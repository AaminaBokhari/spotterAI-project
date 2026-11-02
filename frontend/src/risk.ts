import type { Checkpoint, HeatCell, RiskLevel, RouteOption } from "./types";

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

function cell(lat: number, lng: number, wind: number, rain: number, snow: number, time: string | null, weight: number): HeatCell {
  const { risk, score } = classifyWeather(wind, rain, snow, weight);
  return {
    lat: Number(lat.toFixed(4)),
    lng: Number(lng.toFixed(4)),
    intensity: Math.min(1, score / 4 + Math.min(wind, 45) / 90),
    risk,
    wind_mph: Math.round(wind * 100) / 100,
    rain_in_hr: Math.round(rain * 1000) / 1000,
    snow_in_hr: Math.round(snow * 1000) / 1000,
    forecast_time: time,
  };
}

function corridorPoints(routes: Pick<RouteOption, "coordinates">[]) {
  const pts: { lat: number; lng: number }[] = [];
  const seen = new Set<string>();
  const add = (lat: number, lng: number) => {
    const k = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    if (seen.has(k)) return;
    seen.add(k);
    pts.push({ lat, lng });
  };
  for (const r of routes) {
    const coords = thin(r.coordinates, 14);
    for (let i = 0; i < coords.length; i++) {
      const [lng, lat] = coords[i];
      add(lat, lng);
      const next = coords[Math.min(i + 1, coords.length - 1)];
      const dx = next[0] - lng;
      const dy = next[1] - lat;
      const len = Math.hypot(dx, dy) || 1;
      const off = 0.12;
      add(lat + (-dx / len) * off, lng + (dy / len) * off);
      add(lat - (-dx / len) * off, lng - (dy / len) * off);
    }
  }
  return pts.slice(0, 24);
}

function parseStamp(t: string): number {
  const iso = t.endsWith("Z") || t.includes("+") ? t : `${t}Z`;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function closestIndex(times: string[], targetMs: number) {
  let best = 0;
  let diff = Infinity;
  times.forEach((t, i) => {
    const d = Math.abs(parseStamp(t) - targetMs);
    if (d < diff) {
      diff = d;
      best = i;
    }
  });
  return best;
}

function pickSeries(series: unknown, i: number): number[] {
  if (!Array.isArray(series)) return [];
  if (Array.isArray(series[0])) return (series[i] as number[]) ?? [];
  return series as number[];
}

function parseMeteo(raw: unknown, count: number) {
  if (Array.isArray(raw)) return raw.slice(0, count);
  const o = raw as {
    latitude?: number | number[];
    hourly?: {
      time?: string[];
      wind_speed_10m?: number[] | number[][];
      precipitation?: number[] | number[][];
      snowfall?: number[] | number[][];
    };
  };
  const hourly = o.hourly ?? {};
  if (Array.isArray(o.latitude) && o.latitude.length > 1) {
    return o.latitude.map((_, i) => ({
      hourly: {
        time: hourly.time ?? [],
        wind_speed_10m: pickSeries(hourly.wind_speed_10m, i),
        precipitation: pickSeries(hourly.precipitation, i),
        snowfall: pickSeries(hourly.snowfall, i),
      },
    }));
  }
  return [o];
}

export function thinRoutes(routes: Pick<RouteOption, "coordinates">[]) {
  return routes.map((r) => ({ coordinates: thin(r.coordinates, 20) }));
}

export async function clientHeatmapHours(
  routes: Pick<RouteOption, "coordinates">[],
  weightLb: number
): Promise<Record<number, HeatCell[]>> {
  const pts = corridorPoints(routes).slice(0, 12);
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
  const payloads = parseMeteo(await res.json(), pts.length);
  const now = Date.now();

  const hours: Record<number, HeatCell[]> = {};
  for (let h = 0; h <= 48; h++) hours[h] = [];

  pts.forEach((pt, i) => {
    const hourly = payloads[i]?.hourly ?? payloads[0]?.hourly ?? {};
    const times = hourly.time ?? [];
    const wind = pickSeries(hourly.wind_speed_10m, 0);
    const rain = pickSeries(hourly.precipitation, 0);
    const snow = pickSeries(hourly.snowfall, 0);
    for (let h = 0; h <= 48; h++) {
      const idx = times.length ? closestIndex(times, now + h * 3600_000) : 0;
      hours[h].push(
        cell(
          pt.lat,
          pt.lng,
          Number(wind[idx] || 0),
          Number(rain[idx] || 0),
          Number(snow[idx] || 0),
          times[idx] ?? null,
          weightLb
        )
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
  return Math.min(1, Math.max(0, c.intensity));
}

export function nearestCell(cells: HeatCell[], lat: number, lng: number): HeatCell | null {
  if (!cells.length) return null;
  let best = cells[0];
  let bestD = Infinity;
  for (const c of cells) {
    const d = (c.lat - lat) ** 2 + (c.lng - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

export function paintRouteForHour<T extends { checkpoints: Checkpoint[] }>(
  route: T,
  cells: HeatCell[],
  weightLb: number
): T {
  if (!cells.length) return route;
  return {
    ...route,
    checkpoints: route.checkpoints.map((cp) => {
      const hit = nearestCell(cells, cp.lat, cp.lng);
      if (!hit) return cp;
      const { risk, score } = classifyWeather(hit.wind_mph, hit.rain_in_hr, hit.snow_in_hr, weightLb);
      return {
        ...cp,
        wind_mph: hit.wind_mph,
        rain_in_hr: hit.rain_in_hr,
        snow_in_hr: hit.snow_in_hr,
        forecast_time: hit.forecast_time,
        risk,
        risk_score: score,
      };
    }),
  };
}
