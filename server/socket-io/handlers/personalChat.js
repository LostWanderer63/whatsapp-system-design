const { Op, UniqueConstraintError } = require("sequelize");
const { sequelize } = require("../../db");
const User = require("../../models/User");
const Conversation = require("../../models/Conversation");
const ConversationMember = require("../../models/ConversationMember");
const Message = require("../../models/Message");
const { validateMessage, parseId } = require("../../validation");
const { roomIdFor, otherEmailInRoom } = require("../roomId");
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
    include: [{ model: User, attributes: ["id", "name", "email"] }],
  });
  return row?.User || null;
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

const SELF_CHAT = "You can't start a personal chat with yourself.";

async function findOther(me, body) {
  if (body.roomId !== undefined) {
    const otherEmail = otherEmailInRoom(body.roomId, me.email);
    if (!otherEmail) return { error: "You aren't part of that room." };
    if (otherEmail === me.email.toLowerCase()) return { error: SELF_CHAT };
    const user = await User.findOne({ where: { email: otherEmail }, attributes: ["id", "name", "email"] });
    return user ? { user } : { error: "No Chorus account uses that email." };
  }
  const otherId = Number(body.userId);
  if (!Number.isInteger(otherId) || otherId <= 0) return { error: "userId must be a user id." };
  const user = await User.findByPk(otherId, { attributes: ["id", "name", "email"] });
  return user ? { user } : { error: "User not found." };
}

async function openConversation(me, body) {
  if (body.roomId !== undefined || body.userId !== undefined) {
    const { error, user } = await findOther(me, body);
    if (error) return { error };
    if (user.id === me.id) return { error: SELF_CHAT };
    return { conversation: await findOrCreateDirect(me.id, user.id), other: user };
  }

  const conversationId = parseId(body.conversationId);
  if (!conversationId || !(await ConversationMember.isMember(conversationId, me.id))) return { error: "Chat not found." };
  const conversation = await Conversation.findByPk(conversationId);
  if (!conversation) return { error: "Chat not found." };
  const other = conversation.directKey ? await otherMember(conversation.id, me.id) : null;
  return { conversation, other };
}

function registerPersonalChatHandlers(io, socket) {
  const meId = socket.data.userId;
  const me = { id: meId, email: socket.data.email };

  socket.on("join_room", async (payload, ack) => {
    try {
      const { error, conversation, other } = await openConversation(me, asObject(payload));
      if (error) return reply(ack, { ok: false, error });
      const roomId = other ? roomIdFor(me.email, other.email) : null;
      await socket.join(roomId ? [conversationRoom(conversation.id), roomId] : conversationRoom(conversation.id));
      return reply(ack, {
        ok: true,
        roomId,
        conversation: {
          ...conversation.toPublic(),
          roomId,
          otherUser: other ? { id: other.id, name: other.name } : null,
        },
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
