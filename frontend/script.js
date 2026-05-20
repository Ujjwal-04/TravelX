/* ════════════════════════════════════════════════════
   TravelX — script.js
   Multi-page: Home, Explore, Trending, Saved, Planner
   Features: Crowd prediction, Weather, Map, Planner,
             Hourly forecast, Autocomplete, Save system
════════════════════════════════════════════════════ */

const API = "http://localhost:5000";

// ─── STATE ──────────────────────────────────────────────────
let map, markers = [], globalPlaces = [], currentBounds = [];
let activeFilter = "all", activeSort = "rating";
let currentCity = "Pune", currentLat = 18.5204, currentLon = 73.8567;
let weatherCache = null;
let savedPlaces = JSON.parse(localStorage.getItem("tx_saved") || "[]");
let plannerDays = [];
let plannerPlaces = [];
let tripStartDate = new Date().toISOString().slice(0, 10);
let plannerStartMinutes = 9 * 60;
let plannerCategoryFilter = "all";
let plannerQuickShowAll = false;
let plannerCitySizeMultiplier = 1;
let plannerSearching = false;
let modalPlace = null;
let mapStyleDark = false;
let tileLayer = null;
let focusMode = false;
let focusPlace = null;
let focusMarker = null;
let markersByName = new Map();
let lastDisplayedPlaces = [];
let storyWalkActive = false;
let storyWalkTimeouts = [];
let storyWalkToken = 0;
const priceDataCache = new Map();
const displayLimit = 30;
let placesDisplayCount = displayLimit;
const PRICE_FETCH_TIMEOUT_MS = 3000;
const PRICE_CONCURRENCY = 3;
let priceQueue = [];
let priceActive = 0;

const CATEGORY_AVG_RATING = {
  Temple: 4.2, Museum: 4.1, Fort: 4.3, Waterfall: 4.0, Hill: 4.1,
  Park: 4.0, Heritage: 4.2, Lake: 4.0, Cave: 4.1, Beach: 4.1, Nature: 4.0,
};

function syncCrowdContext() {
  if (typeof CrowdEngine !== "undefined") {
    CrowdEngine.setContext({
      city: currentCity,
      lat: currentLat,
      lon: currentLon,
      weather: weatherCache,
    });
  }
}

function computeCrowd(place) {
  syncCrowdContext();
  return CrowdEngine.computeCrowd(place);
}

function bestTimeHint(category) {
  const hints = {
    Temple: "Early morning 6–8am", Museum: "Weekday mornings",
    Fort: "Weekday 8–10am", Waterfall: "Early morning",
    Hill: "Sunrise or sunset", Park: "Weekday mornings",
    Heritage: "Weekday 8–10am", Lake: "Morning golden hour",
    Cave: "Weekday midday", Beach: "Early morning 7–9am",
    Nature: "Weekday mornings",
  };
  return hints[category] || "Weekday mornings";
}

// ─── CITY DATA ─────────────────────────────────────────────
const POPULAR_CITIES = [
  { name: "Mumbai",    flag: "🇮🇳", country: "India" },
  { name: "Delhi",     flag: "🇮🇳", country: "India" },
  { name: "Bangalore", flag: "🇮🇳", country: "India" },
  { name: "Pune",      flag: "🇮🇳", country: "India" },
  { name: "Jaipur",    flag: "🇮🇳", country: "India" },
  { name: "Goa",       flag: "🇮🇳", country: "India" },
  { name: "Hyderabad", flag: "🇮🇳", country: "India" },
  { name: "Chennai",   flag: "🇮🇳", country: "India" },
  { name: "Kolkata",   flag: "🇮🇳", country: "India" },
  { name: "Agra",      flag: "🇮🇳", country: "India" },
  { name: "Varanasi",  flag: "🇮🇳", country: "India" },
  { name: "Udaipur",   flag: "🇮🇳", country: "India" },
  { name: "Mysore",    flag: "🇮🇳", country: "India" },
  { name: "Rishikesh", flag: "🇮🇳", country: "India" },
  { name: "Manali",    flag: "🇮🇳", country: "India" },
  { name: "Paris",     flag: "🇫🇷", country: "France" },
  { name: "London",    flag: "🇬🇧", country: "UK" },
  { name: "Tokyo",     flag: "🇯🇵", country: "Japan" },
  { name: "Kyoto",     flag: "🇯🇵", country: "Japan" },
  { name: "New York",  flag: "🇺🇸", country: "USA" },
  { name: "Barcelona", flag: "🇪🇸", country: "Spain" },
  { name: "Rome",      flag: "🇮🇹", country: "Italy" },
  { name: "Bangkok",   flag: "🇹🇭", country: "Thailand" },
  { name: "Bali",      flag: "🇮🇩", country: "Indonesia" },
  { name: "Singapore", flag: "🇸🇬", country: "Singapore" },
  { name: "Dubai",     flag: "🇦🇪", country: "UAE" },
  { name: "Istanbul",  flag: "🇹🇷", country: "Turkey" },
  { name: "Lisbon",    flag: "🇵🇹", country: "Portugal" },
  { name: "Prague",    flag: "🇨🇿", country: "Czech Republic" },
];

const CITY_RECOMMENDATIONS = {
  india: [
    { name: "Jaipur",    emoji: "🏰", state: "Rajasthan",    tags: ["Heritage","Forts","Bazaars"], bg: "#FEF3C7" },
    { name: "Goa",       emoji: "🌊", state: "Goa",          tags: ["Beaches","Nightlife","Seafood"], bg: "#DBEAFE" },
    { name: "Varanasi",  emoji: "🕯️", state: "Uttar Pradesh", tags: ["Spiritual","Ghats","Culture"], bg: "#FDF2F8" },
    { name: "Udaipur",   emoji: "🏙️", state: "Rajasthan",    tags: ["Lakes","Palaces","Romance"], bg: "#D1FAE5" },
    { name: "Manali",    emoji: "🏔️", state: "Himachal Pradesh", tags: ["Mountains","Snow","Trek"], bg: "#E0F2FE" },
    { name: "Coorg",     emoji: "☕", state: "Karnataka",    tags: ["Coffee","Nature","Misty"], bg: "#ECFDF5" },
    { name: "Rishikesh", emoji: "🧘", state: "Uttarakhand",  tags: ["Yoga","River","Adventure"], bg: "#FFF7ED" },
    { name: "Hampi",     emoji: "🗿", state: "Karnataka",    tags: ["Ruins","History","UNESCO"], bg: "#EDE9FE" },
  ],
  world: [
    { name: "Kyoto",     emoji: "⛩️", state: "Japan",        tags: ["Temples","Gardens","Zen"], bg: "#FDF2F8" },
    { name: "Lisbon",    emoji: "🚃", state: "Portugal",     tags: ["Trams","Seafood","Sunset"], bg: "#FEF3C7" },
    { name: "Bali",      emoji: "🌺", state: "Indonesia",    tags: ["Beaches","Temples","Wellness"], bg: "#D1FAE5" },
    { name: "Istanbul",  emoji: "🕌", state: "Turkey",       tags: ["Bazaars","Mosques","Bosphorus"], bg: "#DBEAFE" },
    { name: "Barcelona", emoji: "🎨", state: "Spain",        tags: ["Gaudí","Beach","Food"], bg: "#FFF7ED" },
    { name: "Prague",    emoji: "🏰", state: "Czech Republic", tags: ["Old Town","Beer","Gothic"], bg: "#EDE9FE" },
    { name: "Bangkok",   emoji: "🛺", state: "Thailand",     tags: ["Temples","Street Food","Markets"], bg: "#ECFDF5" },
    { name: "Rome",      emoji: "🏛️", state: "Italy",        tags: ["Ruins","Art","Pasta"], bg: "#E0F2FE" },
  ],
  hidden: [
    { name: "Hampi",     emoji: "🗿", state: "Karnataka, India",    tags: ["Ruins","Boulders","UNESCO"], bg: "#EDE9FE" },
    { name: "Spiti",     emoji: "🏔️", state: "Himachal Pradesh",   tags: ["Remote","Monasteries","Stargazing"], bg: "#E0F2FE" },
    { name: "Ziro",      emoji: "🌾", state: "Arunachal Pradesh",  tags: ["Tribal","Rice Fields","Music Fest"], bg: "#ECFDF5" },
    { name: "Majuli",    emoji: "🛶", state: "Assam, India",       tags: ["River Island","Masks","Culture"], bg: "#FEF3C7" },
    { name: "Pondicherry", emoji: "🌸", state: "Tamil Nadu, India", tags: ["French Quarter","Beaches","Yoga"], bg: "#FDF2F8" },
    { name: "Dholavira", emoji: "⚱️", state: "Gujarat, India",     tags: ["Harappan","UNESCO","Desert"], bg: "#FFF7ED" },
    { name: "Chopta",    emoji: "🌿", state: "Uttarakhand, India", tags: ["Mini Switzerland","Trek","Meadows"], bg: "#D1FAE5" },
    { name: "Mawlynnong", emoji: "🌺", state: "Meghalaya, India",  tags: ["Cleanest Village","Root Bridges","Waterfalls"], bg: "#DBEAFE" },
  ]
};

// ─── REAL ENTRY FEE DATA ────────────────────────────────────
// Based on actual typical Indian entry fees per category
const CATEGORY_ENTRY_FEES = {
  "Temple":   { typical: 0,   range: [0, 0],       note: "Free (most temples)" },
  "Museum":   { typical: 50,  range: [20, 500],     note: "Govt museums ₹20–₹100; private ₹200–₹500" },
  "Fort":     { typical: 35,  range: [0, 600],      note: "ASI sites ₹25–₹40; major forts ₹200–₹600" },
  "Waterfall":{ typical: 0,   range: [0, 50],       note: "Most free; some conservation fee ₹20–₹50" },
  "Hill":     { typical: 0,   range: [0, 100],      note: "Mostly free; hill stations may charge ₹50–₹100" },
  "Park":     { typical: 20,  range: [0, 100],      note: "Public parks free; national parks ₹20–₹100" },
  "Heritage": { typical: 40,  range: [20, 1100],    note: "ASI ₹25–₹40; Taj Mahal ₹1100 for foreigners" },
  "Lake":     { typical: 0,   range: [0, 50],       note: "Free; boat rides extra ₹50–₹200" },
  "Cave":     { typical: 30,  range: [15, 40],      note: "ASI caves ₹15–₹40" },
  "Beach":    { typical: 0,   range: [0, 0],        note: "Free (public beaches)" },
  "Nature":   { typical: 0,   range: [0, 100],      note: "Forest reserves may charge ₹50–₹100" },
};

// KNOWN_ENTRY_FEES loaded from known-entry-fees.js

function getPlacePrice(place) {
  if (place.priceData != null) {
    return place.priceData.isFree ? 0 : (place.priceData.price ?? 0);
  }
  return place.cost ?? 0;
}

function getEntryFee(place) {
  const nameLower = place.name.toLowerCase();
  // Check known list first
  for (const [key, fee] of Object.entries(KNOWN_ENTRY_FEES)) {
    if (nameLower.includes(key)) return fee;
  }
  // Use category typical with a small deterministic variation
  const cfg = CATEGORY_ENTRY_FEES[place.category] || { typical: 20, range: [0, 100] };
  const seed = Math.abs(hashCode(place.name));
  const [min, max] = cfg.range;
  if (max === 0) return 0;
  // Pick one of the common fee points, not fully random
  const feeLevels = [0, min, Math.round((min + max) / 2), max].filter(v => v >= 0);
  return feeLevels[seed % feeLevels.length];
}
// ─── HOME PAGE CITY GRID ─────────────────────────────────────
let activeCityTab = "india";

function switchCityTab(tab, el) {
  activeCityTab = tab;
  document.querySelectorAll(".city-tab").forEach(t => t.classList.remove("active"));
  el.classList.add("active");
  renderCityGrid(tab);
}

function renderCityGrid(tab) {
  const cities = CITY_RECOMMENDATIONS[tab] || [];
  const grid = document.getElementById("city-grid");
  grid.innerHTML = cities.map(c => `
    <div class="city-card" onclick="goExplore('${c.name}')">
      <div class="city-card-img" style="background:${c.bg}">
        ${c.emoji}
        <span class="city-card-badge">Explore →</span>
      </div>
      <div class="city-card-body">
        <div class="city-card-name">${c.name}</div>
        <div class="city-card-state">${c.state}</div>
        <div class="city-card-tags">
          ${c.tags.map(t => `<span class="city-tag">${t}</span>`).join("")}
        </div>
      </div>
    </div>
  `).join("");
}

function goExplore(city) {
  showPage("explore");
  document.getElementById("cityInput").value = city;
  setTimeout(() => searchCity(), 300);
}

// ─── HERO AUTOCOMPLETE ───────────────────────────────────────
function handleHeroAutocomplete(val) {
  const list = document.getElementById("hero-autocomplete");
  if (!val.trim() || val.length < 2) { list.classList.remove("open"); return; }
  const matches = POPULAR_CITIES.filter(c => c.name.toLowerCase().startsWith(val.toLowerCase())).slice(0, 6);
  if (!matches.length) { list.classList.remove("open"); return; }
  list.innerHTML = matches.map(c => `
    <div class="ac-item" onclick="selectHeroCity('${c.name}')">
      <span class="ac-flag">${c.flag}</span>
      <span class="ac-name">${c.name}</span>
      <span class="ac-country">${c.country}</span>
    </div>
  `).join("");
  list.classList.add("open");
}

function selectHeroCity(name) {
  document.getElementById("heroInput").value = name;
  document.getElementById("hero-autocomplete").classList.remove("open");
  goExplore(name);
}

function heroSearch() {
  const val = document.getElementById("heroInput").value.trim();
  if (!val) { toast("Enter a city to explore"); return; }
  goExplore(val);
}

// ─── SIDEBAR AUTOCOMPLETE ────────────────────────────────────
function handleAutocomplete(val) {
  const list = document.getElementById("autocomplete-list");
  if (!val.trim() || val.length < 2) { list.classList.remove("open"); return; }
  const matches = POPULAR_CITIES.filter(c => c.name.toLowerCase().startsWith(val.toLowerCase())).slice(0, 5);
  if (!matches.length) { list.classList.remove("open"); return; }
  list.innerHTML = matches.map(c => `
    <div class="ac-item" onclick="selectCity('${c.name}')">
      <span class="ac-flag">${c.flag}</span>
      <span class="ac-name">${c.name}</span>
      <span class="ac-country">${c.country}</span>
    </div>
  `).join("");
  list.classList.add("open");
}

function selectCity(name) {
  document.getElementById("cityInput").value = name;
  document.getElementById("autocomplete-list").classList.remove("open");
  searchCity();
}

document.addEventListener("click", (e) => {
  if (!e.target.closest("#sidebar-search-container")) {
    document.getElementById("autocomplete-list")?.classList.remove("open");
  }
  if (!e.target.closest("#hero-search-container")) {
    document.getElementById("hero-autocomplete")?.classList.remove("open");
  }
});

// ─── PAGE NAVIGATION ─────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(`page-${name}`).classList.add("active");

  // Desktop nav
  document.querySelectorAll(".nav-link").forEach(a => a.classList.remove("active"));
  const navEl = document.getElementById(`nav-${name}`);
  if (navEl) navEl.classList.add("active");

  // Mobile nav
  document.querySelectorAll(".mob-nav-item").forEach(a => a.classList.remove("active"));
  const mnavEl = document.getElementById(`mnav-${name}`);
  if (mnavEl) mnavEl.classList.add("active");

  window.scrollTo({ top: 0, behavior: "smooth" });

  if (name === "saved") renderSaved();
  if (name === "planner") initPlannerPage();
  if (name === "trending") renderTrending();
  if (name === "explore") {
    ensureMap();
    setTimeout(() => map?.invalidateSize(), 100);
  }
}

// ─── MAP ─────────────────────────────────────────────────────
const TILE_LIGHT = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const TILE_DARK  = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

function initMap(lat = 18.5204, lon = 73.8567) {
  if (!document.getElementById("map")) return;
  if (!map) {
    map = L.map("map", { zoomControl: false }).setView([lat, lon], 12);
    tileLayer = L.tileLayer(TILE_LIGHT, {
      attribution: "© OpenStreetMap contributors © CARTO", maxZoom: 19
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
  } else {
    map.setView([lat, lon], 12);
  }
}

function ensureMap(lat = currentLat, lon = currentLon) {
  if (!map) initMap(lat, lon);
}

function toggleMapStyle() {
  mapStyleDark = !mapStyleDark;
  const btn = document.getElementById("map-style-btn");
  if (tileLayer) map.removeLayer(tileLayer);
  tileLayer = L.tileLayer(mapStyleDark ? TILE_DARK : TILE_LIGHT, {
    attribution: "© OpenStreetMap contributors © CARTO", maxZoom: 19
  }).addTo(map);
  btn.textContent = mapStyleDark ? "🌙 Dark" : "🗺 Standard";
  btn.classList.toggle("active", !mapStyleDark);
}

function fitMapToBounds() {
  if (currentBounds.length) map.fitBounds(currentBounds, { padding: [40, 40] });
}

function makePulsingFocusIcon() {
  return L.divIcon({
    className: "",
    html: `<div class="map-focus-marker">📍</div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 48],
  });
}

function isGoldenHour(place) {
  const hour = new Date().getHours();
  const goldenHours = [6, 7, 8, 17, 18, 19];
  if (!goldenHours.includes(hour)) return false;
  return (place.crowd?.score ?? 50) < 50;
}

function priceSourceLabel(source) {
  if (["wikidata", "wikipedia", "opentripmap"].includes(source)) return { text: "Live", cls: "live" };
  return { text: "Estimated", cls: "estimated" };
}

function buildLocalPriceEstimate(place) {
  const fee = getEntryFee(place);
  const cfg = CATEGORY_ENTRY_FEES[place.category] || CATEGORY_ENTRY_FEES.Nature;
  const [min, max] = cfg.range;
  const priceRange = max === 0 && min === 0 ? "Free" : `₹${min}–₹${max}`;
  return {
    price: fee,
    currency: "INR",
    isFree: fee === 0,
    priceDisplay: fee === 0 ? "Free" : `₹${fee}`,
    priceRange,
    source: "estimate",
    note: cfg.note,
  };
}

function ratingFromOtmRate(name, category, otmRate) {
  const variance = ((Math.abs(hashCode(name)) % 3) - 1) * 0.1;
  const step = (Math.abs(hashCode(name + "r")) % 6) / 10;
  let base;
  const rate = otmRate ?? 0;
  if (rate >= 3) base = 4.5 + step;
  else if (rate >= 2) base = 4.0 + step;
  else if (rate >= 1) base = 3.5 + step;
  else base = (CATEGORY_AVG_RATING[category] || 4.0) + variance;
  return Math.min(5, Math.max(3, +base.toFixed(1)));
}

function runInPriceQueue(fn) {
  return new Promise((resolve, reject) => {
    priceQueue.push({ fn, resolve, reject });
    drainPriceQueue();
  });
}

function drainPriceQueue() {
  while (priceActive < PRICE_CONCURRENCY && priceQueue.length) {
    const { fn, resolve, reject } = priceQueue.shift();
    priceActive++;
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        priceActive--;
        drainPriceQueue();
      });
  }
}

async function fetchPlacePriceFromApi(place) {
  const params = new URLSearchParams({
    name: place.name,
    lat: String(place.point.lat),
    lon: String(place.point.lon),
    category: place.category || "Nature",
  });
  const res = await fetch(`${API}/price?${params}`);
  if (!res.ok) throw new Error("price fetch failed");
  return res.json();
}

function applyPriceToPlace(place, data) {
  place.priceData = data;
  if (data?.price != null && !Number.isNaN(data.price)) {
    place.cost = data.isFree ? 0 : data.price;
  }
  if (place?.name && plannerDays.some(d => d.places.some(p => p.name === place.name))) {
    updateBudgetSummary();
  }
}

function formatPriceDisplay(data) {
  if (!data) return "—";
  if (data.isFree) return "Free";
  if (data.priceRange && data.source === "estimate") return data.priceRange;
  return data.priceDisplay || (data.price ? `₹${data.price}` : "—");
}

function setPriceLoading(el) {
  if (!el) return;
  el.innerHTML = `<span class="price-shimmer"></span>`;
}

function renderPriceElement(el, data) {
  if (!el) return;
  if (!data) {
    el.textContent = "—";
    return;
  }
  const badge = priceSourceLabel(data.source);
  const display = formatPriceDisplay(data);
  el.innerHTML = `${display}<span class="price-source-badge ${badge.cls}">${badge.text}</span>`;
}

async function fetchPlacePrice(place, onUpdate) {
  const key = `${place.name}|${place.point.lat}|${place.point.lon}`;
  if (priceDataCache.has(key)) {
    const cached = priceDataCache.get(key);
    applyPriceToPlace(place, cached);
    onUpdate?.(cached, true);
    return cached;
  }

  return runInPriceQueue(async () => {
    const est = buildLocalPriceEstimate(place);
    const apiPromise = fetchPlacePriceFromApi(place).catch(() => null);

    const raced = await Promise.race([
      apiPromise.then(d => (d ? { kind: "api", data: d } : { kind: "fail" })),
      new Promise(r => setTimeout(() => r({ kind: "timeout" }), PRICE_FETCH_TIMEOUT_MS)),
    ]);

    if (raced.kind === "api") {
      priceDataCache.set(key, raced.data);
      applyPriceToPlace(place, raced.data);
      onUpdate?.(raced.data, true);
      return raced.data;
    }

    priceDataCache.set(key, est);
    applyPriceToPlace(place, est);
    onUpdate?.(est, raced.kind === "timeout");

    const late = await apiPromise;
    if (late && late.source !== "estimate") {
      priceDataCache.set(key, late);
      applyPriceToPlace(place, late);
      onUpdate?.(late, true);
      return late;
    }
    return place.priceData;
  });
}

function loadPlacePrice(place, el, onDone) {
  if (!place?.point) return;
  setPriceLoading(el);
  fetchPlacePrice(place, (data) => {
    if (el) renderPriceElement(el, data);
    onDone?.(data);
  });
}

function hideDirectionsPanel() {
  document.getElementById("directions-panel")?.classList.remove("open");
}

function showDirectionsPanel(place) {
  const crowd = place.crowd;
  const crowdLabel = { low: "Low crowd", medium: "Moderate crowd", high: "High crowd" }[crowd.level];
  document.getElementById("dir-place-name").textContent = place.name;
  document.getElementById("dir-meta").textContent = `${place.category} · ${capitalize(currentCity)}`;
  const badge = document.getElementById("dir-crowd-badge");
  badge.textContent = `${crowdLabel} · ${crowd.score}/100`;
  badge.className = `dir-crowd-badge ${crowd.level}`;
  document.getElementById("dir-best-time").textContent = `⏰ Best: ${bestTimeHint(place.category)}`;
  document.getElementById("directions-panel")?.classList.add("open");
  focusPlace = place;
}

function enterFocusMode(place) {
  if (!map || !place?.point) return;
  stopStoryWalk();
  focusMode = true;
  focusPlace = place;
  clearMarkers();
  if (focusMarker) {
    map.removeLayer(focusMarker);
    focusMarker = null;
  }
  const { lat, lon } = place.point;
  focusMarker = L.marker([lat, lon], { icon: makePulsingFocusIcon() }).addTo(map);
  map.flyTo([lat, lon], 16, { duration: 1.2 });
  showDirectionsPanel(place);
}

function showAllPlaces() {
  focusMode = false;
  focusPlace = null;
  hideDirectionsPanel();
  if (focusMarker) {
    map.removeLayer(focusMarker);
    focusMarker = null;
  }
  const filtered = applyFilter(applySort(globalPlaces, activeSort), activeFilter);
  displayPlaces(filtered);
  renderSidebarList(filtered);
}

function getDirectionsToFocus() {
  if (!focusPlace?.point) return;
  const dest = `${focusPlace.point.lat},${focusPlace.point.lon}`;
  const openMaps = (origin) => {
    let url = `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
    if (origin) url += `&origin=${origin}`;
    window.open(url, "_blank");
  };
  if (!navigator.geolocation) {
    openMaps(null);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => openMaps(`${pos.coords.latitude},${pos.coords.longitude}`),
    () => openMaps(null),
    { timeout: 10000, maximumAge: 60000 }
  );
}

function surpriseMe() {
  if (!globalPlaces.length) {
    toast("Search a city first");
    return;
  }
  const pool = applyFilter(applySort(globalPlaces, activeSort), activeFilter).slice(0, 20);
  if (!pool.length) {
    toast("No places to surprise you with");
    return;
  }
  const pick = pool[Math.floor(Math.random() * pool.length)];
  openModal(pick);
  toast(`🎲 ${pick.name}`);
}

function stopStoryWalk() {
  storyWalkActive = false;
  storyWalkToken++;
  storyWalkTimeouts.forEach(t => clearTimeout(t));
  storyWalkTimeouts = [];
  document.getElementById("story-walk-stop")?.classList.remove("visible");
}

function startStoryWalk() {
  if (!map || !globalPlaces.length) {
    toast("Search a city first");
    return;
  }
  stopStoryWalk();
  if (focusMode) showAllPlaces();

  const places = applyFilter(applySort(globalPlaces, activeSort), activeFilter).slice(0, 5);
  if (places.length < 1) {
    toast("No places for a story walk");
    return;
  }

  storyWalkActive = true;
  document.getElementById("story-walk-stop")?.classList.add("visible");
  const token = ++storyWalkToken;
  let step = 0;

  const runStep = () => {
    if (!storyWalkActive || token !== storyWalkToken) return;
    const place = places[step];
    const { lat, lon } = place.point;
    map.flyTo([lat, lon], 15, { duration: 1.1 });
    const marker = markersByName.get(place.name);
    const t1 = setTimeout(() => {
      if (!storyWalkActive || token !== storyWalkToken) return;
      if (marker) marker.openPopup();
      else openModal(place);
    }, 1200);
    storyWalkTimeouts.push(t1);

    step++;
    if (step < places.length) {
      const t2 = setTimeout(runStep, 5000);
      storyWalkTimeouts.push(t2);
    } else {
      const t3 = setTimeout(() => {
        if (token === storyWalkToken) stopStoryWalk();
        if (currentBounds.length) map.fitBounds(currentBounds, { padding: [40, 40] });
        toast("Story walk complete");
      }, 5000);
      storyWalkTimeouts.push(t3);
    }
  };

  toast("🎬 Story walk started");
  runStep();
}

function makeMarkerIcon(index, crowdLevel, isHot) {
  const colorMap = { low: "#1E6B44", medium: "#9A6216", high: "#B83030" };
  const dotColor = colorMap[crowdLevel] || "#918C80";
  const size = isHot ? 34 : 26;
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;background:${isHot?"#C4451A":"#fff"};color:${isHot?"#fff":"#1C1A15"};border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'DM Sans',sans-serif;font-size:${isHot?"12px":"10px"};font-weight:700;box-shadow:0 3px 12px rgba(0,0,0,0.22);border:2.5px solid ${isHot?"rgba(255,255,255,0.8)":"#E2DAC9"};position:relative;">${index+1}
      <span style="position:absolute;bottom:-2px;right:-2px;width:9px;height:9px;border-radius:50%;background:${dotColor};border:1.5px solid #fff;"></span>
    </div>`,
    iconSize: [size, size], iconAnchor: [size/2, size/2]
  });
}

// ─── SEARCH ──────────────────────────────────────────────────
async function searchCity() {
  const city = document.getElementById("cityInput").value.trim();
  if (!city) { toast("Enter a city name first"); return; }
  document.getElementById("autocomplete-list").classList.remove("open");
  toast(`Exploring ${city}…`);
  showSkeletons();
  try {
    const res = await fetch(`${API}/geocode?city=${encodeURIComponent(city)}`);
    if (!res.ok) throw new Error("Geocode failed");
    const geo = await res.json();
    currentCity = city;
    currentLat = geo.lat;
    currentLon = geo.lng;
    syncCrowdContext();
    document.getElementById("map-badge").textContent = `📍 ${capitalize(city)}`;
    if (!map) initMap(geo.lat, geo.lng);
    else initMap(geo.lat, geo.lng);
    loadHostels(city);
    await loadWeather(geo.lat, geo.lng);
    syncCrowdContext();
    await loadPlaces(geo.lat, geo.lng);
  } catch(e) {
    toast("Couldn't find that city — try another");
    console.error(e);
  }
}

// ─── PLACES ──────────────────────────────────────────────────

// Only these OpenTripMap kind substrings are TOURIST places
const TOURIST_KINDS_WHITELIST = [
  "waterfall","mountain","hill_top","plateau","valley","gorge","volcano",
  "beach","cape","island","lake","river_waterfall","natural",
  "temple","church","cathedral","monastery","mosque","synagogue","pagoda","shrine",
  "fort","castle","tower","ruins","archaeological_site","prehistoric","megalith",
  "museum","art_gallery","exhibition","planetarium","aquarium","zoo","botanical_garden",
  "monument","memorial","statue","mausoleum","tomb",
  "historic_architecture","palace","manor","estate",
  "national_park","nature_reserve","wildlife_park","safari","wildlife_sanctuary",
  "garden","amusement_park","theme_park","viewpoint","observation_deck",
  "cave","grotto","glacier","hot_spring","geyser","delta","lagoon","reef","cliff",
  "heritage","world_heritage","historic_district","old_town",
  "interesting_places","cultural","historic","architecture",
  "beaches","waterfalls","fortifications","theatres_and_entertainments",
  "archaeological","monuments_and_memorials","gardens_and_parks","zoos_and_aquariums",
];

// Block ANY place whose name or kinds contains these — non-tourist
const BLOCKLIST_NAMES = [
  "college","university","school","institute","iit","nit","iim","hospital",
  "bank","atm","police","court","jail","prison","office","headquarters",
  "factory","plant","warehouse","depot","terminal","junction","railway station",
  "bus stand","airport","petrol","pump","service station","petrol pump",
  "hotel","lodge","inn","hostel","resort","homestay", // exclude accommodation from tourist places
  "mall","market","bazaar","shop","store","supermarket","hypermarket",
  "clinic","pharmacy","dispensary","medical","nursing home",
  "church hall","community hall","town hall","municipal",
  "residential","apartment","society","colony","sector",
  "cemetery","crematorium","burial",
  "flyover","bridge","highway","road","street","chowk","circle","roundabout",
];

function isTouristPlace(p) {
  const kinds = (p.kinds || "").toLowerCase();
  const name  = (p.name  || "").toLowerCase();

  // Must match at least one whitelist kind
  const hasGoodKind = TOURIST_KINDS_WHITELIST.some(k => kinds.includes(k));
  if (!hasGoodKind) return false;

  // Block if name or kinds contains non-tourist terms
  const isBlocked = BLOCKLIST_NAMES.some(b => name.includes(b) || kinds.includes(b));
  if (isBlocked) return false;

  // Block very generic single-word names that are usually not tourist spots
  const nameTrimmed = name.trim();
  if (nameTrimmed.split(" ").length === 1 && nameTrimmed.length < 5) return false;

  // Drop obscure religious sites; keep famous ones (OTM rate ≥ 2)
  const religiousKinds = ["temple","church","mosque","shrine","monastery","cathedral","pagoda","synagogue"];
  const rate = p.rate ?? p.properties?.rate ?? 0;
  if (religiousKinds.some(k => kinds.includes(k)) && rate < 2) return false;

  return true;
}

function placesRadiusForCity(city) {
  const big = ["mumbai", "delhi", "bangalore", "bengaluru", "kolkata", "chennai", "hyderabad", "pune"];
  return big.includes(city.toLowerCase().trim()) ? 50 : 35;
}

function cityLandmarkKey(city) {
  const c = city.toLowerCase().trim();
  if (c === "bengaluru") return "bangalore";
  return c;
}

const CITY_LANDMARKS = {
  mumbai: [
    { name: "Gateway of India", category: "Heritage" },
    { name: "Marine Drive", category: "Heritage" },
    { name: "Elephanta Caves", category: "Heritage" },
    { name: "Chhatrapati Shivaji Terminus", category: "Heritage" },
    { name: "Siddhivinayak Temple", category: "Temple" },
    { name: "Juhu Beach", category: "Beach" },
    { name: "Haji Ali Dargah", category: "Heritage" },
    { name: "Sanjay Gandhi National Park", category: "Park" },
  ],
  delhi: [
    { name: "India Gate", category: "Heritage" },
    { name: "Red Fort", category: "Fort" },
    { name: "Qutub Minar", category: "Heritage" },
    { name: "Lotus Temple", category: "Temple" },
    { name: "Humayun's Tomb", category: "Heritage" },
    { name: "Akshardham", category: "Temple" },
    { name: "Connaught Place", category: "Heritage" },
    { name: "Jama Masjid", category: "Temple" },
  ],
  bangalore: [
    { name: "Lalbagh Botanical Garden", category: "Park" },
    { name: "Cubbon Park", category: "Park" },
    { name: "Bangalore Palace", category: "Heritage" },
    { name: "Vidhana Soudha", category: "Heritage" },
    { name: "ISKCON Temple Bangalore", category: "Temple" },
    { name: "Bannerghatta Biological Park", category: "Park" },
    { name: "Tipu Sultan's Summer Palace", category: "Heritage" },
    { name: "Nandi Hills", category: "Hill" },
  ],
  kolkata: [
    { name: "Victoria Memorial", category: "Heritage" },
    { name: "Howrah Bridge", category: "Heritage" },
    { name: "Indian Museum", category: "Museum" },
    { name: "Dakshineswar Kali Temple", category: "Temple" },
    { name: "Park Street", category: "Heritage" },
    { name: "Fort William", category: "Fort" },
    { name: "Science City Kolkata", category: "Museum" },
    { name: "Princep Ghat", category: "Heritage" },
  ],
  chennai: [
    { name: "Marina Beach", category: "Beach" },
    { name: "Kapaleeshwarar Temple", category: "Temple" },
    { name: "Fort St. George", category: "Fort" },
    { name: "Government Museum Chennai", category: "Museum" },
    { name: "San Thome Basilica", category: "Temple" },
    { name: "Elliot's Beach", category: "Beach" },
    { name: "Valluvar Kottam", category: "Heritage" },
    { name: "Guindy National Park", category: "Park" },
  ],
  hyderabad: [
    { name: "Charminar", category: "Heritage" },
    { name: "Golconda Fort", category: "Fort" },
    { name: "Hussain Sagar Lake", category: "Lake" },
    { name: "Ramoji Film City", category: "Park" },
    { name: "Salar Jung Museum", category: "Museum" },
    { name: "Chowmahalla Palace", category: "Heritage" },
    { name: "Birla Mandir Hyderabad", category: "Temple" },
    { name: "Qutb Shahi Tombs", category: "Heritage" },
  ],
  pune: [
    { name: "Shaniwar Wada", category: "Fort" },
    { name: "Aga Khan Palace", category: "Heritage" },
    { name: "Sinhagad Fort", category: "Fort" },
    { name: "Dagdusheth Halwai Ganpati Temple", category: "Temple" },
    { name: "Pataleshwar Cave Temple", category: "Temple" },
    { name: "Raja Dinkar Kelkar Museum", category: "Museum" },
    { name: "Parvati Hill", category: "Hill" },
    { name: "Osho International Meditation Resort", category: "Heritage" },
  ],
  jaipur: [
    { name: "Hawa Mahal", category: "Heritage" },
    { name: "Amber Fort", category: "Fort" },
    { name: "City Palace Jaipur", category: "Heritage" },
    { name: "Jantar Mantar Jaipur", category: "Heritage" },
    { name: "Nahargarh Fort", category: "Fort" },
    { name: "Albert Hall Museum", category: "Museum" },
    { name: "Jal Mahal", category: "Heritage" },
    { name: "Jaigarh Fort", category: "Fort" },
  ],
  goa: [
    { name: "Basilica of Bom Jesus", category: "Heritage" },
    { name: "Calangute Beach", category: "Beach" },
    { name: "Fort Aguada", category: "Fort" },
    { name: "Dudhsagar Falls", category: "Waterfall" },
    { name: "Anjuna Beach", category: "Beach" },
    { name: "Se Cathedral", category: "Heritage" },
    { name: "Chapora Fort", category: "Fort" },
    { name: "Palolem Beach", category: "Beach" },
  ],
  agra: [
    { name: "Taj Mahal", category: "Heritage" },
    { name: "Agra Fort", category: "Fort" },
    { name: "Fatehpur Sikri", category: "Heritage" },
    { name: "Itimad-ud-Daulah", category: "Heritage" },
    { name: "Mehtab Bagh", category: "Park" },
    { name: "Akbar's Tomb", category: "Heritage" },
    { name: "Jama Masjid Agra", category: "Temple" },
  ],
  varanasi: [
    { name: "Kashi Vishwanath Temple", category: "Temple" },
    { name: "Dashashwamedh Ghat", category: "Heritage" },
    { name: "Sarnath", category: "Heritage" },
    { name: "Assi Ghat", category: "Heritage" },
    { name: "Manikarnika Ghat", category: "Heritage" },
    { name: "Ramnagar Fort", category: "Fort" },
    { name: "Bharat Mata Temple", category: "Temple" },
  ],
  amritsar: [
    { name: "Golden Temple", category: "Temple" },
    { name: "Wagah Border", category: "Heritage" },
    { name: "Jallianwala Bagh", category: "Heritage" },
    { name: "Partition Museum", category: "Museum" },
    { name: "Gobindgarh Fort", category: "Fort" },
    { name: "Durgiana Temple", category: "Temple" },
  ],
  udaipur: [
    { name: "Lake Pichola", category: "Lake" },
    { name: "City Palace Udaipur", category: "Heritage" },
    { name: "Jag Mandir", category: "Heritage" },
    { name: "Saheliyon Ki Bari", category: "Park" },
    { name: "Fateh Sagar Lake", category: "Lake" },
    { name: "Monsoon Palace", category: "Heritage" },
    { name: "Jagdish Temple", category: "Temple" },
  ],
  kochi: [
    { name: "Fort Kochi", category: "Heritage" },
    { name: "Mattancherry Palace", category: "Heritage" },
    { name: "Chinese Fishing Nets", category: "Heritage" },
    { name: "Paradesi Synagogue", category: "Heritage" },
    { name: "Marine Drive Kochi", category: "Heritage" },
    { name: "Hill Palace Museum", category: "Museum" },
    { name: "Cherai Beach", category: "Beach" },
  ],
  mysore: [
    { name: "Mysore Palace", category: "Heritage" },
    { name: "Chamundi Hills", category: "Hill" },
    { name: "Brindavan Gardens", category: "Park" },
    { name: "Mysore Zoo", category: "Park" },
    { name: "Karanji Lake", category: "Lake" },
    { name: "St. Philomena's Cathedral", category: "Temple" },
  ],
  chandigarh: [
    { name: "Rock Garden of Chandigarh", category: "Park" },
    { name: "Sukhna Lake", category: "Lake" },
    { name: "Rose Garden Chandigarh", category: "Park" },
    { name: "Capitol Complex Chandigarh", category: "Heritage" },
    { name: "Open Hand Monument", category: "Heritage" },
    { name: "Pinjore Gardens", category: "Park" },
  ],
  lucknow: [
    { name: "Bara Imambara", category: "Heritage" },
    { name: "Chota Imambara", category: "Heritage" },
    { name: "Rumi Darwaza", category: "Heritage" },
    { name: "British Residency Lucknow", category: "Heritage" },
    { name: "Ambedkar Memorial Park", category: "Park" },
    { name: "Husainabad Clock Tower", category: "Heritage" },
  ],
  ahmedabad: [
    { name: "Sabarmati Ashram", category: "Heritage" },
    { name: "Adalaj Stepwell", category: "Heritage" },
    { name: "Sidi Saiyyed Mosque", category: "Temple" },
    { name: "Jama Masjid Ahmedabad", category: "Temple" },
    { name: "Kankaria Lake", category: "Lake" },
    { name: "Sarkhej Roza", category: "Heritage" },
    { name: "Calico Museum of Textiles", category: "Museum" },
  ],
  srinagar: [
    { name: "Dal Lake", category: "Lake" },
    { name: "Shalimar Bagh", category: "Park" },
    { name: "Nishat Bagh", category: "Park" },
    { name: "Shankaracharya Temple", category: "Temple" },
    { name: "Hazratbal Shrine", category: "Temple" },
    { name: "Pari Mahal", category: "Heritage" },
  ],
  shimla: [
    { name: "The Ridge Shimla", category: "Heritage" },
    { name: "Mall Road Shimla", category: "Heritage" },
    { name: "Jakhoo Temple", category: "Temple" },
    { name: "Christ Church Shimla", category: "Temple" },
    { name: "Kufri", category: "Hill" },
    { name: "Indian Institute of Advanced Study", category: "Heritage" },
  ],
};

const LANDMARK_KINDS = {
  Temple: "interesting_places,cultural,temples,historic",
  Heritage: "interesting_places,cultural,monuments_and_memorials,historic,architecture",
  Fort: "fortifications,historic,interesting_places",
  Beach: "beaches,natural",
  Museum: "museums,cultural",
  Park: "gardens_and_parks,natural",
  Waterfall: "waterfalls,natural",
  Lake: "natural,interesting_places",
  Hill: "natural,mountains,historic",
};

function makeLandmarkPlace(name, category, cityLat, cityLon, index) {
  const seed = hashCode(name + String(index));
  const angle = ((Math.abs(seed) % 360) * Math.PI) / 180;
  const dist = 0.006 + (Math.abs(seed) % 12) * 0.0012;
  return {
    name,
    kinds: LANDMARK_KINDS[category] || "interesting_places,cultural,historic",
    rate: 7,
    landmarkCategory: category,
    point: {
      lat: cityLat + Math.cos(angle) * dist,
      lon: cityLon + Math.sin(angle) * dist * 1.15,
    },
    isLandmark: true,
  };
}

function prependCityLandmarks(places, cityLat, cityLon) {
  const landmarks = CITY_LANDMARKS[cityLandmarkKey(currentCity)];
  if (!landmarks?.length) return places;
  const seen = new Set(places.map(p => p.name.toLowerCase().trim()));
  const added = [];
  landmarks.forEach((lm, i) => {
    const key = lm.name.toLowerCase().trim();
    if (seen.has(key)) return;
    seen.add(key);
    added.push(makeLandmarkPlace(lm.name, lm.category, cityLat, cityLon, i));
  });
  return [...added, ...places];
}

async function checkBackendPlacesApi() {
  try {
    const res = await fetch(`${API}/health`);
    if (!res.ok) return { ok: false, reason: "offline" };
    const h = await res.json();
    if (h.placesApi >= 3) return { ok: true };
    return { ok: false, reason: "outdated" };
  } catch {
    return { ok: false, reason: "offline" };
  }
}

async function fetchPlacesApi(lat, lon, radius) {
  const res = await fetch(`${API}/places?lat=${lat}&lon=${lon}&radius=${radius}`);
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (Array.isArray(data)) return data;
  if (data?.places && Array.isArray(data.places)) return data.places;

  if (!res.ok) {
    const err = new Error(data?.error || `Places API ${res.status}`);
    err.status = res.status;
    err.needsRestart = res.status === 500 && data?.error === "Could not fetch places";
    throw err;
  }
  return [];
}

async function fetchPlacesWithRetry(lat, lon, radius, maxAttempts = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetchPlacesApi(lat, lon, radius);
    } catch (e) {
      lastErr = e;
      console.warn(`Places fetch attempt ${attempt}/${maxAttempts} failed`, e.message);
      if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 400 * attempt));
    }
  }
  throw lastErr;
}

function showPlacesEmptyState(title, message, showRetry = false) {
  document.getElementById("places").innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">🗺️</div>
      <h2>${title}</h2>
      <p>${message}</p>
      ${showRetry ? '<button type="button" class="btn-primary" style="margin-top:16px" onclick="loadPlaces(currentLat, currentLon)">Try again</button>' : ""}
    </div>`;
}

async function loadPlaces(lat = 18.5204, lon = 73.8567) {
  clearMarkers();
  placesDisplayCount = displayLimit;
  showSkeletons();
  syncCrowdContext();
  const radius = placesRadiusForCity(currentCity);

  try {
    const data = await fetchPlacesWithRetry(lat, lon, radius);

    let valid = data.filter(p =>
      p.name?.trim() && p.point?.lat != null && p.point?.lon != null && p.kinds && isTouristPlace(p)
    );

    const seen = new Set();
    valid = valid.filter(p => {
      const key = p.name.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    valid = prependCityLandmarks(valid, lat, lon);

    valid = valid.map(p => {
      const category = p.landmarkCategory || detectCategory(p.kinds);
      const otmRate = p.rate ?? p.properties?.rate ?? (p.isLandmark ? 7 : 0);
      const rating = ratingFromOtmRate(p.name, category, otmRate);
      const enriched = { ...p, rating, category, otmRate, point: p.point };
      const crowd = computeCrowd(enriched);
      const cost = getEntryFee({ name: p.name, category });
      return { ...enriched, cost, crowd };
    }).sort((a, b) => b.rating - a.rating);

    globalPlaces = valid;

    if (!valid.length) {
      showPlacesEmptyState(
        "No tourist places found",
        `We couldn't find curated spots near ${capitalize(currentCity)}. Try another city.`,
        true
      );
      updateResultsBar(currentCity, 0);
      return;
    }

    updateCrowdSummary(valid);
    const filtered = applyFilter(applySort(valid, activeSort), activeFilter);
    displayPlaces(filtered);
    updateResultsBar(currentCity, filtered.length);
    renderSidebarList(filtered);
  } catch (e) {
    console.error("loadPlaces:", e);
    let msg = "Couldn't load places. Check that the server is running on port 5000.";
    if (e.needsRestart || e.status === 500) {
      const api = await checkBackendPlacesApi();
      if (api.reason === "outdated") {
        msg = "Backend is outdated — stop the old server, then run: npm run start";
      } else if (api.reason === "offline") {
        msg = "Backend not running — open a terminal and run: npm run start";
      } else {
        msg = "Places service error — try again in a few seconds.";
      }
    } else if (e.status === 429) {
      msg = "Too many requests — wait a moment and try again.";
    }
    toast(msg);
    showPlacesEmptyState("Couldn't load places", msg, true);
    updateResultsBar(currentCity, 0);
  }
}

function updateCrowdSummary(places) {
  const low  = places.filter(p => p.crowd.level === "low").length;
  const med  = places.filter(p => p.crowd.level === "medium").length;
  const high = places.filter(p => p.crowd.level === "high").length;
  document.getElementById("scs-low").textContent = low;
  document.getElementById("scs-med").textContent = med;
  document.getElementById("scs-high").textContent = high;
  document.getElementById("sidebar-crowd-summary").classList.add("visible");
}

// ─── HOSTEL DATA ─────────────────────────────────────────────
// Realistic hostel chains & types present in Indian + global cities
const HOSTEL_CHAINS = [
  { name: "Zostel",         type: "Party Hostel",    emoji: "🎉", rating: 4.4, priceRange: [350, 700],  amenities: ["WiFi","Common Room","Bar","Events","AC Dorm"] },
  { name: "Backpacker Panda",type:"Social Hostel",   emoji: "🐼", rating: 4.3, priceRange: [400, 800],  amenities: ["WiFi","Kitchen","Lockers","Female Dorm"] },
  { name: "GoStel",          type: "Budget Hostel",  emoji: "🛏",  rating: 4.1, priceRange: [250, 500],  amenities: ["WiFi","Hot Water","Locker","Common Area"] },
  { name: "The Hosteller",   type: "Social Hostel",  emoji: "🏡", rating: 4.5, priceRange: [500, 900],  amenities: ["WiFi","Rooftop","Events","AC","Breakfast opt."] },
  { name: "Moustache Hostel",type: "Boutique Hostel",emoji: "👨", rating: 4.6, priceRange: [450, 850],  amenities: ["WiFi","Pool","Bar","Café","AC Dorm"] },
  { name: "Roadhouse Hostel",type: "Budget Hostel",  emoji: "🏠", rating: 4.2, priceRange: [300, 600],  amenities: ["WiFi","Lockers","Kitchen","Mixed Dorm"] },
  { name: "Treebo Hostel",   type: "Budget Hotel",   emoji: "🌳", rating: 4.0, priceRange: [500, 1000], amenities: ["WiFi","AC","24hr Reception","Hot Water"] },
  { name: "OYO Townhouse",   type: "Budget Hotel",   emoji: "🏩", rating: 3.9, priceRange: [600, 1200], amenities: ["WiFi","AC","Room Service","24hr Reception"] },
];

const HOSTEL_AREAS = {
  "mumbai":    ["Colaba","Bandra","Andheri","Fort Area","Juhu"],
  "delhi":     ["Paharganj","Karol Bagh","Connaught Place","Hauz Khas","Lajpat Nagar"],
  "bangalore": ["Koramangala","Indiranagar","MG Road","HSR Layout","Whitefield"],
  "pune":      ["Koregaon Park","Shivajinagar","Camp Area","Kothrud","Viman Nagar"],
  "jaipur":    ["MI Road","Bani Park","Sindhi Camp","Civil Lines","C-Scheme"],
  "goa":       ["Panaji","Calangute","Anjuna","Arambol","Vagator"],
  "hyderabad": ["Banjara Hills","Madhapur","Begumpet","Hitech City","Jubilee Hills"],
  "chennai":   ["T Nagar","Anna Nagar","Egmore","Mylapore","Adyar"],
  "kolkata":   ["Park Street","New Market","Esplanade","Tollygunge","Salt Lake"],
  "agra":      ["Taj Ganj","Sadar Bazar","Fatehabad Road","Civil Lines"],
  "varanasi":  ["Assi Ghat","Dashashwamedh","Bengali Tola","Lanka"],
  "udaipur":   ["City Palace Area","Fateh Sagar","Ambamata","Chetak"],
  "manali":    ["Old Manali","Mall Road","Vashisht","Aleo"],
  "rishikesh": ["Lakshman Jhula","Ram Jhula","Tapovan","High Bank"],
  "default":   ["City Centre","Old Town","Near Railway Station","Tourist Area","Market Area"],
};

let globalHostels = [];

function generateHostelsForCity(cityName) {
  const city = cityName.toLowerCase();
  const areas = HOSTEL_AREAS[city] || HOSTEL_AREAS["default"];
  const seed = Math.abs(hashCode(cityName));

  // Pick 6 hostels deterministically per city
  const count = 6;
  const hostels = [];
  for (let i = 0; i < count; i++) {
    const chain = HOSTEL_CHAINS[(seed + i * 3) % HOSTEL_CHAINS.length];
    const area  = areas[(seed + i) % areas.length];
    const price = chain.priceRange[0] + ((seed + i * 7) % (chain.priceRange[1] - chain.priceRange[0]));
    // Vary rating slightly per city
    const ratingVar = ((seed + i) % 5) * 0.1;
    const rating = Math.min(5.0, +(chain.rating + ratingVar - 0.2).toFixed(1));
    // Hostel-specific crowd (hostels tend to be busiest evenings)
    const hostelCrowd = computeCrowd({ name: chain.name + cityName, category: "Park" });

    hostels.push({
      id: `hostel-${i}`,
      name: `${chain.name} ${capitalize(cityName)}`,
      chain: chain.name,
      type: chain.type,
      emoji: chain.emoji,
      area,
      price: Math.round(price / 50) * 50, // round to nearest ₹50
      rating,
      amenities: chain.amenities,
      crowd: hostelCrowd,
      cityName,
    });
  }
  return hostels;
}

function loadHostels(cityName) {
  globalHostels = generateHostelsForCity(cityName);
  renderHostels(globalHostels);
}

function renderHostels(hostels) {
  const grid = document.getElementById("hostels-grid");
  if (!grid) return;
  if (!hostels.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🏨</div><h2>No hostels found</h2><p>Try searching a city first</p></div>`;
    return;
  }

  grid.innerHTML = hostels.map((h, i) => {
    const crowdCls   = { low:"low-s", medium:"med-s", high:"high-s" }[h.crowd.level];
    const crowdLabel = { low:"Low", medium:"Moderate", high:"Busy" }[h.crowd.level];
    const isSaved = savedPlaces.some(s => s.name === h.name && s._isHostel);
    const rid = registerPlace({ ...h, _isHostel: true, cost: h.price, category: "Hostel", point: { lat: currentLat + ((i-3)*0.005), lon: currentLon + ((i-3)*0.005) } });

    return `
    <div class="hostel-card-full" style="animation-delay:${i*0.05}s">
      <div class="hcf-left">
        <div class="hcf-emoji">${h.emoji}</div>
        <div class="hcf-info">
          <div class="hcf-name">${h.name}</div>
          <div class="hcf-type">${h.type}</div>
          <div class="hcf-area">📍 ${h.area}</div>
          <div class="hcf-amenities">
            ${h.amenities.map(a => `<span class="hcf-tag">${a}</span>`).join("")}
          </div>
        </div>
      </div>
      <div class="hcf-right">
        <div class="hcf-rating">⭐ ${h.rating}</div>
        <div class="hcf-price">₹${h.price.toLocaleString("en-IN")}<span class="hcf-price-sub">/night</span></div>
        <div class="hcf-crowd-row">
          <span class="crowd-status ${crowdCls}"><span class="cs-dot"></span>${crowdLabel}</span>
        </div>
        <div class="hcf-actions">
          <button class="hcf-save-btn ${isSaved?'saved':''}" onclick="toggleHostelSave('${rid}',this)">
            ${isSaved?"💙 Saved":"🔖 Save"}
          </button>
          <button class="hcf-add-btn" onclick="addHostelToPlanner('${rid}')">✈ Add to Plan</button>
        </div>
      </div>
    </div>`;
  }).join("");
}

function toggleHostelSave(rid, btn) {
  const h = getPlace(rid);
  if (!h) return;
  const idx = savedPlaces.findIndex(s => s.name === h.name && s._isHostel);
  if (idx === -1) {
    savedPlaces.push({ ...h, savedAt: Date.now(), savedCity: currentCity });
    btn.textContent = "💙 Saved"; btn.classList.add("saved");
    toast(`🔖 Saved: ${h.name}`);
  } else {
    savedPlaces.splice(idx, 1);
    btn.textContent = "🔖 Save"; btn.classList.remove("saved");
    toast(`Removed: ${h.name}`);
  }
  localStorage.setItem("tx_saved", JSON.stringify(savedPlaces));
  updateSavedBadge();
}

function addHostelToPlanner(rid) {
  addPlaceToDay(rid, 0);
  toast("🏨 Hostel added to Day 1 of your plan");
}
async function loadWeather(lat = 18.5204, lon = 73.8567) {
  try {
    const res = await fetch(`${API}/weather?lat=${lat}&lon=${lon}`);
    if (!res.ok) throw new Error();
    const w = await res.json();
    const tempC = +(w.main.temp - 273.15).toFixed(1);
    const feelsC = +(w.main.feels_like - 273.15).toFixed(1);
    weatherCache = {
      temp: `${tempC}°C`, sky: w.weather[0].main,
      tempC, feelsC,
      humidity: `${w.main.humidity}%`, wind: `${(w.wind.speed * 3.6).toFixed(1)} km/h`,
      windKmh: +(w.wind.speed * 3.6).toFixed(1),
      feelsLike: `${feelsC}°C`, description: capitalize(w.weather[0].description),
      condition: w.weather[0].main,
    };
    syncCrowdContext();
    document.getElementById("sw-city-name").textContent = capitalize(currentCity);
    document.getElementById("sw-temp").textContent  = weatherCache.temp;
    document.getElementById("sw-sky").textContent   = weatherCache.sky;
    document.getElementById("sw-hum").textContent   = weatherCache.humidity;
    document.getElementById("sw-wind").textContent  = weatherCache.wind;
    document.getElementById("sw-feels").textContent = weatherCache.feelsLike;
    document.getElementById("sw-desc").textContent  = weatherCache.description;
    document.getElementById("sidebar-weather").classList.add("visible");
  } catch { console.warn("Weather unavailable"); }
}

// ─── DISPLAY PLACES ──────────────────────────────────────────
const STRIPE_COLORS = {
  "Temple":"#C4451A","Museum":"#2456A4","Fort":"#744210",
  "Waterfall":"#0D7A5F","Hill":"#1E6B44","Park":"#1E6B44",
  "Heritage":"#7B341E","Lake":"#1A6B8C","Cave":"#553C9A",
  "Beach":"#C05621","Nature":"#276749",
};
const CAT_BG = {
  "Temple":"rgba(196,69,26,0.1)","Museum":"rgba(36,86,164,0.1)","Fort":"rgba(116,66,16,0.1)",
  "Waterfall":"rgba(13,122,95,0.1)","Hill":"rgba(30,107,68,0.1)","Park":"rgba(30,107,68,0.1)",
  "Heritage":"rgba(123,52,30,0.1)","Lake":"rgba(26,107,140,0.1)","Cave":"rgba(85,60,154,0.1)",
  "Beach":"rgba(192,86,33,0.1)","Nature":"rgba(39,103,73,0.1)",
};

function displayPlaces(places) {
  const container = document.getElementById("places");
  container.innerHTML = "";
  const mapLat = places[0]?.point?.lat ?? currentLat;
  const mapLon = places[0]?.point?.lon ?? currentLon;
  ensureMap(mapLat, mapLon);
  if (focusMode) {
    if (focusMarker && map) { map.removeLayer(focusMarker); focusMarker = null; }
    focusMode = false;
    focusPlace = null;
    hideDirectionsPanel();
  }
  clearMarkers();
  markersByName.clear();
  lastDisplayedPlaces = places;
  currentBounds = [];

  if (!places.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔭</div><h2>No places match</h2><p>Try a different filter or sort</p></div>`;
    return;
  }

  const visible = places.slice(0, placesDisplayCount);
  visible.forEach((place, i) => {
    const { lat, lon } = place.point;
    const isHot = i < 5;
    const crowd = place.crowd;
    const isSaved = savedPlaces.some(s => s.name === place.name);
    const stripeColor = STRIPE_COLORS[place.category] || "#918C80";
    const catBg = CAT_BG[place.category] || "rgba(145,140,128,0.1)";
    const catColor = stripeColor;
    const crowdLevelCls = { low: "low-s", medium: "med-s", high: "high-s" }[crowd.level];
    const crowdLabel = { low: "Low Crowd", medium: "Moderate", high: "High Crowd" }[crowd.level];

    currentBounds.push([lat, lon]);

    // Map marker
    if (map) {
      const marker = L.marker([lat, lon], { icon: makeMarkerIcon(i, crowd.level, isHot) }).addTo(map);
      marker.bindPopup(`
      <div style="font-family:'DM Sans',sans-serif;min-width:180px;padding:4px">
        <div style="font-weight:700;font-size:14px;margin-bottom:4px">${place.name}</div>
        <div style="color:#918C80;font-size:11px;margin-bottom:8px">${place.category}</div>
        <div style="display:flex;gap:10px;font-size:12px;align-items:center">
          <span>⭐ ${place.rating}</span>
          <span>💰 ${place.cost === 0 ? 'Free' : '₹'+place.cost}</span>
          <span style="color:${crowd.level==='low'?'#1E6B44':crowd.level==='medium'?'#9A6216':'#B83030'};font-weight:700">${crowdLabel.toUpperCase()}</span>
        </div>
      </div>
    `);
      marker.on("click", () => openModal(place));
      markers.push(marker);
      markersByName.set(place.name, marker);
    }

    // Card
    const card = document.createElement("div");
    card.className = "place-card";
    card.style.animationDelay = `${i * 0.04}s`;

    card.innerHTML = `
      <div class="place-card-header">
        <span class="place-cat-badge" style="background:${catBg};color:${catColor}">${isHot ? "🔥 HOT" : place.category}</span>
        <div class="place-rating"><span class="stars">${renderStars(place.rating)}</span> ${place.rating}</div>
      </div>
      <div class="place-card-body">
        <div class="place-name">${place.name}</div>
        <div class="place-kind">${place.category} · #${i + 1} in ${capitalize(currentCity)}</div>
        <div class="place-stats">
          <div class="place-stat">
            <div class="place-stat-label">Entry Fee</div>
            <div class="place-stat-val price-with-badge" data-price-for="${encodeURIComponent(place.name)}">
              <span class="price-shimmer"></span>
            </div>
          </div>
          <div class="place-stat">
            <div class="place-stat-label">Weather</div>
            <div class="place-stat-val">${weatherCache?.temp ?? "—"} ${weatherCache?.sky ?? ""}</div>
          </div>
        </div>
        <div class="crowd-section">
          <div class="crowd-header">
            <span class="crowd-label">Crowd Now</span>
            <span class="crowd-status ${crowdLevelCls}">
              <span class="cs-dot"></span>${crowdLabel}
            </span>
          </div>
          <div class="crowd-track">
            <div class="crowd-fill ${crowd.level}" style="width:${crowd.score}%"></div>
          </div>
          <div class="crowd-hint">${crowd.peakHint}</div>
        </div>
        <div class="best-visit-hint">⏰ Best: ${bestTimeHint(place.category)}</div>
      </div>
      <div class="place-card-footer">
        <span class="pf-left">📍 ${place.kinds?.split(",")[0]?.replace(/_/g," ") ?? place.category}</span>
        <div class="pf-actions">
          <button class="save-btn ${isSaved ? 'saved' : ''}" data-name="${place.name}" title="${isSaved ? 'Unsave' : 'Save'}">
            ${isSaved ? '💙' : '🔖'}
          </button>
          <span class="details-link">Details →</span>
        </div>
      </div>
    `;

    card.addEventListener("click", (e) => {
      if (e.target.closest(".save-btn")) return;
      openModal(place);
    });
    card.querySelector(".save-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSave(place, card.querySelector(".save-btn"));
    });

    container.appendChild(card);
    const priceEl = card.querySelector(".place-stat-val.price-with-badge");
    loadPlacePrice(place, priceEl);
  });

  if (map && currentBounds.length) map.fitBounds(currentBounds, { padding: [40, 40] });
  renderShowMoreButton(places.length);
}

function renderShowMoreButton(totalCount) {
  let btn = document.getElementById("show-more-places");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "show-more-places";
    btn.className = "show-more-btn";
    btn.type = "button";
    btn.onclick = showMorePlaces;
    document.getElementById("panel-places")?.appendChild(btn);
  }
  if (totalCount <= placesDisplayCount) {
    btn.style.display = "none";
    return;
  }
  const remaining = totalCount - placesDisplayCount;
  btn.style.display = "block";
  btn.textContent = `Show ${Math.min(15, remaining)} more`;
}

function showMorePlaces() {
  placesDisplayCount += 15;
  const filtered = applyFilter(applySort(globalPlaces, activeSort), activeFilter);
  displayPlaces(filtered);
  renderSidebarList(filtered);
  updateResultsBar(currentCity, filtered.length);
}

// ─── SIDEBAR MINI LIST ───────────────────────────────────────
function renderSidebarList(places) {
  const list = document.getElementById("sidebar-places-list");
  if (!places.length) { list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px">No results</div>`; return; }

  list.innerHTML = places.slice(0, 25).map((p, i) => {
    const dotColor = { low: "#1E6B44", medium: "#9A6216", high: "#B83030" }[p.crowd.level];
    const isHot = i < 5;
    return `
      <div class="mini-card" onclick="openModal(window.__places__[${i}])">
        <div class="mini-card-num ${isHot ? 'hot' : ''}">${i + 1}</div>
        <div class="mini-card-info">
          <div class="mini-card-name">${p.name}</div>
          <div class="mini-card-sub">
            <span class="mini-crowd-dot" style="background:${dotColor}"></span>
            ${p.category}
          </div>
        </div>
        <div class="mini-cost">${p.cost === 0 ? 'Free' : '₹' + p.cost}</div>
      </div>
    `;
  }).join("");

  // Store reference for onclick
  window.__places__ = places;
}

// ─── MODAL ───────────────────────────────────────────────────
const TRAVEL_TIPS = {
  "Temple":    "Remove footwear at the entrance. Early morning puja is a magical experience.",
  "Museum":    "Photography may require a ticket. Weekday mornings have the least crowds.",
  "Fort":      "Wear comfortable shoes — uneven terrain. Carry water and sunscreen.",
  "Waterfall": "Check monsoon advisories. Rocks can be slippery — exercise caution.",
  "Hill":      "Start early for sunrise. Carry warm layers — temperatures drop quickly.",
  "Park":      "Great for morning walks and picnics. Dogs usually welcome.",
  "Heritage":  "Book tickets online to skip queues, especially on weekends.",
  "Lake":      "Sunrise and sunset are magical. Boat rides often available nearby.",
  "Cave":      "Bring a torch. Watch head clearance. Great for hot-weather escapes.",
  "Beach":     "Check tide times before visiting. Lifeguards may not always be present.",
  "Nature":    "Stick to marked trails. Carry insect repellent, water and snacks.",
};

function openModal(place) {
  modalPlace = place;
  syncCrowdContext();
  const crowd = computeCrowd(place);
  place.crowd = crowd;
  const isSaved = savedPlaces.some(s => s.name === place.name);
  const stripeColor = STRIPE_COLORS[place.category] || "#918C80";
  const crowdLabel = { low: "🟢 Low Crowd", medium: "🟡 Moderate Crowd", high: "🔴 High Crowd" }[crowd.level];
  const crowdCls = { low: "low-s", medium: "med-s", high: "high-s" }[crowd.level];

  document.getElementById("modal-cat").textContent     = place.category.toUpperCase();
  document.getElementById("modal-title").textContent   = place.name;
  document.getElementById("modal-stars").textContent   = renderStars(place.rating);
  document.getElementById("modal-rating").textContent  = `${place.rating} / 5.0`;
  document.getElementById("modal-city").textContent    = capitalize(currentCity);
  const modalCostEl = document.getElementById("modal-cost");
  if (place.priceData) renderPriceElement(modalCostEl, place.priceData);
  else loadPlacePrice(place, modalCostEl);
  document.getElementById("modal-cat2").textContent    = place.category;
  document.getElementById("modal-best-time").textContent = bestTimeHint(place.category);
  document.getElementById("modal-weather").textContent = weatherCache?.temp ?? "—";
  document.getElementById("modal-weather-sub").textContent = weatherCache?.sky ?? "—";
  document.getElementById("modal-accent-bar").style.background = stripeColor;
  document.getElementById("modal-crowd-status").textContent = crowdLabel;
  document.getElementById("modal-crowd-status").className = `modal-crowd-status ${crowdCls}`;
  document.getElementById("modal-crowd-fill").style.width = `${crowd.score}%`;
  document.getElementById("modal-crowd-fill").className = `crowd-fill ${crowd.level}`;
  document.getElementById("modal-crowd-time").textContent =
    `Score: ${crowd.score}/100 · ${crowd.confidence ?? 50}% confidence`;
  document.getElementById("modal-peak-hint").textContent = crowd.peakHint;
  document.getElementById("modal-tip").textContent = TRAVEL_TIPS[place.category] || "Great place worth visiting!";
  document.getElementById("modal-save-text").textContent = isSaved ? "💙 Saved!" : "🔖 Save";
  renderModalPlannerDays();

  // Hourly forecast chart
  renderHourlyChart(crowd.hourlyForecast || []);

  document.getElementById("modal-overlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

function renderHourlyChart(forecast) {
  const barsEl = document.getElementById("hourly-bars");
  const timesEl = document.getElementById("hourly-times");
  const currentHour = new Date().getHours();
  // Show 6am–10pm (hours 6–22)
  const hours = Array.from({length: 17}, (_, i) => i + 6);
  const vals = hours.map(h => forecast[h] || 40);
  const maxVal = Math.max(...vals, 1);

  const colorFn = v => v < 38 ? "#1E6B44" : v < 65 ? "#9A6216" : "#B83030";

  barsEl.innerHTML = hours.map((h, i) => {
    const v = vals[i];
    const pct = Math.round((v / maxVal) * 100);
    const isCurrent = h === currentHour;
    const ampm = h === 12 ? "12pm" : h < 12 ? `${h}am` : `${h - 12}pm`;
    return `<div class="hbar ${isCurrent ? 'current' : ''}" 
      style="height:${pct}%;background:${isCurrent ? '#C4451A' : colorFn(v)};opacity:${isCurrent?1:0.65};"
      data-tip="${ampm}: ${v}% crowd" title="${ampm}: ${v}% crowd"></div>`;
  }).join("");

  // Show labels at every 3 hours
  timesEl.innerHTML = hours.map((h, i) => {
    const ampm = h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`;
    return `<div class="hourly-time">${i % 3 === 0 ? ampm : ""}</div>`;
  }).join("");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.remove("open");
  document.body.style.overflow = "";
  modalPlace = null;
}

document.getElementById("modal-overlay").addEventListener("click", function(e) {
  if (e.target === this) closeModal();
});

function toggleSaveFromModal() {
  if (!modalPlace) return;
  toggleSave(modalPlace, null);
  const isSaved = savedPlaces.some(s => s.name === modalPlace.name);
  document.getElementById("modal-save-text").textContent = isSaved ? "💙 Saved!" : "🔖 Save";
}

function viewOnMapFromModal() {
  if (!modalPlace) return;
  const place = modalPlace;
  closeModal();
  showPage("explore");
  const run = () => {
    if (map) enterFocusMode(place);
    else setTimeout(run, 80);
  };
  setTimeout(run, 200);
}

function addModalPlaceToPlanner(dayIndex) {
  if (!modalPlace) return;
  const place = modalPlace;
  const di = dayIndex ?? 0;
  closeModal();
  showPage("planner");
  addPlaceToDay(place, di);
}

// ─── SAVE SYSTEM ─────────────────────────────────────────────
function slimSavedPlace(place) {
  return {
    name: place.name,
    category: place.category,
    point: place.point,
    rating: place.rating,
    kinds: place.kinds,
    savedAt: Date.now(),
    savedCity: currentCity,
  };
}

function hydrateSavedPlace(slim) {
  const crowd = computeCrowd(slim);
  const cost = getEntryFee(slim);
  return { ...slim, crowd, cost };
}

function migrateSavedPlaces() {
  savedPlaces = savedPlaces.map(p => {
    if (p.point && p.category) {
      return hydrateSavedPlace({
        name: p.name,
        category: p.category,
        point: p.point,
        rating: p.rating ?? 4.0,
        kinds: p.kinds,
        savedAt: p.savedAt ?? Date.now(),
        savedCity: p.savedCity ?? "Unknown",
      });
    }
    return p;
  });
  localStorage.setItem("tx_saved", JSON.stringify(
    savedPlaces.map(p => ({
      name: p.name, category: p.category, point: p.point,
      rating: p.rating, kinds: p.kinds, savedAt: p.savedAt, savedCity: p.savedCity,
    }))
  ));
}

function toggleSave(place, btn) {
  const idx = savedPlaces.findIndex(s => s.name === place.name);
  if (idx === -1) {
    savedPlaces.push(hydrateSavedPlace(slimSavedPlace(place)));
    toast(`🔖 Saved: ${place.name}`);
    if (btn) { btn.textContent = "💙"; btn.classList.add("saved"); }
  } else {
    savedPlaces.splice(idx, 1);
    toast(`Removed: ${place.name}`);
    if (btn) { btn.textContent = "🔖"; btn.classList.remove("saved"); }
  }
  localStorage.setItem("tx_saved", JSON.stringify(savedPlaces.map(slimSavedPlace)));
  updateSavedBadge();
}

function updateSavedBadge() {
  const badge = document.getElementById("saved-badge");
  if (savedPlaces.length > 0) {
    badge.textContent = savedPlaces.length;
    badge.classList.add("show");
  } else {
    badge.classList.remove("show");
  }
}

// ─── SAVED PAGE ──────────────────────────────────────────────
function renderSaved() {
  const grid = document.getElementById("saved-grid");
  const hydrated = savedPlaces.map(hydrateSavedPlace);
  const cities = [...new Set(hydrated.map(p => p.savedCity))];
  const uniqueCategories = new Set(hydrated.map(p => p.category)).size;
  const lowCrowdCount = hydrated.filter(p => computeCrowd(p).level === "low").length;

  document.getElementById("stat-total").textContent  = hydrated.length;
  document.getElementById("stat-cities").textContent = cities.length;
  document.getElementById("stat-budget").textContent = uniqueCategories;
  document.getElementById("stat-low").textContent    = lowCrowdCount;

  if (!hydrated.length) {
    grid.innerHTML = `
      <div class="saved-empty">
        <div class="se-icon">🔖</div>
        <h2>No saved places yet</h2>
        <p>Explore cities and save places you'd love to visit</p>
        <button class="btn-primary" onclick="showPage('explore')">Start Exploring →</button>
      </div>`;
    return;
  }

  grid.innerHTML = hydrated.map((place, i) => {
    const color = STRIPE_COLORS[place.category] || "#918C80";
    const crowd = computeCrowd(place);
    const crowdEmoji = { low: "🟢", medium: "🟡", high: "🔴" }[crowd.level] ?? "⚪";
    const price = getPlacePrice(place);
    const date = new Date(place.savedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    return `
      <div class="saved-card" style="animation-delay:${i * 0.04}s">
        <div class="saved-card-stripe" style="background:${color}"></div>
        <div class="saved-card-body">
          <div class="saved-card-meta">
            <span class="saved-card-city">${capitalize(place.savedCity)}</span>
            <span class="saved-card-date">Saved ${date}</span>
          </div>
          <div class="saved-card-name">${place.name}</div>
          <div class="saved-card-cat">${place.category}</div>
          <div class="saved-card-tags">
            <span class="saved-tag">⭐ ${place.rating}</span>
            <span class="saved-tag">${price === 0 ? '🆓 Free' : '₹'+price}</span>
            <span class="saved-tag">${crowdEmoji} ${capitalize(crowd.level)}</span>
          </div>
        </div>
        <div class="saved-card-footer">
          <button class="unsave-btn" onclick="unsavePlace('${place.name.replace(/'/g,"\\'")}')">✕ Remove</button>
          <button class="visit-map-btn" onclick="goToPlaceOnMap('${place.name.replace(/'/g,"\\'")}')">📍 View on Map →</button>
        </div>
      </div>`;
  }).join("");
}

function unsavePlace(name) {
  const idx = savedPlaces.findIndex(s => s.name === name);
  if (idx !== -1) {
    const removed = savedPlaces.splice(idx, 1)[0];
    localStorage.setItem("tx_saved", JSON.stringify(savedPlaces.map(slimSavedPlace)));
    updateSavedBadge();
    toast(`Removed: ${removed.name}`);
    renderSaved();
  }
}

function goToPlaceOnMap(name) {
  const slim = savedPlaces.find(s => s.name === name);
  if (!slim) return;
  const place = hydrateSavedPlace(slim);
  showPage("explore");
  setTimeout(() => {
    if (place.point && map) enterFocusMode(place);
  }, 400);
}

// ─── TRENDING ────────────────────────────────────────────────
const TRENDING_DATA = [
  { name: "Gateway of India",   city: "Mumbai",           emoji: "🏛", rating: 4.7, visits: 98,  spike: "+34%" },
  { name: "Amber Fort",         city: "Jaipur",           emoji: "🏰", rating: 4.8, visits: 95,  spike: "+28%" },
  { name: "Taj Mahal",          city: "Agra",             emoji: "🕌", rating: 4.9, visits: 100, spike: "+12%" },
  { name: "Ellora Caves",       city: "Aurangabad",       emoji: "🗿", rating: 4.7, visits: 76,  spike: "+41%" },
  { name: "Havelock Island",    city: "Andaman",          emoji: "🏝", rating: 4.8, visits: 84,  spike: "+55%" },
  { name: "Valley of Flowers",  city: "Uttarakhand",      emoji: "🌸", rating: 4.9, visits: 72,  spike: "+67%" },
  { name: "Coorg Coffee Estates",city:"Karnataka",        emoji: "☕", rating: 4.6, visits: 68,  spike: "+22%" },
  { name: "Pangong Tso",        city: "Ladakh",           emoji: "🏔", rating: 4.9, visits: 61,  spike: "+89%" },
  { name: "Dudhsagar Falls",    city: "Goa",              emoji: "💧", rating: 4.7, visits: 79,  spike: "+18%" },
  { name: "Ranthambore",        city: "Rajasthan",        emoji: "🦁", rating: 4.5, visits: 64,  spike: "+31%" },
  { name: "Ziro Valley",        city: "Arunachal Pradesh",emoji: "🌾", rating: 4.8, visits: 45,  spike: "+112%" },
  { name: "Majuli Island",      city: "Assam",            emoji: "🛶", rating: 4.6, visits: 52,  spike: "+76%" },
];
const TREND_BG = ["#FEF3C7","#DBEAFE","#D1FAE5","#FCE7F3","#EDE9FE","#FFEDD5","#F0FDF4","#E0F2FE","#FDF2F8","#ECFDF5","#FFF7ED","#F0F9FF"];

function renderTrending() {
  const grid = document.getElementById("trending-grid");
  grid.innerHTML = TRENDING_DATA.map((t, i) => `
    <div class="trend-card" style="animation-delay:${i * 0.05}s">
      <div class="trend-img" style="background:${TREND_BG[i % TREND_BG.length]}">
        <span>${t.emoji}</span>
        <span class="trend-rank">#${i + 1}</span>
        <span class="trend-spike">↑ ${t.spike}</span>
      </div>
      <div class="trend-body">
        <div class="trend-city">${t.city}</div>
        <div class="trend-name">${t.name}</div>
        <div class="trend-meta">
          <span>⭐ ${t.rating}</span>
          <span>👥 ${t.visits}% capacity</span>
        </div>
        <div class="trend-bar"><div class="trend-bar-fill" style="width:${t.visits}%"></div></div>
      </div>
    </div>
  `).join("");
}

// ─── PLACE REGISTRY (fixes broken onclick with special chars) ─
const PLACE_REGISTRY = {};
let _registryId = 0;
function registerPlace(place) {
  const id = "p" + (_registryId++);
  PLACE_REGISTRY[id] = place;
  return id;
}
function getPlace(id) { return PLACE_REGISTRY[id]; }

// ─── PLANNER / HOTEL DATA ────────────────────────────────────
const MEAL_COST_BY_TIER = { budget: 400, mid: 800, luxury: 2000 };
const TRANSPORT_PER_HOP = { budget: 80, mid: 150, luxury: 300 };
const HOTEL_TIER_BASE = { budget: 450, mid: 1800, luxury: 8500 };
const PLANNER_QUICK_LIMIT = 10;

const CATEGORY_VISIT_MIN = {
  Temple: 45, Fort: 120, Museum: 90, Waterfall: 60, Park: 60,
  Heritage: 90, Lake: 60, Cave: 75, Beach: 90, Hill: 120, Nature: 75,
};
const DEFAULT_VISIT_MIN = 75;
const TRAVEL_BUFFER_MIN = 15;

const METRO_CITIES = ["mumbai", "delhi", "bangalore", "bengaluru", "kolkata", "chennai", "hyderabad", "pune", "ahmedabad"];
const HILL_CITIES = ["manali", "shimla", "darjeeling", "leh", "ladakh", "rishikesh", "mussoorie", "ooty", "munnar", "coorg", "chopta", "spiti", "gangtok", "dharamshala", "dalhousie", "nainital", "auli", "kufri"];

const PLANNER_CATEGORY_FILTERS = [
  { id: "all", label: "All" },
  { id: "Temple", label: "Temple" },
  { id: "Fort", label: "Fort" },
  { id: "Nature", label: "Nature" },
  { id: "Heritage", label: "Heritage" },
];

let selectedHotelTier = "budget";
let selectedHotel = null;
let plannerMobileSheetOpen = false;

function getPlannerCityName() {
  return document.getElementById("planner-city")?.value.trim() || currentCity;
}

function citySizeMultiplierFor(cityName) {
  const c = cityName.toLowerCase();
  if (HILL_CITIES.some(h => c.includes(h))) return 2;
  if (METRO_CITIES.some(m => c === m || c.includes(m))) return 1.5;
  return 1;
}

function saveItinerary() {
  localStorage.setItem("tx_itinerary", JSON.stringify({
    plannerDays, tripStartDate, plannerStartMinutes,
  }));
}

function loadItinerary() {
  try {
    const raw = JSON.parse(localStorage.getItem("tx_itinerary") || "null");
    if (!raw?.plannerDays) return false;
    tripStartDate = raw.tripStartDate || tripStartDate;
    plannerStartMinutes = raw.plannerStartMinutes ?? plannerStartMinutes;
    plannerDays = raw.plannerDays.map(d => ({
      places: (d.places || []).map(p => ({ ...p, crowd: p.crowd || computeCrowd(p) })),
    }));
    const daysEl = document.getElementById("planner-days");
    if (daysEl) daysEl.value = plannerDays.length || 3;
    return true;
  } catch { return false; }
}

function syncPlannerDateInputs() {
  const dateEl = document.getElementById("planner-start-date");
  const timeEl = document.getElementById("planner-start-time");
  if (dateEl) dateEl.value = tripStartDate;
  if (timeEl) {
    const h = Math.floor(plannerStartMinutes / 60);
    const m = plannerStartMinutes % 60;
    timeEl.value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
}

function onTripStartDateChange() {
  tripStartDate = document.getElementById("planner-start-date").value || tripStartDate;
  renderDaysGrid();
  saveItinerary();
}

function onPlannerStartTimeChange() {
  const val = document.getElementById("planner-start-time").value;
  if (val) {
    const [h, m] = val.split(":").map(Number);
    plannerStartMinutes = h * 60 + m;
  }
  renderDaysGrid();
  saveItinerary();
}

function getDayDate(dayIndex) {
  const d = new Date(tripStartDate + "T12:00:00");
  d.setDate(d.getDate() + dayIndex);
  return d;
}

function formatTimeFromMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h >= 12 ? "pm" : "am";
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`;
}

function computeDaySchedule(day) {
  let t = plannerStartMinutes;
  return day.places.map(p => {
    const start = t;
    const dur = CATEGORY_VISIT_MIN[p.category] || DEFAULT_VISIT_MIN;
    const slot = { place: p, timeStr: formatTimeFromMinutes(start), endMinutes: start + dur };
    t += dur + TRAVEL_BUFFER_MIN;
    return slot;
  });
}

function findPlaceInItinerary(name) {
  for (let di = 0; di < plannerDays.length; di++) {
    if (plannerDays[di].places.some(p => p.name === name)) return di;
  }
  return -1;
}

function renderDayAddSelect(rid) {
  return `<select class="sp-day-select" onclick="event.stopPropagation()" onchange="addPlaceToDayFromSelect('${rid}', this)">
    <option value="">+ Day</option>
    ${plannerDays.map((_, i) => `<option value="${i}">Day ${i + 1}</option>`).join("")}
  </select>`;
}

function addPlaceToDayFromSelect(rid, selectEl) {
  const di = parseInt(selectEl.value, 10);
  if (Number.isNaN(di)) return;
  addPlaceToDay(rid, di);
  selectEl.value = "";
}

function renderModalPlannerDays() {
  const wrap = document.getElementById("modal-planner-days");
  if (!wrap) return;
  if (!plannerDays.length) {
    wrap.innerHTML = `<span style="font-size:11px;color:var(--muted)">Open Planner to add days first</span>`;
    return;
  }
  wrap.innerHTML = plannerDays.map((_, i) =>
    `<button type="button" class="modal-day-btn" onclick="addModalPlaceToPlanner(${i})">Day ${i + 1} +</button>`
  ).join("");
}

function updatePlannerCityNote() {
  const note = document.getElementById("planner-city-note");
  if (!note) return;
  const city = getPlannerCityName();
  if ((globalPlaces.length && city.toLowerCase() === currentCity.toLowerCase()) || plannerPlaces.length) {
    note.style.display = "block";
    note.textContent = `Showing places for ${capitalize(city)} — search another city to change.`;
  } else note.style.display = "none";
}

function initPlannerPage() {
  const cityInput = document.getElementById("planner-city");
  if (cityInput && !cityInput.value.trim()) cityInput.value = currentCity;
  if (globalPlaces.length && cityInput?.value.trim().toLowerCase() === currentCity.toLowerCase()) {
    plannerPlaces = [...globalPlaces];
  }
  plannerCitySizeMultiplier = citySizeMultiplierFor(getPlannerCityName());
  syncPlannerDateInputs();
  updatePlannerCityNote();
  renderPlannerQuickFilters();
  renderPlannerSidebar();
  renderDaysGrid();
  renderHotelGrid(selectedHotelTier);
  updateBookingLink();
}

function syncPlannerDaysCount() {
  const n = Math.min(14, Math.max(1, parseInt(document.getElementById("planner-days").value, 10) || 3));
  document.getElementById("planner-days").value = n;
  while (plannerDays.length < n) plannerDays.push({ places: [] });
  while (plannerDays.length > n) plannerDays.pop();
  renderDaysGrid();
  renderModalPlannerDays();
  renderPlannerSidebar();
  saveItinerary();
}

function switchHotelTier(tier, el) {
  selectedHotelTier = tier;
  selectedHotel = null;
  document.querySelectorAll(".hotel-tier-tab").forEach(t => t.classList.remove("active"));
  el.classList.add("active");
  renderHotelGrid(tier);
  updateBudgetSummary();
}

function generatePlannerHotels(cityName, tier) {
  const areas = HOSTEL_AREAS[cityName.toLowerCase()] || HOSTEL_AREAS.default;
  const tierMult = { budget: 1, mid: 2.2, luxury: 4.5 }[tier] || 1;
  return areas.slice(0, 4).map((area, i) => {
    const chain = HOSTEL_CHAINS[i % HOSTEL_CHAINS.length];
    const seed = Math.abs(hashCode(cityName + area + tier));
    const base = HOTEL_TIER_BASE[tier] || 450;
    const price = Math.round((base + ((seed % 5) * 80)) * (tier === "budget" ? 1 : tierMult * 0.35));
    return {
      name: `${chain.name} · ${area}`, type: `${chain.type} · ${area}`,
      stars: tier === "luxury" ? 5 : tier === "mid" ? 3 : 2,
      price, emoji: chain.emoji, amenities: [...chain.amenities, area],
    };
  });
}

function updateBookingLink() {
  const link = document.getElementById("hotel-booking-link");
  if (link) link.href = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(getPlannerCityName())}`;
}

function renderHotelGrid(tier) {
  const hotels = generatePlannerHotels(getPlannerCityName(), tier);
  const grid = document.getElementById("hotel-grid");
  if (!grid) return;
  grid.innerHTML = hotels.map((h, i) => {
    const id = `hotel-${tier}-${i}`;
    const starsStr = "★".repeat(h.stars) + "☆".repeat(5 - h.stars);
    return `
      <div class="hotel-card" id="${id}" onclick="selectHotel('${tier}',${i},'${id}')">
        <div class="hotel-emoji">${h.emoji}</div>
        <div class="hotel-stars">${starsStr}</div>
        <div class="hotel-name">${h.name}</div>
        <div class="hotel-type">${h.type}</div>
        <div class="hotel-price">₹${h.price.toLocaleString("en-IN")}<span class="hotel-price-sub">/night</span></div>
        <div class="hotel-amenities">
          ${h.amenities.map(a => `<span class="hotel-tag">${a}</span>`).join("")}
        </div>
      </div>`;
  }).join("");
  updateBookingLink();
}

function selectHotel(tier, idx, cardId) {
  selectedHotel = generatePlannerHotels(getPlannerCityName(), tier)[idx];
  document.querySelectorAll(".hotel-card").forEach(c => c.classList.remove("selected"));
  document.getElementById(cardId).classList.add("selected");
  updateBudgetSummary();
  toast(`🏨 ${selectedHotel.name} selected — ₹${selectedHotel.price.toLocaleString("en-IN")}/night`);
}
function initPlannerDays() {
  syncPlannerDaysCount();
}

function addDay() {
  plannerDays.push({ places: [] });
  document.getElementById("planner-days").value = plannerDays.length;
  renderDaysGrid();
  renderModalPlannerDays();
  renderPlannerSidebar();
  saveItinerary();
}

function clearDay(di) {
  if (!plannerDays[di]) return;
  plannerDays[di].places = [];
  renderDaysGrid();
  saveItinerary();
  toast(`Day ${di + 1} cleared`);
}

function resetTrip() {
  if (!confirm("Reset entire trip? All days and places will be cleared.")) return;
  const n = parseInt(document.getElementById("planner-days").value, 10) || 3;
  plannerDays = Array.from({ length: n }, () => ({ places: [] }));
  selectedHotel = null;
  tripStartDate = new Date().toISOString().slice(0, 10);
  plannerStartMinutes = 9 * 60;
  syncPlannerDateInputs();
  renderDaysGrid();
  renderModalPlannerDays();
  renderPlannerSidebar();
  updateBudgetSummary();
  saveItinerary();
  toast("Trip reset");
}

function exportItinerary() {
  const lines = plannerDays.map((day, di) => {
    const dateLabel = getDayDate(di).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
    const parts = computeDaySchedule(day).map(s => `${s.timeStr} ${s.place.name}`);
    return `Day ${di + 1} (${dateLabel}) — ${parts.length ? parts.join(" · ") : "No places yet"}`;
  });
  const text = lines.join("\n");
  navigator.clipboard.writeText(text).then(() => toast("Itinerary copied to clipboard")).catch(() => toast(text));
}

function movePlaceInDay(di, pi, dir) {
  const places = plannerDays[di]?.places;
  if (!places) return;
  const ni = pi + dir;
  if (ni < 0 || ni >= places.length) return;
  [places[pi], places[ni]] = [places[ni], places[pi]];
  renderDaysGrid();
  saveItinerary();
}

function renderDaysGrid() {
  const grid = document.getElementById("days-grid");
  if (!grid) return;
  grid.innerHTML = plannerDays.map((day, di) => {
    const dateStr = getDayDate(di).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
    const schedule = computeDaySchedule(day);
    const lastEnd = schedule.length ? schedule[schedule.length - 1].endMinutes : plannerStartMinutes;
    const overLate = lastEnd > 20 * 60;
    const endHint = schedule.length
      ? `<div class="day-end-hint">Est. finish ~${formatTimeFromMinutes(lastEnd)}</div>${overLate ? '<div class="day-schedule-warn">⚠ Schedule runs past 8pm</div>' : ""}`
      : "";
    const slots = schedule.map((s, pi) => {
      const crowd = s.place.crowd || computeCrowd(s.place);
      const crowdEmoji = { low: "🟢", medium: "🟡", high: "🔴" }[crowd.level] ?? "⚪";
      return `<div class="day-slot">
        <span class="day-slot-time">${s.timeStr}</span>
        <span class="day-slot-name">${s.place.name}</span>
        <span class="day-slot-crowd">${crowdEmoji}</span>
        <div class="day-slot-actions">
          <button type="button" class="day-slot-move" ${pi === 0 ? "disabled" : ""} onclick="movePlaceInDay(${di},${pi},-1)">▲</button>
          <button type="button" class="day-slot-move" ${pi === day.places.length - 1 ? "disabled" : ""} onclick="movePlaceInDay(${di},${pi},1)">▼</button>
          <button type="button" class="day-slot-remove" onclick="removeFromDay(${di},${pi})">✕</button>
        </div>
      </div>`;
    }).join("");
    return `
      <div class="day-card">
        <div class="day-card-header">
          <span class="day-card-title">Day ${di + 1}</span>
          <span class="day-card-date">${dateStr}</span>
          <button type="button" class="day-clear-btn" onclick="clearDay(${di})">Clear Day</button>
        </div>
        <div class="day-slots">
          ${slots || '<div class="day-add-more">Add places from the sidebar →</div>'}
        </div>
        ${endHint}
      </div>`;
  }).join("");
  updateBudgetSummary();
  saveItinerary();
}

function addPlaceToDay(placeOrId, dayIndex) {
  const place = typeof placeOrId === "string" ? getPlace(placeOrId) : placeOrId;
  if (!place) { toast("Could not add place — try again"); return; }
  if (dayIndex >= plannerDays.length) {
    while (plannerDays.length <= dayIndex) plannerDays.push({ places: [] });
  }
  if (plannerDays[dayIndex].places.some(p => p.name === place.name)) {
    toast(`${place.name} already on Day ${dayIndex + 1}`);
    return;
  }
  const existingDay = findPlaceInItinerary(place.name);
  if (existingDay >= 0 && existingDay !== dayIndex) {
    if (!confirm(`${place.name} is already on Day ${existingDay + 1} — add to Day ${dayIndex + 1} anyway?`)) return;
  }
  const enriched = { ...place, crowd: place.crowd || computeCrowd(place) };
  plannerDays[dayIndex].places.push(enriched);
  if (!enriched.priceData && enriched.point) {
    fetchPlacePrice(enriched, () => updateBudgetSummary());
  }
  renderDaysGrid();
  toast(`✅ ${place.name} added to Day ${dayIndex + 1}`);
}

function removeFromDay(di, pi) {
  plannerDays[di].places.splice(pi, 1);
  renderDaysGrid();
  saveItinerary();
}

function updateBudgetSummary() {
  const allPlaces = plannerDays.flatMap(d => d.places);
  const days = plannerDays.length;

  // Entry fees — real per place
  const entryTotal = allPlaces.reduce((a, p) => a + (p.priceData?.price ?? p.cost ?? 0), 0);
  const entryBreakdown = allPlaces.length
    ? allPlaces.map(p => {
        const fee = p.priceData?.price ?? p.cost ?? 0;
        return `${p.name.length > 18 ? p.name.slice(0,18)+"…" : p.name}: ${fee === 0 ? "Free" : "₹"+fee}`;
      }).join(" · ")
    : "No places added yet";

  // Hotel
  const hotelPerNight = selectedHotel ? selectedHotel.price : 0;
  const nights = Math.max(days - 1, 1);
  const hotelTotal = hotelPerNight * nights;
  const hotelDetail = selectedHotel
    ? `₹${hotelPerNight.toLocaleString("en-IN")}/night × ${nights} night${nights > 1 ? "s" : ""} (${days} days)`
    : "No hotel selected";

  // Meals — based on tier
  const mealPerDay = MEAL_COST_BY_TIER[selectedHotelTier] || 600;
  const mealsTotal = mealPerDay * days;
  const mealsDetail = `₹${mealPerDay}/day × ${days} days (3 meals, ${selectedHotelTier} level)`;

  // Transport — auto-rickshaw/cab within city + intercity rough estimate
  const perHop = Math.round((TRANSPORT_PER_HOP[selectedHotelTier] || 80) * plannerCitySizeMultiplier);
  const stopsPerDay = days ? Math.max(1, Math.ceil(allPlaces.length / days)) : 1;
  const transportTotal = perHop * stopsPerDay * days;
  const transportDetail = `₹${perHop.toLocaleString("en-IN")} × ${stopsPerDay} stops × ${days} days`;

  // Misc: tips, shopping, extras ~10% of subtotal
  const subtotal = entryTotal + hotelTotal + mealsTotal + transportTotal;
  const misc = Math.round(subtotal * 0.08);
  const total = subtotal + misc;

  document.getElementById("budget-entry").textContent      = `₹${entryTotal.toLocaleString("en-IN")}`;
  document.getElementById("budget-hotel").textContent      = `₹${hotelTotal.toLocaleString("en-IN")}`;
  document.getElementById("budget-transport").textContent  = `₹${transportTotal.toLocaleString("en-IN")}`;
  document.getElementById("budget-meals").textContent      = `₹${mealsTotal.toLocaleString("en-IN")}`;
  document.getElementById("budget-misc").textContent       = `₹${misc.toLocaleString("en-IN")}`;
  document.getElementById("budget-total").textContent      = `₹${total.toLocaleString("en-IN")}`;

  // Detail rows
  const entryDetailEl = document.getElementById("budget-entry-detail");
  if (allPlaces.length) {
    entryDetailEl.style.display = "flex";
    document.getElementById("budget-entry-breakdown").textContent = entryBreakdown;
  } else {
    entryDetailEl.style.display = "none";
  }
  document.getElementById("budget-hotel-detail").textContent     = hotelDetail;
  document.getElementById("budget-transport-detail").textContent = transportDetail;
  document.getElementById("budget-meals-detail").textContent     = mealsDetail;

  const noteEl = document.getElementById("budget-note");
  if (allPlaces.length === 0) {
    noteEl.textContent = "Add places to your itinerary to get a full breakdown.";
  } else {
    noteEl.textContent = `Based on ${allPlaces.length} place${allPlaces.length>1?"s":""}, ${days} day${days>1?"s":""}, ${selectedHotelTier} tier. Prices are estimates for India travel.`;
  }
}

async function plannerSearch() {
  const city = document.getElementById("planner-city").value.trim();
  if (!city) { toast("Enter a city for your trip"); return; }
  setPlannerSearchLoading(true);
  try {
    const geo = await fetch(`${API}/geocode?city=${encodeURIComponent(city)}`).then(r => r.json());
    plannerCitySizeMultiplier = citySizeMultiplierFor(city);
    const radius = placesRadiusForCity(city);
    const data = await fetch(`${API}/places?lat=${geo.lat}&lon=${geo.lng}&radius=${radius}`).then(r => r.json());
    let valid = data.filter(p => p.name?.trim() && p.point?.lat && p.point?.lon && p.kinds && isTouristPlace(p));
    const seen = new Set();
    valid = valid.filter(p => { const k = p.name.toLowerCase().trim(); if (seen.has(k)) return false; seen.add(k); return true; });
    valid = valid.map(p => {
      const category = detectCategory(p.kinds);
      const cost = getEntryFee({ name: p.name, category });
      const otmRate = p.rate ?? 0;
      const rating = ratingFromOtmRate(p.name, category, otmRate);
      return { ...p, rating, cost, crowd: computeCrowd({ name: p.name, category, otmRate }), category, otmRate };
    }).sort((a, b) => b.rating - a.rating);
    plannerPlaces = valid;
    plannerQuickShowAll = false;
    updatePlannerCityNote();
    renderPlannerSidebar();
    toast(`Found ${valid.length} places in ${city}`);
  } catch {
    toast("Couldn't load places — check city name");
  } finally {
    setPlannerSearchLoading(false);
  }
}

function setPlannerSearchLoading(loading) {
  plannerSearching = loading;
  const btn = document.getElementById("planner-search-btn");
  if (btn) { btn.disabled = loading; btn.textContent = loading ? "Loading…" : "Load Places"; }
  if (loading) {
    const quickList = document.getElementById("planner-quick-list");
    if (quickList) {
      quickList.innerHTML = Array(3).fill(
        '<div class="skeleton" style="padding:12px"><div class="skel-line" style="height:14px;width:80%;margin-bottom:8px"></div><div class="skel-line" style="height:14px;width:65%"></div></div>'
      ).join("");
    }
  }
}

function renderPlannerQuickFilters() {
  const el = document.getElementById("planner-quick-filters");
  if (!el) return;
  el.innerHTML = PLANNER_CATEGORY_FILTERS.map(f => `
    <button type="button" class="planner-qf-chip ${plannerCategoryFilter === f.id ? "active" : ""}"
      onclick="setPlannerCategoryFilter('${f.id}')">${f.label}</button>`).join("");
}

function setPlannerCategoryFilter(id) {
  plannerCategoryFilter = id;
  plannerQuickShowAll = false;
  renderPlannerQuickFilters();
  renderPlannerSidebar();
}

function getFilteredPlannerQuickPlaces() {
  let list = plannerPlaces.length ? plannerPlaces : globalPlaces;
  if (plannerCategoryFilter === "Nature") {
    list = list.filter(p => ["Nature", "Park", "Waterfall", "Lake", "Cave", "Hill", "Beach"].includes(p.category));
  } else if (plannerCategoryFilter !== "all") {
    list = list.filter(p => p.category === plannerCategoryFilter);
  }
  return list;
}

function togglePlannerQuickShowMore() {
  plannerQuickShowAll = !plannerQuickShowAll;
  renderPlannerSidebar();
}

function togglePlannerMobileSheet() {
  plannerMobileSheetOpen = !plannerMobileSheetOpen;
  document.getElementById("planner-sidebar-wrap")?.classList.toggle("open", plannerMobileSheetOpen);
}

function renderPlannerSidebar() {
  const savedList = document.getElementById("planner-saved-list");
  const dotColor = { low: "#1E6B44", medium: "#9A6216", high: "#B83030" };
  if (savedPlaces.length) {
    savedList.innerHTML = savedPlaces.slice(0, 8).map(p => {
      const hydrated = hydrateSavedPlace(p);
      const rid = registerPlace(hydrated);
      const crowd = computeCrowd(hydrated);
      const price = getPlacePrice(hydrated);
      return `<div class="sp-item">
        <span class="sp-dot" style="background:${dotColor[crowd.level] || "#918C80"}"></span>
        <div class="sp-info"><div class="sp-name">${hydrated.name}</div><div class="sp-meta">${hydrated.category} · ${price === 0 ? "Free" : "₹" + price}</div></div>
        ${renderDayAddSelect(rid)}
      </div>`;
    }).join("");
  } else {
    savedList.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:12px;text-align:center;">Save places on Explore to add them here</div>';
  }
  const quickList = document.getElementById("planner-quick-list");
  if (plannerSearching) return;
  const filtered = getFilteredPlannerQuickPlaces();
  const limit = plannerQuickShowAll ? filtered.length : PLANNER_QUICK_LIMIT;
  const slice = filtered.slice(0, limit);
  if (slice.length) {
    quickList.innerHTML = slice.map(p => {
      const rid = registerPlace(p);
      const price = getPlacePrice(p);
      return `<div class="sp-item">
        <span class="sp-dot" style="background:${dotColor[p.crowd?.level] || "#918C80"}"></span>
        <div class="sp-info"><div class="sp-name">${p.name}</div><div class="sp-meta">${p.category} · ${price === 0 ? "Free" : "₹" + price}</div></div>
        ${renderDayAddSelect(rid)}
      </div>`;
    }).join("") + (filtered.length > PLANNER_QUICK_LIMIT
      ? `<button type="button" class="planner-show-more-link" onclick="togglePlannerQuickShowMore()">${plannerQuickShowAll ? "Show less" : `Show more (${filtered.length - PLANNER_QUICK_LIMIT} more)`}</button>`
      : "");
  } else {
    quickList.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:12px;text-align:center;">Search a city above to see suggestions</div>';
  }
  renderModalPlannerDays();
}

// ─── FILTER & SORT ───────────────────────────────────────────
function applyFilter(places, filter) {
  switch(filter) {
    case "top":     return [...places].sort((a,b)=>b.rating-a.rating).slice(0,12);
    case "cheap":   return places.filter(p => { const c = p.priceData?.price ?? p.cost; return c > 0 && c < 200; });
    case "low":     return places.filter(p=>p.crowd.level==="low");
    case "nature":  return places.filter(p=>["Nature","Park","Waterfall","Lake","Cave","Hill","Beach"].includes(p.category));
    case "heritage":return places.filter(p=>["Temple","Heritage","Museum","Fort"].includes(p.category));
    case "free":    return places.filter(p => (p.priceData?.price ?? p.cost) === 0);
    case "golden":  return places.filter(isGoldenHour);
    default:        return places;
  }
}

function applySort(places, sort) {
  const arr = [...places];
  switch(sort) {
    case "rating":    return arr.sort((a,b)=>b.rating-a.rating);
    case "cost_asc":  return arr.sort((a,b)=>a.cost-b.cost);
    case "cost_desc": return arr.sort((a,b)=>b.cost-a.cost);
    case "crowd":     return arr.sort((a,b)=>a.crowd.score-b.crowd.score);
    case "name":      return arr.sort((a,b)=>a.name.localeCompare(b.name));
    default:          return arr;
  }
}

function handleSort() {
  activeSort = document.getElementById("sort-select").value;
  placesDisplayCount = displayLimit;
  const filtered = applyFilter(applySort(globalPlaces, activeSort), activeFilter);
  displayPlaces(filtered);
  renderSidebarList(filtered);
  updateResultsBar(currentCity, filtered.length);
}

// Filter chip clicks
document.querySelectorAll(".sf-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".sf-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    activeFilter = chip.dataset.filter;
    placesDisplayCount = displayLimit;
    const filtered = applyFilter(applySort(globalPlaces, activeSort), activeFilter);
    displayPlaces(filtered);
    renderSidebarList(filtered);
    updateResultsBar(currentCity, filtered.length);
  });
});

// ─── UI HELPERS ──────────────────────────────────────────────
function clearMarkers() { markers.forEach(m => map?.removeLayer(m)); markers = []; }

function showSkeletons() {
  document.getElementById("places").innerHTML = Array(6).fill(0).map(() => `
    <div class="skeleton">
      <div class="skel-line" style="height:12px;width:35%;margin-bottom:14px"></div>
      <div class="skel-line" style="height:22px;width:70%;margin-bottom:6px"></div>
      <div class="skel-line" style="height:11px;width:45%;margin-bottom:16px"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
        <div class="skel-block" style="height:50px;border-radius:10px"></div>
        <div class="skel-block" style="height:50px;border-radius:10px"></div>
      </div>
      <div class="skel-block" style="height:64px;border-radius:10px;margin-bottom:0"></div>
    </div>`).join("");
}

// ─── EXPLORE TABS ────────────────────────────────────────────
let activeExploreTab = "places";

function switchExploreTab(tab) {
  activeExploreTab = tab;
  document.querySelectorAll(".explore-tab").forEach(t => t.classList.remove("active"));
  document.getElementById(`tab-${tab}`).classList.add("active");

  document.getElementById("panel-places").style.display  = tab === "places"  ? "block" : "none";
  document.getElementById("panel-hostels").style.display = tab === "hostels" ? "block" : "none";

  // Show/hide sidebar filters (only relevant for places)
  const filtersEl = document.querySelector(".sidebar-filters");
  const sortEl    = document.querySelector(".sidebar-sort");
  if (filtersEl) filtersEl.style.display = tab === "places" ? "block" : "none";
  if (sortEl)    sortEl.style.display    = tab === "places" ? "block" : "none";
}

function sortHostels(sortBy) {
  let sorted = [...globalHostels];
  switch(sortBy) {
    case "price_asc":  sorted.sort((a,b) => a.price - b.price); break;
    case "price_desc": sorted.sort((a,b) => b.price - a.price); break;
    case "crowd":      sorted.sort((a,b) => a.crowd.score - b.crowd.score); break;
    default:           sorted.sort((a,b) => b.rating - a.rating);
  }
  renderHostels(sorted);
}

function updateResultsBar(city, count) {
  document.getElementById("city-name-label").textContent = capitalize(city);
  document.getElementById("count-tag").textContent = `${count} places`;
  document.getElementById("tab-places-count").textContent = count;
  document.getElementById("results-bar").classList.add("visible");
  // Update hostel city label
  const hcl = document.getElementById("hostel-city-label");
  if (hcl) hcl.textContent = capitalize(city);
  document.getElementById("tab-hostels-count").textContent = globalHostels.length || "—";
}

function detectCategory(kinds = "") {
  const k = kinds.toLowerCase();
  // Order matters — most specific first
  if (k.includes("waterfall") || k.includes("river_waterfall")) return "Waterfall";
  if (k.includes("beach") || k.includes("cape")) return "Beach";
  if (k.includes("cave") || k.includes("grotto")) return "Cave";
  if (k.includes("lake") || k.includes("lagoon")) return "Lake";
  if (k.includes("fort") || k.includes("castle") || k.includes("tower")) return "Fort";
  if (k.includes("temple") || k.includes("mosque") || k.includes("pagoda") || k.includes("shrine") || k.includes("cathedral") || k.includes("monastery")) return "Temple";
  if (k.includes("museum") || k.includes("art_gallery") || k.includes("exhibition") || k.includes("planetarium") || k.includes("aquarium")) return "Museum";
  if (k.includes("zoo") || k.includes("wildlife") || k.includes("safari") || k.includes("sanctuary")) return "Nature";
  if (k.includes("ruins") || k.includes("archaeological") || k.includes("prehistoric") || k.includes("megalith") || k.includes("mausoleum") || k.includes("memorial") || k.includes("monument") || k.includes("palace") || k.includes("heritage") || k.includes("historic")) return "Heritage";
  if (k.includes("mountain") || k.includes("hill") || k.includes("plateau") || k.includes("viewpoint") || k.includes("cliff")) return "Hill";
  if (k.includes("national_park") || k.includes("nature_reserve") || k.includes("botanical") || k.includes("garden") || k.includes("amusement") || k.includes("theme_park")) return "Park";
  if (k.includes("hot_spring") || k.includes("geyser") || k.includes("glacier") || k.includes("island") || k.includes("valley") || k.includes("delta")) return "Nature";
  if (k.includes("interesting_places") || k.includes("cultural") || k.includes("architecture") || k.includes("historic")) return "Heritage";
  return "Nature";
}

function renderStars(rating) {
  const full = Math.round(rating);
  return Array(5).fill(0).map((_,i)=>i<full?"★":"☆").join("");
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return h;
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2800);
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// Keyboard
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeModal();
});

// ─── BOOT ────────────────────────────────────────────────────
(async function boot() {
  migrateSavedPlaces();
  updateSavedBadge();
  renderCityGrid("india");
  if (!loadItinerary()) initPlannerDays();
  else renderDaysGrid();
  syncPlannerDateInputs();
  renderHotelGrid("budget");
  renderTrending();
  loadHostels("Pune");
  ensureMap(currentLat, currentLon);
  await Promise.all([
    loadPlaces(currentLat, currentLon),
    loadWeather(currentLat, currentLon)
  ]);
})();
