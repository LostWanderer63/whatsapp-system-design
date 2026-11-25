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

/** Create the database if needed, connect, and create tables for the models. */
async function initDB() {
  const conn = await mysql.createConnection({ host, port, user, password });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${name}\``);
  await conn.end();

  await sequelize.authenticate();
  require("./models/User");
  await sequelize.sync();
}

module.exports = { sequelize, initDB };
