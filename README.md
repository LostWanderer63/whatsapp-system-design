# Chorus — sign up and log in

Sign-up and login for a group chat app, built with React (Vite) and an Express + MySQL API.

- **Sign up** with name, email, phone number and password
- **Log in** with either your email or your phone number, plus password
- Passwords are hashed with bcrypt; login returns a JWT
- Duplicate email or phone is rejected with a clear message
- Phone numbers are normalised, so `98765 43210`, `+91 98765-43210` and `+919876543210` are the same account

## Setup

```bash
npm install
cp .env.example .env   # fill in DB_USER, DB_PASSWORD and JWT_SECRET
```

The database (`DB_NAME`, default `chorus`) and the `users` table are created automatically on first start.

## Run

```bash
npm run dev     # React on http://localhost:5173, API on http://localhost:4000, Socket.IO on http://localhost:3000
npm start       # builds the React app and serves everything on http://localhost:4000
```

## API

| Method | Path | Body |
|---|---|---|
| POST | `/api/auth/signup` | `{ name, email, phone, password }` |
| POST | `/api/auth/login` | `{ identifier, password }` (identifier = email or phone) |
| POST | `/api/conversations/lounge/join` | — joins the shared Chorus Lounge everyone can talk in |
| GET | `/api/users/lookup?email=` | — `{ user: { id, name, email } }` if an account uses that email, else 404 |
| GET | `/api/conversations` | — lists the chats you're a member of |
| POST | `/api/conversations` | `{ title, kind?, clientKey? }` — creates a chat you own; an existing `clientKey` returns that chat |
| GET | `/api/conversations/:id/messages?before=&limit=` | — members only; oldest-first page, `hasMore` for older pages |
| GET | `/api/messages?after=` | — every message in your chats (`text`, `senderId`, `conversationId`, …), oldest first; `after=<id>` returns only newer ones; pages of 1000 with `hasMore` |
| POST | `/api/messages` | `{ conversationId, text, clientId? }` — members only |

All but signup/login need `Authorization: Bearer <token>`.

### Live messages (Socket.IO)

A Socket.IO server runs on **http://localhost:3000** (`SOCKET_PORT`) in the same process as the API. Allowed browser origins come from `CLIENT_ORIGINS`. Clients connect with `io("http://localhost:3000", { auth: { token } })`; a missing or invalid token fails with `connect_error` → `Unauthorized`.

**How rooms work.** Every chat is a room, `conversation:<id>`, and every user has a private room, `user:<id>`. On connect the server joins the socket to its user room and to the rooms of every chat the user belongs to, so clients never re-join after a reconnect. When someone is added to a chat (new personal chat, new group, joining by code) the server moves all of that user's open sockets into the room with `socketsJoin`, and announces the chat with `conversation_added`. A message is emitted to exactly one room.

**Connection state recovery** is on: after a short drop (up to 2 minutes) Socket.IO restores the socket's rooms and replays missed events, and the client skips its catch-up. After a longer outage the client re-syncs its chat list and calls `GET /api/messages?after=<last id>`.

#### Events

Client → server, each answered through an acknowledgement as `{ ok: true, … }` or `{ ok: false, error }`:

| Event | Payload | Ack |
|---|---|---|
| `new_message` | `{ conversationId, text, clientId? }` | `{ message }` |
| `join_room` | `{ roomId }` or `{ userId }` opens your personal chat with that user; `{ conversationId }` opens a chat you're in | `{ roomId, conversation, messages }` |
| `create_group` | `{ name, memberEmails: [] }` | `{ conversation, messages }` |
| `join_group` | `{ inviteCode }` | `{ conversation, messages }` |
| `leave_group` | `{ conversationId }` | `{}` |

Server → client:

| Event | Payload |
|---|---|
| `new_message` | a saved message (same shape as `GET /api/messages`) |
| `conversation_added` | `{ conversation }`: a chat you were just added to |
| `conversation_removed` | `{ conversationId }`: you left a group (sent to all your tabs) |
| `group_member_joined` / `group_member_left` | `{ conversationId, user, members }` |
| `presence` | `{ online }`: distinct users connected |

Event names live in one place on each side (`server/socket-io/events.js`, `client/src/chat/events.js`).

#### Personal chats

A personal chat's room ID is built from both users' emails, lowercased and sorted: `roomIdFor("bob@example.com", "alice@example.com")` → `dm:alice@example.com|bob@example.com`, the same whoever starts it. The server only accepts a room ID that contains the caller's own email and matches the sorted form exactly. In the app, typing an email into the sidebar search shows **Start a chat**: the client checks it with `GET /api/users/lookup`, builds the room ID and emits `join_room`. One personal chat per pair is enforced by `conversations.direct_key`.

#### Group chats

The people icon in the sidebar opens **New group**: name the group and add people by email (unknown emails are listed back), or switch to **Join with code**. Every group gets an 8-character invite code (no look-alike characters), shown under **Group info** with the member list, the admin badge and **Leave group**. Joins and leaves appear in the chat as notes.

#### Server practices

- One wrapper (`withAck` in `server/socket-io/utils.js`) for every acknowledged event: payload shape check, `ClientError` → `{ ok: false, error }`, logging for unexpected errors, and a per-socket rate limit (30 events per 10 s).
- Listeners are registered synchronously on connect; room joins happen after, so no early event is missed.
- REST and socket replies describe chats through the same service (`server/services/conversations.js`).
- SIGINT/SIGTERM close Socket.IO connections before the process exits.

`POST /api/messages` still works (the client uses it when the socket is down) and emits the same `new_message` event.

```
server/socket-io/
├── index.js            server setup, middleware, handler registration, helpers for REST routes
├── middleware.js       authenticate: verifies the handshake JWT and loads the user
├── events.js           event names
├── rooms.js            room names and socketsJoin / socketsLeave helpers
├── roomId.js           personal chat room IDs from two emails
├── utils.js            withAck, ClientError, rate limiting
└── handlers/
    ├── chat.js           joins rooms on connect; new_message
    ├── personalChat.js   join_room
    ├── groupChat.js      create_group, join_group, leave_group
    └── presence.js       online count
```

### Tables

**`conversations`**: `id` BIGINT PK · `kind` (`direct`/`group`) · `title` · `created_by` → `users.id` (NULL for the shared lounge) · `client_key` (unique per creator; the app's demo chats use `trek`, `flat`, …) · `direct_key` (unique; one personal chat per pair of users) · `invite_code` (unique; set for group chats) · `created_at`

**`conversation_members`**: PK (`conversation_id` → `conversations.id`, `user_id` → `users.id`) · `role` (`owner`/`member`) · `joined_at`. Index on `user_id`. Every message read and write is checked against this table.

**`messages`**

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED, PK | auto-increment; also the paging cursor |
| `conversation_id` | BIGINT, FK → `conversations.id` | sender must be a member |
| `sender_id` | INT, FK → `users.id` | taken from the JWT, never from the request body |
| `body` | TEXT (utf8mb4) | up to 4000 characters; emoji safe |
| `client_id` | VARCHAR(64), nullable | generated by the browser; unique per sender, so a retried send returns the stored message instead of a duplicate |
| `created_at` | DATETIME | |

Indexes: `(conversation_id, id)` for paging a chat's history, unique `(sender_id, client_id)` for safe retries. Deleting a user or chat deletes its rows.

Tables are created on start. Databases from before conversations existed (text `messages.conversation_id`) are migrated automatically on the next start: each chat becomes a conversation owned by the person who wrote in it.
