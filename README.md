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
| GET | `/api/media/config` | — `{ enabled, maxBytes, types }` |
| POST | `/api/media/uploads` | `{ conversationId, name, type, size, purpose? }` — signed S3 upload URL(s) and an upload token |
| POST | `/api/media/uploads/parts` | `{ token, partNumbers }` — fresh URLs for multipart parts |
| POST | `/api/media/uploads/complete` | `{ token, parts?, caption?, clientId?, width?, height?, thumbnailToken? }` — verifies the object, saves and broadcasts the message |
| POST | `/api/media/uploads/abort` | `{ token }` |
| POST | `/api/media` | multipart: `file`, `conversationId`, `caption?`, `clientId?` — backup route; the server uploads to S3 |
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

### Media sharing (AWS S3)

Photos, videos, audio, PDFs and office documents can be shared in any chat: use the paperclip in the message box, paste an image, or drop a file onto it. Files up to 100 MB (`MEDIA_MAX_MB`).

**How a file travels** (the same pattern apps like Tinder use for photos: clients upload straight to object storage, the API only handles metadata):

1. The browser prepares the file. Photos larger than 2560 px or 4 MB are resized; every photo and video gets a 480 px JPEG thumbnail and its width and height are recorded.
2. `POST /api/media/uploads` with `{ conversationId, name, type, size }`. The server checks membership, type and size, and returns pre-signed S3 URLs plus a signed upload token. The exact `Content-Length` and `Content-Type` are part of each signature, so S3 rejects anything else.
   - Up to 8 MB: one signed `PUT`.
   - Larger: an S3 multipart upload with one signed URL per 8 MB part.
3. The browser uploads directly to S3: parts go 3 at a time, and each one is retried on its own.
4. `POST /api/media/uploads/complete` with the token (plus part ETags, caption, `clientId`, dimensions, thumbnail token). The server finishes the multipart upload, confirms with `HeadObject` that the object has exactly the announced size and type (otherwise it is deleted), saves the message and broadcasts `new_message` to the chat's Socket.IO room.

**Why it doesn't fail:**

- Every step retries with exponential backoff and jitter (up to 8 attempts); while the browser is offline it waits for the connection and then carries on, keeping parts that already finished. The bubble shows the progress and notes like "Waiting for connection…".
- Expired upload URLs are refreshed automatically (`POST /api/media/uploads/parts` re-signs parts).
- If the browser can't reach storage directly but the API is fine (for example the bucket's CORS rules are missing), files up to 25 MB (`MEDIA_PROXY_MAX_MB`) switch to the backup route, `POST /api/media`, where the server uploads to S3 itself.
- Completing is idempotent (by `clientId`, and by file), so retries never create duplicate messages.
- Closing the tab during an upload asks for confirmation. Unfinished multipart uploads are cleaned up by the bucket lifecycle rule; failed ones are aborted right away.
- Chat bubbles reserve the photo's real dimensions and show the small thumbnail first, so the chat doesn't jump and opens fast; tapping opens the full file.

The bucket stays **private**. Download links are pre-signed S3 GET URLs, generated whenever messages are sent to a client and valid for `MEDIA_URL_TTL_SECONDS` (12 hours by default). HTML, SVG and other active content types are refused. Set `S3_PUBLIC_BASE_URL` to serve from a public bucket or CloudFront instead. Without `S3_BUCKET` the server runs normally, uploads return 503 and the paperclip is hidden.

#### AWS setup

Requires the AWS CLI, signed in as an account that can create buckets and IAM users. Replace `YOUR_BUCKET_NAME` and the region.

1. Create the bucket (Block Public Access stays on, which is what we want):
   ```bash
   aws s3api create-bucket --bucket YOUR_BUCKET_NAME --region ap-south-1 \
     --create-bucket-configuration LocationConstraint=ap-south-1
   ```
2. Allow browser uploads from the frontend's origins ([aws/s3-cors.json](aws/s3-cors.json); add your production URL there; `ETag` must stay exposed for multipart uploads), and clean up unfinished multipart uploads after a day ([aws/s3-lifecycle.json](aws/s3-lifecycle.json)):
   ```bash
   aws s3api put-bucket-cors --bucket YOUR_BUCKET_NAME --cors-configuration file://aws/s3-cors.json
   aws s3api put-bucket-lifecycle-configuration --bucket YOUR_BUCKET_NAME \
     --lifecycle-configuration file://aws/s3-lifecycle.json
   ```
3. Create an IAM user for the app with access to `media/*` and `thumbs/*` only. Put your bucket name into [aws/iam-policy.json](aws/iam-policy.json) first. `s3:GetObject` lets the server sign download links and verify uploads; `s3:DeleteObject` and `s3:AbortMultipartUpload` let it clean up bad or abandoned uploads.
   ```bash
   aws iam create-user --user-name chorus-media
   aws iam put-user-policy --user-name chorus-media --policy-name chorus-media-s3 \
     --policy-document file://aws/iam-policy.json
   aws iam create-access-key --user-name chorus-media
   ```
4. Put the values in `.env` (never commit it):
   ```
   AWS_REGION=ap-south-1
   S3_BUCKET=YOUR_BUCKET_NAME
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   ```

`MEDIA_MAX_MB` (default 100) caps file size; `MEDIA_PROXY_MAX_MB` (default 25) caps the backup route. `S3_ENDPOINT` and `S3_FORCE_PATH_STYLE=true` point the SDK at an S3-compatible server such as MinIO or LocalStack for local development.

### Tables

**`conversations`**: `id` BIGINT PK · `kind` (`direct`/`group`) · `title` · `created_by` → `users.id` (NULL for the shared lounge) · `client_key` (unique per creator; the app's demo chats use `trek`, `flat`, …) · `direct_key` (unique; one personal chat per pair of users) · `invite_code` (unique; set for group chats) · `created_at`

**`conversation_members`**: PK (`conversation_id` → `conversations.id`, `user_id` → `users.id`) · `role` (`owner`/`member`) · `joined_at`. Index on `user_id`. Every message read and write is checked against this table.

**`messages`** (attachments add `attachment_key`, `attachment_thumb_key`, `attachment_name`, `attachment_type`, `attachment_size`, `attachment_width`, `attachment_height`)

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
