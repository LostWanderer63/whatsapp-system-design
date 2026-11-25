const http = require("http");
const { Server } = require("socket.io");
const config = require("../config");
const { authenticate } = require("./middleware");
const { addUsersToConversation } = require("./rooms");
const chat = require("./handlers/chat");
const { registerPersonalChatHandlers } = require("./handlers/personalChat");
const { registerGroupChatHandlers } = require("./handlers/groupChat");
const { registerPresenceHandlers } = require("./handlers/presence");

const RECOVERY_WINDOW_MS = 2 * 60 * 1000;

let io = null;
let httpServer = null;

function startSocketServer() {
  httpServer = http.createServer();
  io = new Server(httpServer, {
    cors: { origin: config.socket.origins },
    serveClient: false,
    maxHttpBufferSize: 32 * 1024,
    connectionStateRecovery: { maxDisconnectionDuration: RECOVERY_WINDOW_MS },
  });

  io.use(authenticate);

  io.on("connection", (socket) => {
    registerPersonalChatHandlers(io, socket);
    registerGroupChatHandlers(io, socket);
    registerPresenceHandlers(io, socket);
    chat.registerChatHandlers(io, socket).catch((err) => console.error("Joining rooms failed:", err.message));
  });

  httpServer.on("error", (err) => {
    console.error(`Socket.IO server could not start on port ${config.socket.port}:`, err.message);
    process.exit(1);
  });
  httpServer.listen(config.socket.port, () => console.log(`Socket.IO running on http://localhost:${config.socket.port}`));
  return io;
}

function publishMessage(message) {
  if (io) chat.publishMessage(io, message);
}

function addUserToConversation(userId, conversationId) {
  if (io) addUsersToConversation(io, conversationId, [userId]);
}

function closeSocketServer() {
  return new Promise((resolve) => {
    if (!io) return resolve();
    io.close(() => resolve());
  });
}

module.exports = { startSocketServer, publishMessage, addUserToConversation, closeSocketServer };
