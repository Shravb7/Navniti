"""
NavNiti Intelligence Layer.

Deliberately rule-based, not a trained model. For a 24-hour offline build,
transparent thresholds beat a black-box model that might misfire on stage —
and "explainable by design" is a legitimate pitch point for a governance
tool, not just a shortcut. Swap in real ML post-hackathon once there's
labeled data to train on.
"""
import difflib
from datetime import datetime, timedelta
from statistics import mean, pstdev

from database import get_conn, METRICS

# ---------------------------------------------------------------------------
# City Pulse Score
# ---------------------------------------------------------------------------

def _normalize(metric_type: str, value: float) -> float:
    """Map a raw reading to a 0-100 'badness' score (0 = healthy)."""
    unit, baseline, higher_is_worse = METRICS[metric_type]
    if higher_is_worse:
        # e.g. traffic_congestion baseline 30 -> badness scales up past that
        badness = max(0.0, (value - baseline) / baseline * 100)
    else:
        # e.g. water_pressure baseline 3.0 bar -> badness rises as it drops
        badness = max(0.0, (baseline - value) / baseline * 100)
    return min(100.0, badness)


def compute_pulse_score(ward_id: int) -> dict:
    """
    Pulse score = 100 - weighted average badness across the latest reading
    of each metric for this ward. 100 = perfectly healthy ward.
    """
    weights = {
        "traffic_congestion": 0.3,
        "aqi": 0.3,
        "water_pressure": 0.2,
        "sanitation_backlog": 0.2,
    }
    latest = {}
    with get_conn() as conn:
        for metric_type in METRICS:
            row = conn.execute(
                """SELECT value FROM sensor_readings
                   WHERE ward_id = ? AND metric_type = ?
                   ORDER BY created_at DESC LIMIT 1""",
                (ward_id, metric_type),
            ).fetchone()
            if row:
                latest[metric_type] = row["value"]

    if not latest:
        return {"ward_id": ward_id, "score": None, "breakdown": {}}

    breakdown = {}
    weighted_badness = 0.0
    total_weight = 0.0
    for metric_type, value in latest.items():
        badness = _normalize(metric_type, value)
        breakdown[metric_type] = {"value": round(value, 2), "badness": round(badness, 1)}
        w = weights.get(metric_type, 0.25)
        weighted_badness += badness * w
        total_weight += w

    score = 100 - (weighted_badness / total_weight if total_weight else 0)
    return {"ward_id": ward_id, "score": round(max(0.0, min(100.0, score)), 1), "breakdown": breakdown}


# ---------------------------------------------------------------------------
# Anomaly detection (for predictive alerts, e.g. "pipe failure risk")
# ---------------------------------------------------------------------------

def detect_anomaly(ward_id: int, metric_type: str, lookback: int = 12, z_thresh: float = 2.8):
    """Flags the latest reading if it's a z-score outlier vs recent history."""
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT value FROM sensor_readings
               WHERE ward_id = ? AND metric_type = ?
               ORDER BY created_at DESC LIMIT ?""",
            (ward_id, metric_type, lookback),
        ).fetchall()

    values = [r["value"] for r in rows]
    if len(values) < 5:
        return None

    latest, history = values[0], values[1:]
    mu = mean(history)
    # Floor sigma relative to the metric's own scale so a run of identical
    # (or near-identical) historic values can't blow z up to a huge,
    # meaningless number — a flat history should read as "no signal", not
    # "infinite anomaly".
    sigma = max(pstdev(history), abs(mu) * 0.05, 0.5)
    z = (latest - mu) / sigma
    if abs(z) >= z_thresh:
        return {"ward_id": ward_id, "metric_type": metric_type, "value": latest, "z_score": round(z, 2)}
    return None


# ---------------------------------------------------------------------------
# Correlation engine — the pitch's headline feature
# ---------------------------------------------------------------------------

CORRELATION_RULES = [
    {
        "name": "traffic_driving_aqi",
        "cause": "traffic_congestion",
        "cause_threshold": 65,
        "effect": "aqi",
        "effect_threshold": 130,
        "window_minutes": 20,
        "message": "Severe traffic congestion is likely driving a localized AQI spike",
    },
    {
        "name": "pressure_drop_leak_risk",
        "cause": "water_pressure",
        "cause_threshold": 1.5,   # below this = suspicious
        "cause_below": True,
        "effect": None,
        "message": "Water pressure anomaly suggests possible pipe leak or failure risk",
    },
]


def _latest_value(conn, ward_id: int, metric_type: str):
    row = conn.execute(
        """SELECT value, created_at FROM sensor_readings
           WHERE ward_id = ? AND metric_type = ?
           ORDER BY created_at DESC LIMIT 1""",
        (ward_id, metric_type),
    ).fetchone()
    return row


def run_correlation_engine(ward_id: int) -> list[dict]:
    """
    Checks this ward's latest readings against the rule set and writes any
    new alerts. Returns the alerts generated on this pass (empty if none).
    Rules are intentionally few and hand-tuned so a demo can reliably
    trigger them live rather than hoping a random correlation appears.
    """
    generated = []
    with get_conn() as conn:
        for rule in CORRELATION_RULES:
            cause_row = _latest_value(conn, ward_id, rule["cause"])
            if not cause_row:
                continue

            cause_hit = (
                cause_row["value"] <= rule["cause_threshold"]
                if rule.get("cause_below")
                else cause_row["value"] >= rule["cause_threshold"]
            )
            if not cause_hit:
                continue

            if rule["effect"]:
                effect_row = _latest_value(conn, ward_id, rule["effect"])
                if not effect_row or effect_row["value"] < rule["effect_threshold"]:
                    continue
                severity = "high"
            else:
                severity = "medium"

            # avoid spamming duplicate alerts within a short window
            recent = conn.execute(
                """SELECT id FROM alerts WHERE ward_id = ? AND alert_type = ?
                   AND created_at >= datetime('now', '-10 minutes')""",
                (ward_id, rule["name"]),
            ).fetchone()
            if recent:
                continue

            cur = conn.execute(
                """INSERT INTO alerts (ward_id, alert_type, severity, message)
                   VALUES (?, ?, ?, ?)""",
                (ward_id, rule["name"], severity, rule["message"]),
            )
            conn.commit()
            generated.append({
                "id": cur.lastrowid,
                "ward_id": ward_id,
                "alert_type": rule["name"],
                "severity": severity,
                "message": rule["message"],
            })
    return generated


# ---------------------------------------------------------------------------
# Complaint categorization + deduplication
# ---------------------------------------------------------------------------

CATEGORY_KEYWORDS = {
    "roads": ["pothole", "road", "street damage", "footpath", "speed breaker"],
    "sanitation": ["garbage", "trash", "waste", "drain", "sewage", "dirty"],
    "water": ["water supply", "leak", "pipe", "no water", "pressure", "contamina"],
    "electricity": ["streetlight", "power cut", "electric", "transformer", "wire"],
    "air_quality": ["smoke", "air quality", "pollution", "dust", "burning"],
    "traffic": ["traffic", "signal", "congestion", "parking", "jam"],
}


def categorize_complaint(text: str) -> str:
    lowered = text.lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in lowered for kw in keywords):
            return category
    return "general"


def find_duplicate(ward_id: int, text: str, threshold: float = 0.75):
    """
    Offline similarity check using difflib (no embeddings / no API call
    needed). Good enough to catch near-identical repeat reports from the
    same ward, which is the realistic duplicate pattern for this data.
    """
    with get_conn() as conn:
        open_complaints = conn.execute(
            """SELECT id, text FROM complaints
               WHERE ward_id = ? AND status = 'open' AND is_duplicate_of IS NULL
               ORDER BY created_at DESC LIMIT 50""",
            (ward_id,),
        ).fetchall()

    for row in open_complaints:
        ratio = difflib.SequenceMatcher(None, text.lower(), row["text"].lower()).ratio()
        if ratio >= threshold:
            return row["id"]
    return None
