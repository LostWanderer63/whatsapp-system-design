import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || `${window.location.protocol}//${window.location.hostname}:3000`;
const ACK_TIMEOUT = 8000;

export function connectLive({ getToken, onReady, onMessage, onPresence, onStatus, onUnauthorized }) {
  const socket = io(SOCKET_URL, {
    auth: (cb) => cb({ token: getToken() }),
  });

  onStatus("connecting");

  socket.on("connect", () => {
    onStatus("online");
    onReady();
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

  socket.on("new_message", onMessage);
  socket.on("presence", ({ online }) => onPresence(online));

  function emit(event, data) {
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
    emit,
    isConnected: () => socket.connected,
    stop: () => socket.disconnect(),
  };
}
