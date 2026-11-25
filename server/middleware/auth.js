const jwt = require("jsonwebtoken");
const config = require("../config");

function requireAuth(req, res, next) {
  const match = /^Bearer\s+(\S+)$/i.exec(req.get("authorization") || "");
  if (!match) return res.status(401).json({ message: "Please log in first." });

  try {
    const { userId } = jwt.verify(match[1], config.jwt.secret, { algorithms: ["HS256"] });
    if (!Number.isInteger(userId)) throw new Error("bad payload");
    req.userId = userId;
    return next();
  } catch {
    return res.status(401).json({ message: "Your session has expired. Please log in again." });
  }
}

module.exports = { requireAuth };
