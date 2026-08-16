"""
NavNiti database layer.

Everything is a single local SQLite file (navniti.db) sitting next to this
script. No network calls, no cloud DB — this is the offline "Integration
Layer" described in the pitch deck. In the real product this would be
swapped for Supabase/Postgres fed by real IoT adapters; for the hackathon
build, the simulator plays that role.
"""
import sqlite3
from pathlib import Path
from contextlib import contextmanager

DB_PATH = Path(__file__).parent / "navniti.db"

WARDS = [
    (1, "Ward 1 - Civil Lines"),
    (2, "Ward 2 - Sadar"),
    (3, "Ward 3 - Dharampeth"),
    (4, "Ward 4 - Sitabuldi"),
    (5, "Ward 5 - Ramdaspeth"),
    (6, "Ward 6 - Wardhaman Nagar"),
    (7, "Ward 7 - Trimurti Nagar"),
    (8, "Ward 8 - Manish Nagar"),
]

# metric_type -> (unit, "healthy" baseline, higher_is_worse)
METRICS = {
    "traffic_congestion": ("index 0-100", 30, True),
    "aqi": ("AQI", 80, True),
    "water_pressure": ("bar", 3.0, False),   # lower pressure = worse
    "sanitation_backlog": ("hrs overdue", 2, True),
}


def init_db(reset: bool = False):
    if reset and DB_PATH.exists():
        DB_PATH.unlink()

    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS wards (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sensor_readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ward_id INTEGER NOT NULL,
                metric_type TEXT NOT NULL,
                value REAL NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (ward_id) REFERENCES wards(id)
            );

            CREATE INDEX IF NOT EXISTS idx_readings_ward_metric_time
                ON sensor_readings (ward_id, metric_type, created_at);

            CREATE TABLE IF NOT EXISTS complaints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ward_id INTEGER NOT NULL,
                category TEXT NOT NULL,
                text TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'open',
                is_duplicate_of INTEGER,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (ward_id) REFERENCES wards(id)
            );

            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ward_id INTEGER NOT NULL,
                alert_type TEXT NOT NULL,
                severity TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (ward_id) REFERENCES wards(id)
            );
            """
        )
        conn.executemany(
            "INSERT OR IGNORE INTO wards (id, name) VALUES (?, ?)", WARDS
        )
        conn.commit()


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
    finally:
        conn.close()


if __name__ == "__main__":
    init_db(reset=True)
    print(f"Initialized {DB_PATH}")
