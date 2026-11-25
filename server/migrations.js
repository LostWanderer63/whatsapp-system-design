const { sequelize } = require("./db");

async function columnType(table, column) {
  const [rows] = await sequelize.query(
    "SELECT DATA_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    { replacements: [table, column] }
  );
  return rows[0]?.type || null;
}

async function hasIndex(table, index) {
  const [rows] = await sequelize.query(
    "SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1",
    { replacements: [table, index] }
  );
  return rows.length > 0;
}

async function linkMessagesToConversations() {
  if ((await columnType("messages", "conversation_id")) !== "varchar") return;
  console.log("Migrating messages.conversation_id to the conversations table…");

  await sequelize.transaction(async (transaction) => {
    await sequelize.query(
      `INSERT INTO conversations (kind, title, client_key, created_by, created_at)
       SELECT 'group', LEFT(m.conversation_id, 100), m.conversation_id, m.sender_id, MIN(m.created_at)
       FROM messages m
       LEFT JOIN conversations c ON c.created_by = m.sender_id AND c.client_key = m.conversation_id
       WHERE c.id IS NULL
       GROUP BY m.sender_id, m.conversation_id`,
      { transaction }
    );
    await sequelize.query(
      `INSERT IGNORE INTO conversation_members (conversation_id, user_id, role, joined_at)
       SELECT DISTINCT c.id, c.created_by, 'owner', c.created_at
       FROM conversations c JOIN messages m ON m.sender_id = c.created_by AND m.conversation_id = c.client_key`,
      { transaction }
    );
  });

  if (!(await columnType("messages", "conversation_ref"))) {
    await sequelize.query("ALTER TABLE messages ADD COLUMN conversation_ref BIGINT UNSIGNED NULL");
  }
  await sequelize.query(
    `UPDATE messages m JOIN conversations c ON c.created_by = m.sender_id AND c.client_key = m.conversation_id
     SET m.conversation_ref = c.id`
  );
  for (const index of ["messages_conversation_created", "messages_conversation_id"]) {
    if (await hasIndex("messages", index)) await sequelize.query(`ALTER TABLE messages DROP INDEX ${index}`);
  }
  await sequelize.query(
    `ALTER TABLE messages
       DROP COLUMN conversation_id,
       CHANGE conversation_ref conversation_id BIGINT UNSIGNED NOT NULL,
       ADD INDEX messages_conversation_id (conversation_id, id),
       ADD CONSTRAINT messages_conversation_fk FOREIGN KEY (conversation_id)
         REFERENCES conversations (id) ON DELETE CASCADE ON UPDATE CASCADE`
  );
  console.log("Migration done.");
}

async function allowSharedConversations() {
  const [rows] = await sequelize.query(
    "SELECT IS_NULLABLE AS nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversations' AND COLUMN_NAME = 'created_by'"
  );
  if (rows[0]?.nullable === "NO") await sequelize.query("ALTER TABLE conversations MODIFY created_by INT NULL");
}

async function addDirectKey() {
  if (await columnType("conversations", "direct_key")) return;
  await sequelize.query(
    "ALTER TABLE conversations ADD COLUMN direct_key VARCHAR(32) NULL, ADD UNIQUE INDEX conversations_direct_key (direct_key)"
  );
}

async function runMigrations() {
  await linkMessagesToConversations();
  await allowSharedConversations();
  await addDirectKey();
}

module.exports = { runMigrations };
