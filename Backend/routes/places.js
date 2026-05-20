const express = require("express");
const { cached } = require("../lib/cache");
const logger = require("../lib/logger");
const {
  validatePlacesQuery,
  getPlacesForLocation,
} = require("../services/placesService");

const PLACES_API_VERSION = 3;

function createPlacesRouter(generalLimiter) {
  const router = express.Router();

  router.get("/", generalLimiter, async (req, res) => {
    try {
      const validated = validatePlacesQuery(req.query);
      if (validated.error) {
        logger.warn("Places validation rejected", { query: req.query, error: validated.error });
        return res.status(400).json({ error: validated.error, places: [] });
      }

      const { lat, lon, radiusKm } = validated;
      logger.info("GET /places", { lat, lon, radiusKm });

      let payload;
      try {
        const cacheKey = `places:v3:${lat.toFixed(3)}:${lon.toFixed(3)}:r${radiusKm}`;
        payload = await cached(cacheKey, () => getPlacesForLocation(lat, lon, radiusKm));
      } catch (err) {
        logger.error("GET /places upstream failed", {
          lat,
          lon,
          message: err.message,
        });
        return res.status(200).json([]);
      }

      const places = Array.isArray(payload?.places) ? payload.places : [];
      logger.info("GET /places success", { count: places.length });

      if (req.query.format === "envelope") {
        return res.status(200).json({ places, meta: payload?.meta || {} });
      }
      return res.status(200).json(places);
    } catch (err) {
      logger.error("GET /places unexpected error", { message: err.message, stack: err.stack });
      return res.status(200).json([]);
    }
  });

  router.get("/version", (_req, res) => {
    res.json({ version: PLACES_API_VERSION });
  });

  return router;
}

module.exports = createPlacesRouter;
