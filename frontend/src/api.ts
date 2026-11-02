import type { AnalyzeRequest, AnalyzeResponse, HeatmapResponse, RouteOption } from "./types";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

function explain(err: unknown): Error {
  if (err instanceof DOMException && err.name === "AbortError") {
    return new Error("The server is waking up or busy. Wait 20 seconds and try once more.");
  }
  if (err instanceof TypeError) {
    return new Error("Cannot reach the API. Wait a moment and try again — the free host may be asleep.");
  }
  return err instanceof Error ? err : new Error("Request failed");
}

async function postOnce<T>(path: string, body: unknown, _timeoutMs: number, signal: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

async function wakeApi(): Promise<void> {
  if (!API_BASE) return;
  try {
    await fetch(`${API_BASE}/api/health/`, { method: "GET" });
  } catch {
    /* ignore — analyze will retry */
  }
}

async function post<T>(path: string, body: unknown, timeoutMs = 120_000): Promise<T> {
  await wakeApi();
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await postOnce<T>(path, body, timeoutMs, ctrl.signal);
    } catch (err) {
      last = err;
      const retryable =
        (err instanceof TypeError) ||
        (err instanceof DOMException && err.name === "AbortError");
      if (!retryable || attempt === 2) throw explain(err);
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    } finally {
      window.clearTimeout(timer);
    }
  }
  throw explain(last);
}

export function analyzeRoutes(payload: AnalyzeRequest): Promise<AnalyzeResponse> {
  return post<AnalyzeResponse>("/api/analyze/", payload);
}

export async function fetchHeatmap(opts: {
  weight_lb: number;
  hour_offset: number;
  routes: Pick<RouteOption, "coordinates">[];
  grid?: number;
}): Promise<HeatmapResponse> {
  await wakeApi();
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 25_000);
  try {
    return await postOnce<HeatmapResponse>("/api/heatmap/", opts, 25_000, ctrl.signal);
  } catch (err) {
    throw explain(err);
  } finally {
    window.clearTimeout(timer);
  }
}
