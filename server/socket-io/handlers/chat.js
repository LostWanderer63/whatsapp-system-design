const ConversationMember = require("../../models/ConversationMember");

const userRoom = (userId) => `user:${userId}`;

function registerChatHandlers(io, socket) {
  socket.join(userRoom(socket.data.userId));
}

async function publishMessage(io, message) {
  const members = await ConversationMember.findAll({ where: { conversationId: message.conversationId }, attributes: ["userId"] });
  if (!members.length) return;
  io.to(members.map((m) => userRoom(m.userId))).emit("message", message);
}

module.exports = { registerChatHandlers, publishMessage, userRoom };
