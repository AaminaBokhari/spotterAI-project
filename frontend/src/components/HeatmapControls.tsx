interface Props {
  hour: number;
  onChange: (hour: number) => void;
  loading: boolean;
  enabled: boolean;
  forecastLabel?: string | null;
  avgWind?: number;
  maxRisk?: string;
  error?: string | null;
}

const PRESETS = [0, 6, 12, 24, 36, 48];

export default function HeatmapControls({
  hour,
  onChange,
  loading,
  enabled,
  forecastLabel,
  avgWind,
  maxRisk,
  error,
}: Props) {
  return (
    <div className={`heatmap-bar ${enabled ? "" : "disabled"}`}>
      <div className="heatmap-bar-copy">
        <div>
          <p className="eyebrow">WeatherSeek heatmap</p>
          <strong>{hour === 0 ? "Now" : `+${hour} hours`}</strong>
        </div>
        <span>
          {loading
            ? "Loading 0–48h corridor forecast…"
            : avgWind != null
              ? `Avg wind ${avgWind} mph · max ${maxRisk ?? "Low"}`
              : "0–48h forecast"}
          {forecastLabel && !loading
            ? ` · ${new Date(forecastLabel).toUTCString().replace("GMT", "UTC")}`
            : ""}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={48}
        step={1}
        value={hour}
        disabled={!enabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Forecast hour offset 0 to 48"
      />
      <div className="hour-presets">
        {PRESETS.map((h) => (
          <button
            key={h}
            type="button"
            className={hour === h ? "active" : ""}
            disabled={!enabled}
            onClick={() => onChange(h)}
          >
            {h === 0 ? "Now" : `${h}h`}
          </button>
        ))}
      </div>
      {error && <p className="heat-error">{error}</p>}
    </div>
  );
}
