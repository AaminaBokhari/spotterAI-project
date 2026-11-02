import type { RouteOption } from "../types";
import { RISK_COLORS } from "../riskColors";

interface Props {
  route: RouteOption;
}

export default function CheckpointTable({ route }: Props) {
  return (
    <section className="checkpoints">
      <header className="panel-head compact">
        <div>
          <p className="eyebrow">Checkpoints</p>
          <h2>
            Route {route.id + 1} · every {route.interval_miles} mi
          </h2>
        </div>
        <p className="muted tiny">{route.checkpoints.length} samples along the haul</p>
      </header>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Mile</th>
              <th>ETA</th>
              <th>Wind</th>
              <th>Rain</th>
              <th>Snow</th>
              <th>Risk</th>
            </tr>
          </thead>
          <tbody>
            {route.checkpoints.map((cp) => (
              <tr key={`${cp.mile}-${cp.eta}`}>
                <td className="mono">{cp.mile}</td>
                <td>{new Date(cp.eta).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                <td className="mono">{cp.wind_mph}</td>
                <td className="mono">{cp.rain_in_hr}</td>
                <td className="mono">{cp.snow_in_hr}</td>
                <td>
                  <span className="risk-tag" style={{ background: RISK_COLORS[cp.risk] }}>
                    {cp.risk}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
