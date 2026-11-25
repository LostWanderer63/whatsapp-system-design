import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Avatar, Ticks } from "./bits.jsx";
import { ME, PEOPLE, firstName } from "./data.js";
import { clock, dayLabel, fullStamp, startOfDay } from "./time.js";
import { formatSize } from "./media.js";

const GROUP_GAP = 5 * 60_000;
const NEAR_BOTTOM = 96;
const JUMBO = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️|\s)+$/u;

const savedScroll = new Map();

const smooth = () => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

function isJumbo(text) {
  if (!JUMBO.test(text)) return false;
  const count = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text.trim())].filter((s) => s.segment.trim()).length;
  return count <= 3;
}

function UploadProgress({ value }) {
  return (
    <span className="att-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((value || 0) * 100)}>
      <span style={{ width: `${Math.round((value || 0) * 100)}%` }} />
    </span>
  );
}

function Attachment({ attachment: a, sending, progress }) {
  const progressBar = sending && <UploadProgress value={progress} />;
  if (!a.url) {
    return (
      <span className="att att-file is-missing">
        <span className="att-file-icon" aria-hidden="true">📄</span>
        <span className="att-file-text">
          <strong>{a.name}</strong>
          <small>File unavailable</small>
        </span>
      </span>
    );
  }
  if (a.kind === "image") {
    return (
      <a className="att att-image" href={a.url} target="_blank" rel="noopener noreferrer" aria-label={`Open image ${a.name}`}>
        <img src={a.url} alt={a.name} loading="lazy" />
        {progressBar}
      </a>
    );
  }
  if (a.kind === "video") {
    return (
      <span className="att att-video">
        <video src={a.url} controls preload="metadata" />
        {progressBar}
      </span>
    );
  }
  if (a.kind === "audio") {
    return (
      <span className="att att-audio">
        <audio src={a.url} controls preload="metadata" />
        {progressBar}
      </span>
    );
  }
  const extension = a.name.includes(".") ? a.name.split(".").pop().toUpperCase() : "FILE";
  return (
    <a className="att att-file" href={a.url} target="_blank" rel="noopener noreferrer" download={a.name}>
      <span className="att-file-icon" aria-hidden="true">{extension.slice(0, 4)}</span>
      <span className="att-file-text">
        <strong>{a.name}</strong>
        <small>
          {formatSize(a.size)} · {extension}
        </small>
      </span>
      {progressBar}
    </a>
  );
}

function groupByDay(messages) {
  const days = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const day = startOfDay(m.at);
    if (!days.length || days.at(-1).day !== day) days.push({ day, items: [] });
    const joins = (other) => other && !other.system && !m.system && other.from === m.from && startOfDay(other.at) === day && Math.abs(m.at - other.at) < GROUP_GAP;
    const joinsPrev = joins(prev);
    const joinsNext = joins(next);
    days.at(-1).items.push({ m, first: !joinsPrev, last: !joinsNext });
  });
  return days;
}

export default function MessageList({ convo, dividerId, onRetry }) {
  const scroller = useRef(null);
  const divider = useRef(null);
  const following = useRef(true);
  const autoScrolling = useRef(false);
  const lastTop = useRef(0);
  const seenCount = useRef(convo.messages.length);
  const initialIds = useRef(null);
  initialIds.current ??= new Set(convo.messages.map((m) => m.id));

  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [fresh, setFresh] = useState(0);

  const isGroup = convo.kind === "group";
  const days = useMemo(() => groupByDay(convo.messages), [convo.messages]);

  const scrollToEnd = useCallback((animate) => {
    const el = scroller.current;
    following.current = true;
    setAwayFromBottom(false);
    setFresh(0);
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 1) return;
    autoScrolling.current = animate;
    el.scrollTo({ top: el.scrollHeight, behavior: animate ? smooth() : "auto" });
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    const saved = savedScroll.get(convo.id);
    if (divider.current) {
      const offset = divider.current.getBoundingClientRect().top - el.getBoundingClientRect().top;
      el.scrollTop += offset - 56;
    } else if (saved && !saved.following) {
      el.scrollTop = saved.top;
    } else {
      el.scrollTop = el.scrollHeight;
    }
    lastTop.current = el.scrollTop;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    following.current = near;
    setAwayFromBottom(!near);
    return () => savedScroll.set(convo.id, { top: lastTop.current, following: following.current });
  }, []);

  useLayoutEffect(() => {
    const count = convo.messages.length;
    const added = count - seenCount.current;
    seenCount.current = count;
    if (added <= 0) return;
    if (convo.messages.at(-1).from === ME || following.current) scrollToEnd(true);
    else setFresh((n) => n + added);
  }, [convo.messages, scrollToEnd]);

  useLayoutEffect(() => {
    if (convo.typing && following.current) scrollToEnd(true);
  }, [convo.typing, scrollToEnd]);

  useEffect(() => {
    const el = scroller.current;
    const ro = new ResizeObserver(() => {
      if (following.current && !autoScrolling.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);

  function onScroll() {
    const el = scroller.current;
    lastTop.current = el.scrollTop;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (autoScrolling.current) {
      if (distance < 2) autoScrolling.current = false;
      return;
    }
    const near = distance < NEAR_BOTTOM;
    following.current = near;
    setAwayFromBottom(!near);
    if (near) setFresh(0);
  }

  const userTookOver = () => {
    autoScrolling.current = false;
  };

  const typist = convo.typing ? PEOPLE[convo.typing] : null;

  return (
    <div className="thread">
      <div
        ref={scroller}
        className="scroller"
        onScroll={onScroll}
        onWheel={userTookOver}
        onTouchStart={userTookOver}
        onPointerDown={userTookOver}
        onKeyDown={userTookOver}
        tabIndex={0}
        role="log"
        aria-label={`Messages in ${convo.title}`}
      >
        <div className="thread-inner">
          {days.map(({ day, items }) => (
            <section key={day} className="day" aria-label={dayLabel(day)}>
              <h2 className="day-label">
                <span>{dayLabel(day)}</span>
              </h2>
              <ol className="msgs">
                {items.map(({ m, first, last }) => {
                  if (m.system) {
                    return (
                      <li key={m.id} className="sys-note">
                        <span>{m.text}</span>
                      </li>
                    );
                  }
                  const mine = m.from === ME;
                  const person = PEOPLE[m.from];
                  const jumbo = !m.attachment && isJumbo(m.text);
                  return [
                    m.id === dividerId && (
                      <li key="divider" ref={divider} className="unread-divider">
                        <span>Unread messages</span>
                      </li>
                    ),
                    <li
                      key={m.id}
                      className={`msg${mine ? " mine" : ""}${jumbo ? " jumbo" : ""}${m.attachment ? ` has-att kind-${m.attachment.kind}` : ""}${m.status === "failed" ? " failed" : ""}${initialIds.current.has(m.id) ? "" : " pop"}`}
                      data-first={first ? "" : undefined}
                      data-last={last ? "" : undefined}
                    >
                      {!mine && isGroup && <span className="msg-avatar">{last && <Avatar name={person.name} tone={person.tone} size={30} />}</span>}
                      <div className="msg-bubble" title={fullStamp(m.at)}>
                        {!mine && isGroup && first && <span className={`msg-from ink-${person.tone}`}>{firstName(person.name)}</span>}
                        {!mine && isGroup && !first && <span className="sr-only">{firstName(person.name)}: </span>}
                        {mine && <span className="sr-only">You: </span>}
                        {m.attachment && <Attachment attachment={m.attachment} sending={m.status === "sending"} progress={m.progress} />}
                        {m.text && <span className="msg-text">{m.text}</span>}
                        <span className="msg-meta">
                          <time dateTime={new Date(m.at).toISOString()}>{clock(m.at)}</time>
                          {mine && <Ticks status={m.status} />}
                        </span>
                      </div>
                      {m.status === "failed" && (
                        <p className="msg-failed" role="alert">
                          Not sent. {m.error}{" "}
                          <button type="button" onClick={() => onRetry(m.id)}>
                            Retry
                          </button>
                        </p>
                      )}
                    </li>,
                  ];
                })}
              </ol>
            </section>
          ))}

          {typist && (
            <div className="msg typing" data-first="" data-last="" aria-live="off">
              {isGroup && (
                <span className="msg-avatar">
                  <Avatar name={typist.name} tone={typist.tone} size={30} />
                </span>
              )}
              <div className="msg-bubble">
                <span className="dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="sr-only">{firstName(typist.name)} is typing</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {awayFromBottom && (
        <button type="button" className={`jump${fresh ? " has-fresh" : ""}`} onClick={() => scrollToEnd(true)}>
          {fresh > 0 && <span>{fresh === 1 ? "1 new message" : `${fresh} new messages`}</span>}
          <ArrowDown />
          {!fresh && <span className="sr-only">Jump to latest message</span>}
        </button>
      )}
    </div>
  );
}
