"""
NavNiti data simulator — stands in for the real IoT Integration Layer
(traffic cameras, smart water meters, AQI monitors, sanitation trackers)
described in the pitch. Posts fake-but-plausible readings to the API on a
loop so the whole pipeline (pulse score, correlation engine, alerts) runs
live during a demo with zero internet dependency.

Run this in a second terminal AFTER the API is up:
    python simulator.py

DEMO_WARD_ID builds a scripted traffic -> AQI correlation over
SCENARIO_START_TICK ticks so you can reliably trigger the correlation
engine live on stage instead of hoping for a random spike.
"""
import random
import time
import requests

API = "http://localhost:8000"
DEMO_WARD_ID = 7           # the ward whose scenario you narrate in the demo
SCENARIO_START_TICK = 3    # scenario starts ramping after this many ticks
TICK_SECONDS = 6

BASELINES = {
    "traffic_congestion": (20, 45),   # normal random range
    "aqi": (60, 100),
    "water_pressure": (2.6, 3.4),
    "sanitation_backlog": (0, 3),
}

tick = 0


def post_reading(ward_id: int, metric_type: str, value: float):
    try:
        resp = requests.post(f"{API}/readings", json={
            "ward_id": ward_id, "metric_type": metric_type, "value": round(value, 2)
        }, timeout=5)
        alerts = resp.json().get("alerts_generated", [])
        for a in alerts:
            print(f"  !! ALERT ward {ward_id} [{a.get('severity','?')}] {metric_type}")
    except requests.exceptions.ConnectionError:
        print("Could not reach API — is `uvicorn main:app` running on port 8000?")
        raise SystemExit(1)


def normal_reading(metric_type: str) -> float:
    lo, hi = BASELINES[metric_type]
    return random.uniform(lo, hi)


def demo_ward_scenario(t: int):
    """
    Ramps traffic congestion up steadily starting at SCENARIO_START_TICK,
    with AQI following ~2 ticks later — a clean cause-then-effect sequence
    for the correlation engine to catch on camera.
    """
    ramp = max(0, t - SCENARIO_START_TICK)
    traffic = min(95, 35 + ramp * 8)
    aqi = min(220, 85 + max(0, ramp - 2) * 12)

    post_reading(DEMO_WARD_ID, "traffic_congestion", traffic)
    post_reading(DEMO_WARD_ID, "aqi", aqi)
    post_reading(DEMO_WARD_ID, "water_pressure", normal_reading("water_pressure"))
    post_reading(DEMO_WARD_ID, "sanitation_backlog", normal_reading("sanitation_backlog"))
    print(f"[t={t}] Ward {DEMO_WARD_ID} scenario -> traffic={traffic:.0f} aqi={aqi:.0f}")


def main():
    global tick
    print(f"NavNiti simulator started. Posting to {API} every {TICK_SECONDS}s.")
    print(f"Demo scenario ward: {DEMO_WARD_ID} (ramps after tick {SCENARIO_START_TICK})")
    wards = requests.get(f"{API}/wards", timeout=5).json()

    while True:
        for ward in wards:
            wid = ward["id"]
            if wid == DEMO_WARD_ID:
                demo_ward_scenario(tick)
            else:
                for metric_type in BASELINES:
                    post_reading(wid, metric_type, normal_reading(metric_type))
        tick += 1
        time.sleep(TICK_SECONDS)


if __name__ == "__main__":
    main()
