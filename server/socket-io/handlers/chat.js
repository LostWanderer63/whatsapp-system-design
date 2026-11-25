const ConversationMember = require("../../models/ConversationMember");

const userRoom = (userId) => `user:${userId}`;
const conversationRoom = (conversationId) => `conversation:${conversationId}`;

function registerChatHandlers(io, socket) {
  socket.join(userRoom(socket.data.userId));
}

async function publishMessage(io, message) {
  const members = await ConversationMember.findAll({ where: { conversationId: message.conversationId }, attributes: ["userId"] });
  io.to([conversationRoom(message.conversationId), ...members.map((m) => userRoom(m.userId))]).emit("new_message", message);
}

module.exports = { registerChatHandlers, publishMessage, userRoom, conversationRoom };
