import { initials } from "./data.js";

export function Avatar({ name, tone, size = 44 }) {
  return (
    <span className={`avatar tone-${tone}`} style={{ "--size": `${size}px` }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

const STATUS_LABEL = { sending: "Sending", failed: "Not sent", sent: "Sent", delivered: "Delivered", read: "Read" };

export function Ticks({ status }) {
  if (status === "sending" || status === "failed") {
    return (
      <span className={`ticks ticks-${status}`}>
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <circle cx="8" cy="8" r="6.2" />
          {status === "sending" ? <path d="M8 4.6V8l2.2 1.4" /> : <path d="M8 4.6v4M8 11.2v.1" />}
        </svg>
        <span className="sr-only">{STATUS_LABEL[status]}</span>
      </span>
    );
  }
  return (
    <span className={`ticks ticks-${status}`}>
      <svg viewBox="0 0 18 12" width="16" height="11" aria-hidden="true">
        <path d="M1.5 6.5 5 10l6.5-8" />
        {status !== "sent" && <path d="m7.5 9 1 1 6.5-8" />}
      </svg>
      <span className="sr-only">{STATUS_LABEL[status]}</span>
    </span>
  );
}

export function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M4.4 3.6 20.6 11a1.1 1.1 0 0 1 0 2L4.4 20.4a.9.9 0 0 1-1.2-1.1L5.6 12 3.2 4.7a.9.9 0 0 1 1.2-1.1Z" fill="currentColor" />
      <path d="M5.8 12h7" stroke="var(--night)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function ArrowDown() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M12 5v14m-6-6 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
