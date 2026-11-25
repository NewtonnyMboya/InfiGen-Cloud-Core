// Route all /api/* requests through the existing Express application.
// Vercel invokes this exported handler per request; no persistent listener is started.
module.exports = require("../backend/server");
