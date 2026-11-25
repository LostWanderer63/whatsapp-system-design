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
const authRoutes = require("./routes/auth");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));

app.use("/api/auth", authRoutes);
app.use("/api", (req, res) => res.status(404).json({ message: "Route not found." }));

// In production, serve the built React app (npm run build -> dist/).
const dist = path.join(__dirname, "..", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, "index.html")));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ message: "Request body must be valid JSON." });
  console.error(err);
  res.status(500).json({ message: "Something went wrong on our side. Please try again." });
});

initDB()
  .then(() => app.listen(config.port, () => console.log(`API running on http://localhost:${config.port}`)))
  .catch((err) => {
    console.error("Could not connect to MySQL:", err.message);
    process.exit(1);
  });
