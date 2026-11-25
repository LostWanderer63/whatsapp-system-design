const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");
const User = require("./User");

const Conversation = sequelize.define(
  "Conversation",
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    kind: { type: DataTypes.ENUM("direct", "group"), allowNull: false, defaultValue: "group" },
    title: { type: DataTypes.STRING(100), allowNull: false },
    clientKey: { type: DataTypes.STRING(64), allowNull: true, field: "client_key" },
    directKey: { type: DataTypes.STRING(32), allowNull: true, unique: "conversations_direct_key", field: "direct_key" },
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
  foreignKey: { name: "createdBy", field: "created_by", allowNull: true },
  onDelete: "CASCADE",
});

Conversation.prototype.toPublic = function toPublic() {
  return { id: String(this.id), kind: this.kind, title: this.title, clientKey: this.clientKey, createdBy: this.createdBy, createdAt: this.createdAt };
};

Conversation.LOUNGE_KEY = "lounge";

Conversation.directKeyFor = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);

Conversation.findLounge = () => Conversation.findOne({ where: { clientKey: Conversation.LOUNGE_KEY, createdBy: null } });

Conversation.ensureLounge = async () =>
  (await Conversation.findLounge()) ||
  Conversation.create({ kind: "group", title: "Chorus Lounge", clientKey: Conversation.LOUNGE_KEY, createdBy: null });

module.exports = Conversation;
