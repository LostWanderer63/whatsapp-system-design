import { useEffect, useRef, useState } from "react";
import { Avatar } from "./bits.jsx";
import Composer from "./Composer.jsx";
import MessageList from "./MessageList.jsx";
import { PEOPLE, firstName } from "./data.js";
import { lastSeen } from "./time.js";

function subtitle(convo, presence) {
  if (convo.live) return presence;
  if (convo.personal) return "Personal chat";
  if (convo.typing) return convo.kind === "group" ? `${firstName(PEOPLE[convo.typing].name)} is typing…` : "typing…";
  if (convo.kind === "group") return ["You", ...convo.members.map((id) => firstName(PEOPLE[id].name))].join(", ");
  const theirs = convo.messages.findLast((m) => m.from === convo.members[0]);
  return theirs ? lastSeen(theirs.at) : "";
}

function GroupInfo({ convo, meId, onLeave, onClose }) {
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");
  const panel = useRef(null);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(convo.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy. Select the code and copy it yourself.");
    }
  }

  async function leave() {
    if (!window.confirm(`Leave "${convo.title}"? You'll stop getting its messages.`)) return;
    setLeaving(true);
    setError("");
    try {
      await onLeave();
    } catch (err) {
      setError(err.message);
      setLeaving(false);
    }
  }

  const members = [...convo.memberList].sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : a.name.localeCompare(b.name)));

  return (
    <aside className="group-info" ref={panel} tabIndex={-1} aria-label="Group info">
      <div className="group-info-head">
        <h2>Group info</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close group info">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <section>
        <h3>Invite code</h3>
        <div className="invite">
          <code>{convo.inviteCode}</code>
          <button type="button" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="group-info-hint">Anyone with this code can join from New group → Join with code.</p>
      </section>

      <section>
        <h3>
          {members.length} {members.length === 1 ? "member" : "members"}
        </h3>
        <ul className="member-list">
          {members.map((m) => (
            <li key={m.id}>
              <Avatar name={m.name} tone={m.id === meId ? "violet" : PEOPLE[`u${m.id}`]?.tone || "sky"} size={34} />
              <span className="member-name">{m.id === meId ? `${m.name} (you)` : m.name}</span>
              {m.role === "owner" && <small>Admin</small>}
            </li>
          ))}
        </ul>
      </section>

      {error && (
        <p className="group-info-error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="leave-btn" onClick={leave} disabled={leaving}>
        {leaving ? "Leaving…" : "Leave group"}
      </button>
    </aside>
  );
}

export default function ConversationView({ convo, meId, dividerId, draft, onDraft, onSend, onRetry, onLeaveGroup, presence }) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <>
      <header className="pane-head">
        <a className="back icon-btn" href="#/chat" aria-label="Back to chats">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
        <Avatar name={convo.title} tone={convo.tone} size={40} />
        <div className="pane-title">
          <h1>{convo.title}</h1>
          <p className={convo.typing ? "is-typing" : undefined}>{subtitle(convo, presence)}</p>
        </div>
        {convo.group && (
          <button
            type="button"
            className="icon-btn info-btn"
            onClick={() => setShowInfo((v) => !v)}
            aria-label="Group info"
            aria-expanded={showInfo}
            title="Group info"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M12 11v6M12 7.5v.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </header>

      {convo.group && showInfo && <GroupInfo convo={convo} meId={meId} onLeave={onLeaveGroup} onClose={() => setShowInfo(false)} />}

      <MessageList convo={convo} dividerId={dividerId} onRetry={onRetry} />

      <Composer key={convo.id} value={draft} onChange={onDraft} onSend={onSend} placeholder={`Message ${convo.kind === "group" ? convo.title : firstName(convo.title)}`} />
    </>
  );
}
