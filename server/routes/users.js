const express = require("express");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");
const { normalizeEmail } = require("../validation");

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

router.get("/lookup", requireAuth, async (req, res, next) => {
  const email = normalizeEmail(req.query.email);
  if (!EMAIL_RE.test(email)) return res.status(400).json({ message: "Enter a valid email address." });
  try {
    const user = await User.findOne({ where: { email }, attributes: ["id", "name", "email"] });
    if (!user) return res.status(404).json({ message: "No Chorus account uses that email." });
    return res.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
