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
const media = require("../services/media");

const router = express.Router();
const KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_DIMENSION = 100000;

const megabytes = (bytes) => Math.round(bytes / (1024 * 1024));
const fail = (res, status, message) => res.status(status).json({ message });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.media.proxyMaxBytes, files: 1, fields: 8, fieldSize: 32 * 1024 },
  fileFilter: (req, file, cb) => cb(null, isAllowed(file.mimetype)),
}).single("file");

function receiveFile(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") return fail(res, 413, `Files can be up to ${megabytes(config.media.proxyMaxBytes)} MB here.`);
    if (err instanceof multer.MulterError) return fail(res, 400, 'Send one file in a field called "file".');
    return next(err);
  });
}

const requireMedia = (req, res, next) => (media.isEnabled() ? next() : fail(res, 503, "Media sharing isn't set up on this server yet."));

function readDetails(body) {
  const caption = typeof body.caption === "string" ? body.caption.trim() : "";
  const clientId = body.clientId ? String(body.clientId) : null;
  const dimension = (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 && n <= MAX_DIMENSION ? n : null;
  };
  if ([...caption].length > MAX_MESSAGE) return { error: `Captions can be up to ${MAX_MESSAGE} characters.` };
  if (clientId !== null && !KEY_RE.test(clientId)) return { error: "Invalid client id." };
  return { caption, clientId, width: dimension(body.width), height: dimension(body.height) };
}

async function respondWith(res, status, message, senderName) {
  const [payload] = await media.withMediaUrls([{ ...message.toPublic(), senderName }]);
  if (status === 201) publishMessage(payload);
  return res.status(status).json({ message: payload });
}

async function existingByClientId(userId, clientId) {
  return clientId ? Message.findOne({ where: { senderId: userId, clientId } }) : null;
}

async function saveAttachmentMessage({ userId, conversationId, details, attachment }) {
  try {
    return {
      created: true,
      message: await Message.create({
        senderId: userId,
        conversationId,
        body: details.caption,
        clientId: details.clientId,
        attachmentKey: attachment.key,
        attachmentThumbKey: attachment.thumbKey || null,
        attachmentName: attachment.name,
        attachmentType: attachment.type,
        attachmentSize: attachment.size,
        attachmentWidth: details.width,
        attachmentHeight: details.height,
      }),
    };
  } catch (err) {
    if (!(err instanceof UniqueConstraintError && details.clientId)) throw err;
    return { created: false, message: await existingByClientId(userId, details.clientId) };
  }
}

router.get("/config", requireAuth, (req, res) => {
  res.json({
    enabled: media.isEnabled(),
    maxBytes: config.media.maxBytes,
    proxyMaxBytes: config.media.proxyMaxBytes,
    partSize: media.PART_SIZE,
    types: allowedTypes(),
  });
});

router.post("/uploads", requireAuth, requireMedia, async (req, res, next) => {
  const conversationId = parseId(req.body?.conversationId);
  const purpose = req.body?.purpose === "thumbnail" ? "thumbnail" : "attachment";
  const name = media.cleanFileName(req.body?.name);
  const type = String(req.body?.type || "");
  const size = Number(req.body?.size);

  if (!conversationId) return fail(res, 400, "Pick a chat to send this file to.");
  if (!Number.isSafeInteger(size) || size <= 0) return fail(res, 400, "The file is empty.");
  if (purpose === "thumbnail") {
    if (!media.THUMB_TYPES.has(type) || size > media.THUMB_MAX_BYTES) return fail(res, 400, "Thumbnails must be JPEG or WebP under 1 MB.");
  } else {
    if (!isAllowed(type)) return fail(res, 415, "That file type can't be shared. Try a photo, video, audio clip, PDF or document.");
    if (size > config.media.maxBytes) return fail(res, 413, `Files can be up to ${megabytes(config.media.maxBytes)} MB.`);
  }

  try {
    if (!(await ConversationMember.isMember(conversationId, req.userId))) return fail(res, 404, "Chat not found.");
    const target = await media.createUploadTarget({ userId: req.userId, conversationId, name, type, size, purpose });
    return res.status(201).json(target);
  } catch (err) {
    console.error("Creating upload failed:", err.name, err.message);
    return fail(res, 502, "Storage is unavailable right now. Please try again.");
  }
});

router.post("/uploads/parts", requireAuth, requireMedia, async (req, res) => {
  const claims = media.readUploadToken(req.body?.token, req.userId);
  if (!claims?.uploadId) return fail(res, 400, "That upload has expired. Please send the file again.");
  const partNumbers = (Array.isArray(req.body.partNumbers) ? req.body.partNumbers : [])
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= claims.partCount);
  if (!partNumbers.length) return fail(res, 400, "No valid parts requested.");
  try {
    return res.json({ parts: await media.signParts({ key: claims.key, uploadId: claims.uploadId, size: claims.size, partNumbers }) });
  } catch (err) {
    console.error("Signing parts failed:", err.message);
    return fail(res, 502, "Storage is unavailable right now. Please try again.");
  }
});

router.post("/uploads/complete", requireAuth, requireMedia, async (req, res, next) => {
  const body = req.body || {};
  const claims = media.readUploadToken(body.token, req.userId);
  if (!claims || claims.purpose !== "attachment") return fail(res, 400, "That upload has expired. Please send the file again.");
  const details = readDetails(body);
  if (details.error) return fail(res, 400, details.error);

  try {
    if (!(await ConversationMember.isMember(claims.cid, req.userId))) return fail(res, 404, "Chat not found.");
    const sender = await User.findByPk(req.userId, { attributes: ["name"] });

    const existing =
      (await existingByClientId(req.userId, details.clientId)) ||
      (await Message.findOne({ where: { senderId: req.userId, attachmentKey: claims.key } }));
    if (existing) return respondWith(res, 200, existing, sender?.name);

    if (claims.uploadId) {
      const parts = (Array.isArray(body.parts) ? body.parts : [])
        .map((p) => ({ partNumber: Number(p?.partNumber), etag: String(p?.etag || "") }))
        .filter((p) => Number.isInteger(p.partNumber) && p.partNumber >= 1 && p.partNumber <= claims.partCount && p.etag);
      if (new Set(parts.map((p) => p.partNumber)).size !== claims.partCount) return fail(res, 400, "Some parts of the file are missing.");
      body.parts = parts;
    }

    const finished = await media.finishUpload(claims, body.parts || []);
    if (finished.error) return fail(res, 409, finished.error);

    let thumbKey = null;
    const thumb = body.thumbnailToken ? media.readUploadToken(body.thumbnailToken, req.userId) : null;
    if (thumb && thumb.purpose === "thumbnail" && thumb.cid === claims.cid) {
      const thumbCheck = await media.finishUpload(thumb, []).catch(() => ({ error: true }));
      if (!thumbCheck.error) thumbKey = thumb.key;
    }

    const { created, message } = await saveAttachmentMessage({
      userId: req.userId,
      conversationId: claims.cid,
      details,
      attachment: { key: claims.key, thumbKey, name: claims.name, type: claims.type, size: claims.size },
    });
    return respondWith(res, created ? 201 : 200, message, sender?.name);
  } catch (err) {
    if (err.name && err.$metadata) {
      console.error("Completing upload failed:", err.name, err.message);
      return fail(res, 502, "Storage is unavailable right now. Please try again.");
    }
    return next(err);
  }
});

router.post("/uploads/abort", requireAuth, requireMedia, async (req, res) => {
  const claims = media.readUploadToken(req.body?.token, req.userId);
  if (claims) await media.abortUpload(claims);
  res.status(204).end();
});

router.post("/", requireAuth, requireMedia, receiveFile, async (req, res, next) => {
  if (!req.file) return fail(res, 415, "That file type can't be shared. Try a photo, video, audio clip, PDF or document.");
  const conversationId = parseId(req.body.conversationId);
  if (!conversationId) return fail(res, 400, "Pick a chat to send this file to.");
  const details = readDetails(req.body);
  if (details.error) return fail(res, 400, details.error);

  try {
    if (!(await ConversationMember.isMember(conversationId, req.userId))) return fail(res, 404, "Chat not found.");
    const sender = await User.findByPk(req.userId, { attributes: ["name"] });
    const existing = await existingByClientId(req.userId, details.clientId);
    if (existing) return respondWith(res, 200, existing, sender?.name);

    const name = media.cleanFileName(req.file.originalname);
    let key;
    try {
      key = await media.uploadMedia({ conversationId, buffer: req.file.buffer, type: req.file.mimetype, name });
    } catch (err) {
      console.error("S3 upload failed:", err.name, err.message);
      return fail(res, 502, "Couldn't store the file. Please try again.");
    }

    const { created, message } = await saveAttachmentMessage({
      userId: req.userId,
      conversationId,
      details,
      attachment: { key, name, type: req.file.mimetype, size: req.file.size },
    });
    return respondWith(res, created ? 201 : 200, message, sender?.name);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
