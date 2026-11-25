const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/User");

async function authenticate(socket, next) {
  try {
    const { token } = socket.handshake.auth || {};
    if (typeof token !== "string") throw new Error("missing token");
    const { userId } = jwt.verify(token, config.jwt.secret, { algorithms: ["HS256"] });
    if (!Number.isInteger(userId)) throw new Error("bad payload");
    const user = await User.findByPk(userId, { attributes: ["id", "name"] });
    if (!user) throw new Error("unknown user");
    socket.data.userId = user.id;
    socket.data.name = user.name;
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
}

module.exports = { authenticate };
