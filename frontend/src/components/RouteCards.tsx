import type { AnalyzeResponse, RouteOption } from "../types";
import { RISK_COLORS, ROUTE_PALETTE } from "../riskColors";

interface Props {
  data: AnalyzeResponse;
  selectedId: number | null;
  onSelect: (id: number) => void;
}

function fmtHours(h: number): string {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${String(mins).padStart(2, "0")}m`;
}

function RiskBar({ route }: { route: RouteOption }) {
  const miles = route.summary.miles_by_risk;
  const total = Math.max(
    route.distance_miles,
    Object.values(miles).reduce((a, b) => a + b, 0) || 1
  );
  const order = ["Low", "Moderate", "High", "Severe", "No Travel"] as const;
  return (
    <div className="risk-stack" title="Miles by risk">
      {order.map((level) => {
        const m = miles[level] ?? 0;
        if (m <= 0) return null;
        return (
          <span
            key={level}
            style={{ width: `${(m / total) * 100}%`, background: RISK_COLORS[level] }}
          />
        );
      })}
    </div>
  );
}

function RouteCard({
  route,
  recommended,
  selected,
  onSelect,
}: {
  route: RouteOption;
  recommended: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const color = ROUTE_PALETTE[route.id % ROUTE_PALETTE.length];
  const s = route.summary;

  return (
    <button
      type="button"
      className={`route-card ${selected ? "selected" : ""} ${recommended ? "recommended" : ""}`}
      onClick={onSelect}
      style={{ ["--route-accent" as string]: color }}
    >
      <div className="route-card-top">
        <span className="route-badge">Route {route.id + 1}</span>
        {recommended && <span className="rec-pill">Run this</span>}
      </div>
      <div className="route-metrics">
        <div>
          <span className="muted">Miles</span>
          <strong>{route.distance_miles.toFixed(0)}</strong>
        </div>
        <div>
          <span className="muted">ETA</span>
          <strong>{fmtHours(route.duration_hours)}</strong>
        </div>
        <div>
          <span className="muted">Max</span>
          <strong>{s.max_risk}</strong>
        </div>
      </div>
      <RiskBar route={route} />
      <p className="tiny muted">
        {s.severe_miles.toFixed(0)} severe · {s.high_miles.toFixed(0)} high · every {route.interval_miles} mi
      </p>
    </button>
  );
}

export default function RouteCards({ data, selectedId, onSelect }: Props) {
  return (
    <div className="routes-panel">
      <header className="panel-head compact">
        <div>
          <p className="eyebrow">Options</p>
          <h2>{data.routes.length} routes scored</h2>
        </div>
      </header>
      <div className="route-list">
        {data.routes.map((route) => (
          <RouteCard
            key={route.id}
            route={route}
            recommended={route.id === data.recommendation?.route_id}
            selected={selectedId === route.id}
            onSelect={() => onSelect(route.id)}
          />
        ))}
      </div>
    </div>
  );
}
