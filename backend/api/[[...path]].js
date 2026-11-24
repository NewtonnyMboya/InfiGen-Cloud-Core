// Vercel Node.js Function catch-all for the Express API.
// Express retains the original /api/... request path and dispatches routes.
const app = require("../server");

module.exports = app;
