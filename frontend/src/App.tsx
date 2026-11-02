import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyzeRoutes, fetchHeatmap } from "./api";
import CheckpointTable from "./components/CheckpointTable";
import HeatmapControls from "./components/HeatmapControls";
import RouteCards from "./components/RouteCards";
import RouteForm from "./components/RouteForm";
import RouteMap from "./components/RouteMap";
import { clientHeatmapHours, heatStats, hoursFromApi, thinRoutes } from "./risk";
import type { AnalyzeRequest, AnalyzeResponse, HeatCell } from "./types";

export default function App() {
  const [loading, setLoading] = useState(false);
  const [heatLoading, setHeatLoading] = useState(false);
  const [heatError, setHeatError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hour, setHour] = useState(0);
  const [heatByHour, setHeatByHour] = useState<Record<number, HeatCell[]>>({});
  const [showChecks, setShowChecks] = useState(false);
  const heatReq = useRef(0);

  const selectedRoute = useMemo(
    () => data?.routes.find((r) => r.id === selectedId) ?? data?.routes[0] ?? null,
    [data, selectedId]
  );

  const recRoute = useMemo(
    () => data?.routes.find((r) => r.id === data.recommendation?.route_id) ?? null,
    [data]
  );

  const heatCells = heatByHour[hour] ?? [];
  const forecastLabel = heatCells[0]?.forecast_time ?? null;
  const stats = heatStats(heatCells);

  const loadHeat = useCallback(async (payload: AnalyzeResponse) => {
    const reqId = ++heatReq.current;
    setHeatLoading(true);
    setHeatError(null);
    const slim = thinRoutes(payload.routes);
    try {
      try {
        const hours = await clientHeatmapHours(slim, payload.weight_lb);
        if (reqId !== heatReq.current) return;
        setHeatByHour(hours);
      } catch {
        const res = await fetchHeatmap({
          weight_lb: payload.weight_lb,
          hour_offset: 0,
          routes: slim,
          grid: 7,
        });
        if (reqId !== heatReq.current) return;
        setHeatByHour(hoursFromApi(res.hours, res.cells, 0));
      }
    } catch (err) {
      if (reqId !== heatReq.current) return;
      setHeatError(err instanceof Error ? err.message : "Heatmap failed to load");
    } finally {
      if (reqId === heatReq.current) setHeatLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!data) return;
    void loadHeat(data);
  }, [data, loadHeat]);

  async function handleAnalyze(payload: AnalyzeRequest) {
    setLoading(true);
    setError(null);
    try {
      const res = await analyzeRoutes(payload);
      setData(res);
      setSelectedId(res.recommendation?.route_id ?? res.routes[0]?.id ?? null);
      setHour(0);
      setHeatByHour({});
      setShowChecks(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="spotter-mark" aria-hidden>
            S
          </span>
          <div>
            <p className="brand-name">
              Spotter <span>Corridor</span>
            </p>
            <p className="brand-sub">WeatherSeek · safer corridors for the next haul</p>
          </div>
        </div>
        <div className="top-status">
          <span className="live-dot" />
          Live weather
          {data && (
            <p className="trip-chip">
              <span>{shortPlace(data.origin.name)}</span>
              <em>→</em>
              <span>{shortPlace(data.destination.name)}</span>
              <small>{Math.round(data.weight_lb).toLocaleString()} lb</small>
            </p>
          )}
        </div>
      </header>

      <div className="workspace">
        <aside className="rail">
          <RouteForm loading={loading} onSubmit={handleAnalyze} compact={!!data} />
          {error && <p className="error-banner">{error}</p>}
          {data ? (
            <>
              {recRoute && data.recommendation && (
                <div className="decision">
                  <p className="eyebrow">Dispatch call</p>
                  <h2>Run Route {recRoute.id + 1}</h2>
                  <p>{data.recommendation.reason}</p>
                  <dl>
                    <div>
                      <dt>Severe mi</dt>
                      <dd>{recRoute.summary.severe_miles.toFixed(0)}</dd>
                    </div>
                    <div>
                      <dt>High mi</dt>
                      <dd>{recRoute.summary.high_miles.toFixed(0)}</dd>
                    </div>
                    <div>
                      <dt>Time</dt>
                      <dd>{fmtHours(recRoute.duration_hours)}</dd>
                    </div>
                  </dl>
                </div>
              )}
              <RouteCards data={data} selectedId={selectedId} onSelect={setSelectedId} />
            </>
          ) : (
            <div className="rail-hint">
              <p className="eyebrow">Operator brief</p>
              <h3>Weather before wheels turn</h3>
              <p>
                Built for Spotter operators. Score each alternate the way a dispatcher would:
                fewest severe miles, then high, then average risk, then time.
              </p>
              <ul>
                <li>3 OSRM driving options</li>
                <li>Forecast at every 10 / 25 / 50 mi ETA</li>
                <li>Wind + rain + snow + load rules</li>
              </ul>
            </div>
          )}
        </aside>

        <section className="stage">
          <div className="map-wrap">
            <RouteMap
              data={data}
              selectedId={selectedId}
              heatCells={heatCells}
              showHeat={heatCells.length > 0}
              onSelect={setSelectedId}
            />
            {loading && (
              <div className="map-loading" role="status">
                <span className="spinner" aria-hidden />
                <div>
                  <strong>Scoring corridors…</strong>
                  <p>Pulling routes and checkpoint forecasts</p>
                </div>
              </div>
            )}
          </div>

          <div className="dock">
            <HeatmapControls
              hour={hour}
              onChange={setHour}
              loading={heatLoading}
              enabled={!!data}
              forecastLabel={forecastLabel}
              avgWind={stats.avgWind}
              maxRisk={stats.maxRisk}
              error={heatError}
            />
            {selectedRoute && (
              <div className="checks-shell">
                <button
                  type="button"
                  className="checks-toggle"
                  onClick={() => setShowChecks((v) => !v)}
                >
                  {showChecks ? "Hide checkpoints" : "Show checkpoints"}
                  {` · Route ${selectedRoute.id + 1} · ${selectedRoute.checkpoints.length} stops`}
                </button>
                {showChecks && <CheckpointTable route={selectedRoute} />}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function shortPlace(name: string): string {
  return name.split(",")[0] || name;
}

function fmtHours(h: number): string {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${String(mins).padStart(2, "0")}m`;
}
