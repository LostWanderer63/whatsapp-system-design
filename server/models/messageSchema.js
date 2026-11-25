const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");
const User = require("./User");
const Conversation = require("./Conversation");
const { kindOf } = require("../mediaTypes");

const COLUMNS = [
  "id",
  "conversation_id",
  "sender_id",
  "body",
  "client_id",
  "attachment_key",
  "attachment_name",
  "attachment_type",
  "attachment_size",
  "attachment_thumb_key",
  "attachment_width",
  "attachment_height",
  "created_at",
];

function toPublic() {
  return {
    id: String(this.id),
    conversationId: String(this.conversationId),
    senderId: this.senderId,
    senderName: this.sender?.name,
    text: this.body,
    clientId: this.clientId,
    attachment: this.attachmentKey
      ? {
          key: this.attachmentKey,
          thumbKey: this.attachmentThumbKey,
          name: this.attachmentName,
          type: this.attachmentType,
          size: Number(this.attachmentSize),
          width: this.attachmentWidth,
          height: this.attachmentHeight,
          kind: kindOf(this.attachmentType),
        }
      : null,
    createdAt: this.createdAt,
  };
}

function defineMessageModel(modelName, tableName, { archive = false } = {}) {
  const model = sequelize.define(
    modelName,
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: !archive, primaryKey: true },
      conversationId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: "conversation_id" },
      body: { type: DataTypes.TEXT, allowNull: false },
      clientId: { type: DataTypes.STRING(64), allowNull: true, field: "client_id" },
      attachmentKey: { type: DataTypes.STRING(512), allowNull: true, field: "attachment_key" },
      attachmentName: { type: DataTypes.STRING(255), allowNull: true, field: "attachment_name" },
      attachmentType: { type: DataTypes.STRING(127), allowNull: true, field: "attachment_type" },
      attachmentSize: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: "attachment_size" },
      attachmentThumbKey: { type: DataTypes.STRING(512), allowNull: true, field: "attachment_thumb_key" },
      attachmentWidth: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: "attachment_width" },
      attachmentHeight: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: "attachment_height" },
      ...(archive ? { archivedAt: { type: DataTypes.DATE, allowNull: false, field: "archived_at" } } : {}),
    },
    {
      tableName,
      underscored: true,
      updatedAt: false,
      charset: "utf8mb4",
      collate: "utf8mb4_unicode_ci",
      indexes: [
        { name: `${tableName}_conversation_id`, fields: ["conversation_id", "id"] },
        { name: `${tableName}_sender_client`, unique: true, fields: ["sender_id", "client_id"] },
        ...(archive ? [] : [{ name: `${tableName}_created_at`, fields: ["created_at"] }]),
      ],
    }
  );

  model.belongsTo(User, {
    as: "sender",
    foreignKey: { name: "senderId", field: "sender_id", allowNull: false },
    onDelete: "CASCADE",
  });
  model.belongsTo(Conversation, {
    foreignKey: { name: "conversationId", field: "conversation_id", allowNull: false },
    onDelete: "CASCADE",
  });
  model.prototype.toPublic = toPublic;
  return model;
}

module.exports = { defineMessageModel, COLUMNS };
