const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const config = require("./config");
const User = require("./models/User");
const ConversationMember = require("./models/ConversationMember");

let io = null;
const connections = new Map();
const userRoom = (userId) => `user:${userId}`;

function broadcastPresence() {
  io.emit("presence", { online: connections.size });
}

async function authenticate(socket, next) {
  try {
    const { token } = socket.handshake.auth || {};
    if (typeof token !== "string") throw new Error("missing token");
    const { userId } = jwt.verify(token, config.jwt.secret, { algorithms: ["HS256"] });
    if (!Number.isInteger(userId) || !(await User.findByPk(userId, { attributes: ["id"] }))) throw new Error("unknown user");
    socket.data.userId = userId;
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
}

function startRealtime() {
  const httpServer = http.createServer();
  io = new Server(httpServer, {
    cors: { origin: config.socket.origins },
    serveClient: false,
    maxHttpBufferSize: 8 * 1024,
  });

  io.use(authenticate);

  io.on("connection", (socket) => {
    const { userId } = socket.data;
    socket.join(userRoom(userId));
    connections.set(userId, (connections.get(userId) || 0) + 1);
    broadcastPresence();

    socket.on("disconnect", () => {
      const left = connections.get(userId) - 1;
      if (left > 0) connections.set(userId, left);
      else connections.delete(userId);
      broadcastPresence();
    });
  });

  httpServer.on("error", (err) => {
    console.error(`Socket.IO server could not start on port ${config.socket.port}:`, err.message);
    process.exit(1);
  });
  httpServer.listen(config.socket.port, () => console.log(`Socket.IO running on http://localhost:${config.socket.port}`));
  return io;
}

async function publishMessage(message) {
  if (!io) return;
  const members = await ConversationMember.findAll({ where: { conversationId: message.conversationId }, attributes: ["userId"] });
  if (!members.length) return;
  io.to(members.map((m) => userRoom(m.userId))).emit("message", message);
}

module.exports = { startRealtime, publishMessage };
