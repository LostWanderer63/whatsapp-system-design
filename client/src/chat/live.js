import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || `${window.location.protocol}//${window.location.hostname}:3000`;

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

  return () => socket.disconnect();
}
