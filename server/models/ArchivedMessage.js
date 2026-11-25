const { defineMessageModel } = require("./messageSchema");

module.exports = defineMessageModel("ArchivedMessage", "archived_messages", { archive: true });
