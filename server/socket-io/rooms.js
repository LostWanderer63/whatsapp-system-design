const userRoom = (userId) => `user:${userId}`;
const conversationRoom = (conversationId) => `conversation:${conversationId}`;

function addUsersToConversation(io, conversationId, userIds) {
  if (!userIds.length) return;
  io.in(userIds.map(userRoom)).socketsJoin(conversationRoom(conversationId));
}

function removeUserFromConversation(io, conversationId, userId) {
  io.in(userRoom(userId)).socketsLeave(conversationRoom(conversationId));
}

module.exports = { userRoom, conversationRoom, addUsersToConversation, removeUserFromConversation };
