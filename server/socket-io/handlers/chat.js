const { UniqueConstraintError } = require("sequelize");
const ConversationMember = require("../../models/ConversationMember");
const Message = require("../../models/Message");
const { validateMessage } = require("../../validation");
const EVENTS = require("../events");
const { userRoom, conversationRoom } = require("../rooms");
const { ClientError, withAck } = require("../utils");

function publishMessage(io, message) {
  io.to(conversationRoom(message.conversationId)).emit(EVENTS.NEW_MESSAGE, message);
}

async function joinExistingRooms(socket) {
  const memberships = await ConversationMember.findAll({ where: { userId: socket.data.userId }, attributes: ["conversationId"] });
  socket.join([userRoom(socket.data.userId), ...memberships.map((m) => conversationRoom(m.conversationId))]);
}

function registerChatHandlers(io, socket) {
  const { userId, name } = socket.data;

  socket.on(
    EVENTS.NEW_MESSAGE,
    withAck(socket, EVENTS.NEW_MESSAGE, async (body) => {
      const { errors, values } = validateMessage(body);
      if (Object.keys(errors).length) throw new ClientError(Object.values(errors)[0], errors);
      if (!(await ConversationMember.isMember(values.conversationId, userId))) throw new ClientError("Chat not found.");

      try {
        const message = await Message.create({ senderId: userId, ...values });
        const out = { ...message.toPublic(), senderName: name };
        publishMessage(io, out);
        return { message: out };
      } catch (err) {
        if (!(err instanceof UniqueConstraintError && values.clientId)) throw err;
        const existing = await Message.findOne({ where: { senderId: userId, clientId: values.clientId } });
        return { message: { ...existing.toPublic(), senderName: name } };
      }
    })
  );

  return joinExistingRooms(socket);
}

module.exports = { registerChatHandlers, publishMessage };
