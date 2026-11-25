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
| GET | `/api/conversations` | — lists the chats you're a member of |
| POST | `/api/conversations` | `{ title, kind?, clientKey? }` — creates a chat you own; an existing `clientKey` returns that chat |
| GET | `/api/conversations/:id/messages?before=&limit=` | — members only; oldest-first page, `hasMore` for older pages |
| GET | `/api/messages?after=` | — every message in your chats (`text`, `senderId`, `conversationId`, …), oldest first; `after=<id>` returns only newer ones; pages of 1000 with `hasMore` |
| POST | `/api/messages` | `{ conversationId, text, clientId? }` — members only |

All but signup/login need `Authorization: Bearer <token>`.

### Live messages (Socket.IO)

A Socket.IO server runs on **http://localhost:3000** (`SOCKET_PORT`) in the same process as the API, so it can push a message the moment it's saved. Allowed browser origins come from `CLIENT_ORIGINS` (default: the Vite dev server and the API port).

The client connects with `socket.io-client`, passing the JWT in the handshake: `io("http://localhost:3000", { auth: { token } })`. A missing or invalid token fails with a `connect_error` whose message is `Unauthorized`. Each user joins a private room, `user:<id>`.

| Event (server → client) | When |
|---|---|
| `new_message` | a message was saved in a chat you're a member of (same shape as `GET /api/messages`), whether it was sent over REST or the socket |
| `presence` | `{ online }`: number of distinct users connected changed |

#### Personal chats (client → server, with acknowledgement)

| Event | Payload | Ack |
|---|---|---|
| `join_room` | `{ userId }` opens (or creates) your one-to-one chat with that user; `{ conversationId }` re-joins a chat you're in | `{ ok, conversation: { …, otherUser }, messages }` (last 50) or `{ ok: false, error }` |
| `new_message` | `{ conversationId, text, clientId? }` | `{ ok, message }` or `{ ok: false, error }` |

`join_room` puts the socket in the `conversation:<id>` room. `new_message` applies the same checks as `POST /api/messages` (validation, membership, `clientId` retry safety), stores the message, and emits `new_message` to the conversation room and to every member's `user:<id>` room, so the other person gets it even if they haven't opened the chat. There is exactly one personal chat per pair of users, enforced by `conversations.direct_key` (`"<lower id>:<higher id>"`, unique).

`POST /api/messages` works too and emits the same event, so validation, membership checks and retry-safety stay consistent. Socket.IO handles reconnection; on every `connect` the client calls `GET /api/messages?after=<last id>` to fill in anything missed while offline. Set `VITE_SOCKET_URL` to point the frontend at a different Socket.IO server.

Socket.IO code lives in `server/socket-io/`:

```
server/socket-io/
├── index.js          creates the server on SOCKET_PORT, applies middleware, registers handlers
├── middleware.js     authenticate: verifies the handshake JWT and loads the user
└── handlers/
    ├── chat.js           joins the user:<id> room; pushes saved messages to chat members
    ├── personalChat.js   join_room and new_message for one-to-one chats
    └── presence.js       tracks connected users and emits presence
```

### Tables

**`conversations`**: `id` BIGINT PK · `kind` (`direct`/`group`) · `title` · `created_by` → `users.id` (NULL for the shared lounge) · `client_key` (unique per creator; the app's demo chats use `trek`, `flat`, …) · `direct_key` (unique; one personal chat per pair of users) · `created_at`

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
