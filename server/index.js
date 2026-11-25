let config;
try {
  config = require("./config");
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const path = require("path");
const fs = require("fs");
const express = require("express");
const { initDB } = require("./db");
const { startSocketServer } = require("./socket-io");
const authRoutes = require("./routes/auth");
const messageRoutes = require("./routes/messages");
const conversationRoutes = require("./routes/conversations");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

app.use("/api/auth", authRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api", (req, res) => res.status(404).json({ message: "Route not found." }));

const dist = path.join(__dirname, "..", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ message: "Request body must be valid JSON." });
  if (err.type === "entity.too.large") return res.status(413).json({ message: "That message is too long." });
  console.error(err);
  res.status(500).json({ message: "Something went wrong on our side. Please try again." });
});

initDB()
  .then(() => {
    app.listen(config.port, () => console.log(`API running on http://localhost:${config.port}`));
    startSocketServer();
  })
  .catch((err) => {
    console.error("Could not connect to MySQL:", err.message);
    process.exit(1);
  });
