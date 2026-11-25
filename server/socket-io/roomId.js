const PREFIX = "dm:";
const SEPARATOR = "|";

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

function roomIdFor(emailA, emailB) {
  return PREFIX + [normalizeEmail(emailA), normalizeEmail(emailB)].sort().join(SEPARATOR);
}

function otherEmailInRoom(roomId, myEmail) {
  if (typeof roomId !== "string" || !roomId.startsWith(PREFIX)) return null;
  const me = normalizeEmail(myEmail);
  const body = roomId.slice(PREFIX.length);
  const candidates = [];
  if (body.startsWith(me + SEPARATOR)) candidates.push(body.slice(me.length + SEPARATOR.length));
  if (body.endsWith(SEPARATOR + me)) candidates.push(body.slice(0, body.length - me.length - SEPARATOR.length));
  return candidates.find((other) => other && roomIdFor(me, other) === roomId) ?? null;
}

module.exports = { roomIdFor, otherEmailInRoom };
