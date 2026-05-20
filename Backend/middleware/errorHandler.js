const logger = require("../lib/logger");

function errorHandler(err, req, res, _next) {
  logger.error("Unhandled route error", {
    path: req.path,
    method: req.method,
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });

  if (res.headersSent) return;

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.publicMessage || "Internal server error",
    places: [],
    meta: { fallback: true },
  });
}

module.exports = errorHandler;
