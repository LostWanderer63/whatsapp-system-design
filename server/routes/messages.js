const express = require("express");
const { ForeignKeyConstraintError, UniqueConstraintError } = require("sequelize");
const Message = require("../models/Message");
const ConversationMember = require("../models/ConversationMember");
const { requireAuth } = require("../middleware/auth");
const { validateMessage } = require("../validation");

const router = express.Router();

// POST /api/messages  { conversationId, text, clientId? }   (Authorization: Bearer <token>)
router.post("/", requireAuth, async (req, res, next) => {
  const { errors, values } = validateMessage(req.body || {});
  if (Object.keys(errors).length) {
    return res.status(400).json({ message: "Message could not be sent.", errors });
  }

  try {
    // Only members can post. Same 404 whether the chat is missing or not yours.
    if (!(await ConversationMember.isMember(values.conversationId, req.userId))) {
      return res.status(404).json({ message: "Chat not found." });
    }
    const message = await Message.create({ senderId: req.userId, ...values });
    return res.status(201).json({ message: message.toPublic() });
  } catch (err) {
    // A retry of a message we already stored: return the stored one.
    if (err instanceof UniqueConstraintError && values.clientId) {
      const existing = await Message.findOne({ where: { senderId: req.userId, clientId: values.clientId } }).catch(() => null);
      if (existing) return res.status(200).json({ message: existing.toPublic() });
    }
    // The chat (or the user) was deleted between the membership check and the insert.
    if (err instanceof ForeignKeyConstraintError) return res.status(404).json({ message: "Chat not found." });
    return next(err);
  }
});

module.exports = router;
