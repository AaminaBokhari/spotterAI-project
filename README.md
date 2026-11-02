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

## Deploy (hosted URL)

### Backend — Render
1. Sign up at https://render.com with GitHub.
2. **New → Web Service** → this repo.
3. Root directory: `backend`
4. Build: `pip install -r requirements.txt && python manage.py migrate`
5. Start: `gunicorn config.wsgi:application`
6. Environment:
   - `DJANGO_SECRET_KEY` = any long random string
   - `DJANGO_DEBUG` = `false`
   - `DJANGO_ALLOWED_HOSTS` = `.onrender.com`
   - `CORS_ALLOWED_ORIGINS` = your Vercel URL (add after frontend is live), e.g. `https://spotter-corridor.vercel.app`

API health: `https://YOUR-SERVICE.onrender.com/api/health/`

### Frontend — Vercel
1. Sign up at https://vercel.com with GitHub.
2. **Add New → Project** → this repo.
3. Root directory: `frontend`
4. Framework: Vite
5. Environment: `VITE_API_URL` = `https://YOUR-SERVICE.onrender.com` (no trailing slash)
6. Deploy, then put the Vercel URL into Render `CORS_ALLOWED_ORIGINS` and **Manual Deploy** the API once.

Free Render apps sleep after idle; the first Analyze can take ~30–60s to wake.

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
