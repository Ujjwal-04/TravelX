const { fetchPlacesFromOtm } = require("./opentripmap");
const logger = require("../lib/logger");

function validatePlacesQuery(query) {
  const lat = parseFloat(query.lat);
  const lon = parseFloat(query.lon);
  const radiusKm = parseFloat(query.radius);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return { error: "Invalid lat/lon — must be numbers", status: 400 };
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return { error: "lat/lon out of valid range", status: 400 };
  }

  const radius = Number.isNaN(radiusKm)
    ? 35
    : Math.min(80, Math.max(5, radiusKm));

  return { lat, lon, radiusKm: radius };
}

function normalizePlace(raw) {
  try {
    if (!raw?.name?.trim()) return null;
    const lat = raw.point?.lat;
    const lon = raw.point?.lon;
    if (lat == null || lon == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lon))) {
      return null;
    }
    return {
      xid: raw.xid || null,
      name: String(raw.name).trim(),
      kinds: raw.kinds || "",
      rate: Number(raw.rate) || 0,
      point: { lat: Number(lat), lon: Number(lon) },
      wikidata: raw.wikidata || null,
      osm: raw.osm || null,
    };
  } catch (e) {
    logger.debug("Skipped malformed place", { name: raw?.name, error: e.message });
    return null;
  }
}

function normalizePlaces(rawList) {
  const out = [];
  let skipped = 0;
  for (const raw of rawList || []) {
    const p = normalizePlace(raw);
    if (p) out.push(p);
    else skipped++;
  }
  if (skipped > 0) {
    logger.debug("Places normalization skipped", { skipped, kept: out.length });
  }
  return out;
}

async function getPlacesForLocation(lat, lon, radiusKm) {
  const { places: raw, warnings } = await fetchPlacesFromOtm(lat, lon, radiusKm);
  const normalized = normalizePlaces(raw);
  return {
    places: normalized,
    meta: {
      count: normalized.length,
      rawCount: raw.length,
      warnings,
      center: { lat, lon },
      radiusKm,
    },
  };
}

module.exports = {
  validatePlacesQuery,
  normalizePlace,
  normalizePlaces,
  getPlacesForLocation,
};
