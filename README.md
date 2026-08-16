# NavNiti — Smart City Operations Dashboard

A fully offline, local-first build of NavNiti. No cloud, no API keys, no
internet required — the whole stack runs on `localhost`.

## Stack

- **Backend**: FastAPI + SQLite (single local file, `backend/navniti.db`)
- **Frontend**: React (Vite)
- **"AI" layer**: rule-based correlation engine, z-score anomaly detection,
  keyword complaint categorization + difflib-based deduplication — all
  offline, no external API calls

## First-time setup

You need Python 3.10+ and Node 18+ installed.

```bash
# 1. Backend
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python3 database.py             # creates and seeds navniti.db

# 2. Frontend (separate terminal)
cd frontend
npm install
```

## Running it (3 terminals)

**Terminal 1 — API:**
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```
Swagger docs: http://localhost:8000/docs

**Terminal 2 — Simulator** (fakes the IoT integration layer):
```bash
cd backend
source venv/bin/activate
python3 simulator.py
```
This posts fake sensor readings every 6 seconds and scripts a
traffic-driving-AQI scenario in Ward 7 so the correlation engine has
something reliable to catch on stage. Edit `DEMO_WARD_ID` and
`SCENARIO_START_TICK` in `simulator.py` to point at a different ward or
change timing.

**Terminal 3 — Frontend:**
```bash
cd frontend
npm run dev
```
Open the printed localhost URL (usually http://localhost:5173).

## Demo script

1. Open the dashboard — all wards start near 100 (healthy, teal).
2. Let the simulator run. Around tick 3-4, Ward 7's traffic congestion
   starts climbing.
3. A few ticks later, AQI in Ward 7 follows — narrate this as "watch how
   traffic congestion is about to drive up air quality readings in this
   ward."
4. The correlation engine fires a **high severity** alert:
   *"Severe traffic congestion is likely driving a localized AQI spike"* —
   this is the headline "AI correlation" feature from the pitch.
5. Submit a complaint through the panel (e.g. "pothole on MG road near the
   market"), then submit a near-identical one — show it getting flagged as
   a duplicate automatically.
6. If you want a clean restart before a re-run: stop the simulator, delete
   `backend/navniti.db`, run `python3 database.py` again, restart both.

## What's simulated vs. real (be upfront about this in Q&A)

| Component | This build | Production |
|---|---|---|
| Sensor data | `simulator.py` posts synthetic readings | Real traffic cams, AQI monitors, smart water meters |
| Database | Local SQLite file | Supabase/Postgres |
| Correlation engine | Hand-tuned threshold rules | Same rules, expandable to a trained model once real historical data exists |
| Complaint dedup | difflib text similarity | Same approach scales fine; could add embeddings later |
| Deployment | `localhost` only | AWS (matches the stack in the original pitch) |

Being explicit about this split is a strength, not a weakness — it shows
you understand the difference between a working prototype and vaporware.

## Project structure

```
navniti/
├── backend/
│   ├── main.py          # FastAPI app, all endpoints
│   ├── database.py      # SQLite schema + ward seed data
│   ├── engine.py         # pulse score, correlation engine, complaint logic
│   ├── simulator.py      # fake IoT data generator with scripted demo scenario
│   └── requirements.txt
└── frontend/
    └── src/
        ├── App.jsx        # dashboard: ward grid, alerts, complaint form
        ├── App.css
        └── api.js         # fetch helpers hitting localhost:8000
```

## Extending it (if you have more time before submission)

- Add a `/pulse/history` endpoint + small line chart per ward (recharts is
  already demo-friendly and works offline once installed).
- Add a ward detail view when a card is clicked.
- Add more correlation rules to `CORRELATION_RULES` in `engine.py` —
  keep them few and reliable rather than many and flaky for a live demo.
