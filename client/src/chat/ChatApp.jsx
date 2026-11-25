import { useCallback, useEffect, useRef, useState } from "react";
import ConversationList from "./ConversationList.jsx";
import ConversationView from "./ConversationView.jsx";
import GroupDialog from "./GroupDialog.jsx";
import { INCOMING, ME, PEOPLE, REPLIES, firstName, nextId, rememberPerson, seedConversations, toneFor } from "./data.js";
import { getToken, request } from "../api.js";
import { createChatSocket } from "./socket.js";
import { EVENTS } from "./events.js";
import { normalizeEmail, roomIdFor } from "./roomId.js";
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

function convoFromServer(desc, userId) {
  if (desc.personal && desc.otherUser) {
    const from = rememberPerson(desc.otherUser.id, desc.otherUser.name);
    return {
      id: `dm${desc.id}`,
      kind: "direct",
      personal: true,
      serverId: desc.id,
      roomId: desc.roomId,
      title: desc.otherUser.name,
      tone: PEOPLE[from].tone,
      members: [from],
    };
  }
  if (desc.group) {
    const others = desc.members.filter((m) => m.id !== userId);
    return {
      id: `g${desc.id}`,
      kind: "group",
      group: true,
      serverId: desc.id,
      title: desc.title,
      tone: toneFor(Number(desc.id) + 2),
      members: others.map((m) => rememberPerson(m.id, m.name)),
      memberList: desc.members,
      inviteCode: desc.inviteCode,
    };
  }
  return null;
}

export default function ChatApp({ user, activeId, onLogout }) {
  const [convos, setConvos] = useState(() => seedConversations(Date.now()));
  const [drafts, setDrafts] = useState({});
  const [dividers, setDividers] = useState({});
  const [opened, setOpened] = useState(null);
  const [sync, setSync] = useState("loading");
  const [liveStatus, setLiveStatus] = useState("connecting");
  const [online, setOnline] = useState(null);
  const [groupDialog, setGroupDialog] = useState(null);

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
  const onLogoutRef = useRef(onLogout);
  onLogoutRef.current = onLogout;

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
  const chat = useRef(null);
  const syncing = useRef(null);

  const addServerConversation = useCallback(
    (desc) => {
      const built = convoFromServer(desc, user.id);
      if (!built) return null;
      serverIds.current.set(built.id, Promise.resolve(desc.id));
      keyByServerId.current.set(desc.id, built.id);
      setConvos((cs) =>
        cs.some((c) => c.id === built.id)
          ? cs.map((c) => (c.id === built.id ? { ...c, ...built } : c))
          : [...cs, { ...built, messages: [], unread: 0, typing: null, openedAt: Date.now() }]
      );
      return built.id;
    },
    [user.id]
  );

  const removeConversation = useCallback((serverId) => {
    const key = keyByServerId.current.get(serverId);
    if (!key) return;
    keyByServerId.current.delete(serverId);
    serverIds.current.delete(key);
    setConvos((cs) => cs.filter((c) => c.id !== key));
    if (activeRef.current === key) window.location.hash = "/chat";
  }, []);

  const addSystemNote = useCallback(
    (serverId, text) => {
      const key = keyByServerId.current.get(serverId);
      if (key) update(key, (c) => ({ ...c, messages: [...c.messages, { id: nextId(), system: true, text, at: Date.now() }] }));
    },
    [update]
  );

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

  const syncConversations = useCallback(() => {
    syncing.current ??= request("/conversations", { auth: true })
      .then(({ conversations }) => {
        conversations.forEach((c) => {
          if (c.personal || c.group) addServerConversation(c);
          else if (c.clientKey && c.createdBy === user.id && !serverIds.current.has(c.clientKey)) {
            serverIds.current.set(c.clientKey, Promise.resolve(c.id));
            keyByServerId.current.set(c.id, c.clientKey);
          }
        });
        return conversations;
      })
      .finally(() => {
        syncing.current = null;
      });
    return syncing.current;
  }, [addServerConversation, user.id]);

  const loadRun = useRef(0);
  const loadHistory = useCallback(async () => {
    const run = ++loadRun.current;
    setSync("loading");
    try {
      await syncConversations();
      await Promise.all(convosRef.current.map((c) => ensureConversation(c)));
      const all = await fetchSince(null);
      if (run !== loadRun.current) return;
      applyIncoming(all, { countUnread: false });
      setSync("ready");
    } catch (err) {
      if (run !== loadRun.current) return;
      if (err.status === 401) return onLogoutRef.current();
      setSync(err.message || "Couldn't load your saved messages.");
    }
  }, [syncConversations, ensureConversation, fetchSince, applyIncoming]);

  useEffect(() => {
    loadHistory();
    return () => {
      loadRun.current++;
    };
  }, []);

  const isReady = sync === "ready";

  useEffect(() => {
    if (!isReady) return undefined;
    const catchUp = () =>
      syncConversations()
        .then(() => fetchSince(lastId.current || null))
        .then((missed) => applyIncoming(missed, { countUnread: true }))
        .catch(() => {});

    const refreshMembers = (conversationId, members) => {
      const key = keyByServerId.current.get(conversationId);
      const convo = convosRef.current.find((c) => c.id === key);
      if (convo?.group) addServerConversation({ id: conversationId, group: true, title: convo.title, inviteCode: convo.inviteCode, members });
    };

    const socket = createChatSocket({
      getToken,
      onStatus: setLiveStatus,
      onConnected: ({ recovered }) => {
        if (!recovered) catchUp();
      },
      onUnauthorized: () => onLogoutRef.current(),
      on: {
        [EVENTS.NEW_MESSAGE]: (m) => {
          if (keyByServerId.current.has(m.conversationId)) applyIncoming([m], { countUnread: true });
          else syncConversations().then(() => applyIncoming([m], { countUnread: true })).catch(() => {});
        },
        [EVENTS.CONVERSATION_ADDED]: ({ conversation }) => addServerConversation(conversation),
        [EVENTS.CONVERSATION_REMOVED]: ({ conversationId }) => removeConversation(conversationId),
        [EVENTS.GROUP_MEMBER_JOINED]: ({ conversationId, user: who, members }) => {
          refreshMembers(conversationId, members);
          addSystemNote(conversationId, who.id === user.id ? "You joined" : `${who.name} joined`);
        },
        [EVENTS.GROUP_MEMBER_LEFT]: ({ conversationId, user: who, members }) => {
          if (who.id === user.id) return;
          refreshMembers(conversationId, members);
          addSystemNote(conversationId, `${who.name} left`);
        },
        [EVENTS.PRESENCE]: ({ online: count }) => setOnline(count),
      },
    });
    chat.current = socket;
    return () => {
      socket.close();
      chat.current = null;
    };
  }, [isReady, syncConversations, fetchSince, applyIncoming, addServerConversation, removeConversation, addSystemNote, user.id]);

  function requireSocket() {
    if (!chat.current) throw new Error("Still connecting. Try again in a moment.");
    return chat.current;
  }

  function openFromServer({ conversation, messages }) {
    const key = addServerConversation(conversation);
    applyIncoming(messages, { countUnread: false });
    window.location.hash = `/chat/${key}`;
  }

  async function startChat(email) {
    const theirEmail = normalizeEmail(email);
    if (theirEmail === normalizeEmail(user.email)) throw new Error("You can't start a personal chat with yourself.");
    const socket = requireSocket();
    await request(`/users/lookup?email=${encodeURIComponent(theirEmail)}`, { auth: true });
    openFromServer(await socket.openPersonalChat(roomIdFor(user.email, theirEmail)));
  }

  async function createGroup(name, memberEmails) {
    openFromServer(await requireSocket().createGroup(name, memberEmails));
  }

  async function joinGroup(inviteCode) {
    openFromServer(await requireSocket().joinGroup(inviteCode));
  }

  async function leaveGroup(convoKey) {
    const convo = convosRef.current.find((c) => c.id === convoKey);
    if (!convo?.group) return;
    await requireSocket().leaveGroup(convo.serverId);
    removeConversation(convo.serverId);
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
      const socket = chat.current;
      const { message } = socket?.isConnected()
        ? await socket.sendMessage(body)
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
    const convo = convosRef.current.find((c) => c.id === convoId);
    if (!convo || replying.current.has(convoId) || convo.live || convo.personal || convo.group) return;
    replying.current.add(convoId);
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

  const closeGroupDialog = useCallback(() => setGroupDialog(null), []);

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
        onNewGroup={() => setGroupDialog("create")}
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
            onLeaveGroup={() => leaveGroup(active.id)}
            meId={user.id}
            presence={liveStatus === "online" ? `Everyone on Chorus · ${online ?? 1} online` : liveStatus === "connecting" ? "Connecting…" : "Offline · reconnecting…"}
          />
        ) : (
          <EmptyPane name={user.name} />
        )}
      </main>
      {groupDialog && (
        <GroupDialog mode={groupDialog} onModeChange={setGroupDialog} onCreate={createGroup} onJoin={joinGroup} onClose={closeGroupDialog} />
      )}
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
