const MAX_DELAY = 30000;

export function connectLive({ getToken, onReady, onMessage, onPresence, onStatus, onUnauthorized }) {
  let ws = null;
  let attempt = 0;
  let timer = null;
  let stopped = false;

  function open() {
    onStatus("connecting");
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${protocol}://${window.location.host}/ws`);

    ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token: getToken() }));

    ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.type === "ready") {
        attempt = 0;
        onStatus("online");
        onReady();
      } else if (data.type === "message") {
        onMessage(data.message);
      } else if (data.type === "presence") {
        onPresence(data.online);
      }
    };

    ws.onclose = (event) => {
      ws = null;
      if (stopped) return;
      onStatus("offline");
      if (event.code === 4001) {
        onUnauthorized();
        return;
      }
      const delay = Math.min(MAX_DELAY, 1000 * 2 ** attempt) * (0.75 + Math.random() * 0.5);
      attempt += 1;
      timer = setTimeout(open, delay);
    };
  }

  open();

  return () => {
    stopped = true;
    clearTimeout(timer);
    ws?.close();
  };
}
