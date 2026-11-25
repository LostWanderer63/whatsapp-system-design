const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Op, UniqueConstraintError } = require("sequelize");
const config = require("../config");
const { sequelize } = require("../db");
const User = require("../models/User");
const { validateSignup, parseIdentifier } = require("../validation");

const router = express.Router();

function signToken(user) {
  return jwt.sign({ userId: user.id }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

router.post("/signup", async (req, res, next) => {
  const { errors, values } = validateSignup(req.body || {});
  if (Object.keys(errors).length) {
    return res.status(400).json({ message: "Please fix the highlighted fields.", errors });
  }

  let transaction;
  try {
    transaction = await sequelize.transaction();

    const taken = await User.findAll({
      where: { [Op.or]: [{ email: values.email }, { phone: values.phone }] },
      attributes: ["email", "phone"],
      transaction,
    });
    const conflict = {};
    if (taken.some((u) => u.email === values.email)) conflict.email = "An account with this email already exists.";
    if (taken.some((u) => u.phone === values.phone)) conflict.phone = "An account with this phone number already exists.";
    if (Object.keys(conflict).length) {
      await transaction.rollback();
      return res.status(409).json({ message: "User already exists. Please log in.", errors: conflict });
    }

    const passwordHash = await bcrypt.hash(values.password, config.bcryptRounds);
    const user = await User.create(
      { name: values.name, email: values.email, phone: values.phone, passwordHash },
      { transaction }
    );
    await transaction.commit();

    return res.status(201).json({ message: "Account created.", user: user.toPublic() });
  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback();
    if (err instanceof UniqueConstraintError) {
      return res.status(409).json({ message: "User already exists. Please log in." });
    }
    return next(err);
  }
});

router.post("/login", async (req, res, next) => {
  const { identifier, password } = req.body || {};
  const id = parseIdentifier(identifier);
  if (!id || typeof password !== "string" || !password) {
    const errors = {};
    if (!id) errors.identifier = "Enter the email or phone number you signed up with.";
    if (typeof password !== "string" || !password) errors.password = "Enter your password.";
    return res.status(400).json({ message: "Please fix the highlighted fields.", errors });
  }

  try {
    const user = await User.findOne({ where: { [id.type]: id.value } });
    const valid = user && (await bcrypt.compare(password, user.passwordHash));
    if (!valid) {
      return res.status(401).json({ message: "That email/phone and password don't match an account." });
    }
    return res.json({ message: "Logged in.", token: signToken(user), user: user.toPublic() });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
