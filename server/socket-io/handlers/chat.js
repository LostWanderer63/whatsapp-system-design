const User = require("../../models/User");
const Conversation = require("../../models/Conversation");
const ConversationMember = require("../../models/ConversationMember");
const { roomIdFor } = require("../roomId");

const userRoom = (userId) => `user:${userId}`;
const conversationRoom = (conversationId) => `conversation:${conversationId}`;

function registerChatHandlers(io, socket) {
  socket.join(userRoom(socket.data.userId));
}

async function publishMessage(io, message) {
  const [conversation, members] = await Promise.all([
    Conversation.findByPk(message.conversationId, { attributes: ["id", "directKey"] }),
    ConversationMember.findAll({
      where: { conversationId: message.conversationId },
      attributes: ["userId"],
      include: [{ model: User, attributes: ["email"] }],
    }),
  ]);
  const rooms = [conversationRoom(message.conversationId), ...members.map((m) => userRoom(m.userId))];
  if (conversation?.directKey && members.length === 2) rooms.push(roomIdFor(members[0].User.email, members[1].User.email));
  io.to(rooms).emit("new_message", message);
}

module.exports = { registerChatHandlers, publishMessage, userRoom, conversationRoom };
