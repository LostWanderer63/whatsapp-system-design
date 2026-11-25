const cron = require("node-cron");
const config = require("../config");
const { archiveOldMessages } = require("./archiveMessages");

function startJobs() {
  const { enabled, schedule, timezone, olderThanHours, batchSize } = config.archive;
  if (!enabled) {
    console.log("Message archiving is turned off (ARCHIVE_ENABLED=false).");
    return [];
  }
  if (!cron.validate(schedule)) {
    console.error(`ARCHIVE_CRON "${schedule}" isn't a valid cron expression; archiving is off.`);
    return [];
  }
  const task = cron.schedule(
    schedule,
    () => archiveOldMessages({ olderThanHours, batchSize }).catch((err) => console.error("Archiving failed:", err.message)),
    { timezone, name: "archive-messages", noOverlap: true }
  );
  console.log(`Archiving messages older than ${olderThanHours}h on schedule "${schedule}"${timezone ? ` (${timezone})` : ""}.`);
  return [task];
}

function stopJobs(tasks) {
  for (const task of tasks) task.stop();
}

module.exports = { startJobs, stopJobs };
