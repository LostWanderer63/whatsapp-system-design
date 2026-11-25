const User = require("../../models/User");
const Conversation = require("../../models/Conversation");
const ConversationMember = require("../../models/ConversationMember");
const { parseId } = require("../../validation");
const { describeConversation, recentMessages, findOrCreateDirect } = require("../../services/conversations");
const EVENTS = require("../events");
const { userRoom, conversationRoom, addUsersToConversation } = require("../rooms");
const { otherEmailInRoom } = require("../roomId");
const { ClientError, withAck } = require("../utils");

const SELF_CHAT = "You can't start a personal chat with yourself.";
const NOT_FOUND = "Chat not found.";

async function findOtherUser(me, body) {
  if (body.roomId !== undefined) {
    const otherEmail = otherEmailInRoom(body.roomId, me.email);
    if (!otherEmail) throw new ClientError("You aren't part of that room.");
    if (otherEmail === me.email.toLowerCase()) throw new ClientError(SELF_CHAT);
    const user = await User.findOne({ where: { email: otherEmail }, attributes: ["id", "name"] });
    if (!user) throw new ClientError("No Chorus account uses that email.");
    return user;
  }
  const otherId = Number(body.userId);
  if (!Number.isInteger(otherId) || otherId <= 0) throw new ClientError("userId must be a user id.");
  const user = await User.findByPk(otherId, { attributes: ["id", "name"] });
  if (!user) throw new ClientError("User not found.");
  return user;
}

async function openExisting(meId, conversationIdInput) {
  const conversationId = parseId(conversationIdInput);
  if (!conversationId || !(await ConversationMember.isMember(conversationId, meId))) throw new ClientError(NOT_FOUND);
  const conversation = await Conversation.findByPk(conversationId);
  if (!conversation) throw new ClientError(NOT_FOUND);
  return conversation;
}

function registerPersonalChatHandlers(io, socket) {
  const me = { id: socket.data.userId, email: socket.data.email };

  socket.on(
    EVENTS.JOIN_ROOM,
    withAck(socket, EVENTS.JOIN_ROOM, async (body) => {
      let conversation;
      if (body.roomId !== undefined || body.userId !== undefined) {
        const other = await findOtherUser(me, body);
        if (other.id === me.id) throw new ClientError(SELF_CHAT);
        const result = await findOrCreateDirect(me.id, other.id);
        conversation = result.conversation;
        if (result.created) {
          addUsersToConversation(io, conversation.id, [me.id, other.id]);
          io.to(userRoom(other.id)).emit(EVENTS.CONVERSATION_ADDED, { conversation: await describeConversation(conversation, other.id) });
        }
      } else {
        conversation = await openExisting(me.id, body.conversationId);
      }

      socket.join(conversationRoom(conversation.id));
      const described = await describeConversation(conversation, me.id);
      return { roomId: described.roomId ?? null, conversation: described, messages: await recentMessages(conversation.id) };
    })
  );
}

module.exports = { registerPersonalChatHandlers };
