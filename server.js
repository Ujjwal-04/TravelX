const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const rateLimit = require("express-rate-limit");
const {
  OPENCAGE_KEY,
  OPENTRIPMAP_KEY,
  OPENWEATHER_KEY,
  API_TIMEOUT_MS,
  PORT,
} = require("./config");
const { cached } = require("./lib/cache");
const logger = require("./lib/logger");
const createPlacesRouter = require("./routes/places");
const errorHandler = require("./middleware/errorHandler");

const app = express();
app.use(cors());

const PRICE_CACHE_FILE = path.join(__dirname, "price-cache.json");

// ─── IN-MEMORY CACHE (price disk + legacy price helpers) ─
const cache = require("./lib/cache").cache;
const PRICE_CACHE_TTL = 30 * 60 * 1000;

function loadPriceCacheFromDisk() {
  try {
    if (!fs.existsSync(PRICE_CACHE_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(PRICE_CACHE_FILE, "utf8"));
    const now = Date.now();
    for (const [key, entry] of Object.entries(raw)) {
      if (entry?.ts && now - entry.ts < PRICE_CACHE_TTL) cache.set(key, entry);
    }
    console.log(`Loaded ${Object.keys(raw).length} price cache entries from disk`);
  } catch (e) {
    console.warn("Price cache load failed:", e.message);
  }
}

function persistPriceCacheEntry(key, entry) {
  if (!key.startsWith("price:")) return;
  try {
    let disk = {};
    if (fs.existsSync(PRICE_CACHE_FILE)) {
      disk = JSON.parse(fs.readFileSync(PRICE_CACHE_FILE, "utf8"));
    }
    disk[key] = entry;
    fs.writeFileSync(PRICE_CACHE_FILE, JSON.stringify(disk));
  } catch (e) {
    console.warn("Price cache persist failed:", e.message);
  }
}

function cachedPrice(key, fetchFn) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < PRICE_CACHE_TTL) return Promise.resolve(entry.data);
  return fetchFn().then(data => {
    const record = { data, ts: Date.now() };
    cache.set(key, record);
    persistPriceCacheEntry(key, record);
    return data;
  });
}

// ─── RATE LIMITING ───────────────────────────────
const priceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many price requests — try again in a minute" },
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 45,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — try again in a minute" },
});

const CATEGORY_ESTIMATES = {
  Temple:    { min: 0,    max: 0,    typical: 0,   note: "Most temples are free to enter" },
  Museum:    { min: 20,   max: 500,  typical: 50,  note: "Govt museums ₹20–₹100; private ₹200–₹500" },
  Fort:      { min: 25,   max: 600,  typical: 35,  note: "ASI sites ₹25–₹40; major forts ₹200–₹600" },
  Waterfall: { min: 0,    max: 50,   typical: 0,   note: "Most free; some conservation fee ₹20–₹50" },
  Hill:      { min: 0,    max: 100,  typical: 0,   note: "Mostly free; hill stations may charge ₹50–₹100" },
  Park:      { min: 0,    max: 100,  typical: 20,  note: "Public parks free; national parks ₹20–₹100" },
  Heritage:  { min: 25,   max: 1100, typical: 40,  note: "ASI ₹25–₹40; premium sites up to ₹1100" },
  Lake:      { min: 0,    max: 50,   typical: 0,   note: "Free; boat rides extra" },
  Cave:      { min: 15,   max: 40,   typical: 30,  note: "ASI caves ₹15–₹40" },
  Beach:     { min: 0,    max: 0,    typical: 0,   note: "Public beaches are free" },
  Nature:    { min: 0,    max: 100,  typical: 0,   note: "Forest reserves may charge ₹50–₹100" },
};

function formatINR(amount) {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function buildPriceResponse({ price, currency = "INR", isFree, priceRange, source, note }) {
  const free = isFree || price === 0;
  return {
    price: free ? 0 : Math.round(price),
    currency,
    isFree: free,
    priceDisplay: free ? "Free" : formatINR(price),
    priceRange: priceRange || (free ? "Free" : formatINR(price)),
    source,
    note: note || "",
  };
}

function parsePriceFromText(text) {
  if (!text || typeof text !== "string") return null;
  const lower = text.toLowerCase();
  if (/\b(no\s+entry\s+fee|entry\s+free|admission\s+free|free\s+entry|free\s+admission)\b/i.test(lower)) {
    return { price: 0, isFree: true };
  }
  const rangeMatch = text.match(/(?:₹|Rs\.?\s*|INR\s*)([\d,]+)\s*[–\-—to]+\s*(?:₹|Rs\.?\s*|INR\s*)?([\d,]+)/i);
  if (rangeMatch) {
    const lo = parseInt(rangeMatch[1].replace(/,/g, ""), 10);
    const hi = parseInt(rangeMatch[2].replace(/,/g, ""), 10);
    return { price: Math.round((lo + hi) / 2), priceRange: `${formatINR(lo)}–${formatINR(hi)}`, isFree: lo === 0 && hi === 0 };
  }
  const single = text.match(/(?:₹|Rs\.?\s*|INR\s*)([\d,]+(?:\.\d+)?)/i);
  if (single) {
    const price = parseFloat(single[1].replace(/,/g, ""));
    return { price, isFree: price === 0 };
  }
  const usd = text.match(/\$\s*([\d.]+)/);
  if (usd) {
    const price = Math.round(parseFloat(usd[1]) * 83);
    return { price, isFree: price === 0 };
  }
  return null;
}

function wikipediaTitle(name) {
  return encodeURIComponent(name.trim().replace(/\s+/g, "_"));
}

async function fetchWikidataPrice(name) {
  const searchRes = await axios.get("https://www.wikidata.org/w/api.php", {
    params: {
      action: "wbsearchentities",
      search: name,
      language: "en",
      format: "json",
      limit: 3,
    },
    timeout: 6000,
  });
  const entity = searchRes.data?.search?.[0];
  if (!entity?.id) return null;

  const entityRes = await axios.get("https://www.wikidata.org/w/api.php", {
    params: {
      action: "wbgetentities",
      ids: entity.id,
      props: "claims",
      format: "json",
    },
    timeout: 6000,
  });
  const claims = entityRes.data?.entities?.[entity.id]?.claims?.P2555;
  if (!claims?.length) return null;

  const mainsnak = claims[0].mainsnak;
  if (mainsnak.snaktype === "value" && mainsnak.datavalue) {
    const val = mainsnak.datavalue.value;
    if (val.amount != null) {
      const amount = Math.abs(parseFloat(val.amount));
      const unit = val.unit || "";
      let price = amount;
      if (unit.includes("Q4917") || unit.toLowerCase().includes("usd")) price = Math.round(amount * 83);
      return {
        price,
        isFree: price === 0,
        note: "Entrance fee from Wikidata",
      };
    }
  }
  return null;
}

async function fetchWikipediaPrice(name) {
  const title = wikipediaTitle(name);
  const res = await axios.get(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`,
    { timeout: 6000, validateStatus: s => s < 500 }
  );
  if (res.status === 404) return null;
  const extract = res.data?.extract || res.data?.description || "";
  const parsed = parsePriceFromText(extract);
  if (!parsed) return null;
  return {
    ...parsed,
    note: "Parsed from Wikipedia summary",
  };
}

async function fetchOpenTripMapPrice(name, lat, lon) {
  const geoRes = await axios.get("https://api.opentripmap.com/0.1/en/places/geoname", {
    params: { name, apikey: OPENTRIPMAP_KEY },
    timeout: 6000,
  });
  let xid = geoRes.data?.features?.[0]?.properties?.xid;
  if (!xid) {
    const bboxRes = await axios.get("https://api.opentripmap.com/0.1/en/places/radius", {
      params: { lat, lon, radius: 500, name, apikey: OPENTRIPMAP_KEY, limit: 1 },
      timeout: 6000,
    });
    xid = bboxRes.data?.features?.[0]?.properties?.xid;
    if (!xid) return null;
  }
  return fetchOtmXidPrice(xid);
}

async function fetchOtmXidPrice(xid) {
  const detail = await axios.get(`https://api.opentripmap.com/0.1/en/places/xid/${xid}`, {
    params: { apikey: OPENTRIPMAP_KEY },
    timeout: 6000,
  });
  const info = detail.data || {};
  const texts = [
    info.info?.descr,
    info.wikipedia_extracts?.text,
    info.info?.text,
  ].filter(Boolean);
  for (const t of texts) {
    const parsed = parsePriceFromText(t);
    if (parsed) return { ...parsed, note: "Parsed from OpenTripMap place description" };
  }
  return null;
}

function estimateByCategory(category) {
  const cat = CATEGORY_ESTIMATES[category] || CATEGORY_ESTIMATES.Nature;
  const priceRange = cat.min === cat.max && cat.min === 0
    ? "Free"
    : `${formatINR(cat.min)}–${formatINR(cat.max)}`;
  return buildPriceResponse({
    price: cat.typical,
    isFree: cat.typical === 0 && cat.max === 0,
    priceRange,
    source: "estimate",
    note: cat.note,
  });
}

loadPriceCacheFromDisk();

// ─── GEOCODE ─────────────────────────────────────
app.get("/geocode", generalLimiter, async (req, res) => {
  const city = req.query.city?.trim();
  if (!city) return res.status(400).json({ error: "City is required" });

  try {
    const data = await cached(`geocode:${city.toLowerCase()}`, () =>
      axios.get(`https://api.opencagedata.com/geocode/v1/json`, {
        params: { q: city, key: OPENCAGE_KEY, limit: 1, no_annotations: 1 },
        timeout: API_TIMEOUT_MS,
      }).then(r => {
        const loc = r.data.results[0]?.geometry;
        if (!loc) throw new Error("No results found");
        return { lat: loc.lat, lng: loc.lng, formatted: r.data.results[0].formatted };
      })
    );
    res.json(data);
  } catch (err) {
    console.error("Geocode error:", err.message);
    res.status(500).json({ error: "Could not geocode city" });
  }
});

app.use("/places", createPlacesRouter(generalLimiter));

// ─── WEATHER ─────────────────────────────────────
app.get("/weather", generalLimiter, async (req, res) => {
  const lat = parseFloat(req.query.lat) || 18.5204;
  const lon = parseFloat(req.query.lon) || 73.8567;

  try {
    const data = await cached(`weather:${lat.toFixed(2)}:${lon.toFixed(2)}`, () =>
      axios.get(`https://api.openweathermap.org/data/2.5/weather`, {
        params: { lat, lon, appid: OPENWEATHER_KEY },
        timeout: API_TIMEOUT_MS,
      }).then(r => r.data)
    );
    res.json(data);
  } catch (err) {
    console.error("Weather error:", err.message);
    res.status(500).json({ error: "Could not fetch weather" });
  }
});

// ─── PRICE ───────────────────────────────────────
app.get("/price", priceLimiter, async (req, res) => {
  const name = req.query.name?.trim();
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const category = req.query.category?.trim() || "Nature";

  if (!name) return res.status(400).json({ error: "name is required" });
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return res.status(400).json({ error: "lat and lon are required" });
  }

  const cacheKey = `price:${name.toLowerCase()}:${lat.toFixed(4)}:${lon.toFixed(4)}`;

  try {
    const result = await cachedPrice(cacheKey, async () => {
      try {
        const wd = await fetchWikidataPrice(name);
        if (wd) {
          return buildPriceResponse({
            price: wd.price,
            isFree: wd.isFree,
            priceRange: wd.isFree ? "Free" : formatINR(wd.price),
            source: "wikidata",
            note: wd.note || "Standard entry · Foreign nationals may pay more",
          });
        }
      } catch (e) {
        console.warn("Wikidata price:", e.message);
      }

      try {
        const wiki = await fetchWikipediaPrice(name);
        if (wiki) {
          return buildPriceResponse({
            price: wiki.price,
            isFree: wiki.isFree,
            priceRange: wiki.priceRange || (wiki.isFree ? "Free" : formatINR(wiki.price)),
            source: "wikipedia",
            note: wiki.note || "From Wikipedia entry summary",
          });
        }
      } catch (e) {
        console.warn("Wikipedia price:", e.message);
      }

      try {
        const otm = await fetchOpenTripMapPrice(name, lat, lon);
        if (otm) {
          return buildPriceResponse({
            price: otm.price,
            isFree: otm.isFree,
            priceRange: otm.priceRange || (otm.isFree ? "Free" : formatINR(otm.price)),
            source: "opentripmap",
            note: otm.note || "From place listing",
          });
        }
      } catch (e) {
        console.warn("OpenTripMap price:", e.message);
      }

      return estimateByCategory(category);
    });

    res.json(result);
  } catch (err) {
    console.error("Price error:", err.message);
    res.status(500).json({ error: "Could not fetch price" });
  }
});

app.get("/health", (_, res) => res.json({
  status: "ok",
  placesApi: 3,
  ts: new Date().toISOString(),
}));

// Chrome DevTools probes this path — harmless 204 avoids console 404 noise
app.get("/.well-known/appspecific/com.chrome.devtools.json", (_req, res) => {
  res.status(204).end();
});

app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`TravelX server running on http://localhost:${PORT}`);
});
