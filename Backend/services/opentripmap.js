const axios = require("axios");
const { OPENTRIPMAP_KEY, API_TIMEOUT_MS } = require("../config");
const logger = require("../lib/logger");

const OTM_BBOX_URL = "https://api.opentripmap.com/0.1/en/places/bbox";

/** OTM bbox accepts exactly ONE kind per request (not comma-separated). */
const OTM_SUPPLEMENT_KINDS = [
  "interesting_places",
  "cultural",
  "historic",
  "museums",
  "fortifications",
];

const http = axios.create({ timeout: API_TIMEOUT_MS });

async function fetchBboxSlice(bbox, { kind = null, limit = 500, minRate = null } = {}) {
  const params = {
    lon_min: bbox.minLon,
    lon_max: bbox.maxLon,
    lat_min: bbox.minLat,
    lat_max: bbox.maxLat,
    format: "json",
    limit,
    apikey: OPENTRIPMAP_KEY,
  };
  if (kind) params.kinds = kind;
  if (minRate != null) params.rate = String(minRate);

  const res = await http.get(OTM_BBOX_URL, { params, validateStatus: () => true });
  if (res.status >= 400) {
    const errMsg = typeof res.data?.error === "string"
      ? res.data.error
      : res.statusText || `HTTP ${res.status}`;
    throw new Error(`OTM bbox ${kind || "all"}: ${errMsg}`);
  }
  return Array.isArray(res.data) ? res.data : [];
}

function bboxFromCenter(lat, lon, radiusKm) {
  const delta = radiusKm / 111;
  return {
    minLat: lat - delta,
    maxLat: lat + delta,
    minLon: lon - delta,
    maxLon: lon + delta,
  };
}

function mergeIntoMap(byXid, list) {
  for (const raw of list) {
    if (!raw?.xid || !raw?.name) continue;
    if (!byXid.has(raw.xid)) byXid.set(raw.xid, raw);
  }
}

async function fetchPlacesFromOtm(lat, lon, radiusKm, options = {}) {
  const bbox = bboxFromCenter(lat, lon, radiusKm);
  const minRate = options.minRate ?? 2;
  const warnings = [];
  const byXid = new Map();

  logger.info("OTM fetch start", { lat: lat.toFixed(4), lon: lon.toFixed(4), radiusKm });

  // Primary: one request, no kinds (valid for all cities; avoids invalid multi-kind bug)
  try {
    mergeIntoMap(byXid, await fetchBboxSlice(bbox, { limit: 500, minRate }));
  } catch (e) {
    logger.warn("OTM primary fetch failed", { error: e.message });
    warnings.push("primary_failed");
    try {
      mergeIntoMap(byXid, await fetchBboxSlice(bbox, { limit: 500, minRate: null }));
      warnings.push("primary_no_rate_filter");
    } catch (e2) {
      logger.error("OTM primary fallback failed", { error: e2.message });
    }
  }

  // Supplement only if thin results
  if (byXid.size < 40) {
    for (const kind of OTM_SUPPLEMENT_KINDS) {
      try {
        mergeIntoMap(byXid, await fetchBboxSlice(bbox, { kind, limit: 80, minRate }));
      } catch (e) {
        logger.warn("OTM supplement failed", { kind, error: e.message });
        warnings.push(`supplement_${kind}_failed`);
      }
      await new Promise((r) => setTimeout(r, 80));
    }
  }

  const places = [...byXid.values()];
  if (!places.length) {
    throw new Error("OpenTripMap returned no places for this area");
  }

  logger.info("OTM fetch complete", { uniquePlaces: places.length, warnings });
  return { places, warnings };
}

module.exports = {
  fetchPlacesFromOtm,
  bboxFromCenter,
  OTM_SUPPLEMENT_KINDS,
};
