const crypto = require("crypto");
const { UniqueConstraintError } = require("sequelize");
const { sequelize } = require("../db");
const User = require("../models/User");
const Conversation = require("../models/Conversation");
const ConversationMember = require("../models/ConversationMember");
const { roomIdFor } = require("../socket-io/roomId");
const { serializeMessages } = require("./media");
const { findMessages } = require("./messageStore");

const HISTORY_SIZE = 50;
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_LENGTH = 8;

async function describeConversations(conversations, meId) {
  const detailed = conversations.filter((c) => c.directKey || c.inviteCode);
  if (!detailed.length) return conversations.map((c) => c.toPublic());

  const rows = await ConversationMember.findAll({
    where: { conversationId: detailed.map((c) => c.id) },
    include: [{ model: User, attributes: ["id", "name", "email"] }],
    order: [["joinedAt", "ASC"]],
  });
  const membersOf = new Map();
  for (const row of rows) {
    if (!row.User) continue;
    const key = String(row.conversationId);
    if (!membersOf.has(key)) membersOf.set(key, []);
    membersOf.get(key).push({ id: row.User.id, name: row.User.name, email: row.User.email, role: row.role });
  }

  return conversations.map((c) => {
    const base = c.toPublic();
    const members = membersOf.get(String(c.id)) || [];
    if (c.directKey) {
      const me = members.find((m) => m.id === meId);
      const other = members.find((m) => m.id !== meId);
      return {
        ...base,
        roomId: me && other ? roomIdFor(me.email, other.email) : null,
        otherUser: other ? { id: other.id, name: other.name } : null,
      };
    }
    if (c.inviteCode) {
      return { ...base, inviteCode: c.inviteCode, members: members.map(({ id, name, role }) => ({ id, name, role })) };
    }
    return base;
  });
}

async function describeConversation(conversation, meId) {
  return (await describeConversations([conversation], meId))[0];
}

async function recentMessages(conversationId) {
  const rows = await findMessages({ where: { conversationId }, direction: "DESC", limit: HISTORY_SIZE });
  return serializeMessages(rows.reverse());
}

async function findOrCreateDirect(meId, otherId) {
  const directKey = Conversation.directKeyFor(meId, otherId);
  const existing = await Conversation.findOne({ where: { directKey } });
  if (existing) return { conversation: existing, created: false };
  try {
    const conversation = await sequelize.transaction(async (transaction) => {
      const c = await Conversation.create({ kind: "direct", title: "Personal chat", directKey, createdBy: meId }, { transaction });
      await ConversationMember.bulkCreate(
        [
          { conversationId: c.id, userId: meId, role: "owner" },
          { conversationId: c.id, userId: otherId, role: "member" },
        ],
        { transaction }
      );
      return c;
    });
    return { conversation, created: true };
  } catch (err) {
    if (err instanceof UniqueConstraintError) return { conversation: await Conversation.findOne({ where: { directKey } }), created: false };
    throw err;
  }
}

function newInviteCode() {
  let code = "";
  for (let i = 0; i < INVITE_LENGTH; i++) code += INVITE_ALPHABET[crypto.randomInt(INVITE_ALPHABET.length)];
  return code;
}

async function createGroup(ownerId, title, memberIds) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await sequelize.transaction(async (transaction) => {
        const c = await Conversation.create({ kind: "group", title, inviteCode: newInviteCode(), createdBy: ownerId }, { transaction });
        await ConversationMember.bulkCreate(
          [
            { conversationId: c.id, userId: ownerId, role: "owner" },
            ...memberIds.map((userId) => ({ conversationId: c.id, userId, role: "member" })),
          ],
          { transaction }
        );
        return c;
      });
    } catch (err) {
      if (!(err instanceof UniqueConstraintError) || attempt === 2) throw err;
    }
  }
  return null;
}

module.exports = { describeConversations, describeConversation, recentMessages, findOrCreateDirect, createGroup };
