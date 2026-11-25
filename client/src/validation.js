const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MIN_PASSWORD = 8;

export function isEmail(value) {
  return EMAIL_RE.test(value.trim());
}

export function phoneDigits(value) {
  return value.replace(/\D/g, "");
}

export function isPhone(value) {
  const v = value.trim();
  if (!/^[+\d\s().-]+$/.test(v)) return false;
  const n = phoneDigits(v).length;
  return n >= 10 && n <= 15;
}

export function validateSignup({ name, email, phone, password }) {
  const errors = {};
  const n = name.trim();
  if (n.length < 2) errors.name = "Enter your name (at least 2 characters).";
  else if (n.length > 60) errors.name = "Name must be 60 characters or fewer.";
  if (!isEmail(email)) errors.email = "Enter a valid email address, like name@example.com.";
  if (!isPhone(phone)) errors.phone = "Enter a valid phone number, like 98765 43210.";
  if (password.length < MIN_PASSWORD) errors.password = `Use at least ${MIN_PASSWORD} characters.`;
  else if (password.length > 72) errors.password = "Password must be 72 characters or fewer.";
  return errors;
}

export function identifierKind(value) {
  const v = value.trim();
  if (!v) return null;
  if (v.includes("@")) return "email";
  if (/^[+\d\s().-]+$/.test(v)) return "phone";
  return null;
}

export function validateLogin({ identifier, password }) {
  const errors = {};
  const kind = identifierKind(identifier);
  if (!kind || (kind === "email" && !isEmail(identifier)) || (kind === "phone" && !isPhone(identifier))) {
    errors.identifier = "Enter the email or phone number you signed up with.";
  }
  if (!password) errors.password = "Enter your password.";
  return errors;
}

export function passwordStrength(pw) {
  if (pw.length < MIN_PASSWORD) return 0;
  let score = 1;
  if (pw.length >= 12) score++;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  if (kinds >= 3) score++;
  return Math.min(score, 3);
}
