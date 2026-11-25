const DAY = 86_400_000;

const clockFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const shortWeekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
const dateYearFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
const numericFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "numeric", year: "2-digit" });
const fullFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" });

export const clock = (t) => clockFmt.format(t);
export const fullStamp = (t) => fullFmt.format(t);

export function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Whole calendar days between t and now (rounding absorbs DST shifts).
function daysAgo(t, now) {
  return Math.round((startOfDay(now) - startOfDay(t)) / DAY);
}

/** Label for the sticky separator above each day of messages. */
export function dayLabel(t, now = Date.now()) {
  const n = daysAgo(t, now);
  if (n === 0) return "Today";
  if (n === 1) return "Yesterday";
  if (n < 7) return weekdayFmt.format(t);
  return new Date(t).getFullYear() === new Date(now).getFullYear() ? dateFmt.format(t) : dateYearFmt.format(t);
}

/** Compact stamp for the chat list: time today, then weekday, then date. */
export function listStamp(t, now = Date.now()) {
  const n = daysAgo(t, now);
  if (n === 0) return clock(t);
  if (n === 1) return "Yesterday";
  if (n < 7) return shortWeekdayFmt.format(t);
  return numericFmt.format(t);
}

export function lastSeen(t, now = Date.now()) {
  const n = daysAgo(t, now);
  if (n === 0) return `last seen today at ${clock(t)}`;
  if (n === 1) return `last seen yesterday at ${clock(t)}`;
  return `last seen ${dayLabel(t, now)}`;
}
