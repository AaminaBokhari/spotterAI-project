# Corridor — Weather-Aware Truck Routing

React + Django app that helps truck drivers pick the safest route by combining **OSRM alternatives**, **Open-Meteo hourly weather**, and **load-aware risk rules**.

## What it does

1. Geocodes origin & destination (Nominatim)
2. Fetches up to **3 driving alternatives** (OSRM)
3. Samples checkpoints every **10 / 25 / 50 miles** (auto or manual)
4. Looks up weather at each checkpoint’s **ETA**
5. Classifies risk with the assignment wind / rain / snow tables + load overrides
6. Recommends a route by: fewest No-Travel → Severe → High miles → lowest average risk → shortest time
7. Shows routes, checkpoints, ETAs, and a **0–48h corridor weather heatmap**

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React + TypeScript + Vite + Leaflet |
| Backend | Django + Django REST Framework |
| Routing | [OSRM](https://project-osrm.org/) public API |
| Geocoding | [Nominatim](https://nominatim.openstreetmap.org/) |
| Weather | [Open-Meteo](https://open-meteo.com/) (no API key) |

## Quick start (local)

### Backend

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
# source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env   # or cp .env.example .env
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

App: `http://127.0.0.1:5173` (Vite proxies `/api` → Django)

### Tests

```bash
cd backend
python manage.py test routing
```

## API

### `POST /api/analyze/`

```json
{
  "origin": "Chicago, IL",
  "destination": "Detroit, MI",
  "departure_time": "2026-11-03T14:00:00.000Z",
  "weight_lb": 35000,
  "interval_miles": 25
}
```

`interval_miles` is optional (`10`, `25`, `50`). Omit for auto.

### `POST /api/heatmap/`

```json
{
  "weight_lb": 35000,
  "hour_offset": 6,
  "grid": 12,
  "routes": [{ "coordinates": [[-87.6, 41.8], [-83.0, 42.3]] }]
}
```

## Risk rules

**Weather bands** (worst of wind / rain / snow wins), then **load overrides**:

- ≥55 mph → **No Travel** (any load)
- 45–54 mph + load > 30,000 lb → **No Travel**
- 35–44 mph + load > 40,000 lb → at least **Severe**

## Deploy notes

1. **Backend**: Render / Railway / Fly — run Gunicorn (`gunicorn config.wsgi`), set `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=false`, `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`.
2. **Frontend**: Netlify / Vercel / Cloudflare Pages — set `VITE_API_BASE` to the backend origin, then `npm run build`.
3. Public OSRM / Nominatim are rate-limited; for production traffic use self-hosted or commercial endpoints.

## Loom walkthrough

Record a 5–10 minute video covering:

1. Enter trip inputs and run analysis
2. Explain three routes + recommendation order
3. Inspect checkpoint weather / risk on the map
4. Drag the 0–48h heatmap slider

## Project layout

```
backend/           Django API (routing app + services)
frontend/          React UI (map, heatmap, panels)
README.md
```
