const express = require("express");
const { ForeignKeyConstraintError, Op, UniqueConstraintError } = require("sequelize");
const { sequelize } = require("../db");
const User = require("../models/User");
const Message = require("../models/Message");
const ConversationMember = require("../models/ConversationMember");
const { requireAuth } = require("../middleware/auth");
const { publishMessage } = require("../socket-io");
const { validateMessage, parseId } = require("../validation");
const { serializeMessages, withMediaUrls } = require("../services/media");
const { findMessages } = require("../services/messageStore");

const router = express.Router();

const PAGE_SIZE = 1000;

router.get("/", requireAuth, async (req, res, next) => {
  const after = req.query.after === undefined ? null : parseId(req.query.after);
  if (req.query.after !== undefined && !after) return res.status(400).json({ message: "after must be a message id." });

  try {
    const rows = await findMessages({
      where: {
        conversationId: {
          [Op.in]: sequelize.literal(`(SELECT conversation_id FROM conversation_members WHERE user_id = ${sequelize.escape(req.userId)})`),
        },
        ...(after ? { id: { [Op.gt]: after } } : {}),
      },
      direction: "ASC",
      limit: PAGE_SIZE + 1,
    });
    const hasMore = rows.length > PAGE_SIZE;
    return res.json({ messages: await serializeMessages(rows.slice(0, PAGE_SIZE)), hasMore });
  } catch (err) {
    return next(err);
  }
});

router.post("/", requireAuth, async (req, res, next) => {
  const { errors, values } = validateMessage(req.body || {});
  if (Object.keys(errors).length) {
    return res.status(400).json({ message: "Message could not be sent.", errors });
  }

  try {
    if (!(await ConversationMember.isMember(values.conversationId, req.userId))) {
      return res.status(404).json({ message: "Chat not found." });
    }
    const message = await Message.create({ senderId: req.userId, ...values });
    const sender = await User.findByPk(req.userId, { attributes: ["name"] });
    const payload = { ...message.toPublic(), senderName: sender?.name };
    publishMessage(payload);
    return res.status(201).json({ message: payload });
  } catch (err) {
    if (err instanceof UniqueConstraintError && values.clientId) {
      const existing = await Message.findOne({ where: { senderId: req.userId, clientId: values.clientId } }).catch(() => null);
      if (existing) return res.status(200).json({ message: (await withMediaUrls([existing.toPublic()]))[0] });
    }
    if (err instanceof ForeignKeyConstraintError) return res.status(404).json({ message: "Chat not found." });
    return next(err);
  }
});

module.exports = router;
