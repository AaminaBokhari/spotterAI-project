import type { HeatCell, RiskLevel, RouteOption } from "./types";

const ORDER: RiskLevel[] = ["Low", "Moderate", "High", "Severe", "No Travel"];
const SCORE: Record<RiskLevel, number> = {
  Low: 0,
  Moderate: 1,
  High: 2,
  Severe: 3,
  "No Travel": 4,
};

function band(value: number, limits: number[]): RiskLevel {
  for (let i = 0; i < limits.length; i++) {
    if (value < limits[i]) return ORDER[i];
  }
  return ORDER[ORDER.length - 1];
}

export function classifyWeather(wind: number, rain: number, snow: number, weightLb: number) {
  const w = band(wind, [25, 35, 45, 55]);
  const r = band(rain, [0.1, 0.25, 0.5, 1]);
  const s = band(snow, [0.5, 1, 2, 3]);
  let risk = [w, r, s].sort((a, b) => SCORE[b] - SCORE[a])[0];
  if (wind >= 55) risk = "No Travel";
  else if (wind >= 45 && weightLb > 30_000) risk = "No Travel";
  else if (wind >= 35 && weightLb > 40_000 && SCORE[risk] < SCORE.Severe) risk = "Severe";
  return { risk, score: SCORE[risk] };
}

function thin(coords: [number, number][], maxPts = 16): [number, number][] {
  if (coords.length <= maxPts) return coords;
  const step = (coords.length - 1) / (maxPts - 1);
  return Array.from({ length: maxPts }, (_, i) => coords[Math.round(i * step)]);
}

function bounds(routes: Pick<RouteOption, "coordinates">[]) {
  const lngs: number[] = [];
  const lats: number[] = [];
  for (const r of routes) {
    for (const [lng, lat] of thin(r.coordinates)) {
      lngs.push(lng);
      lats.push(lat);
    }
  }
  const pad = 0.35;
  return {
    min_lat: Math.min(...lats) - pad,
    max_lat: Math.max(...lats) + pad,
    min_lng: Math.min(...lngs) - pad,
    max_lng: Math.max(...lngs) + pad,
  };
}

function cell(lat: number, lng: number, wind: number, rain: number, snow: number, time: string | null, weight: number): HeatCell {
  const { risk, score } = classifyWeather(wind, rain, snow, weight);
  return {
    lat: Number(lat.toFixed(4)),
    lng: Number(lng.toFixed(4)),
    intensity: Math.min(1, score / 4 + Math.min(wind, 40) / 80),
    risk,
    wind_mph: Math.round(wind * 100) / 100,
    rain_in_hr: Math.round(rain * 1000) / 1000,
    snow_in_hr: Math.round(snow * 1000) / 1000,
    forecast_time: time,
  };
}

function gridPoints(b: ReturnType<typeof bounds>, n = 6) {
  const pts: { lat: number; lng: number }[] = [];
  for (let i = 0; i < n; i++) {
    const lat = b.min_lat + ((b.max_lat - b.min_lat) * i) / Math.max(n - 1, 1);
    for (let j = 0; j < n; j++) {
      const lng = b.min_lng + ((b.max_lng - b.min_lng) * j) / Math.max(n - 1, 1);
      pts.push({ lat, lng });
    }
  }
  return pts;
}

function closestNowIndex(times: string[]) {
  const now = Date.now();
  let best = 0;
  let diff = Infinity;
  times.forEach((t, i) => {
    const d = Math.abs(new Date(t.endsWith("Z") || t.includes("+") ? t : `${t}Z`).getTime() - now);
    if (d < diff) {
      diff = d;
      best = i;
    }
  });
  return best;
}

export function thinRoutes(routes: Pick<RouteOption, "coordinates">[]) {
  return routes.map((r) => ({ coordinates: thin(r.coordinates, 20) }));
}

export async function clientHeatmapHours(
  routes: Pick<RouteOption, "coordinates">[],
  weightLb: number
): Promise<Record<number, HeatCell[]>> {
  const pts = gridPoints(bounds(routes), 6);
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", pts.map((p) => p.lat.toFixed(4)).join(","));
  url.searchParams.set("longitude", pts.map((p) => p.lng.toFixed(4)).join(","));
  url.searchParams.set("hourly", "wind_speed_10m,precipitation,snowfall");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("precipitation_unit", "inch");
  url.searchParams.set("forecast_days", "3");
  url.searchParams.set("timezone", "UTC");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Weather forecast unavailable for heatmap");
  const raw = await res.json();
  const payloads: { hourly?: { time?: string[]; wind_speed_10m?: number[]; precipitation?: number[]; snowfall?: number[] } }[] =
    Array.isArray(raw) ? raw : [raw];

  const hours: Record<number, HeatCell[]> = {};
  for (let h = 0; h <= 48; h++) hours[h] = [];

  pts.forEach((pt, i) => {
    const hourly = payloads[i]?.hourly ?? {};
    const times = hourly.time ?? [];
    const wind = hourly.wind_speed_10m ?? [];
    const rain = hourly.precipitation ?? [];
    const snow = hourly.snowfall ?? [];
    const base = times.length ? closestNowIndex(times) : 0;
    for (let h = 0; h <= 48; h++) {
      const idx = Math.min(base + h, Math.max(times.length - 1, 0));
      hours[h].push(
        cell(pt.lat, pt.lng, Number(wind[idx] || 0), Number(rain[idx] || 0), Number(snow[idx] || 0), times[idx] ?? null, weightLb)
      );
    }
  });

  return hours;
}

export function hoursFromApi(raw: Record<string, HeatCell[]> | undefined, fallback: HeatCell[], hour: number) {
  const out: Record<number, HeatCell[]> = {};
  if (raw) {
    for (const [k, v] of Object.entries(raw)) out[Number(k)] = v;
  }
  if (!out[hour]) out[hour] = fallback;
  return out;
}

export function heatStats(cells: HeatCell[]) {
  if (!cells.length) {
    return { avgWind: 0, avgRain: 0, avgSnow: 0, maxRisk: "Low" as RiskLevel };
  }
  const n = cells.length;
  const avgWind = cells.reduce((s, c) => s + c.wind_mph, 0) / n;
  const avgRain = cells.reduce((s, c) => s + c.rain_in_hr, 0) / n;
  const avgSnow = cells.reduce((s, c) => s + c.snow_in_hr, 0) / n;
  const maxRisk = cells.reduce((best, c) => (SCORE[c.risk] > SCORE[best] ? c.risk : best), "Low" as RiskLevel);
  return {
    avgWind: Math.round(avgWind * 10) / 10,
    avgRain: Math.round(avgRain * 1000) / 1000,
    avgSnow: Math.round(avgSnow * 1000) / 1000,
    maxRisk,
  };
}

export function weatherStrength(c: HeatCell): number {
  return Math.min(1, Math.max(0, c.wind_mph / 28 + c.rain_in_hr * 2.2 + c.snow_in_hr * 0.6));
}
