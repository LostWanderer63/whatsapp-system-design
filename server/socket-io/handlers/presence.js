const EVENTS = require("../events");

const connections = new Map();

function broadcastPresence(io) {
  io.emit(EVENTS.PRESENCE, { online: connections.size });
}

function registerPresenceHandlers(io, socket) {
  const { userId } = socket.data;
  connections.set(userId, (connections.get(userId) || 0) + 1);
  broadcastPresence(io);

  socket.on("disconnect", () => {
    const left = connections.get(userId) - 1;
    if (left > 0) connections.set(userId, left);
    else connections.delete(userId);
    broadcastPresence(io);
  });
}

module.exports = { registerPresenceHandlers };
