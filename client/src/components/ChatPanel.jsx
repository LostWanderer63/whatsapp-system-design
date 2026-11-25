// The decorative group conversation on the left. It plays in once on load;
// the last line follows what the person types in the Name field.
const MESSAGES = [
  { from: "Riya", tone: "violet", text: "Trek is on for Saturday. Who's in?" },
  { from: "Kabir", tone: "mint", text: "Me! I'll bring the big thermos" },
  { from: "Meera", tone: "butter", text: "Count me in. Pickup at 6?" },
];

function firstName(name) {
  return name.trim().split(/\s+/)[0] || "";
}

export default function ChatPanel({ mode, name }) {
  const who = firstName(name);
  const event =
    mode === "login"
      ? "Welcome back. 3 new messages in Weekend trek"
      : who
        ? `${who} joined the group`
        : "You're invited to join";

  return (
    <div className="chat">
      <div className="chat-head">
        <span className="chat-avatar">WT</span>
        <div>
          <strong>Weekend trek</strong>
          <small>Riya, Kabir, Meera</small>
        </div>
      </div>
      <ol className="chat-log">
        {MESSAGES.map((m, i) => (
          <li key={m.from} className={`bubble bubble-${m.tone}`} style={{ "--i": i }}>
            <span className="bubble-from">{m.from}</span>
            {m.text}
          </li>
        ))}
        <li className="chat-event" style={{ "--i": MESSAGES.length }}>
          <span key={event} className="chat-event-text">{event}</span>
        </li>
      </ol>
    </div>
  );
}
