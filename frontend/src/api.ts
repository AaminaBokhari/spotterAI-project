import type { AnalyzeRequest, AnalyzeResponse, HeatmapResponse, RouteOption } from "./types";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

async function post<T>(path: string, body: unknown, timeoutMs = 90_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
    }
    return data as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(
        "Request timed out. Is Django running on http://127.0.0.1:8000? Start it with: python manage.py runserver"
      );
    }
    if (err instanceof TypeError) {
      throw new Error(
        "Cannot reach API. Start the backend: cd backend && python manage.py runserver"
      );
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

export function analyzeRoutes(payload: AnalyzeRequest): Promise<AnalyzeResponse> {
  return post<AnalyzeResponse>("/api/analyze/", payload);
}

export function fetchHeatmap(opts: {
  weight_lb: number;
  hour_offset: number;
  routes: Pick<RouteOption, "coordinates">[];
  grid?: number;
}): Promise<HeatmapResponse> {
  return post<HeatmapResponse>("/api/heatmap/", opts);
}
