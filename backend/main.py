"""
NavNiti API — runs entirely on localhost, no external calls.

    uvicorn main:app --reload --port 8000

Swagger docs at http://localhost:8000/docs
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import init_db, get_conn, WARDS, METRICS
from engine import (
    compute_pulse_score,
    run_correlation_engine,
    detect_anomaly,
    categorize_complaint,
    find_duplicate,
)

app = FastAPI(title="NavNiti API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # local hackathon build — tighten before any real deploy
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()


# ---------------------------------------------------------------------------
# Wards + Pulse Scores
# ---------------------------------------------------------------------------

@app.get("/wards")
def list_wards():
    return [{"id": w[0], "name": w[1]} for w in WARDS]


@app.get("/wards/{ward_id}/pulse")
def ward_pulse(ward_id: int):
    result = compute_pulse_score(ward_id)
    if result["score"] is None:
        raise HTTPException(404, "No sensor data yet for this ward — is the simulator running?")
    return result


@app.get("/pulse")
def all_pulse():
    """Pulse score for every ward — what the dashboard grid polls."""
    return [compute_pulse_score(w[0]) for w in WARDS]


# ---------------------------------------------------------------------------
# Sensor readings (called by the simulator; also usable for manual testing)
# ---------------------------------------------------------------------------

class ReadingIn(BaseModel):
    ward_id: int
    metric_type: str
    value: float


@app.post("/readings")
def add_reading(reading: ReadingIn):
    if reading.metric_type not in METRICS:
        raise HTTPException(400, f"Unknown metric_type. Valid: {list(METRICS)}")
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO sensor_readings (ward_id, metric_type, value) VALUES (?, ?, ?)",
            (reading.ward_id, reading.metric_type, reading.value),
        )
        conn.commit()

    # every new reading is a chance for the correlation engine to fire
    alerts = run_correlation_engine(reading.ward_id)
    anomaly = detect_anomaly(reading.ward_id, reading.metric_type)
    if anomaly and not alerts:
        alert_type = f"anomaly_{reading.metric_type}"
        with get_conn() as conn:
            # cooldown: don't re-flag the same ward+metric anomaly repeatedly
            recent = conn.execute(
                """SELECT id FROM alerts WHERE ward_id = ? AND alert_type = ?
                   AND created_at >= datetime('now', '-10 minutes')""",
                (reading.ward_id, alert_type),
            ).fetchone()
            if not recent:
                cur = conn.execute(
                    """INSERT INTO alerts (ward_id, alert_type, severity, message)
                       VALUES (?, ?, 'medium', ?)""",
                    (reading.ward_id, alert_type,
                     f"Unusual {reading.metric_type.replace('_', ' ')} reading detected "
                     f"(z={anomaly['z_score']}) — possible early warning"),
                )
                conn.commit()
                alerts.append({"id": cur.lastrowid, "ward_id": reading.ward_id,
                                "alert_type": alert_type, "severity": "medium"})
    return {"stored": True, "alerts_generated": alerts}


@app.get("/wards/{ward_id}/readings/{metric_type}")
def get_readings(ward_id: int, metric_type: str, limit: int = 30):
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT value, created_at FROM sensor_readings
               WHERE ward_id = ? AND metric_type = ?
               ORDER BY created_at DESC LIMIT ?""",
            (ward_id, metric_type, limit),
        ).fetchall()
    return [dict(r) for r in rows][::-1]


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------

@app.get("/alerts")
def list_alerts(limit: int = 20):
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT alerts.*, wards.name AS ward_name FROM alerts
               JOIN wards ON wards.id = alerts.ward_id
               ORDER BY alerts.created_at DESC LIMIT ?""",
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Complaints
# ---------------------------------------------------------------------------

class ComplaintIn(BaseModel):
    ward_id: int
    text: str


@app.post("/complaints")
def submit_complaint(complaint: ComplaintIn):
    category = categorize_complaint(complaint.text)
    duplicate_of = find_duplicate(complaint.ward_id, complaint.text)

    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO complaints (ward_id, category, text, status, is_duplicate_of)
               VALUES (?, ?, ?, ?, ?)""",
            (complaint.ward_id, category, complaint.text,
             "duplicate" if duplicate_of else "open", duplicate_of),
        )
        conn.commit()
        new_id = cur.lastrowid

    return {
        "id": new_id,
        "category": category,
        "is_duplicate": duplicate_of is not None,
        "duplicate_of": duplicate_of,
    }


@app.get("/complaints")
def list_complaints(ward_id: int | None = None, limit: int = 50):
    query = """SELECT complaints.*, wards.name AS ward_name FROM complaints
               JOIN wards ON wards.id = complaints.ward_id"""
    params = []
    if ward_id is not None:
        query += " WHERE complaints.ward_id = ?"
        params.append(ward_id)
    query += " ORDER BY complaints.created_at DESC LIMIT ?"
    params.append(limit)

    with get_conn() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]
