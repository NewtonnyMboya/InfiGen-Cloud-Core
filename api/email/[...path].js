// Route nested /api/email/* requests through the existing Express application.
// This explicit route ensures Vercel maps email endpoints to the backend handler.
module.exports = require("../../backend/server");
