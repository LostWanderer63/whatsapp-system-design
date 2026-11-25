const config = require("../config");
const { sequelize, initDB } = require("../db");
const { archiveOldMessages } = require("./archiveMessages");

const hoursArg = process.argv.find((a) => a.startsWith("--older-than-hours="));
const olderThanHours = hoursArg ? Number(hoursArg.split("=")[1]) : config.archive.olderThanHours;

initDB()
  .then(() => archiveOldMessages({ olderThanHours, batchSize: config.archive.batchSize }))
  .then(() => sequelize.close())
  .catch(async (err) => {
    console.error("Archiving failed:", err.message);
    await sequelize.close().catch(() => {});
    process.exit(1);
  });
