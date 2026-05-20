const { CACHE_TTL_MS } = require("../config");

const cache = new Map();

function get(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts >= (entry.ttl ?? CACHE_TTL_MS)) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function set(key, data, ttl = CACHE_TTL_MS) {
  cache.set(key, { data, ts: Date.now(), ttl });
  return data;
}

async function cached(key, fetchFn, ttl = CACHE_TTL_MS) {
  const hit = get(key);
  if (hit != null) return hit;
  const data = await fetchFn();
  return set(key, data, ttl);
}

module.exports = { cached, get, set, cache };
