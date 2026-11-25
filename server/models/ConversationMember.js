const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");
const User = require("./User");
const Conversation = require("./Conversation");

const ConversationMember = sequelize.define(
  "ConversationMember",
  {
    conversationId: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, field: "conversation_id" },
    userId: { type: DataTypes.INTEGER, primaryKey: true, field: "user_id" },
    role: { type: DataTypes.ENUM("owner", "member"), allowNull: false, defaultValue: "member" },
  },
  {
    tableName: "conversation_members",
    underscored: true,
    createdAt: "joinedAt",
    updatedAt: false,
    indexes: [{ name: "conversation_members_user", fields: ["user_id"] }],
  }
);

ConversationMember.belongsTo(Conversation, { foreignKey: { name: "conversationId", field: "conversation_id" }, onDelete: "CASCADE" });
ConversationMember.belongsTo(User, { foreignKey: { name: "userId", field: "user_id" }, onDelete: "CASCADE" });
Conversation.hasMany(ConversationMember, { as: "members", foreignKey: { name: "conversationId", field: "conversation_id" } });

ConversationMember.isMember = async (conversationId, userId, options = {}) =>
  Boolean(await ConversationMember.findOne({ where: { conversationId, userId }, attributes: ["userId"], ...options }));

module.exports = ConversationMember;
