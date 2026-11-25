const config = require("./config");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Turn what people type ("98765 43210", "+91-98765-43210", "(987) 654-3210")
 * into one stored form: "+" followed by 10 to 15 digits.
 * A bare 10-digit number gets DEFAULT_COUNTRY_CODE. Returns null if it can't be a phone number.
 */
function normalizePhone(value) {
  const raw = String(value || "").trim();
  if (!/^[+\d\s().-]+$/.test(raw)) return null;
  const hasPlus = raw.startsWith("+");
  let digits = raw.replace(/\D/g, "");
  if (!hasPlus) {
    if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1); // trunk prefix 0
    if (digits.length === 10) digits = config.defaultCountryCode + digits;
  }
  return /^\d{10,15}$/.test(digits) ? `+${digits}` : null;
}

function validateSignup(body) {
  const errors = {};
  const name = String(body.name || "").trim().replace(/\s+/g, " ");
  const email = normalizeEmail(body.email);
  const phone = normalizePhone(body.phone);
  const password = typeof body.password === "string" ? body.password : "";

  if (name.length < 2) errors.name = "Enter your name (at least 2 characters).";
  else if (name.length > 60) errors.name = "Name must be 60 characters or fewer.";

  if (!EMAIL_RE.test(email) || email.length > 254) errors.email = "Enter a valid email address, like name@example.com.";

  if (!phone) errors.phone = "Enter a valid phone number, like 98765 43210 or +44 7700 900123.";

  if (password.length < MIN_PASSWORD) errors.password = `Password must be at least ${MIN_PASSWORD} characters.`;
  else if (password.length > 72) errors.password = "Password must be 72 characters or fewer.";

  return { errors, values: { name, email, phone, password } };
}

/** Login accepts an email or a phone number in one field. */
function parseIdentifier(value) {
  const raw = String(value || "").trim();
  if (raw.includes("@")) {
    const email = normalizeEmail(raw);
    return EMAIL_RE.test(email) ? { type: "email", value: email } : null;
  }
  const phone = normalizePhone(raw);
  return phone ? { type: "phone", value: phone } : null;
}

const MAX_MESSAGE = 4000;
const KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** A BIGINT row id from a URL or body ("42" or 42), as a string; null if it isn't one. */
function parseId(value) {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  return /^[1-9]\d{0,18}$/.test(raw) ? raw : null;
}

function validateMessage(body) {
  const errors = {};
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const conversationId = parseId(body.conversationId);
  const clientId = body.clientId == null ? null : String(body.clientId);

  if (!text) errors.text = "Message can't be empty.";
  else if ([...text].length > MAX_MESSAGE) errors.text = `Messages can be up to ${MAX_MESSAGE} characters.`;

  if (!conversationId) errors.conversationId = "Pick a chat to send this message to.";
  if (clientId !== null && !KEY_RE.test(clientId)) errors.clientId = "Invalid client id.";

  return { errors, values: { conversationId, body: text, clientId } };
}

function validateConversation(body) {
  const errors = {};
  const title = String(body.title || "").trim().replace(/\s+/g, " ");
  const kind = body.kind === undefined ? "group" : body.kind;
  const clientKey = body.clientKey == null ? null : String(body.clientKey);

  if (!title) errors.title = "Give the chat a name.";
  else if ([...title].length > 100) errors.title = "Chat names can be up to 100 characters.";
  if (kind !== "group" && kind !== "direct") errors.kind = "Kind must be \"group\" or \"direct\".";
  if (clientKey !== null && !KEY_RE.test(clientKey)) errors.clientKey = "Invalid client key.";

  return { errors, values: { title, kind, clientKey } };
}

module.exports = { validateSignup, parseIdentifier, normalizePhone, validateMessage, validateConversation, parseId, MAX_MESSAGE };
