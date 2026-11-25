import { useState } from "react";
import { Avatar } from "./bits.jsx";
import { ME, PEOPLE, firstName } from "./data.js";
import { listStamp } from "./time.js";
import { attachmentLabel } from "./media.js";

function preview(c, draft) {
  if (c.typing) return { kind: "typing", text: c.kind === "group" ? `${firstName(PEOPLE[c.typing].name)} is typing…` : "typing…" };
  if (draft?.trim()) return { kind: "draft", text: draft };
  const last = c.messages[c.messages.length - 1];
  if (!last) return { kind: "plain", text: c.live ? "Say hi to everyone 👋" : c.group ? "New group" : "" };
  if (last.system) return { kind: "plain", text: last.text };
  const who = last.from === ME ? "You" : c.kind === "group" ? firstName(PEOPLE[last.from].name) : "";
  const text = last.attachment ? [attachmentLabel(last.attachment), last.text].filter(Boolean).join(" · ") : last.text;
  return { kind: "plain", who, text: text.replace(/\s+/g, " ") };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function ConversationList({ convos, activeId, drafts, liveStatus, user, onLogout, syncError, onRetrySync, onStartChat, onNewGroup }) {
  const [query, setQuery] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const q = query.trim().toLowerCase();
  const isEmail = EMAIL_RE.test(q);

  async function startChat() {
    setStarting(true);
    setStartError("");
    try {
      await onStartChat(q);
      setQuery("");
    } catch (err) {
      setStartError(err.message);
    } finally {
      setStarting(false);
    }
  }

  const sorted = [...convos]
    .filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.text.toLowerCase().includes(q)))
    .sort(
      (a, b) =>
        Number(Boolean(b.live)) - Number(Boolean(a.live)) ||
        (b.messages.at(-1)?.at ?? b.openedAt ?? 0) - (a.messages.at(-1)?.at ?? a.openedAt ?? 0)
    );

  return (
    <aside className="sidebar">
      <header className="side-head">
        <div className="brand">
          <img src="/favicon.svg" alt="" width="30" height="30" />
          <span>Chorus</span>
        </div>
        <div className="side-me">
          <button type="button" className="icon-btn" onClick={onNewGroup} aria-label="New group" title="New group">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8M18 8v6M15 11h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <span title={`Signed in as ${user.name}`}>
            <Avatar name={user.name} tone="violet" size={32} />
          </span>
          <button type="button" className="icon-btn" onClick={onLogout} aria-label="Log out" title="Log out">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l4-4-4-4M14 12H4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </header>

      <div className="side-search">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <label className="sr-only" htmlFor="chat-search">Search chats, or enter an email to start one</label>
        <input
          id="chat-search"
          type="search"
          placeholder="Search, or enter an email to chat"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setStartError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && isEmail && !starting) startChat();
          }}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {isEmail && (
        <div className="start-chat">
          <button type="button" className="start-chat-btn" onClick={startChat} disabled={starting}>
            <span className="start-chat-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </span>
            <span className="start-chat-text">
              <strong>{starting ? "Opening chat…" : "Start a chat"}</strong>
              <small>{q}</small>
            </span>
          </button>
          {startError && (
            <p className="start-chat-error" role="alert">
              {startError}
            </p>
          )}
        </div>
      )}

      {syncError && (
        <div className="side-notice" role="alert">
          <span>Saved messages didn't load. {syncError}</span>
          <button type="button" onClick={onRetrySync}>
            Try again
          </button>
        </div>
      )}

      <nav className="convo-scroll" aria-label="Chats">
        {sorted.length === 0 ? (
          !isEmail && <p className="convo-none">No chats match “{query.trim()}”.</p>
        ) : (
          <ul className="convo-list">
            {sorted.map((c) => {
              const last = c.messages.at(-1);
              const p = preview(c, drafts[c.id]);
              return (
                <li key={c.id}>
                  <a className="convo" href={`#/chat/${c.id}`} aria-current={c.id === activeId ? "page" : undefined} data-unread={c.unread ? "" : undefined}>
                    <span className="convo-avatar">
                      <Avatar name={c.title} tone={c.tone} size={48} />
                      {c.live && <span className={`live-dot is-${liveStatus}`} title={liveStatus === "online" ? "Live" : "Reconnecting"} />}
                    </span>
                    <span className="convo-name">{c.title}</span>
                    {last && <time className="convo-time" dateTime={new Date(last.at).toISOString()}>{listStamp(last.at)}</time>}
                    <span className={`convo-preview is-${p.kind}`}>
                      {p.kind === "draft" && <b>Draft: </b>}
                      {p.who && <b>{p.who}: </b>}
                      {p.text}
                    </span>
                    {c.unread > 0 && (
                      <span className="convo-badge">
                        {c.unread}
                        <span className="sr-only"> unread</span>
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </aside>
  );
}
