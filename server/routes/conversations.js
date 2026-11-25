const express = require("express");
const { Op, UniqueConstraintError } = require("sequelize");
const { sequelize } = require("../db");
const User = require("../models/User");
const Conversation = require("../models/Conversation");
const ConversationMember = require("../models/ConversationMember");
const Message = require("../models/Message");
const { requireAuth } = require("../middleware/auth");
const { validateConversation, parseId } = require("../validation");

const router = express.Router();
router.use(requireAuth);

const NOT_FOUND = { message: "Chat not found." };

// GET /api/conversations  -> the chats you're a member of
router.get("/", async (req, res, next) => {
  try {
    const conversations = await Conversation.findAll({
      include: [{ model: ConversationMember, as: "members", where: { userId: req.userId }, attributes: [] }],
      order: [["id", "ASC"]],
    });
    return res.json({ conversations: conversations.map((c) => c.toPublic()) });
  } catch (err) {
    return next(err);
  }
});

// POST /api/conversations  { title, kind?, clientKey? }
// Creates a chat with you as its owner. With a clientKey you've used before,
// returns that chat instead (200), so the app can call this on every load.
router.post("/", async (req, res, next) => {
  const { errors, values } = validateConversation(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ message: "Chat could not be created.", errors });

  const findExisting = () =>
    values.clientKey ? Conversation.findOne({ where: { createdBy: req.userId, clientKey: values.clientKey } }) : null;

  try {
    const existing = await findExisting();
    if (existing) return res.json({ conversation: existing.toPublic() });

    const conversation = await sequelize.transaction(async (transaction) => {
      const c = await Conversation.create({ ...values, createdBy: req.userId }, { transaction });
      await ConversationMember.create({ conversationId: c.id, userId: req.userId, role: "owner" }, { transaction });
      return c;
    });
    return res.status(201).json({ conversation: conversation.toPublic() });
  } catch (err) {
    // Two requests with the same clientKey raced; the other one won.
    if (err instanceof UniqueConstraintError) {
      const existing = await findExisting();
      if (existing) return res.json({ conversation: existing.toPublic() });
    }
    return next(err);
  }
});

// GET /api/conversations/:id/messages?before=<messageId>&limit=50
// Oldest-first page of messages. Members only; anyone else gets 404, so the
// response doesn't reveal whether the chat exists.
router.get("/:id/messages", async (req, res, next) => {
  const conversationId = parseId(req.params.id);
  if (!conversationId) return res.status(404).json(NOT_FOUND);

  const before = req.query.before === undefined ? null : parseId(req.query.before);
  if (req.query.before !== undefined && !before) return res.status(400).json({ message: "before must be a message id." });
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);

  try {
    if (!(await ConversationMember.isMember(conversationId, req.userId))) return res.status(404).json(NOT_FOUND);

    const rows = await Message.findAll({
      where: { conversationId, ...(before ? { id: { [Op.lt]: before } } : {}) },
      include: [{ model: User, as: "sender", attributes: ["id", "name"] }],
      order: [["id", "DESC"]],
      limit: limit + 1, // one extra tells us whether there's an older page
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse();
    return res.json({ messages: page.map((m) => m.toPublic()), hasMore });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
