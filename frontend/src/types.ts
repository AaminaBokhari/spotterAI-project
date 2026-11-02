export type RiskLevel = "Low" | "Moderate" | "High" | "Severe" | "No Travel";

export interface Checkpoint {
  mile: number;
  lat: number;
  lng: number;
  eta: string;
  segment_miles: number;
  wind_mph: number;
  rain_in_hr: number;
  snow_in_hr: number;
  forecast_time: string | null;
  wind_risk: RiskLevel;
  rain_risk: RiskLevel;
  snow_risk: RiskLevel;
  risk: RiskLevel;
  risk_score: number;
}

export interface RouteSummary {
  miles_by_risk: Record<string, number>;
  severe_miles: number;
  high_miles: number;
  no_travel_miles: number;
  avg_risk: number;
  max_risk: RiskLevel;
}

export interface RouteOption {
  id: number;
  distance_miles: number;
  duration_hours: number;
  coordinates: [number, number][];
  checkpoints: Checkpoint[];
  summary: RouteSummary;
  interval_miles: number;
}

export interface Place {
  name: string;
  lat: number;
  lng: number;
}

export interface AnalyzeResponse {
  origin: Place;
  destination: Place;
  weight_lb: number;
  departure_time: string;
  routes: RouteOption[];
  recommendation: { route_id: number; reason: string } | null;
}

export interface HeatCell {
  lat: number;
  lng: number;
  intensity: number;
  risk: RiskLevel;
  wind_mph: number;
  rain_in_hr: number;
  snow_in_hr: number;
  forecast_time: string | null;
}

export interface HeatmapResponse {
  hour_offset: number;
  bounds: {
    min_lat: number;
    max_lat: number;
    min_lng: number;
    max_lng: number;
  };
  cells: HeatCell[];
  hours?: Record<string, HeatCell[]>;
  legend: string[];
}

export interface AnalyzeRequest {
  origin: string;
  destination: string;
  departure_time: string;
  weight_lb: number;
  interval_miles?: number | null;
}
