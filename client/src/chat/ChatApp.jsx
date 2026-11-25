import { useCallback, useEffect, useRef, useState } from "react";
import ConversationList from "./ConversationList.jsx";
import ConversationView from "./ConversationView.jsx";
import { INCOMING, ME, REPLIES, firstName, nextId, seedConversations } from "./data.js";
import "./chat.css";

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export default function ChatApp({ user, activeId, onLogout }) {
  const [convos, setConvos] = useState(() => seedConversations(Date.now()));
  const [drafts, setDrafts] = useState({});
  // First unread message of each chat, captured when it is opened, so the
  // "unread" divider stays put while you read.
  const [dividers, setDividers] = useState({});
  const [opened, setOpened] = useState(null);

  const active = convos.find((c) => c.id === activeId) || null;

  // Opening a chat marks it read. Done during render (not in an effect) so the
  // thread mounts already knowing where the divider is and can scroll to it.
  if ((active?.id ?? null) !== opened) {
    setOpened(active?.id ?? null);
    if (active) {
      const firstUnread = active.unread ? active.messages[active.messages.length - active.unread].id : null;
      setDividers((d) => ({ ...d, [active.id]: firstUnread }));
      if (active.unread) setConvos((cs) => cs.map((c) => (c.id === active.id ? { ...c, unread: 0 } : c)));
    }
  }

  const activeRef = useRef(activeId);
  activeRef.current = active?.id ?? null;
  const convosRef = useRef(convos);
  convosRef.current = convos;

  const timers = useRef(new Set());
  const replying = useRef(new Set());
  const later = useCallback((fn, ms) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
      replying.current.clear();
    };
  }, []);

  const update = useCallback((id, fn) => setConvos((cs) => cs.map((c) => (c.id === id ? fn(c) : c))), []);

  const receive = useCallback(
    (convoId, from, text) => {
      const msg = { id: nextId(), from, text, at: Date.now() };
      update(convoId, (c) => ({
        ...c,
        typing: c.typing === from ? null : c.typing,
        messages: [...c.messages.map((m) => (m.from === ME ? { ...m, status: "read" } : m)), msg],
        unread: activeRef.current === convoId ? 0 : c.unread + 1,
      }));
    },
    [update]
  );

  useEffect(() => {
    INCOMING.forEach(({ after, convo, from, text }) => later(() => receive(convo, from, text), after));
  }, [later, receive]);

  function send(convoId, text) {
    const msg = { id: nextId(), from: ME, text, at: Date.now(), status: "sent" };
    update(convoId, (c) => ({ ...c, messages: [...c.messages, msg] }));
    setDrafts((d) => ({ ...d, [convoId]: "" }));
    later(() => update(convoId, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === msg.id && m.status === "sent" ? { ...m, status: "delivered" } : m)) })), 600);

    // Someone answers: a typing indicator, then a reply. One per burst.
    if (replying.current.has(convoId)) return;
    replying.current.add(convoId);
    const convo = convosRef.current.find((c) => c.id === convoId);
    const who = pick(convo.members);
    const reply = pick(REPLIES[convoId] || ["👍"]);
    const typingFor = Math.min(3500, 1200 + reply.length * 35);
    later(() => update(convoId, (c) => ({ ...c, typing: who })), 1300);
    later(() => {
      replying.current.delete(convoId);
      receive(convoId, who, reply);
    }, 1300 + typingFor);
  }

  const totalUnread = convos.reduce((n, c) => n + c.unread, 0);
  useEffect(() => {
    document.title = `${totalUnread ? `(${totalUnread}) ` : ""}${active ? active.title : "Chats"} · Chorus`;
  }, [totalUnread, active]);

  return (
    <div className="app" data-open={active ? "" : undefined}>
      <ConversationList convos={convos} activeId={active?.id} drafts={drafts} user={user} onLogout={onLogout} />
      <main className="pane">
        {active ? (
          <ConversationView
            key={active.id}
            convo={active}
            dividerId={dividers[active.id]}
            draft={drafts[active.id] || ""}
            onDraft={(text) => setDrafts((d) => ({ ...d, [active.id]: text }))}
            onSend={(text) => send(active.id, text)}
          />
        ) : (
          <EmptyPane name={user.name} />
        )}
      </main>
    </div>
  );
}

function EmptyPane({ name }) {
  return (
    <div className="empty">
      <div className="empty-art" aria-hidden="true">
        <span className="tone-violet" />
        <span className="tone-mint" />
        <span className="tone-butter" />
      </div>
      <h1>Hey {firstName(name)}, pick a chat</h1>
      <p>Your conversations are on the left. These are demo chats that live in this tab only.</p>
    </div>
  );
}
