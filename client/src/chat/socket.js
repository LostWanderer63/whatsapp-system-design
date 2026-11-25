import { io } from "socket.io-client";
import { EVENTS } from "./events.js";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || `${window.location.protocol}//${window.location.hostname}:3000`;
const ACK_TIMEOUT = 8000;

export function createChatSocket({ getToken, onStatus, onConnected, onUnauthorized, on }) {
  const socket = io(SOCKET_URL, { auth: (cb) => cb({ token: getToken() }) });

  onStatus("connecting");
  socket.on("connect", () => {
    onStatus("online");
    onConnected({ recovered: socket.recovered });
  });
  socket.on("disconnect", (reason) => {
    onStatus("offline");
    if (reason === "io server disconnect") socket.connect();
  });
  socket.io.on("reconnect_attempt", () => onStatus("connecting"));
  socket.on("connect_error", (err) => {
    if (err.message === "Unauthorized") {
      socket.disconnect();
      onUnauthorized();
      return;
    }
    onStatus("offline");
  });

  for (const [event, handler] of Object.entries(on)) socket.on(event, handler);

  function call(event, data) {
    return new Promise((resolve, reject) => {
      if (!socket.connected) {
        reject(new Error("You're offline. Reconnecting…"));
        return;
      }
      socket.timeout(ACK_TIMEOUT).emit(event, data, (err, res) => {
        if (err) reject(new Error("The server didn't respond. Check your connection."));
        else if (!res?.ok) reject(Object.assign(new Error(res?.error || "Something went wrong."), { fields: res?.errors }));
        else resolve(res);
      });
    });
  }

  return {
    isConnected: () => socket.connected,
    sendMessage: (message) => call(EVENTS.NEW_MESSAGE, message),
    openPersonalChat: (roomId) => call(EVENTS.JOIN_ROOM, { roomId }),
    createGroup: (name, memberEmails) => call(EVENTS.CREATE_GROUP, { name, memberEmails }),
    joinGroup: (inviteCode) => call(EVENTS.JOIN_GROUP, { inviteCode }),
    leaveGroup: (conversationId) => call(EVENTS.LEAVE_GROUP, { conversationId }),
    close: () => {
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
    },
  };
}
