const PREFIX = "dm:";
const SEPARATOR = "|";

export const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

export function roomIdFor(emailA, emailB) {
  return PREFIX + [normalizeEmail(emailA), normalizeEmail(emailB)].sort().join(SEPARATOR);
}
