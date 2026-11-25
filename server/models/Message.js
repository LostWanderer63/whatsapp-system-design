const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");
const User = require("./User");
const Conversation = require("./Conversation");

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
    updatedAt: false,
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci",
    indexes: [
      { name: "messages_conversation_id", fields: ["conversation_id", "id"] },
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
    id: String(this.id),
    conversationId: String(this.conversationId),
    senderId: this.senderId,
    senderName: this.sender?.name,
    text: this.body,
    clientId: this.clientId,
    createdAt: this.createdAt,
  };
};

module.exports = Message;
