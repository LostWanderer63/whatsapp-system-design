const { WebSocketServer, WebSocket } = require("ws");
const jwt = require("jsonwebtoken");
const config = require("./config");
const User = require("./models/User");
const ConversationMember = require("./models/ConversationMember");

const AUTH_TIMEOUT = 5000;
const HEARTBEAT = 30000;
const sockets = new Map();

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function sendToUsers(userIds, payload) {
  const data = JSON.stringify(payload);
  for (const id of new Set(userIds)) {
    for (const ws of sockets.get(id) || []) if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

function broadcastPresence() {
  sendToUsers([...sockets.keys()], { type: "presence", online: sockets.size });
}

async function authenticate(raw) {
  const msg = JSON.parse(raw);
  if (msg?.type !== "auth" || typeof msg.token !== "string") throw new Error("expected auth");
  const { userId } = jwt.verify(msg.token, config.jwt.secret, { algorithms: ["HS256"] });
  if (!Number.isInteger(userId) || !(await User.findByPk(userId, { attributes: ["id"] }))) throw new Error("unknown user");
  return userId;
}

function register(ws, userId) {
  ws.userId = userId;
  if (!sockets.has(userId)) sockets.set(userId, new Set());
  sockets.get(userId).add(ws);
  send(ws, { type: "ready" });
  broadcastPresence();
}

function unregister(ws) {
  const set = sockets.get(ws.userId);
  if (!set) return;
  set.delete(ws);
  if (!set.size) sockets.delete(ws.userId);
  broadcastPresence();
}

function attachRealtime(server) {
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 8 * 1024 });

  wss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    const timer = setTimeout(() => ws.close(4001, "Authentication timed out"), AUTH_TIMEOUT);

    ws.once("message", async (raw) => {
      clearTimeout(timer);
      try {
        const userId = await authenticate(raw);
        if (ws.readyState === WebSocket.OPEN) register(ws, userId);
      } catch {
        ws.close(4001, "Unauthorized");
      }
    });

    ws.on("close", () => {
      clearTimeout(timer);
      if (ws.userId) unregister(ws);
    });
    ws.on("error", () => ws.terminate());
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT);
  wss.on("close", () => clearInterval(heartbeat));

  return wss;
}

async function publishMessage(message) {
  const members = await ConversationMember.findAll({ where: { conversationId: message.conversationId }, attributes: ["userId"] });
  sendToUsers(
    members.map((m) => m.userId),
    { type: "message", message }
  );
}

module.exports = { attachRealtime, publishMessage };
