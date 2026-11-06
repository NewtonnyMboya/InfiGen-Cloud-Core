require("dotenv").config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 64) {
  throw new Error("A secure JWT_SECRET must be configured in .env");
}

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const pool = require("./db");
const { router: authRouter } = require("./auth");

const app = express();

app.use(helmet());

app.use(cors({
  origin: process.env.APP_ORIGIN || false
}));

app.use(express.json({ limit: "20kb" }));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false
}));

app.get("/api/health", (req, res) => {
  res.json({
    application: "InfiGen",
    status: "online",
    environment: process.env.NODE_ENV,
    livePayments: false
  });
});

app.get("/api/health/database", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      application: "InfiGen",
      database: "connected"
    });
  } catch (error) {
    console.error("Database health check failed");
    res.status(503).json({
      application: "InfiGen",
      database: "unavailable"
    });
  }
});

app.use("/api/auth", authRouter);

app.get("/api/status", (req, res) => {
  res.json({
    backend: "running",
    database: "check /api/health/database",
    authentication: "enabled",
    mpesa: "not_configured",
    production: false
  });
});

const PORT = process.env.PORT || 8080;

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`InfiGen backend running on port ${PORT}`);
});

async function shutdown() {
  server.close();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
