const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");
const User = require("./User");

// A chat: a direct chat between two people, or a group.
//   created_by  the user who started it
//   client_key  optional key the app uses to find a chat it created, unique per creator
//               (the built-in demo chats use "trek", "flat", ...)
const Conversation = sequelize.define(
  "Conversation",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    kind: { type: DataTypes.ENUM("direct", "group"), allowNull: false, defaultValue: "group" },
    title: { type: DataTypes.STRING(100), allowNull: false },
    clientKey: { type: DataTypes.STRING(64), allowNull: true, field: "client_key" },
  },
  {
    tableName: "conversations",
    underscored: true,
    updatedAt: false,
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci",
    indexes: [{ name: "conversations_creator_key", unique: true, fields: ["created_by", "client_key"] }],
  }
);

Conversation.belongsTo(User, {
  as: "creator",
  foreignKey: { name: "createdBy", field: "created_by", allowNull: false },
  onDelete: "CASCADE",
});

Conversation.prototype.toPublic = function toPublic() {
  return { id: String(this.id), kind: this.kind, title: this.title, clientKey: this.clientKey, createdBy: this.createdBy, createdAt: this.createdAt };
};

module.exports = Conversation;
