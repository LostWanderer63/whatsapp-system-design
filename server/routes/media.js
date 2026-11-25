const express = require("express");
const multer = require("multer");
const { UniqueConstraintError } = require("sequelize");
const config = require("../config");
const User = require("../models/User");
const Message = require("../models/Message");
const ConversationMember = require("../models/ConversationMember");
const { requireAuth } = require("../middleware/auth");
const { publishMessage } = require("../socket-io");
const { parseId, MAX_MESSAGE } = require("../validation");
const { isAllowed, allowedTypes } = require("../mediaTypes");
const { isEnabled, cleanFileName, uploadMedia, withMediaUrls } = require("../services/media");

const router = express.Router();
const KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.media.maxBytes, files: 1, fields: 5, fieldSize: 32 * 1024 },
  fileFilter: (req, file, cb) => cb(null, isAllowed(file.mimetype)),
}).single("file");

const megabytes = (bytes) => Math.round(bytes / (1024 * 1024));

function receiveFile(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ message: `Files can be up to ${megabytes(config.media.maxBytes)} MB.` });
    if (err instanceof multer.MulterError) return res.status(400).json({ message: "Send one file in a field called \"file\"." });
    return next(err);
  });
}

router.get("/config", requireAuth, (req, res) => {
  res.json({ enabled: isEnabled(), maxBytes: config.media.maxBytes, types: allowedTypes() });
});

router.post(
  "/",
  requireAuth,
  (req, res, next) => (isEnabled() ? next() : res.status(503).json({ message: "Media sharing isn't set up on this server yet." })),
  receiveFile,
  async (req, res, next) => {
    if (!req.file) return res.status(415).json({ message: "That file type can't be shared. Try a photo, video, audio clip, PDF or document." });

    const conversationId = parseId(req.body.conversationId);
    const caption = typeof req.body.caption === "string" ? req.body.caption.trim() : "";
    const clientId = req.body.clientId ? String(req.body.clientId) : null;
    if (!conversationId) return res.status(400).json({ message: "Pick a chat to send this file to." });
    if ([...caption].length > MAX_MESSAGE) return res.status(400).json({ message: `Captions can be up to ${MAX_MESSAGE} characters.` });
    if (clientId !== null && !KEY_RE.test(clientId)) return res.status(400).json({ message: "Invalid client id." });

    try {
      if (!(await ConversationMember.isMember(conversationId, req.userId))) return res.status(404).json({ message: "Chat not found." });

      const sender = await User.findByPk(req.userId, { attributes: ["name"] });
      const respond = async (status, message) => {
        const [payload] = await withMediaUrls([{ ...message.toPublic(), senderName: sender?.name }]);
        return { status, payload };
      };

      if (clientId) {
        const existing = await Message.findOne({ where: { senderId: req.userId, clientId } });
        if (existing) {
          const { status, payload } = await respond(200, existing);
          return res.status(status).json({ message: payload });
        }
      }

      const name = cleanFileName(req.file.originalname);
      let key;
      try {
        key = await uploadMedia({ conversationId, buffer: req.file.buffer, type: req.file.mimetype, name });
      } catch (err) {
        console.error("S3 upload failed:", err.name, err.message);
        return res.status(502).json({ message: "Couldn't store the file. Please try again." });
      }

      let message;
      try {
        message = await Message.create({
          senderId: req.userId,
          conversationId,
          body: caption,
          clientId,
          attachmentKey: key,
          attachmentName: name,
          attachmentType: req.file.mimetype,
          attachmentSize: req.file.size,
        });
      } catch (err) {
        if (!(err instanceof UniqueConstraintError && clientId)) throw err;
        message = await Message.findOne({ where: { senderId: req.userId, clientId } });
        const { status, payload } = await respond(200, message);
        return res.status(status).json({ message: payload });
      }

      const { status, payload } = await respond(201, message);
      publishMessage(payload);
      return res.status(status).json({ message: payload });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
