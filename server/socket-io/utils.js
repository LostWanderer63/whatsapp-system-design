const RATE_WINDOW_MS = 10_000;
const RATE_MAX_EVENTS = 30;

class ClientError extends Error {
  constructor(message, fields) {
    super(message);
    this.fields = fields;
  }
}

function overLimit(socket) {
  const now = Date.now();
  const hits = (socket.data.hits || []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  socket.data.hits = hits;
  return hits.length > RATE_MAX_EVENTS;
}

function withAck(socket, name, handler) {
  return async (payload, ack) => {
    const respond = typeof ack === "function" ? ack : () => {};
    if (overLimit(socket)) {
      respond({ ok: false, error: "You're doing that too fast. Wait a few seconds." });
      return;
    }
    try {
      const body = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
      respond({ ok: true, ...(await handler(body)) });
    } catch (err) {
      if (err instanceof ClientError) {
        respond({ ok: false, error: err.message, ...(err.fields ? { errors: err.fields } : {}) });
        return;
      }
      console.error(`${name} failed:`, err.message);
      respond({ ok: false, error: "Something went wrong. Please try again." });
    }
  };
}

module.exports = { ClientError, withAck };
