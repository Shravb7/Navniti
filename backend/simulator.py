import time
import random
import requests

API_URL = "http://localhost:8000/api"
TICK_INTERVAL = 4  # seconds between ticks

# Base normal ranges for normal readings
NORMAL_RANGES = {
    "traffic": {
        "vehicle_count": (100, 300),
        "congestion_percentage": (20.0, 50.0),
        "average_speed": (35.0, 55.0),
    },
    "water": {
        "pressure": (75.0, 85.0),
        "flow_rate": (18.0, 22.0),
        "consumption": (15.0, 22.0),
    },
    "air_quality": {
        "aqi": (50.0, 110.0),
        "pm25": (15.0, 35.0),
        "pm10": (30.0, 70.0),
    },
    "sanitation": {
        "garbage_fill_percentage": (20.0, 60.0),
        "collection_status": ["pending", "completed"],
    }
}

# Track which demo scenarios have had their complaints submitted
submitted_complaints = set()


def get_active_scenario():
    """Fetch current active demo scenario from the backend."""
    try:
        resp = requests.get(f"{API_URL}/demo/scenario", timeout=2)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("scenario", "normal"), data.get("elapsed_ticks", 0)
    except Exception:
        pass
    return "normal", 0


def post_reading(endpoint, payload):
    """Post simulated reading to the backend."""
    try:
        resp = requests.post(f"{API_URL}/{endpoint}", json=payload, timeout=2)
        return resp.status_code == 200 or resp.status_code == 201
    except Exception as e:
        print(f"Failed to post to {endpoint}: {e}")
        return False


def post_complaint(ward_id, text):
    """Submit complaint to backend for simulation."""
    try:
        resp = requests.post(f"{API_URL}/complaints", json={"ward_id": ward_id, "text": text}, timeout=2)
        if resp.status_code in [200, 201]:
            print(f"  [Complaint Submitted] Ward {ward_id}: \"{text[:40]}...\" -> {resp.json().get('category')}")
            return True
    except Exception as e:
        print(f"Failed to submit complaint: {e}")
    return False


def submit_scenario_complaints(scenario):
    """Submit appropriate complaints for specific incidents only once."""
    if scenario in submitted_complaints:
        return

    print(f"\n>>> Injecting citizen complaints for scenario: {scenario} <<<")
    if scenario == "traffic-aqi":
        # Ward 7 traffic + AQI complaints
        post_complaint(7, "Traffic is at a standstill near Trimurti Nagar square. The exhaust smoke is making it hard to breathe.")
        time.sleep(0.5)
        post_complaint(7, "Huge gridlock on the main double road. Cars have been stuck for 30 minutes, lots of pollution.")
        time.sleep(0.5)
        post_complaint(7, "There is terrible traffic near the school in Ward 7 and lots of black smoke from buses.")
    elif scenario == "water-pipeline":
        # Ward 4 water pipeline leaks/pressure drops
        post_complaint(4, "Water pressure is extremely low in Sitabuldi since morning, please check.")
        time.sleep(0.5)
        post_complaint(4, "We are getting barely any water flow in our taps today in Ward 4.")
        time.sleep(0.5)
        post_complaint(4, "Water supply has suddenly stopped completely since morning. No water in our area.")
    elif scenario == "sanitation":
        # Ward 2 sanitation backlog
        post_complaint(2, "Garbage bin near Sadar market is overflowing and smells terrible. It hasn't been cleared for days.")
        time.sleep(0.5)
        post_complaint(2, "There is garbage piling up near the bus stop in Ward 2 and it has been there for three days.")

    submitted_complaints.add(scenario)


def simulate_ward_data(ward_id, scenario, elapsed_ticks):
    """Generate metrics for a single ward based on the active scenario and timeline."""
    
    # 1. Traffic Reading
    if scenario == "traffic-aqi" and ward_id == 7:
        # Ramp up congestion, slow down speeds
        ramp = min(1.0, elapsed_ticks / 5.0)  # ramp up over 5 ticks
        congestion = 50.0 + (ramp * 40.0) + random.uniform(-2, 2)  # up to ~90%
        speed = 40.0 - (ramp * 32.0) + random.uniform(-2, 2)       # down to ~8 km/h
        vehicle_count = int(250 + (ramp * 450) + random.randint(-15, 15))  # up to ~700
    else:
        # Normal traffic
        congestion = random.uniform(*NORMAL_RANGES["traffic"]["congestion_percentage"])
        speed = random.uniform(*NORMAL_RANGES["traffic"]["average_speed"])
        vehicle_count = random.randint(*NORMAL_RANGES["traffic"]["vehicle_count"])

    post_reading("traffic", {
        "ward_id": ward_id,
        "vehicle_count": vehicle_count,
        "congestion_percentage": round(congestion, 2),
        "average_speed": round(speed, 2)
    })

    # 2. Water Reading
    if scenario == "water-pipeline" and ward_id == 4:
        # Pressure drops, flow rate spikes (leakage), consumption drops
        ramp = min(1.0, elapsed_ticks / 5.0)
        pressure = 80.0 - (ramp * 42.0) + random.uniform(-2, 2)  # drops from 80 to ~38 PSI
        flow_rate = 20.0 + (ramp * 25.0) + random.uniform(-1, 1) # leaks flow: spikes from 20 to ~45 L/s
        consumption = 18.0 - (ramp * 8.0) + random.uniform(-1, 1) # drops from 18 to ~10 L/s
    else:
        # Normal water
        pressure = random.uniform(*NORMAL_RANGES["water"]["pressure"])
        flow_rate = random.uniform(*NORMAL_RANGES["water"]["flow_rate"])
        consumption = random.uniform(*NORMAL_RANGES["water"]["consumption"])

    post_reading("water", {
        "ward_id": ward_id,
        "pressure": round(pressure, 2),
        "flow_rate": round(flow_rate, 2),
        "consumption": round(consumption, 2)
    })

    # 3. Air Quality Reading
    if scenario == "traffic-aqi" and ward_id == 7:
        # AQI spikes (delayed slightly behind traffic)
        # Ramps up after tick 2
        delay_ticks = max(0, elapsed_ticks - 2)
        ramp = min(1.0, delay_ticks / 5.0)
        aqi = 90.0 + (ramp * 140.0) + random.uniform(-5, 5)   # up to ~230
        pm25 = 28.0 + (ramp * 57.0) + random.uniform(-2, 2)   # up to ~85
        pm10 = 55.0 + (ramp * 105.0) + random.uniform(-4, 4)  # up to ~160
    else:
        # Normal AQI
        aqi = random.uniform(*NORMAL_RANGES["air_quality"]["aqi"])
        pm25 = random.uniform(*NORMAL_RANGES["air_quality"]["pm25"])
        pm10 = random.uniform(*NORMAL_RANGES["air_quality"]["pm10"])

    post_reading("air-quality", {
        "ward_id": ward_id,
        "aqi": round(aqi, 2),
        "pm25": round(pm25, 2),
        "pm10": round(pm10, 2)
    })

    # 4. Sanitation Reading
    if scenario == "sanitation" and ward_id == 2:
        # Fill percentage rises to maximum
        ramp = min(1.0, elapsed_ticks / 5.0)
        fill = 40.0 + (ramp * 55.0) + random.uniform(-1, 1)  # up to ~95%
        status = "pending"
    else:
        # Normal sanitation
        fill = random.uniform(*NORMAL_RANGES["sanitation"]["garbage_fill_percentage"])
        status = random.choice(NORMAL_RANGES["sanitation"]["collection_status"])

    post_reading("sanitation", {
        "ward_id": ward_id,
        "garbage_fill_percentage": round(fill, 2),
        "collection_status": status
    })


def main():
    global submitted_complaints
    print("NavNiti Data Simulator initialized.")
    print(f"Connecting to backend at: {API_URL}")
    
    # Wait for API to be available
    retries = 5
    wards = []
    while retries > 0:
        try:
            resp = requests.get(f"{API_URL}/wards", timeout=2)
            if resp.status_code == 200:
                wards = resp.json()
                print(f"Connected to API. Seeding sensor data for {len(wards)} wards.")
                break
        except Exception:
            print("Waiting for backend API to start...")
            time.sleep(2)
            retries -= 1

    if not wards:
        print("Could not connect to API. Exiting.")
        return

    # Main simulation loop
    tick = 0
    last_scenario = "normal"
    
    while True:
        scenario, elapsed_ticks = get_active_scenario()
        
        # Reset submitted complaints flag if we go back to normal or switch
        if scenario != last_scenario:
            print(f"\nScenario changed: {last_scenario} -> {scenario}")
            if scenario == "normal":
                submitted_complaints.clear()
            last_scenario = scenario

        # Submit complaints for active incidents
        if scenario != "normal":
            submit_scenario_complaints(scenario)

        # Print current tick state
        print(f"[Tick {tick}] Active Scenario: {scenario.upper()} (Elapsed Ticks: {elapsed_ticks})")

        # Simulate data for all wards
        for w in wards:
            simulate_ward_data(w["id"], scenario, elapsed_ticks)
            
        tick += 1
        time.sleep(TICK_INTERVAL)


if __name__ == "__main__":
    main()
