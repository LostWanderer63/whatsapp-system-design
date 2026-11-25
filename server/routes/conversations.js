const express = require("express");
const { Op, UniqueConstraintError } = require("sequelize");
const { sequelize } = require("../db");
const User = require("../models/User");
const Conversation = require("../models/Conversation");
const ConversationMember = require("../models/ConversationMember");
const Message = require("../models/Message");
const { requireAuth } = require("../middleware/auth");
const { validateConversation, parseId } = require("../validation");
const { describeConversations } = require("../services/conversations");
const { addUserToConversation } = require("../socket-io");

const router = express.Router();
router.use(requireAuth);

const NOT_FOUND = { message: "Chat not found." };

router.get("/", async (req, res, next) => {
  try {
    const conversations = await Conversation.findAll({
      include: [{ model: ConversationMember, as: "members", where: { userId: req.userId }, attributes: [] }],
      order: [["id", "ASC"]],
    });
    return res.json({ conversations: await describeConversations(conversations, req.userId) });
  } catch (err) {
    return next(err);
  }
});

router.post("/", async (req, res, next) => {
  const { errors, values } = validateConversation(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ message: "Chat could not be created.", errors });
  if (values.clientKey === Conversation.LOUNGE_KEY) {
    return res.status(400).json({ message: "Chat could not be created.", errors: { clientKey: "That key is reserved." } });
  }

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
    if (err instanceof UniqueConstraintError) {
      const existing = await findExisting();
      if (existing) return res.json({ conversation: existing.toPublic() });
    }
    return next(err);
  }
});

router.post("/lounge/join", async (req, res, next) => {
  try {
    const lounge = await Conversation.ensureLounge();
    await ConversationMember.findOrCreate({
      where: { conversationId: lounge.id, userId: req.userId },
      defaults: { role: "member" },
    });
    addUserToConversation(req.userId, lounge.id);
    return res.json({ conversation: lounge.toPublic() });
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      const lounge = await Conversation.findLounge();
      if (lounge) return res.json({ conversation: lounge.toPublic() });
    }
    return next(err);
  }
});

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
      limit: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse();
    return res.json({ messages: page.map((m) => m.toPublic()), hasMore });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
