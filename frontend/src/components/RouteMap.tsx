import { Fragment, useEffect, useMemo } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import type { AnalyzeResponse, Checkpoint, HeatCell, RiskLevel, RouteOption } from "../types";
import { RISK_COLORS, ROUTE_PALETTE, weatherTint } from "../riskColors";
import { nearestCell, weatherStrength } from "../risk";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function pinIcon(label: string) {
  return L.divIcon({
    className: "",
    html: `<div class="place-pin">${label}</div>`,
    iconSize: [64, 24],
    iconAnchor: [32, 12],
  });
}

interface Props {
  data: AnalyzeResponse | null;
  selectedId: number | null;
  heatCells: HeatCell[];
  showHeat: boolean;
  hour: number;
  avgWind: number;
  avgRain: number;
  maxRisk: RiskLevel | string;
  heatLoading?: boolean;
  onSelect?: (id: number) => void;
}

function HeatPane() {
  const map = useMap();
  useEffect(() => {
    if (!map.getPane("heatpane")) {
      const pane = map.createPane("heatpane");
      pane.style.zIndex = "450";
      pane.style.pointerEvents = "none";
    }
  }, [map]);
  return null;
}

function FitBounds({ routes }: { routes: RouteOption[] }) {
  const map = useMap();
  useEffect(() => {
    const pts: L.LatLngExpression[] = [];
    for (const r of routes) {
      for (const [lng, lat] of r.coordinates) pts.push([lat, lng]);
    }
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
  }, [map, routes]);
  return null;
}

function HeatLayer({ cells, show }: { cells: HeatCell[]; show: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!show || !cells.length) return;
    const pane = map.getPane("heatpane") ? "heatpane" : undefined;
    const points: [number, number, number][] = cells.map((c) => [
      c.lat,
      c.lng,
      Math.max(0.18, weatherStrength(c)),
    ]);
    const layer = (L as typeof L & { heatLayer: typeof L.heatLayer }).heatLayer(points, {
      radius: 48,
      blur: 22,
      maxZoom: 9,
      minOpacity: 0.55,
      max: 1,
      pane,
      gradient: {
        0.0: "#2f9e6b",
        0.22: "#c9a227",
        0.45: "#d97706",
        0.7: "#c2410c",
        1.0: "#7f1d1d",
      },
    });
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, cells, show]);
  return (
    <>
      {show &&
        cells.map((c, i) => {
          const t = weatherStrength(c);
          const fill = weatherTint(t);
          return (
            <CircleMarker
              key={`${c.lat}-${c.lng}-${i}-${c.forecast_time ?? ""}`}
              center={[c.lat, c.lng]}
              radius={16 + t * 22}
              pane="heatpane"
              pathOptions={{
                color: fill,
                weight: 0,
                fillColor: fill,
                fillOpacity: 0.45 + t * 0.4,
              }}
            >
              <Tooltip>
                {c.wind_mph} mph · rain {c.rain_in_hr} · {c.risk}
              </Tooltip>
            </CircleMarker>
          );
        })}
    </>
  );
}

function riskAtMile(checkpoints: Checkpoint[], mile: number) {
  let risk = checkpoints[0]?.risk ?? ("Low" as const);
  for (const cp of checkpoints) {
    if (cp.mile <= mile) risk = cp.risk;
    else break;
  }
  return risk;
}

function pathColorAt(lat: number, lng: number, mile: number, route: RouteOption, cells: HeatCell[]) {
  const hit = nearestCell(cells, lat, lng);
  if (hit) {
    const bucket = Math.round(weatherStrength(hit) * 8) / 8;
    return weatherTint(bucket);
  }
  return RISK_COLORS[riskAtMile(route.checkpoints, mile)];
}

function riskChunks(route: RouteOption, cells: HeatCell[]) {
  const coords = route.coordinates;
  if (coords.length < 2) return [] as { positions: [number, number][]; color: string }[];

  const chunks: { positions: [number, number][]; color: string }[] = [];
  let current = pathColorAt(coords[0][1], coords[0][0], 0, route, cells);
  let buffer: [number, number][] = [[coords[0][1], coords[0][0]]];
  const step = Math.max(1, Math.floor(coords.length / 120));

  for (let i = step; i < coords.length; i += step) {
    const mile = (i / (coords.length - 1)) * route.distance_miles;
    const color = pathColorAt(coords[i][1], coords[i][0], mile, route, cells);
    const pt: [number, number] = [coords[i][1], coords[i][0]];
    if (color !== current) {
      buffer.push(pt);
      chunks.push({ positions: buffer, color: current });
      buffer = [pt];
      current = color;
    } else {
      buffer.push(pt);
    }
  }
  const last = coords[coords.length - 1];
  buffer.push([last[1], last[0]]);
  if (buffer.length > 1) chunks.push({ positions: buffer, color: current });
  return chunks;
}

export default function RouteMap({
  data,
  selectedId,
  heatCells,
  showHeat,
  hour,
  avgWind,
  avgRain,
  maxRisk,
  heatLoading,
  onSelect,
}: Props) {
  const center = useMemo<[number, number]>(() => {
    if (data?.origin) return [data.origin.lat, data.origin.lng];
    return [41.88, -87.63];
  }, [data]);

  return (
    <div className="map-shell">
      <MapContainer center={center} zoom={6} className="map-canvas" scrollWheelZoom>
        <TileLayer
          attribution='Tiles &copy; Esri'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        />
        <TileLayer
          attribution=""
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
          opacity={0.9}
        />

        {data && <FitBounds routes={data.routes} />}
        <HeatPane />

        {data?.routes.map((route) => {
          const selected = selectedId === route.id;
          const recommended = data.recommendation?.route_id === route.id;
          const outline = ROUTE_PALETTE[route.id % ROUTE_PALETTE.length];
          const full = route.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
          const chunks = riskChunks(route, heatCells);

          return (
            <Fragment key={route.id}>
              <Polyline
                positions={full}
                pathOptions={{
                  color: outline,
                  weight: selected || recommended ? 10 : 7,
                  opacity: selected || recommended ? 0.28 : 0.12,
                }}
                eventHandlers={{ click: () => onSelect?.(route.id) }}
              />
              {chunks.map((chunk, idx) => (
                <Polyline
                  key={`${route.id}-c-${idx}`}
                  positions={chunk.positions}
                  pathOptions={{
                    color: chunk.color,
                    weight: selected || recommended ? 8 : 5,
                    opacity: selected || recommended ? 1 : 0.7,
                  }}
                  eventHandlers={{ click: () => onSelect?.(route.id) }}
                >
                  <Tooltip sticky>
                    Route {route.id + 1}
                    {recommended ? " · recommended" : ""}
                  </Tooltip>
                </Polyline>
              ))}
            </Fragment>
          );
        })}

        {data &&
          data.routes
            .filter((r) => selectedId == null || r.id === selectedId)
            .flatMap((route) =>
              route.checkpoints.map((cp, i) => (
                <CircleMarker
                  key={`${route.id}-${i}`}
                  center={[cp.lat, cp.lng]}
                  radius={selectedId === route.id ? 7 : 5}
                  pathOptions={{
                    color: "#0b1220",
                    weight: 1,
                    fillColor: nearestCell(heatCells, cp.lat, cp.lng)
                      ? weatherTint(weatherStrength(nearestCell(heatCells, cp.lat, cp.lng)!))
                      : RISK_COLORS[cp.risk],
                    fillOpacity: 0.95,
                  }}
                >
                  <Popup>
                    <strong>
                      Route {route.id + 1} · mi {cp.mile}
                    </strong>
                    <br />
                    Risk: {cp.risk}
                    <br />
                    Wind {cp.wind_mph} mph · Rain {cp.rain_in_hr} in/hr · Snow {cp.snow_in_hr}{" "}
                    in/hr
                    <br />
                    ETA: {new Date(cp.eta).toLocaleString()}
                  </Popup>
                  <Tooltip direction="top" offset={[0, -4]}>
                    {cp.risk} @ mi {cp.mile}
                  </Tooltip>
                </CircleMarker>
              )),
            )}

        {data && (
          <>
            <Marker position={[data.origin.lat, data.origin.lng]} icon={pinIcon("Origin")}>
              <Popup>
                <strong>Origin</strong>
                <br />
                {data.origin.name}
              </Popup>
            </Marker>
            <Marker position={[data.destination.lat, data.destination.lng]} icon={pinIcon("Dest")}>
              <Popup>
                <strong>Destination</strong>
                <br />
                {data.destination.name}
              </Popup>
            </Marker>
          </>
        )}

        <HeatLayer cells={heatCells} show={showHeat} />
      </MapContainer>

      <div className="heat-hud">
        <strong>{hour === 0 ? "Now" : `+${hour}h`}</strong>
        {heatLoading && !showHeat ? (
          <span>Loading corridor weather…</span>
        ) : showHeat ? (
          <>
            <span>{avgWind} mph wind</span>
            <span>{avgRain} in rain</span>
            <em>{maxRisk}</em>
          </>
        ) : (
          <span>Score a trip to load overlay</span>
        )}
      </div>

      <div className="map-legend">
        <span>Risk</span>
        {(Object.keys(RISK_COLORS) as (keyof typeof RISK_COLORS)[]).map((k) => (
          <span key={k} className="legend-item">
            <i style={{ background: RISK_COLORS[k] }} />
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}
