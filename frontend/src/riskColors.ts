import type { RiskLevel } from "./types";

export const RISK_COLORS: Record<RiskLevel, string> = {
  Low: "#2f9e6b",
  Moderate: "#c9a227",
  High: "#d97706",
  Severe: "#c2410c",
  "No Travel": "#7f1d1d",
};

export const ROUTE_PALETTE = ["#0f766e", "#1d4ed8", "#7c2d12"];

export function weatherTint(t: number): string {
  const stops: [number, number, number, number][] = [
    [0, 47, 158, 107],
    [0.22, 201, 162, 39],
    [0.45, 217, 119, 6],
    [0.7, 194, 65, 12],
    [1, 127, 29, 29],
  ];
  const x = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < stops.length - 2 && x > stops[i + 1][0]) i += 1;
  const a = stops[i];
  const b = stops[i + 1];
  const u = (x - a[0]) / Math.max(b[0] - a[0], 0.0001);
  const ch = (k: number) => Math.round(a[k] + (b[k] - a[k]) * u);
  return `rgb(${ch(1)}, ${ch(2)}, ${ch(3)})`;
}
