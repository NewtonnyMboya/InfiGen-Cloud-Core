const pool = require("../../db");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ application: "InfiGen", error: "method_not_allowed" });
  }

  try {
    await pool.query("SELECT 1");
    return res.status(200).json({
      application: "InfiGen",
      database: "connected"
    });
  } catch (error) {
    const code = typeof error?.code === "string" && /^[A-Z0-9_]{1,32}$/.test(error.code)
      ? error.code
      : "CONNECTION_FAILED";
    console.error("Database health check failed", { code });
    return res.status(503).json({
      application: "InfiGen",
      database: "unavailable",
      databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
      errorCode: code
    });
  }
};
