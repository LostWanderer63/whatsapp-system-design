import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Avatar, Ticks } from "./bits.jsx";
import { ME, PEOPLE, firstName } from "./data.js";
import { clock, dayLabel, fullStamp, startOfDay } from "./time.js";

const GROUP_GAP = 5 * 60_000; // messages closer than this from one sender form one group
const NEAR_BOTTOM = 96; // px: within this, we treat you as "following" the chat
const JUMBO = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️|\s)+$/u;

// Where you left each chat, so switching away and back keeps your place.
const savedScroll = new Map();

const smooth = () => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

function isJumbo(text) {
  if (!JUMBO.test(text)) return false;
  const count = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text.trim())].filter((s) => s.segment.trim()).length;
  return count <= 3;
}

function groupByDay(messages) {
  const days = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const day = startOfDay(m.at);
    if (!days.length || days.at(-1).day !== day) days.push({ day, items: [] });
    const joinsPrev = prev && prev.from === m.from && startOfDay(prev.at) === day && m.at - prev.at < GROUP_GAP;
    const joinsNext = next && next.from === m.from && startOfDay(next.at) === day && next.at - m.at < GROUP_GAP;
    days.at(-1).items.push({ m, first: !joinsPrev, last: !joinsNext });
  });
  return days;
}

export default function MessageList({ convo, dividerId }) {
  const scroller = useRef(null);
  const divider = useRef(null);
  const following = useRef(true); // are we pinned to the newest message?
  const autoScrolling = useRef(false); // a smooth scroll we started is still running
  const lastTop = useRef(0);
  const seenCount = useRef(convo.messages.length);
  const initialIds = useRef(null);
  initialIds.current ??= new Set(convo.messages.map((m) => m.id));

  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [fresh, setFresh] = useState(0); // messages that arrived while you were scrolled up

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

  // Opening a chat: unread divider first, else where you left off, else the bottom.
  useLayoutEffect(() => {
    const el = scroller.current;
    const saved = savedScroll.get(convo.id);
    if (divider.current) {
      const offset = divider.current.getBoundingClientRect().top - el.getBoundingClientRect().top;
      el.scrollTop += offset - 56; // leave room for the sticky day label
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New messages: yours always scroll into view; others' only if you're at the bottom.
  useLayoutEffect(() => {
    const count = convo.messages.length;
    const added = count - seenCount.current;
    seenCount.current = count;
    if (added <= 0) return;
    if (convo.messages.at(-1).from === ME || following.current) scrollToEnd(true);
    else setFresh((n) => n + added);
  }, [convo.messages, scrollToEnd]);

  // Typing indicator appearing shouldn't hide under the composer.
  useLayoutEffect(() => {
    if (convo.typing && following.current) scrollToEnd(true);
  }, [convo.typing, scrollToEnd]);

  // When the viewport shrinks (composer grows, keyboard opens, window resizes), stay pinned.
  useEffect(() => {
    const el = scroller.current;
    const ro = new ResizeObserver(() => {
      if (following.current && !autoScrolling.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
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

  // Any manual input cancels "this is our own smooth scroll".
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
                  const mine = m.from === ME;
                  const person = PEOPLE[m.from];
                  const jumbo = isJumbo(m.text);
                  return [
                    m.id === dividerId && (
                      <li key="divider" ref={divider} className="unread-divider">
                        <span>Unread messages</span>
                      </li>
                    ),
                    <li
                      key={m.id}
                      className={`msg${mine ? " mine" : ""}${jumbo ? " jumbo" : ""}${initialIds.current.has(m.id) ? "" : " pop"}`}
                      data-first={first ? "" : undefined}
                      data-last={last ? "" : undefined}
                    >
                      {!mine && isGroup && <span className="msg-avatar">{last && <Avatar name={person.name} tone={person.tone} size={30} />}</span>}
                      <div className="msg-bubble" title={fullStamp(m.at)}>
                        {!mine && isGroup && first && <span className={`msg-from ink-${person.tone}`}>{firstName(person.name)}</span>}
                        {!mine && isGroup && !first && <span className="sr-only">{firstName(person.name)}: </span>}
                        {mine && <span className="sr-only">You: </span>}
                        <span className="msg-text">{m.text}</span>
                        <span className="msg-meta">
                          <time dateTime={new Date(m.at).toISOString()}>{clock(m.at)}</time>
                          {mine && <Ticks status={m.status} />}
                        </span>
                      </div>
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
