import { useState } from "react";
import { Avatar } from "./bits.jsx";
import { ME, PEOPLE, firstName } from "./data.js";
import { listStamp } from "./time.js";

function preview(c, draft) {
  if (c.typing) return { kind: "typing", text: c.kind === "group" ? `${firstName(PEOPLE[c.typing].name)} is typing…` : "typing…" };
  if (draft?.trim()) return { kind: "draft", text: draft };
  const last = c.messages[c.messages.length - 1];
  if (!last) return { kind: "plain", text: c.live ? "Say hi to everyone 👋" : "" };
  const who = last.from === ME ? "You" : c.kind === "group" ? firstName(PEOPLE[last.from].name) : "";
  return { kind: "plain", who, text: last.text.replace(/\s+/g, " ") };
}

export default function ConversationList({ convos, activeId, drafts, liveStatus, user, onLogout, syncError, onRetrySync }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const sorted = [...convos]
    .filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.text.toLowerCase().includes(q)))
    .sort((a, b) => Number(Boolean(b.live)) - Number(Boolean(a.live)) || (b.messages.at(-1)?.at ?? 0) - (a.messages.at(-1)?.at ?? 0));

  return (
    <aside className="sidebar">
      <header className="side-head">
        <div className="brand">
          <img src="/favicon.svg" alt="" width="30" height="30" />
          <span>Chorus</span>
        </div>
        <div className="side-me">
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
        <label className="sr-only" htmlFor="chat-search">Search chats</label>
        <input id="chat-search" type="search" placeholder="Search chats and messages" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
      </div>

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
          <p className="convo-none">No chats match “{query.trim()}”.</p>
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
