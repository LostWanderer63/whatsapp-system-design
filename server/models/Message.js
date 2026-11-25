const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");
const User = require("./User");
const Conversation = require("./Conversation");

// One row per chat message.
//   sender_id        who sent it (the logged-in user, taken from the JWT, never the request body)
//   conversation_id  which chat it belongs to (FK; the sender must be a member)
//   body             the message text
//   client_id        id the browser generates per message, so a retried send isn't stored twice
const Message = sequelize.define(
  "Message",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    conversationId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: "conversation_id" },
    body: { type: DataTypes.TEXT, allowNull: false },
    clientId: { type: DataTypes.STRING(64), allowNull: true, field: "client_id" },
  },
  {
    tableName: "messages",
    underscored: true,
    updatedAt: false, // messages aren't edited yet; created_at is enough
    // utf8mb4 so emoji are stored correctly
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci",
    indexes: [
      // A chat's history, newest first, paged by id: WHERE conversation_id = ? AND id < ? ORDER BY id DESC
      { name: "messages_conversation_id", fields: ["conversation_id", "id"] },
      // Same sender + same client id = same message (MySQL allows many NULLs here)
      { name: "messages_sender_client", unique: true, fields: ["sender_id", "client_id"] },
    ],
  }
);

Message.belongsTo(User, {
  as: "sender",
  foreignKey: { name: "senderId", field: "sender_id", allowNull: false },
  onDelete: "CASCADE",
});

Message.belongsTo(Conversation, {
  foreignKey: { name: "conversationId", field: "conversation_id", allowNull: false },
  onDelete: "CASCADE",
});

Message.prototype.toPublic = function toPublic() {
  return {
    id: String(this.id), // BIGINT can exceed JS number precision
    conversationId: String(this.conversationId),
    senderId: this.senderId,
    senderName: this.sender?.name,
    text: this.body,
    clientId: this.clientId,
    createdAt: this.createdAt,
  };
};

module.exports = Message;
