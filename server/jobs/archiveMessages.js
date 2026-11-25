const { sequelize } = require("../db");
const { COLUMNS } = require("../models/messageSchema");

const LOCK_NAME = "chorus_archive_messages";
const COLUMN_LIST = COLUMNS.join(", ");

async function archiveBatch(cutoff, batchSize) {
  return sequelize.transaction(async (transaction) => {
    const [rows] = await sequelize.query("SELECT id FROM messages WHERE created_at < :cutoff ORDER BY id LIMIT :batchSize FOR UPDATE", {
      replacements: { cutoff, batchSize },
      transaction,
    });
    if (!rows.length) return 0;
    const ids = rows.map((r) => r.id);
    await sequelize.query(
      `INSERT IGNORE INTO archived_messages (${COLUMN_LIST}, archived_at)
       SELECT ${COLUMN_LIST}, UTC_TIMESTAMP() FROM messages WHERE id IN (:ids)`,
      { replacements: { ids }, transaction }
    );
    const [result] = await sequelize.query("DELETE FROM messages WHERE id IN (:ids)", { replacements: { ids }, transaction });
    return result.affectedRows ?? ids.length;
  });
}

async function archiveOldMessages({ olderThanHours, batchSize = 5000, log = console.log } = {}) {
  const [[lock]] = await sequelize.query("SELECT GET_LOCK(:name, 0) AS acquired", { replacements: { name: LOCK_NAME } });
  if (!lock.acquired) {
    log("Archive skipped: another run is in progress.");
    return { skipped: true, moved: 0 };
  }

  const started = Date.now();
  let moved = 0;
  try {
    const [[{ cutoff }]] = await sequelize.query(
      "SELECT DATE_FORMAT(UTC_TIMESTAMP() - INTERVAL :hours HOUR, '%Y-%m-%d %H:%i:%s') AS cutoff",
      { replacements: { hours: olderThanHours } }
    );
    for (;;) {
      const count = await archiveBatch(cutoff, batchSize);
      moved += count;
      if (count < batchSize) break;
    }
    log(`Archived ${moved} message(s) created before ${cutoff} UTC (${olderThanHours}h) in ${Date.now() - started} ms.`);
    return { skipped: false, moved, cutoff };
  } finally {
    await sequelize.query("SELECT RELEASE_LOCK(:name)", { replacements: { name: LOCK_NAME } });
  }
}

module.exports = { archiveOldMessages };
