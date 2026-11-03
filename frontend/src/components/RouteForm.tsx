import { type FormEvent, useMemo, useState } from "react";
import type { AnalyzeRequest } from "../types";

interface Props {
  loading: boolean;
  compact?: boolean;
  onSubmit: (payload: AnalyzeRequest) => void;
}

function defaultDepartureLocal(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function RouteForm({ loading, compact, onSubmit }: Props) {
  const [origin, setOrigin] = useState("Chicago, IL");
  const [destination, setDestination] = useState("Detroit, MI");
  const [departure, setDeparture] = useState(defaultDepartureLocal);
  const [weight, setWeight] = useState("35000");
  const [interval, setInterval] = useState<string>("auto");
  const [open, setOpen] = useState(true);

  const weightNum = useMemo(() => Number(weight), [weight]);
  const collapsed = compact && !open;

  function payload(extra: Partial<AnalyzeRequest> = {}): AnalyzeRequest | null {
    if (!origin.trim() || !destination.trim() || !departure || !(weightNum > 0)) return null;
    return {
      origin: origin.trim(),
      destination: destination.trim(),
      departure_time: new Date(departure).toISOString(),
      weight_lb: weightNum,
      interval_miles: interval === "auto" ? null : Number(interval),
      ...extra,
    };
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const body = payload();
    if (!body) return;
    onSubmit(body);
    if (compact) setOpen(false);
  }

  function runHighWindDemo() {
    setOrigin("Chicago, IL");
    setDestination("Detroit, MI");
    setWeight("41000");
    onSubmit({
      origin: "Chicago, IL",
      destination: "Detroit, MI",
      departure_time: new Date(departure).toISOString(),
      weight_lb: 41000,
      interval_miles: interval === "auto" ? null : Number(interval),
      demo_weather: true,
    });
    if (compact) setOpen(false);
  }

  return (
    <form className={`form ${collapsed ? "collapsed" : ""}`} onSubmit={handleSubmit}>
      <header className="panel-head">
        <div>
          <p className="eyebrow">Haul inputs</p>
          <h2>{compact ? "This trip" : "Build the haul"}</h2>
        </div>
        {compact && (
          <button type="button" className="ghost-btn" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide" : "Edit"}
          </button>
        )}
      </header>

      {!collapsed && (
        <>
          <div className="demo-presets">
            <button
              type="button"
              onClick={() => {
                setOrigin("Chicago, IL");
                setDestination("Detroit, MI");
                setWeight("35000");
              }}
            >
              Chicago → Detroit
            </button>
            <button
              type="button"
              onClick={() => {
                setOrigin("Denver, CO");
                setDestination("Chicago, IL");
                setWeight("35000");
              }}
            >
              Denver → Chicago
            </button>
            <button type="button" className="demo-wind" onClick={runHighWindDemo} disabled={loading}>
              Demo: High / Severe wind
            </button>
          </div>
          <div className="form-grid">
            <label>
              Origin
              <input
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="City or address"
                required
              />
            </label>
            <label>
              Destination
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="City or address"
                required
              />
            </label>
            <label>
              Departure
              <input
                type="datetime-local"
                value={departure}
                onChange={(e) => setDeparture(e.target.value)}
                required
              />
            </label>
            <label>
              Load weight (lb)
              <input
                type="number"
                min={1}
                step={100}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                required
              />
            </label>
            <label>
              Weather sample
              <select value={interval} onChange={(e) => setInterval(e.target.value)}>
                <option value="auto">Auto (10 / 25 / 50 mi)</option>
                <option value="10">Every 10 miles</option>
                <option value="25">Every 25 miles</option>
                <option value="50">Every 50 miles</option>
              </select>
            </label>
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Scoring…" : compact ? "Re-score haul" : "Score safer routes"}
          </button>
        </>
      )}
    </form>
  );
}
