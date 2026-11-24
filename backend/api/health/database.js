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
    console.error("Database health check failed");
    return res.status(503).json({
      application: "InfiGen",
      database: "unavailable"
    });
  }
};
