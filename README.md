# NavNiti — Smart City Operations Dashboard

A fully offline, local-first build of NavNiti. No cloud, no API keys, no
internet required — the whole stack runs on `localhost`.


- **Backend**: FastAPI + SQLite (single local file, `backend/navniti.db`)
- **Frontend**: React (Vite)
- **"AI" layer**: rule-based correlation engine, z-score anomaly detection,
  keyword complaint categorization + difflib-based deduplication — all
  offline, no external API calls
