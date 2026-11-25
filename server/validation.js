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

module.exports = { validateSignup, parseIdentifier, normalizePhone };
