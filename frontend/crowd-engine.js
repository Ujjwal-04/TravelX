/**
 * TravelX — data-driven crowd prediction engine
 * Modular scoring: hourly curves, popularity, weather, holidays, city, distance, history
 */
const CrowdEngine = (function () {
  const HISTORY_KEY = "tx_crowd_hist";
  const MAX_SAMPLES_PER_PLACE = 56;
  const CROWD_DISCLAIMER =
    "Estimate from live time, weather, popularity signals, and visit patterns — not live footfall.";

  let context = {
    city: "Pune",
    lat: 18.5204,
    lon: 73.8567,
    weather: null,
  };

  const CITY_CROWD_MULTIPLIER = {
    mumbai: 1.38, delhi: 1.35, bangalore: 1.28, bengaluru: 1.28,
    goa: 1.32, pune: 1.22, jaipur: 1.3, kolkata: 1.26, chennai: 1.24,
    hyderabad: 1.25, agra: 1.34, varanasi: 1.33, amritsar: 1.28,
    london: 1.3, paris: 1.32, "new york": 1.35, tokyo: 1.33, rome: 1.31,
    barcelona: 1.28, bangkok: 1.27, dubai: 1.3, singapore: 1.29,
  };

  const GLOBAL_FAME = {
    "taj mahal": 3.8, "gateway of india": 2.9, "marine drive": 2.4,
    "red fort": 2.8, "india gate": 2.7, "qutub minar": 2.6,
    "charminar": 2.5, "golden temple": 3.2, "mysore palace": 2.6,
    "hawa mahal": 2.5, "amber fort": 2.7, "elephanta": 2.4,
    "shaniwar wada": 2.2, "siddhivinayak": 2.8, "lotus temple": 2.4,
    "big ben": 3.0, "tower of london": 3.1, "buckingham": 2.8,
    "eiffel": 3.5, "louvre": 3.2, "colosseum": 3.4, "statue of liberty": 3.3,
  };

  const CATEGORY_CURVES = {
    Temple:    { base: 38, peak: 82, peaks: [7, 8, 18, 19], sigma: 2.1, weekend: 22 },
    Museum:    { base: 22, peak: 78, peaks: [11, 12, 14, 15], sigma: 2.4, weekend: 26 },
    Fort:      { base: 20, peak: 80, peaks: [10, 11, 15, 16], sigma: 2.3, weekend: 32 },
    Waterfall: { base: 18, peak: 72, peaks: [10, 11, 12], sigma: 2.0, weekend: 34 },
    Hill:      { base: 28, peak: 70, peaks: [6, 7, 17, 18], sigma: 2.5, weekend: 20 },
    Park:      { base: 30, peak: 75, peaks: [7, 8, 17, 18], sigma: 2.2, weekend: 30 },
    Heritage:  { base: 28, peak: 85, peaks: [10, 11, 14, 15], sigma: 2.2, weekend: 24 },
    Lake:      { base: 26, peak: 68, peaks: [7, 8, 17], sigma: 2.3, weekend: 22 },
    Cave:      { base: 18, peak: 70, peaks: [10, 11, 12], sigma: 2.0, weekend: 14 },
    Beach:     { base: 32, peak: 88, peaks: [10, 11, 16, 17], sigma: 2.4, weekend: 38 },
    Nature:    { base: 22, peak: 65, peaks: [9, 10, 15], sigma: 2.5, weekend: 18 },
  };

  function setContext(partial) {
    context = { ...context, ...partial };
  }

  function gaussian(h, center, sigma) {
    return Math.exp(-0.5 * Math.pow((h - center) / sigma, 2));
  }

  function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  function hashCode(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
    return h;
  }

  function placeKey(place) {
    return `${(place.name || "").toLowerCase()}|${place.point?.lat?.toFixed(3)}|${place.point?.lon?.toFixed(3)}`;
  }

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveHistory(store) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(store));
    } catch { /* quota */ }
  }

  function recordSnapshot(place, score, level) {
    const key = placeKey(place);
    if (!key || key === "||") return;
    const store = loadHistory();
    const now = new Date();
    const sample = { ts: now.getTime(), hour: now.getHours(), score, level };
    const entry = store[key] || { samples: [] };
    entry.samples.push(sample);
    if (entry.samples.length > MAX_SAMPLES_PER_PLACE) {
      entry.samples = entry.samples.slice(-MAX_SAMPLES_PER_PLACE);
    }
    store[key] = entry;
    saveHistory(store);
  }

  function historicalTrendAdjustment(place, hour) {
    const key = placeKey(place);
    const samples = loadHistory()[key]?.samples || [];
    const sameHour = samples.filter(s => s.hour === hour);
    if (sameHour.length < 3) return 0;
    const avg = sameHour.reduce((a, s) => a + s.score, 0) / sameHour.length;
    const recent = sameHour.slice(-5);
    const recentAvg = recent.reduce((a, s) => a + s.score, 0) / recent.length;
    return (recentAvg - avg) * 0.35;
  }

  function buildHourlyCurve(category) {
    const cfg = CATEGORY_CURVES[category] || CATEGORY_CURVES.Nature;
    return Array.from({ length: 24 }, (_, h) => {
      let v = cfg.base;
      for (const peak of cfg.peaks) {
        v += (cfg.peak - cfg.base) * gaussian(h, peak, cfg.sigma);
      }
      return v;
    });
  }

  function baseHourlyScore(category, hour, isWeekend) {
    const curve = buildHourlyCurve(category);
    let score = curve[hour] ?? CATEGORY_CURVES[category]?.base ?? 40;
    const cfg = CATEGORY_CURVES[category] || CATEGORY_CURVES.Nature;
    if (isWeekend) score += cfg.weekend * 0.45;
    return score;
  }

  function getFameWeight(name, place) {
    const n = (name || "").toLowerCase();
    for (const [key, w] of Object.entries(GLOBAL_FAME)) {
      if (n.includes(key)) return w;
    }
    if (place.isLandmark) return 2.4;
    if (place.otmRate >= 6) return 2.0;
    if (place.otmRate >= 4) return 1.5;
    return 1;
  }

  function estimateReviewCount(place) {
    if (place.reviewCount > 0) return place.reviewCount;
    const rate = place.otmRate || 0;
    const rating = place.rating || 4;
    return Math.round(Math.pow(2, Math.max(rate, 1)) * 120 + (rating - 3.5) * 400);
  }

  function cityMultiplier(cityName) {
    const c = (cityName || "").toLowerCase().trim();
    if (CITY_CROWD_MULTIPLIER[c]) return CITY_CROWD_MULTIPLIER[c];
    for (const [key, mult] of Object.entries(CITY_CROWD_MULTIPLIER)) {
      if (c.includes(key)) return mult;
    }
    return 1.05;
  }

  function tourismPopularity(place) {
    const rating = place.rating ?? 4;
    const reviews = estimateReviewCount(place);
    const fame = getFameWeight(place.name, place);
    const otm = place.otmRate || 0;
    const cityIntensity = cityMultiplier(context.city);

    const raw =
      (rating * 10) +
      (Math.log10(reviews + 1) * 15) +
      (otm * 6) +
      (fame * 12);
    return raw * (0.85 + cityIntensity * 0.15);
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function distanceFactor(place) {
    if (!place.point?.lat || context.lat == null) return 1;
    const d = haversineKm(context.lat, context.lon, place.point.lat, place.point.lon);
    if (d < 2) return 1.02;
    if (d < 6) return 0.95;
    if (d < 12) return 0.88;
    if (d < 25) return 0.78;
    if (d < 45) return 0.68;
    return 0.58;
  }

  function parseWeather(w) {
    if (!w) return null;
    const tempC = w.tempC ?? (parseFloat(String(w.temp || "").replace("°C", "")) || null);
    const main = (w.sky || w.main || w.condition || "").toLowerCase();
    const desc = (w.description || "").toLowerCase();
    return { tempC, main, desc, humidity: w.humidity, windKmh: w.windKmh };
  }

  function weatherAdjustment(category, w) {
    const weather = parseWeather(w || context.weather);
    if (!weather) return 0;
    let adj = 0;
    const { main, desc, tempC } = weather;
    const rainy = /rain|drizzle|storm|thunder|snow/.test(main + desc);
    const storm = /storm|thunder|hurricane/.test(main + desc);
    const sunny = /clear|sun/.test(main);
    const hot = tempC != null && tempC >= 38;
    const cold = tempC != null && tempC <= 8;

    if (storm) adj -= 28;
    else if (rainy) adj -= 18;

    if (hot) {
      if (["Beach", "Waterfall", "Park"].includes(category)) adj -= 12;
      else adj -= 8;
    }
    if (cold) {
      if (["Beach", "Waterfall"].includes(category)) adj -= 15;
      else if (["Museum", "Fort", "Heritage"].includes(category)) adj -= 5;
    }

    if (sunny && !rainy) {
      if (category === "Beach") adj += 22;
      else if (category === "Park" || category === "Lake") adj += 10;
    }

    if (rainy && category === "Waterfall") adj += 14;
    if (rainy && ["Park", "Beach"].includes(category)) adj -= 10;

    return adj;
  }

  function getSeasonalBoost(category, month) {
    const peakMonths = [10, 11, 0, 1];
    const offMonths = [5, 6];
    if (offMonths.includes(month) && ["Beach", "Waterfall", "Park"].includes(category)) return -12;
    if (peakMonths.includes(month) && ["Heritage", "Temple", "Fort", "Museum"].includes(category)) return 14;
    if ([3, 4].includes(month) && ["Beach", "Waterfall"].includes(category)) return 10;
    return 0;
  }

  function isLongWeekend(date) {
    const d = date.getDay();
    const friday = d === 5;
    const monday = d === 1;
    const weekend = d === 0 || d === 6;
    return friday || monday || (weekend && (date.getDate() <= 3 || date.getDate() >= 28));
  }

  function holidayAdjustment(category, date) {
    const m = date.getMonth();
    const day = date.getDate();
    let boost = 0;

    if (m === 0 && day <= 2) boost += 18;
    if (m === 11 && day >= 24) boost += 12;
    if (m === 2 && day >= 10 && day <= 18) boost += 22;
    if (m === 9 && day >= 15 && day <= 25) boost += 20;
    if (m === 7 && day >= 25 && day <= 31) boost += 24;
    if (m === 9 && day >= 28) boost += 16;
    if (m === 10 && day >= 18) boost += 26;

    if (isLongWeekend(date)) boost += 10;

    if (category === "Temple") return boost * 1.35;
    if (category === "Heritage" || category === "Fort") return boost * 1.15;
    if (category === "Beach") return boost * 0.85;
    return boost * 0.7;
  }

  function liveTrendFluctuation(place, hour, dayOfYear) {
    const pop = tourismPopularity(place);
    const seed = hashCode(place.name) % 1000;
    const wave =
      Math.sin((hour / 24) * Math.PI * 2 + seed / 1000) * 3 +
      Math.sin((dayOfYear / 365) * Math.PI * 4 + seed / 500) * 2;
    const amp = sigmoid((pop - 50) / 25) * 5;
    return wave * amp;
  }

  function computeConfidence(place, hasHistory) {
    let c = 38;
    if (place.otmRate >= 2) c += 14;
    if (place.otmRate >= 5) c += 8;
    if (context.weather) c += 16;
    if (getFameWeight(place.name, place) > 1.8) c += 14;
    if (place.isLandmark) c += 10;
    if (hasHistory) c += 12;
    if (place.rating >= 4.2) c += 6;
    return Math.min(100, Math.round(c));
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

  function scoreToLevel(score) {
    if (score < 30) return "low";
    if (score < 60) return "medium";
    return "high";
  }

  function buildHourlyForecast(place, category, isWeekend, month) {
    const curve = buildHourlyCurve(category);
    const popFactor = tourismPopularity(place) / 80;
    const wAdj = weatherAdjustment(category, context.weather) / 24;

    return curve.map((base, h) => {
      let hv = base;
      const cfg = CATEGORY_CURVES[category] || CATEGORY_CURVES.Nature;
      if (isWeekend) hv += cfg.weekend * 0.35;
      hv += getSeasonalBoost(category, month);
      hv += popFactor * 8;
      hv += wAdj;
      hv += liveTrendFluctuation(place, h, Math.floor(Date.now() / 86400000) % 365);
      return Math.max(5, Math.min(96, Math.round(hv)));
    });
  }

  function computeCrowd(place) {
    const now = new Date();
    const hour = now.getHours();
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    const month = now.getMonth();
    const category = place.category || "Nature";
    const cfg = CATEGORY_CURVES[category] || CATEGORY_CURVES.Nature;

    let score = baseHourlyScore(category, hour, isWeekend);
    score += getSeasonalBoost(category, month);

    const pop = tourismPopularity(place);
    score += pop * 0.42;

    score += weatherAdjustment(category, context.weather);
    score += holidayAdjustment(category, now);
    score *= distanceFactor(place);
    score += historicalTrendAdjustment(place, hour);
    score += liveTrendFluctuation(place, hour, Math.floor(now.getTime() / 86400000) % 365);

    score = Math.max(5, Math.min(96, Math.round(score)));
    const level = scoreToLevel(score);

    const hasHistory = (loadHistory()[placeKey(place)]?.samples?.length || 0) >= 3;
    const confidence = computeConfidence(place, hasHistory);

    const isPeakHour = cfg.peaks.includes(hour);
    const nextPeak = cfg.peaks.find(h => h > hour);
    let peakHint;
    if (isPeakHour) {
      peakHint = `Currently at peak — try ${bestTimeHint(category)} for fewer crowds. ${CROWD_DISCLAIMER}`;
    } else if (nextPeak != null) {
      const h12 = nextPeak > 12 ? nextPeak - 12 : nextPeak;
      const ampm = `${h12}${nextPeak >= 12 ? "pm" : "am"}`;
      peakHint = `Peak expected around ${ampm} · Best: ${bestTimeHint(category)}. ${CROWD_DISCLAIMER}`;
    } else {
      peakHint = `Good time to visit · Best: ${bestTimeHint(category)}. ${CROWD_DISCLAIMER}`;
    }

    const hourlyForecast = buildHourlyForecast(place, category, isWeekend, month);
    const result = { level, score, peakHint, hourlyForecast, isPeakHour, confidence };

    recordSnapshot(place, score, level);
    return result;
  }

  return {
    setContext,
    computeCrowd,
    recordSnapshot,
    buildHourlyCurve,
    CROWD_DISCLAIMER,
    tourismPopularity,
  };
})();
