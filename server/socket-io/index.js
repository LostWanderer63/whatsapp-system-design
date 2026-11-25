const http = require("http");
const { Server } = require("socket.io");
const config = require("../config");
const { authenticate } = require("./middleware");
const chat = require("./handlers/chat");
const { registerPresenceHandlers } = require("./handlers/presence");

let io = null;

function startSocketServer() {
  const httpServer = http.createServer();
  io = new Server(httpServer, {
    cors: { origin: config.socket.origins },
    serveClient: false,
    maxHttpBufferSize: 8 * 1024,
  });

  io.use(authenticate);

  io.on("connection", (socket) => {
    chat.registerChatHandlers(io, socket);
    registerPresenceHandlers(io, socket);
  });

  httpServer.on("error", (err) => {
    console.error(`Socket.IO server could not start on port ${config.socket.port}:`, err.message);
    process.exit(1);
  });
  httpServer.listen(config.socket.port, () => console.log(`Socket.IO running on http://localhost:${config.socket.port}`));
  return io;
}

async function publishMessage(message) {
  if (io) await chat.publishMessage(io, message);
}

module.exports = { startSocketServer, publishMessage };
