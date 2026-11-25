const { Op, UniqueConstraintError } = require("sequelize");
const { sequelize } = require("../../db");
const User = require("../../models/User");
const Conversation = require("../../models/Conversation");
const ConversationMember = require("../../models/ConversationMember");
const Message = require("../../models/Message");
const { validateMessage, parseId } = require("../../validation");
const { conversationRoom, publishMessage } = require("./chat");

const HISTORY_SIZE = 50;

function reply(ack, payload) {
  if (typeof ack === "function") ack(payload);
}

const asObject = (payload) => (payload && typeof payload === "object" ? payload : {});

async function findOrCreateDirect(meId, otherId) {
  const directKey = Conversation.directKeyFor(meId, otherId);
  const existing = await Conversation.findOne({ where: { directKey } });
  if (existing) return existing;
  try {
    return await sequelize.transaction(async (transaction) => {
      const conversation = await Conversation.create(
        { kind: "direct", title: "Personal chat", directKey, createdBy: meId },
        { transaction }
      );
      await ConversationMember.bulkCreate(
        [
          { conversationId: conversation.id, userId: meId, role: "owner" },
          { conversationId: conversation.id, userId: otherId, role: "member" },
        ],
        { transaction }
      );
      return conversation;
    });
  } catch (err) {
    if (err instanceof UniqueConstraintError) return Conversation.findOne({ where: { directKey } });
    throw err;
  }
}

async function otherMember(conversationId, meId) {
  const row = await ConversationMember.findOne({
    where: { conversationId, userId: { [Op.ne]: meId } },
    include: [{ model: User, attributes: ["id", "name"] }],
  });
  return row?.User ? { id: row.User.id, name: row.User.name } : null;
}

async function recentMessages(conversationId) {
  const rows = await Message.findAll({
    where: { conversationId },
    include: [{ model: User, as: "sender", attributes: ["id", "name"] }],
    order: [["id", "DESC"]],
    limit: HISTORY_SIZE,
  });
  return rows.reverse().map((m) => m.toPublic());
}

async function openConversation(meId, body) {
  if (body.userId !== undefined) {
    const otherId = Number(body.userId);
    if (!Number.isInteger(otherId) || otherId <= 0) return { error: "userId must be a user id." };
    if (otherId === meId) return { error: "You can't start a personal chat with yourself." };
    const other = await User.findByPk(otherId, { attributes: ["id", "name"] });
    if (!other) return { error: "User not found." };
    return { conversation: await findOrCreateDirect(meId, otherId), otherUser: { id: other.id, name: other.name } };
  }

  const conversationId = parseId(body.conversationId);
  if (!conversationId || !(await ConversationMember.isMember(conversationId, meId))) return { error: "Chat not found." };
  const conversation = await Conversation.findByPk(conversationId);
  if (!conversation) return { error: "Chat not found." };
  const otherUser = conversation.kind === "direct" ? await otherMember(conversation.id, meId) : null;
  return { conversation, otherUser };
}

function registerPersonalChatHandlers(io, socket) {
  const meId = socket.data.userId;

  socket.on("join_room", async (payload, ack) => {
    try {
      const { error, conversation, otherUser } = await openConversation(meId, asObject(payload));
      if (error) return reply(ack, { ok: false, error });
      await socket.join(conversationRoom(conversation.id));
      return reply(ack, {
        ok: true,
        conversation: { ...conversation.toPublic(), otherUser },
        messages: await recentMessages(conversation.id),
      });
    } catch (err) {
      console.error("join_room failed:", err.message);
      return reply(ack, { ok: false, error: "Couldn't open the chat. Please try again." });
    }
  });

  socket.on("new_message", async (payload, ack) => {
    try {
      const { errors, values } = validateMessage(asObject(payload));
      if (Object.keys(errors).length) return reply(ack, { ok: false, error: Object.values(errors)[0], errors });
      if (!(await ConversationMember.isMember(values.conversationId, meId))) return reply(ack, { ok: false, error: "Chat not found." });

      let message;
      try {
        message = await Message.create({ senderId: meId, ...values });
      } catch (err) {
        if (!(err instanceof UniqueConstraintError && values.clientId)) throw err;
        const existing = await Message.findOne({ where: { senderId: meId, clientId: values.clientId } });
        return reply(ack, { ok: true, message: { ...existing.toPublic(), senderName: socket.data.name } });
      }

      const out = { ...message.toPublic(), senderName: socket.data.name };
      await publishMessage(io, out);
      return reply(ack, { ok: true, message: out });
    } catch (err) {
      console.error("new_message failed:", err.message);
      return reply(ack, { ok: false, error: "Message could not be sent. Please try again." });
    }
  });
}

module.exports = { registerPersonalChatHandlers };
