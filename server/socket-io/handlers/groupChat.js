const { Op } = require("sequelize");
const User = require("../../models/User");
const Conversation = require("../../models/Conversation");
const ConversationMember = require("../../models/ConversationMember");
const { normalizeEmail, parseId } = require("../../validation");
const { describeConversation, recentMessages, createGroup } = require("../../services/conversations");
const EVENTS = require("../events");
const { userRoom, conversationRoom, addUsersToConversation, removeUserFromConversation } = require("../rooms");
const { ClientError, withAck } = require("../utils");

const MAX_TITLE = 100;
const MAX_MEMBERS = 50;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function parseGroupInput(body, myEmail) {
  const name = String(body.name || "").trim().replace(/\s+/g, " ");
  if (!name) throw new ClientError("Give the group a name.");
  if ([...name].length > MAX_TITLE) throw new ClientError(`Group names can be up to ${MAX_TITLE} characters.`);

  const raw = Array.isArray(body.memberEmails) ? body.memberEmails : [];
  const emails = [...new Set(raw.map(normalizeEmail).filter(Boolean))].filter((e) => e !== normalizeEmail(myEmail));
  const invalid = emails.filter((e) => !EMAIL_RE.test(e));
  if (invalid.length) throw new ClientError(`These aren't valid emails: ${invalid.join(", ")}`);
  if (emails.length > MAX_MEMBERS) throw new ClientError(`A group can start with up to ${MAX_MEMBERS} other members.`);
  return { name, emails };
}

const normalizeInviteCode = (code) => String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

function registerGroupChatHandlers(io, socket) {
  const me = { id: socket.data.userId, name: socket.data.name, email: socket.data.email };

  socket.on(
    EVENTS.CREATE_GROUP,
    withAck(socket, EVENTS.CREATE_GROUP, async (body) => {
      const { name, emails } = parseGroupInput(body, me.email);
      const users = emails.length ? await User.findAll({ where: { email: { [Op.in]: emails } }, attributes: ["id", "email"] }) : [];
      const found = new Set(users.map((u) => u.email));
      const missing = emails.filter((e) => !found.has(e));
      if (missing.length) throw new ClientError(`No Chorus account for: ${missing.join(", ")}`);

      const memberIds = users.map((u) => u.id);
      const conversation = await createGroup(me.id, name, memberIds);
      addUsersToConversation(io, conversation.id, [me.id, ...memberIds]);

      const described = await describeConversation(conversation, me.id);
      io.to([me.id, ...memberIds].map(userRoom)).emit(EVENTS.CONVERSATION_ADDED, { conversation: described });
      return { conversation: described, messages: [] };
    })
  );

  socket.on(
    EVENTS.JOIN_GROUP,
    withAck(socket, EVENTS.JOIN_GROUP, async (body) => {
      const inviteCode = normalizeInviteCode(body.inviteCode);
      if (!inviteCode) throw new ClientError("Enter an invite code.");
      const conversation = await Conversation.findOne({ where: { inviteCode } });
      if (!conversation) throw new ClientError("That invite code doesn't match any group.");

      const [, created] = await ConversationMember.findOrCreate({
        where: { conversationId: conversation.id, userId: me.id },
        defaults: { role: "member" },
      });
      addUsersToConversation(io, conversation.id, [me.id]);

      const described = await describeConversation(conversation, me.id);
      if (created) {
        io.to(conversationRoom(conversation.id)).emit(EVENTS.GROUP_MEMBER_JOINED, {
          conversationId: described.id,
          user: { id: me.id, name: me.name },
          members: described.members,
        });
        io.to(userRoom(me.id)).emit(EVENTS.CONVERSATION_ADDED, { conversation: described });
      }
      return { conversation: described, messages: await recentMessages(conversation.id) };
    })
  );

  socket.on(
    EVENTS.LEAVE_GROUP,
    withAck(socket, EVENTS.LEAVE_GROUP, async (body) => {
      const conversationId = parseId(body.conversationId);
      const conversation = conversationId && (await Conversation.findByPk(conversationId));
      if (!conversation?.inviteCode) throw new ClientError("Group not found.");
      const removed = await ConversationMember.destroy({ where: { conversationId: conversation.id, userId: me.id } });
      if (!removed) throw new ClientError("Group not found.");

      removeUserFromConversation(io, conversation.id, me.id);
      const described = await describeConversation(conversation, me.id);
      io.to(conversationRoom(conversation.id)).emit(EVENTS.GROUP_MEMBER_LEFT, {
        conversationId: described.id,
        user: { id: me.id, name: me.name },
        members: described.members,
      });
      io.to(userRoom(me.id)).emit(EVENTS.CONVERSATION_REMOVED, { conversationId: described.id });
      return {};
    })
  );
}

module.exports = { registerGroupChatHandlers };
