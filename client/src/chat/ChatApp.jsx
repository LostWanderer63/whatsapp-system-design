import { useCallback, useEffect, useRef, useState } from "react";
import ConversationList from "./ConversationList.jsx";
import ConversationView from "./ConversationView.jsx";
import { INCOMING, ME, PEOPLE, REPLIES, firstName, nextId, rememberPerson, seedConversations } from "./data.js";
import { getToken, request } from "../api.js";
import { connectLive } from "./live.js";
import "./chat.css";

const pick = (list) => list[Math.floor(Math.random() * list.length)];

const newClientId = () => (crypto.randomUUID ? crypto.randomUUID() : nextId());

function mergeHistory(convo, stored, userId) {
  const known = new Set(convo.messages.flatMap((m) => [m.id, m.serverId]).filter(Boolean));
  const fresh = stored
    .filter((s) => !known.has(s.id) && !(s.clientId && known.has(s.clientId)))
    .map((s) => ({
      id: s.clientId || `s${s.id}`,
      serverId: s.id,
      from: s.senderId === userId ? ME : rememberPerson(s.senderId, s.senderName),
      text: s.text,
      at: Date.parse(s.createdAt),
      ...(s.senderId === userId ? { status: "sent" } : {}),
    }));
  if (!fresh.length) return convo;
  return { ...convo, messages: [...convo.messages, ...fresh].sort((a, b) => a.at - b.at) };
}

function personalConvo(conversation, otherUser) {
  const from = rememberPerson(otherUser.id, otherUser.name);
  return {
    id: `dm${conversation.id}`,
    kind: "direct",
    personal: true,
    serverId: conversation.id,
    title: otherUser.name,
    tone: PEOPLE[from].tone,
    members: [from],
    messages: [],
    unread: 0,
    typing: null,
    openedAt: Date.now(),
  };
}

export default function ChatApp({ user, activeId, onLogout }) {
  const [convos, setConvos] = useState(() => seedConversations(Date.now()));
  const [drafts, setDrafts] = useState({});
  const [dividers, setDividers] = useState({});
  const [opened, setOpened] = useState(null);
  const [sync, setSync] = useState("loading");
  const [liveStatus, setLiveStatus] = useState("connecting");
  const [online, setOnline] = useState(null);

  const active = convos.find((c) => c.id === activeId) || null;

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

  const serverIds = useRef(new Map());
  const keyByServerId = useRef(new Map());
  const lastId = useRef(0);
  const liveRef = useRef(null);
  const pendingJoins = useRef(new Map());

  const addPersonal = useCallback((conversation, otherUser) => {
    const convo = personalConvo(conversation, otherUser);
    serverIds.current.set(convo.id, Promise.resolve(conversation.id));
    keyByServerId.current.set(conversation.id, convo.id);
    setConvos((cs) => (cs.some((c) => c.id === convo.id) ? cs : [...cs, convo]));
    return convo.id;
  }, []);

  const ensureConversation = useCallback((convo) => {
    let id = serverIds.current.get(convo.id);
    if (!id) {
      const call = convo.live
        ? request("/conversations/lounge/join", { method: "POST", auth: true })
        : request("/conversations", {
            method: "POST",
            auth: true,
            body: { clientKey: convo.id, title: convo.title, kind: convo.kind },
          });
      id = call.then((r) => {
        keyByServerId.current.set(r.conversation.id, convo.id);
        return r.conversation.id;
      });
      id.catch(() => serverIds.current.delete(convo.id));
      serverIds.current.set(convo.id, id);
    }
    return id;
  }, []);

  const applyIncoming = useCallback(
    (stored, { countUnread }) => {
      const byKey = {};
      stored.forEach((m) => {
        lastId.current = Math.max(lastId.current, Number(m.id));
        const key = keyByServerId.current.get(m.conversationId);
        if (key) (byKey[key] ??= []).push(m);
      });
      if (!Object.keys(byKey).length) return;
      setConvos((cs) =>
        cs.map((c) => {
          if (!byKey[c.id]) return c;
          const merged = mergeHistory(c, byKey[c.id], user.id);
          if (merged === c || !countUnread || activeRef.current === c.id) return merged;
          const added = merged.messages.length - c.messages.length;
          const fromOthers = byKey[c.id].filter((m) => m.senderId !== user.id).length;
          return { ...merged, unread: c.unread + Math.min(added, fromOthers) };
        })
      );
    },
    [user.id]
  );

  const fetchSince = useCallback(async (after) => {
    const all = [];
    let cursor = after;
    for (;;) {
      const page = await request(`/messages${cursor ? `?after=${cursor}` : ""}`, { auth: true });
      all.push(...page.messages);
      if (!page.hasMore || !page.messages.length) return all;
      cursor = page.messages.at(-1).id;
    }
  }, []);

  const loadRun = useRef(0);
  const loadHistory = useCallback(async () => {
    const run = ++loadRun.current;
    setSync("loading");
    try {
      const { conversations } = await request("/conversations", { auth: true });
      conversations.filter((c) => c.personal && c.otherUser).forEach((c) => addPersonal(c, c.otherUser));
      conversations.forEach((c) => {
        if (c.clientKey && c.createdBy === user.id && !serverIds.current.has(c.clientKey)) {
          serverIds.current.set(c.clientKey, Promise.resolve(c.id));
          keyByServerId.current.set(c.id, c.clientKey);
        }
      });
      await Promise.all(convosRef.current.map((c) => ensureConversation(c)));
      const all = await fetchSince(null);
      if (run !== loadRun.current) return;
      applyIncoming(all, { countUnread: false });
      setSync("ready");
    } catch (err) {
      if (run !== loadRun.current) return;
      if (err.status === 401) return onLogout();
      setSync(err.message || "Couldn't load your saved messages.");
    }
  }, [ensureConversation, fetchSince, applyIncoming, addPersonal, user.id, onLogout]);

  useEffect(() => {
    loadHistory();
    return () => {
      loadRun.current++;
    };
  }, []);

  const isReady = sync === "ready";
  const onLogoutRef = useRef(onLogout);
  onLogoutRef.current = onLogout;

  const joinRoom = useCallback(
    (payload) =>
      liveRef.current.emit("join_room", payload).then((res) => {
        const { conversation, messages } = res;
        if (conversation.personal && conversation.otherUser) addPersonal(conversation, conversation.otherUser);
        applyIncoming(messages, { countUnread: true });
        return res;
      }),
    [addPersonal, applyIncoming]
  );

  const onLiveMessage = useCallback(
    (m) => {
      if (keyByServerId.current.has(m.conversationId)) {
        applyIncoming([m], { countUnread: true });
        return;
      }
      let pending = pendingJoins.current.get(m.conversationId);
      if (!pending) {
        pending = joinRoom({ conversationId: m.conversationId }).finally(() => pendingJoins.current.delete(m.conversationId));
        pendingJoins.current.set(m.conversationId, pending);
      }
      pending.then(() => applyIncoming([m], { countUnread: true })).catch(() => {});
    },
    [applyIncoming, joinRoom]
  );

  useEffect(() => {
    if (!isReady) return undefined;
    const live = connectLive({
      getToken,
      onStatus: setLiveStatus,
      onPresence: setOnline,
      onMessage: onLiveMessage,
      onReady: () => {
        convosRef.current.filter((c) => c.personal).forEach((c) => joinRoom({ conversationId: c.serverId }).catch(() => {}));
        fetchSince(lastId.current || null)
          .then((missed) => applyIncoming(missed, { countUnread: true }))
          .catch(() => {});
      },
      onUnauthorized: () => onLogoutRef.current(),
    });
    liveRef.current = live;
    return () => {
      live.stop();
      liveRef.current = null;
    };
  }, [isReady, applyIncoming, fetchSince, joinRoom, onLiveMessage]);

  async function startChat(email) {
    if (!liveRef.current) throw new Error("Still connecting. Try again in a moment.");
    const { conversation } = await joinRoom({ email });
    window.location.hash = `/chat/${keyByServerId.current.get(conversation.id)}`;
  }

  const receive = useCallback(
    (convoId, from, text) => {
      const msg = { id: nextId(), from, text, at: Date.now() };
      update(convoId, (c) => ({
        ...c,
        typing: c.typing === from ? null : c.typing,
        messages: [...c.messages.map((m) => (m.from === ME && (m.status === "sent" || m.status === "delivered") ? { ...m, status: "read" } : m)), msg],
        unread: activeRef.current === convoId ? 0 : c.unread + 1,
      }));
    },
    [update]
  );

  useEffect(() => {
    INCOMING.forEach(({ after, convo, from, text }) => later(() => receive(convo, from, text), after));
  }, [later, receive]);

  const patchMessage = useCallback(
    (convoId, id, fn) => update(convoId, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === id ? fn(m) : m)) })),
    [update]
  );

  function send(convoId, text) {
    const msg = { id: newClientId(), from: ME, text, at: Date.now(), status: "sending" };
    update(convoId, (c) => ({ ...c, messages: [...c.messages, msg] }));
    setDrafts((d) => ({ ...d, [convoId]: "" }));
    save(convoId, msg);
  }

  function retry(convoId, id) {
    const msg = convosRef.current.find((c) => c.id === convoId)?.messages.find((m) => m.id === id);
    if (!msg || msg.status !== "failed") return;
    patchMessage(convoId, id, (m) => ({ ...m, status: "sending", error: undefined }));
    save(convoId, msg);
  }

  async function save(convoId, msg) {
    try {
      const conversationId = await ensureConversation(convosRef.current.find((c) => c.id === convoId));
      const body = { conversationId, text: msg.text, clientId: msg.id };
      const live = liveRef.current;
      const { message } = live?.isConnected()
        ? await live.emit("new_message", body)
        : await request("/messages", { method: "POST", auth: true, body });
      patchMessage(convoId, msg.id, (m) => ({ ...m, status: "sent", serverId: message.id }));
    } catch (err) {
      const error = err.fields?.text || err.message || "Couldn't send. Check your connection.";
      patchMessage(convoId, msg.id, (m) => ({ ...m, status: "failed", error }));
      return;
    }
    later(() => patchMessage(convoId, msg.id, (m) => (m.status === "sent" ? { ...m, status: "delivered" } : m)), 600);
    simulateReply(convoId);
  }

  function simulateReply(convoId) {
    const target = convosRef.current.find((c) => c.id === convoId);
    if (replying.current.has(convoId) || target?.live || target?.personal) return;
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
      <ConversationList
        convos={convos}
        activeId={active?.id}
        drafts={drafts}
        liveStatus={liveStatus}
        user={user}
        onLogout={onLogout}
        syncError={sync !== "loading" && sync !== "ready" ? sync : null}
        onRetrySync={loadHistory}
        onStartChat={startChat}
      />
      <main className="pane">
        {sync === "loading" ? (
          <div className="empty" role="status">
            <p>Loading your messages…</p>
          </div>
        ) : active ? (
          <ConversationView
            key={active.id}
            convo={active}
            dividerId={dividers[active.id]}
            draft={drafts[active.id] || ""}
            onDraft={(text) => setDrafts((d) => ({ ...d, [active.id]: text }))}
            onSend={(text) => send(active.id, text)}
            onRetry={(id) => retry(active.id, id)}
            presence={liveStatus === "online" ? `Everyone on Chorus · ${online ?? 1} online` : liveStatus === "connecting" ? "Connecting…" : "Offline · reconnecting…"}
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
      <p>Your conversations are on the left. Messages you send are saved to your account.</p>
    </div>
  );
}
