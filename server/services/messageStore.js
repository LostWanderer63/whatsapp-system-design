const User = require("../models/User");
const Message = require("../models/Message");
const ArchivedMessage = require("../models/ArchivedMessage");

const withSender = [{ model: User, as: "sender", attributes: ["id", "name"] }];

async function findMessages({ where, direction = "ASC", limit }) {
  const query = { where, include: withSender, order: [["id", direction]], limit };
  const [live, archived] = await Promise.all([Message.findAll(query), ArchivedMessage.findAll(query)]);
  const merged = [...archived, ...live].sort((a, b) => {
    const diff = BigInt(a.id) - BigInt(b.id);
    return direction === "ASC" ? (diff < 0n ? -1 : diff > 0n ? 1 : 0) : diff > 0n ? -1 : diff < 0n ? 1 : 0;
  });
  return merged.slice(0, limit);
}

module.exports = { findMessages };
