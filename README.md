# Spotter Corridor — Weather-Aware Truck Routing

React + Django app for the Spotter AI full-stack assessment. A driver enters origin, destination, departure time, and load weight. The API scores up to **three driving corridors** with weather at each checkpoint ETA and the specified **load rules**, then recommends the safest practical route.

## Hosted

| Piece | URL |
| --- | --- |
| **Live app (Vercel)** | https://spotter-ai-project.vercel.app |
| **API (Render)** | https://spotterai-project.onrender.com |
| **Health** | https://spotterai-project.onrender.com/api/health/ |
| **GitHub** | https://github.com/AaminaBokhari/spotterAI-project |

Frontend env: `VITE_API_URL=https://spotterai-project.onrender.com`  
Backend env: `CORS_ALLOWED_ORIGINS=https://spotter-ai-project.vercel.app`

Render’s free web service **sleeps when idle**. Wake it (open `/api/health/`) before a demo; the first analyze can take 30–60 seconds.

## What it does

1. Geocodes origin and destination (Open-Meteo geocoder, then Photon / Nominatim; common US cities are cached).
2. Asks **OSRM** for driving alternatives (`alternatives=3`).
3. If OSRM returns fewer than 3, adds another corridor with a **via-waypoint** offset from the origin–destination line.
4. Samples checkpoints every **10 / 25 / 50 miles** (auto by trip length, or manual).
5. Looks up **Open-Meteo** (MET Norway fallback) at each checkpoint **ETA**.
6. Classifies risk (wind / rain / snow, then load overrides).
7. Recommends a route: fewest no-travel + severe miles, then high miles, then average risk, then shortest time.
8. Map + checkpoint table + **0–48h corridor heatmap**.
9. Optional **Demo: High / Severe wind** — clearly labeled. Live forecast stays as-is; this overlay sets 28 / 40 / 50 mph on routes 1–3 so reviewers can see Moderate / Severe / No Travel and the recommendation change.

## Local setup

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

API: `http://127.0.0.1:8000/api/`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App: `http://127.0.0.1:5173` (Vite proxies `/api` to Django)

### Tests

```bash
cd backend
python manage.py test routing
```

## Risk rules

Weather band is the **worst** of wind, rain, and snow. Then load overrides:

| Wind | Load | Result |
| --- | --- | --- |
| ≥ 55 mph | any | **No Travel** |
| 45–54 mph | > 30,000 lb | **No Travel** |
| 35–44 mph | > 40,000 lb | at least **Severe** |
| &lt; 25 / 25–34 / 35–44 / 45–54 mph | (wind-only) | Low / Moderate / High / Severe |

Rain (in/hr): &lt;0.10 Low, &lt;0.25 Moderate, &lt;0.50 High, &lt;1.00 Severe, else No Travel.  
Snow (in/hr): &lt;0.5 Low, &lt;1.0 Moderate, &lt;2.0 High, &lt;3.0 Severe, else No Travel.

Calm days (11–15 mph) stay **Low** even at 41,000 lb. That is correct. Use **Demo: High / Severe wind** to show the load table.

## Recommendation order

1. Fewest severe + no-travel miles  
2. Fewest high miles  
3. Lowest average risk  
4. Shortest duration  

## API

`POST /api/analyze/`

```json
{
  "origin": "Chicago, IL",
  "destination": "Detroit, MI",
  "departure_time": "2026-11-03T14:00:00.000Z",
  "weight_lb": 41000,
  "interval_miles": 25,
  "demo_weather": false
}
```

`demo_weather: true` applies the labeled high-wind overlay after live weather.

`POST /api/heatmap/` — corridor cells for a forecast hour (0–48).  
`GET /api/health/` — `{ "status": "ok" }`.

## Loom

Record **5–10 minutes on the live Vercel URL** (not localhost). Wake Render first. Show three scored routes, the demo wind button (recommendation changes), a checkpoint, and the 0–48h slider.
