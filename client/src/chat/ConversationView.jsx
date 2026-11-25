import { Avatar } from "./bits.jsx";
import Composer from "./Composer.jsx";
import MessageList from "./MessageList.jsx";
import { PEOPLE, firstName } from "./data.js";
import { lastSeen } from "./time.js";

function subtitle(convo, presence) {
  if (convo.live) return presence;
  if (convo.typing) return convo.kind === "group" ? `${firstName(PEOPLE[convo.typing].name)} is typing…` : "typing…";
  if (convo.kind === "group") return ["You", ...convo.members.map((id) => firstName(PEOPLE[id].name))].join(", ");
  const theirs = convo.messages.findLast((m) => m.from === convo.members[0]);
  return theirs ? lastSeen(theirs.at) : "";
}

export default function ConversationView({ convo, dividerId, draft, onDraft, onSend, onRetry, presence }) {
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
      </header>

      <MessageList convo={convo} dividerId={dividerId} onRetry={onRetry} />

      <Composer key={convo.id} value={draft} onChange={onDraft} onSend={onSend} placeholder={`Message ${convo.kind === "group" ? convo.title : firstName(convo.title)}`} />
    </>
  );
}
