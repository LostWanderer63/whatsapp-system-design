const mysql = require("mysql2/promise");
const { Sequelize } = require("sequelize");
const config = require("./config");

const { host, port, user, password, name } = config.db;

const sequelize = new Sequelize(name, user, password, {
  host,
  port,
  dialect: "mysql",
  logging: false,
});

async function initDB() {
  const conn = await mysql.createConnection({ host, port, user, password });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.end();

  await sequelize.authenticate();
  const User = require("./models/User");
  const Conversation = require("./models/Conversation");
  const ConversationMember = require("./models/ConversationMember");
  require("./models/Message");

  await User.sync();
  await Conversation.sync();
  await ConversationMember.sync();
  await require("./migrations").runMigrations();
  await sequelize.sync();
}

module.exports = { sequelize, initDB };
