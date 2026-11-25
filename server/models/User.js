const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");

const User = sequelize.define(
  "User",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(60), allowNull: false },
    email: { type: DataTypes.STRING(254), allowNull: false, unique: true },
    // Stored normalised, e.g. +919876543210
    phone: { type: DataTypes.STRING(16), allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING(100), allowNull: false, field: "password_hash" },
  },
  { tableName: "users", underscored: true }
);

User.prototype.toPublic = function toPublic() {
  return { id: this.id, name: this.name, email: this.email, phone: this.phone };
};

module.exports = User;
