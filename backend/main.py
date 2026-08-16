import os
import json
import asyncio
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import desc, delete

from database import (
    init_db,
    get_db,
    Ward,
    TrafficReading,
    WaterReading,
    AirQualityReading,
    SanitationReading,
    CitizenComplaint,
    Alert,
)
from engine import (
    calculate_pulse_for_ward,
    detect_zscore_anomaly,
    detect_isolation_forest_anomaly,
    classify_complaint_gemini,
    find_complaint_duplicate,
    run_correlation_checks,
)

app = FastAPI(
    title="NavNiti API",
    description="The AI-Powered Digital Nervous System Command Center API",
    version="1.0.0"
)

# Allow CORS for React local dev environment
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Scenario State
ACTIVE_SCENARIO = "normal"
SCENARIO_START_TIME = datetime.utcnow()


@app.on_event("startup")
def startup_event():
    """Initialize database and seed wards on startup."""
    init_db()


# ---------------------------------------------------------------------------
# WebSocket Broadcast Manager
# ---------------------------------------------------------------------------

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"WebSocket client connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            print(f"WebSocket client disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, message: Dict[str, Any]):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        
        # Clean up stale connections
        for conn in disconnected:
            self.disconnect(conn)

ws_manager = ConnectionManager()


@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        # Keep connection open
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        ws_manager.disconnect(websocket)


# ---------------------------------------------------------------------------
# Demo Scenario Control Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/demo/scenario")
def get_scenario():
    """Retrieve currently active scenario and tick timeline."""
    global ACTIVE_SCENARIO, SCENARIO_START_TIME
    elapsed = (datetime.utcnow() - SCENARIO_START_TIME).total_seconds()
    # Estimate elapsed ticks (4 seconds per tick)
    ticks = int(elapsed / 4)
    return {
        "scenario": ACTIVE_SCENARIO,
        "elapsed_seconds": int(elapsed),
        "elapsed_ticks": ticks
    }


async def clear_live_data(db: Session):
    """Resets transactional data for clean demo presentation."""
    try:
        db.query(TrafficReading).delete()
        db.query(WaterReading).delete()
        db.query(AirQualityReading).delete()
        db.query(SanitationReading).delete()
        db.query(CitizenComplaint).delete()
        db.query(Alert).delete()
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error resetting demo database: {e}")


@app.post("/api/demo/scenario/{scenario_name}")
async def trigger_scenario(scenario_name: str, db: Session = Depends(get_db)):
    """Triggers specific demo incident states (normal, traffic-aqi, water-pipeline, sanitation)."""
    global ACTIVE_SCENARIO, SCENARIO_START_TIME
    
    valid_scenarios = ["normal", "traffic-aqi", "water-pipeline", "sanitation"]
    if scenario_name not in valid_scenarios:
        raise HTTPException(status_code=400, detail="Invalid scenario name")
        
    ACTIVE_SCENARIO = scenario_name
    SCENARIO_START_TIME = datetime.utcnow()
    
    # Clean historical readings and alerts so dashboard updates dynamically in real time
    await clear_live_data(db)
    
    # Broadcast scenario change to frontend
    await ws_manager.broadcast({
        "type": "SCENARIO_CHANGED",
        "data": {
            "scenario": ACTIVE_SCENARIO,
            "timestamp": datetime.utcnow().isoformat()
        }
    })
    return {"status": "success", "active_scenario": ACTIVE_SCENARIO}


# Legacy trigger routes mapped to primary endpoint
@app.post("/api/demo/traffic-aqi")
async def trigger_traffic_aqi(db: Session = Depends(get_db)):
    return await trigger_scenario("traffic-aqi", db)


@app.post("/api/demo/water-pipeline")
async def trigger_water_pipeline(db: Session = Depends(get_db)):
    return await trigger_scenario("water-pipeline", db)


@app.post("/api/demo/sanitation")
async def trigger_sanitation(db: Session = Depends(get_db)):
    return await trigger_scenario("sanitation", db)


@app.post("/api/demo/normal")
async def trigger_normal(db: Session = Depends(get_db)):
    return await trigger_scenario("normal", db)


# ---------------------------------------------------------------------------
# Wards API
# ---------------------------------------------------------------------------

@app.get("/api/wards", response_model=List[Dict[str, Any]])
def list_wards(db: Session = Depends(get_db)):
    wards = db.query(Ward).order_by(Ward.id).all()
    return [
        {
            "id": w.id,
            "name": w.name,
            "latitude": w.latitude,
            "longitude": w.longitude,
            "population": w.population,
            "baseline_pulse_score": w.baseline_pulse_score
        }
        for w in wards
    ]


@app.get("/api/wards/{ward_id}")
def get_ward(ward_id: int, db: Session = Depends(get_db)):
    ward = db.query(Ward).filter(Ward.id == ward_id).first()
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")
    
    pulse = calculate_pulse_for_ward(db, ward_id)
    return {
        "id": ward.id,
        "name": ward.name,
        "latitude": ward.latitude,
        "longitude": ward.longitude,
        "population": ward.population,
        "baseline_pulse_score": ward.baseline_pulse_score,
        "pulse": pulse
    }


# ---------------------------------------------------------------------------
# City Pulse Score API
# ---------------------------------------------------------------------------

@app.get("/api/pulse")
def get_city_pulse(db: Session = Depends(get_db)):
    """Fetch current pulse score and breakdowns for all wards."""
    wards = db.query(Ward).order_by(Ward.id).all()
    pulses = []
    
    total_score = 0.0
    valid_count = 0
    
    for w in wards:
        p = calculate_pulse_for_ward(db, w.id)
        pulses.append(p)
        total_score += p["score"]
        valid_count += 1
        
    city_average = round(total_score / valid_count, 1) if valid_count > 0 else 100.0
    
    return {
        "city_average": city_average,
        "wards": pulses
    }


@app.get("/api/wards/{ward_id}/pulse")
def get_ward_pulse(ward_id: int, db: Session = Depends(get_db)):
    pulse = calculate_pulse_for_ward(db, ward_id)
    return pulse


# ---------------------------------------------------------------------------
# Readings Ingestion Endpoints (Posted by Simulator)
# ---------------------------------------------------------------------------

async def handle_metric_anomaly(db: Session, ward_id: int, metric_type: str, value: float):
    """Helper to detect anomalies and trigger database alerts and websocket notifications."""
    anomaly = detect_zscore_anomaly(db, ward_id, metric_type, value)
    if anomaly:
        # Create Alert
        description_map = {
            "traffic_congestion": f"Traffic congestion spiked abnormally to {value}% (mean: {anomaly['mean']}%).",
            "water_pressure": f"Water pipeline pressure dropped to {value} PSI (mean: {anomaly['mean']} PSI). Possible leak.",
            "water_flow": f"Water flow rate deviated abnormally to {value} L/s (mean: {anomaly['mean']} L/s).",
            "aqi": f"Localized air quality index (AQI) surged to {value} (mean: {anomaly['mean']}).",
            "sanitation_fill": f"Sanitation dump bin fill levels reached {value}% (mean: {anomaly['mean']}%)."
        }
        
        title_map = {
            "traffic_congestion": "TRAFFIC CONGESTION ANOMALY",
            "water_pressure": "CRITICAL WATER PRESSURE DROP",
            "water_flow": "WATER PIPELINE FLOW DEVIATION",
            "aqi": "LOCALIZED AIR QUALITY SPIKE",
            "sanitation_fill": "SANITATION CAPACITY WARNING"
        }
        
        severity_map = {
            "traffic_congestion": "MEDIUM",
            "water_pressure": "HIGH",
            "water_flow": "MEDIUM",
            "aqi": "HIGH",
            "sanitation_fill": "MEDIUM"
        }
        
        action_map = {
            "traffic_congestion": ["Verify traffic cams.", "Deploy local traffic wardens."],
            "water_pressure": ["Isolate water valves.", "Dispatch pipe inspection team."],
            "water_flow": ["Check water meters.", "Verify water consumption matches."],
            "aqi": ["Check nearby emission points.", "Recommend respirators if necessary."],
            "sanitation_fill": ["Dispatch collection vehicle.", "Check dump schedule."]
        }
        
        # Check cooldown: don't create duplicate anomaly alerts of same type in same ward in last 3 minutes
        cooldown_limit = datetime.utcnow() - timedelta(minutes=3)
        exists = db.query(Alert).filter(
            Alert.ward_id == ward_id,
            Alert.type == f"ANOMALY_{metric_type.upper()}",
            Alert.timestamp >= cooldown_limit
        ).first()
        
        if not exists:
            alert = Alert(
                ward_id=ward_id,
                type=f"ANOMALY_{metric_type.upper()}",
                severity=severity_map.get(metric_type, "MEDIUM"),
                title=title_map.get(metric_type, "SENSOR ANOMALY DETECTED"),
                description=description_map.get(metric_type, f"Sensor reading deviated: {value}"),
                confidence=anomaly["confidence"],
                contributing_factors=json.dumps([f"Latest reading: {value}", f"Historical ward average: {anomaly['mean']}", f"Standard deviations: {anomaly['z_score']}"]),
                recommended_actions=json.dumps(action_map.get(metric_type, ["Check sensor status."])),
                status="active"
            )
            db.add(alert)
            db.commit()
            db.refresh(alert)
            
            # Broadcast new alert
            await ws_manager.broadcast({
                "type": "ALERT_TRIGGERED",
                "data": {
                    "id": alert.id,
                    "ward_id": alert.ward_id,
                    "ward_name": alert.ward.name,
                    "type": alert.type,
                    "severity": alert.severity,
                    "title": alert.title,
                    "description": alert.description,
                    "confidence": alert.confidence,
                    "contributing_factors": json.loads(alert.contributing_factors),
                    "recommended_actions": json.loads(alert.recommended_actions),
                    "timestamp": alert.timestamp.isoformat()
                }
            })


@app.post("/api/traffic")
async def post_traffic(payload: Dict[str, Any], db: Session = Depends(get_db)):
    reading = TrafficReading(
        ward_id=payload["ward_id"],
        vehicle_count=payload["vehicle_count"],
        congestion_percentage=payload["congestion_percentage"],
        average_speed=payload["average_speed"]
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)
    
    # Anomaly checks
    await handle_metric_anomaly(db, reading.ward_id, "traffic_congestion", reading.congestion_percentage)
    
    # Run cross-domain correlation checks
    new_correlations = run_correlation_checks(db, reading.ward_id)
    for c in new_correlations:
        await ws_manager.broadcast({
            "type": "ALERT_TRIGGERED",
            "data": {
                "id": c.id,
                "ward_id": c.ward_id,
                "ward_name": c.ward.name,
                "type": c.type,
                "severity": c.severity,
                "title": c.title,
                "description": c.description,
                "confidence": c.confidence,
                "contributing_factors": json.loads(c.contributing_factors),
                "recommended_actions": json.loads(c.recommended_actions),
                "timestamp": c.timestamp.isoformat()
            }
        })
        
    # Broadcast metrics update
    pulse = calculate_pulse_for_ward(db, reading.ward_id)
    await ws_manager.broadcast({
        "type": "METRIC_UPDATE",
        "data": {
            "ward_id": reading.ward_id,
            "metric": "traffic",
            "values": {
                "vehicle_count": reading.vehicle_count,
                "congestion_percentage": reading.congestion_percentage,
                "average_speed": reading.average_speed
            },
            "pulse": pulse
        }
    })
    return {"status": "success"}


@app.post("/api/water")
async def post_water(payload: Dict[str, Any], db: Session = Depends(get_db)):
    reading = WaterReading(
        ward_id=payload["ward_id"],
        pressure=payload["pressure"],
        flow_rate=payload["flow_rate"],
        consumption=payload["consumption"]
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)
    
    # Anomaly checks
    await handle_metric_anomaly(db, reading.ward_id, "water_pressure", reading.pressure)
    await handle_metric_anomaly(db, reading.ward_id, "water_flow", reading.flow_rate)
    
    # Correlation checks
    new_correlations = run_correlation_checks(db, reading.ward_id)
    for c in new_correlations:
        await ws_manager.broadcast({
            "type": "ALERT_TRIGGERED",
            "data": {
                "id": c.id,
                "ward_id": c.ward_id,
                "ward_name": c.ward.name,
                "type": c.type,
                "severity": c.severity,
                "title": c.title,
                "description": c.description,
                "confidence": c.confidence,
                "contributing_factors": json.loads(c.contributing_factors),
                "recommended_actions": json.loads(c.recommended_actions),
                "timestamp": c.timestamp.isoformat()
            }
        })
        
    # Broadcast metrics update
    pulse = calculate_pulse_for_ward(db, reading.ward_id)
    await ws_manager.broadcast({
        "type": "METRIC_UPDATE",
        "data": {
            "ward_id": reading.ward_id,
            "metric": "water",
            "values": {
                "pressure": reading.pressure,
                "flow_rate": reading.flow_rate,
                "consumption": reading.consumption
            },
            "pulse": pulse
        }
    })
    return {"status": "success"}


@app.post("/api/air-quality")
async def post_air_quality(payload: Dict[str, Any], db: Session = Depends(get_db)):
    reading = AirQualityReading(
        ward_id=payload["ward_id"],
        aqi=payload["aqi"],
        pm25=payload["pm25"],
        pm10=payload["pm10"]
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)
    
    # Anomaly checks
    await handle_metric_anomaly(db, reading.ward_id, "aqi", reading.aqi)
    
    # Correlation checks
    new_correlations = run_correlation_checks(db, reading.ward_id)
    for c in new_correlations:
        await ws_manager.broadcast({
            "type": "ALERT_TRIGGERED",
            "data": {
                "id": c.id,
                "ward_id": c.ward_id,
                "ward_name": c.ward.name,
                "type": c.type,
                "severity": c.severity,
                "title": c.title,
                "description": c.description,
                "confidence": c.confidence,
                "contributing_factors": json.loads(c.contributing_factors),
                "recommended_actions": json.loads(c.recommended_actions),
                "timestamp": c.timestamp.isoformat()
            }
        })
        
    # Broadcast metrics update
    pulse = calculate_pulse_for_ward(db, reading.ward_id)
    await ws_manager.broadcast({
        "type": "METRIC_UPDATE",
        "data": {
            "ward_id": reading.ward_id,
            "metric": "air_quality",
            "values": {
                "aqi": reading.aqi,
                "pm25": reading.pm25,
                "pm10": reading.pm10
            },
            "pulse": pulse
        }
    })
    return {"status": "success"}


@app.post("/api/sanitation")
async def post_sanitation(payload: Dict[str, Any], db: Session = Depends(get_db)):
    reading = SanitationReading(
        ward_id=payload["ward_id"],
        garbage_fill_percentage=payload["garbage_fill_percentage"],
        collection_status=payload["collection_status"]
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)
    
    # Anomaly checks
    await handle_metric_anomaly(db, reading.ward_id, "sanitation_fill", reading.garbage_fill_percentage)
    
    # Correlation checks
    new_correlations = run_correlation_checks(db, reading.ward_id)
    for c in new_correlations:
        await ws_manager.broadcast({
            "type": "ALERT_TRIGGERED",
            "data": {
                "id": c.id,
                "ward_id": c.ward_id,
                "ward_name": c.ward.name,
                "type": c.type,
                "severity": c.severity,
                "title": c.title,
                "description": c.description,
                "confidence": c.confidence,
                "contributing_factors": json.loads(c.contributing_factors),
                "recommended_actions": json.loads(c.recommended_actions),
                "timestamp": c.timestamp.isoformat()
            }
        })
        
    # Broadcast metrics update
    pulse = calculate_pulse_for_ward(db, reading.ward_id)
    await ws_manager.broadcast({
        "type": "METRIC_UPDATE",
        "data": {
            "ward_id": reading.ward_id,
            "metric": "sanitation",
            "values": {
                "garbage_fill_percentage": reading.garbage_fill_percentage,
                "collection_status": reading.collection_status
            },
            "pulse": pulse
        }
    })
    return {"status": "success"}




@app.post("/api/complaints")
async def submit_complaint(payload: Dict[str, Any], db: Session = Depends(get_db)):
    ward_id = payload["ward_id"]
    text = payload["text"]
    
    # Check ward exists
    ward = db.query(Ward).filter(Ward.id == ward_id).first()
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")
        
    # 1. NLP Classification (Gemini with local fallback)
    ai_classification = classify_complaint_gemini(text)
    
    # 2. Semantic Deduplication
    dup_id = find_complaint_duplicate(db, ward_id, text)
    
    # Create complaint
    complaint = CitizenComplaint(
        ward_id=ward_id,
        raw_text=text,
        category=ai_classification["category"],
        severity=ai_classification["severity"],
        status="duplicate" if dup_id else "open",
        duplicate_group_id=dup_id,
        ai_summary=ai_classification["summary"],
        # Mock coordinates inside the ward's proximity
        latitude=ward.latitude + 0.003 * (0.5 - os.getpid() % 10 / 10),
        longitude=ward.longitude + 0.003 * (0.5 - os.getpid() % 10 / 10)
    )
    db.add(complaint)
    db.commit()
    db.refresh(complaint)
    
    # Trigger correlation checks immediately upon receiving complaint
    new_correlations = run_correlation_checks(db, ward_id)
    for c in new_correlations:
        await ws_manager.broadcast({
            "type": "ALERT_TRIGGERED",
            "data": {
                "id": c.id,
                "ward_id": c.ward_id,
                "ward_name": c.ward.name,
                "type": c.type,
                "severity": c.severity,
                "title": c.title,
                "description": c.description,
                "confidence": c.confidence,
                "contributing_factors": json.loads(c.contributing_factors),
                "recommended_actions": json.loads(c.recommended_actions),
                "timestamp": c.timestamp.isoformat()
            }
        })
        
    # Broadcast new complaint to frontend
    await ws_manager.broadcast({
        "type": "COMPLAINT_SUBMITTED",
        "data": {
            "id": complaint.id,
            "ward_id": complaint.ward_id,
            "ward_name": ward.name,
            "raw_text": complaint.raw_text,
            "category": complaint.category,
            "severity": complaint.severity,
            "status": complaint.status,
            "duplicate_group_id": complaint.duplicate_group_id,
            "ai_summary": complaint.ai_summary,
            "latitude": complaint.latitude,
            "longitude": complaint.longitude,
            "timestamp": complaint.timestamp.isoformat()
        }
    })
    
    # Re-calculate pulse score and broadcast update
    pulse = calculate_pulse_for_ward(db, ward_id)
    await ws_manager.broadcast({
        "type": "METRIC_UPDATE",
        "data": {
            "ward_id": ward_id,
            "metric": "complaint",
            "values": {"open_complaints_count": pulse["raw_values"]["complaints_count"]},
            "pulse": pulse
        }
    })
    
    return {
        "id": complaint.id,
        "category": complaint.category,
        "severity": complaint.severity,
        "is_duplicate": dup_id is not None,
        "duplicate_of": dup_id,
        "summary": complaint.ai_summary
    }


@app.get("/api/complaints")
def list_complaints(ward_id: Optional[int] = None, limit: int = 50, db: Session = Depends(get_db)):
    """Fetch recent complaints, optionally filtered by ward."""
    query = db.query(CitizenComplaint).order_by(desc(CitizenComplaint.timestamp))
    if ward_id is not None:
        query = query.filter(CitizenComplaint.ward_id == ward_id)
    
    complaints = query.limit(limit).all()
    
    return [
        {
            "id": c.id,
            "ward_id": c.ward_id,
            "ward_name": c.ward.name,
            "raw_text": c.raw_text,
            "category": c.category,
            "severity": c.severity,
            "status": c.status,
            "duplicate_group_id": c.duplicate_group_id,
            "ai_summary": c.ai_summary,
            "latitude": c.latitude,
            "longitude": c.longitude,
            "timestamp": c.timestamp.isoformat()
        }
        for c in complaints
    ]


# ---------------------------------------------------------------------------
# Alerts API
# ---------------------------------------------------------------------------

@app.get("/api/alerts")
def list_alerts(limit: int = 20, db: Session = Depends(get_db)):
    """Fetch active and past alerts."""
    alerts = db.query(Alert).order_by(desc(Alert.timestamp)).limit(limit).all()
    return [
        {
            "id": a.id,
            "ward_id": a.ward_id,
            "ward_name": a.ward.name,
            "timestamp": a.timestamp.isoformat(),
            "type": a.type,
            "severity": a.severity,
            "title": a.title,
            "description": a.description,
            "confidence": a.confidence,
            "contributing_factors": json.loads(a.contributing_factors),
            "recommended_actions": json.loads(a.recommended_actions),
            "status": a.status
        }
        for a in alerts
    ]


# ---------------------------------------------------------------------------
# Explainable AI & Insights API
# ---------------------------------------------------------------------------

@app.get("/api/insights")
def get_ai_insights(db: Session = Depends(get_db)):
    """Generates overview summary insights for the city operations chief."""
    # Count metrics
    total_alerts = db.query(Alert).filter(Alert.status == "active").count()
    critical_alerts = db.query(Alert).filter(Alert.status == "active", Alert.severity == "CRITICAL").count()
    high_alerts = db.query(Alert).filter(Alert.status == "active", Alert.severity == "HIGH").count()
    
    total_complaints = db.query(CitizenComplaint).filter(CitizenComplaint.status == "open").count()
    
    # Calculate duplicate statistics
    duplicates_count = db.query(CitizenComplaint).filter(CitizenComplaint.status == "duplicate").count()
    
    # Get overall city pulse
    wards = db.query(Ward).all()
    avg_pulse = 100.0
    critical_wards_count = 0
    
    if wards:
        scores = [calculate_pulse_for_ward(db, w.id)["score"] for w in wards]
        avg_pulse = round(sum(scores) / len(scores), 1)
        critical_wards_count = sum(1 for s in scores if s < 60)

    # Compile brief summary
    if avg_pulse >= 90:
        summary_desc = "All city domains operating within stable parameters. System pulse is healthy."
    elif avg_pulse >= 70:
        summary_desc = f"Moderate congestion or utility disruptions detected in {critical_wards_count} ward(s). Maintain standby alert."
    else:
        summary_desc = f"Critical events active in {critical_wards_count} ward(s). Infrastructure and traffic diversion protocols recommended."

    # Identify primary active incident category
    categories = db.query(CitizenComplaint.category, func.count(CitizenComplaint.id)).filter(
        CitizenComplaint.status == "open"
    ).group_by(CitizenComplaint.category).all()
    
    top_complaint_category = "None"
    if categories:
        # Sort by count desc
        categories.sort(key=lambda x: x[1], reverse=True)
        top_complaint_category = categories[0][0]

    return {
        "city_pulse": avg_pulse,
        "active_alerts_count": total_alerts,
        "critical_alerts_count": critical_alerts,
        "high_alerts_count": high_alerts,
        "open_complaints_count": total_complaints,
        "duplicate_complaints_prevented": duplicates_count,
        "critical_wards_count": critical_wards_count,
        "overall_status": "STABLE" if avg_pulse >= 80 else ("WARNING" if avg_pulse >= 60 else "CRITICAL"),
        "summary": summary_desc,
        "top_complaint_category": top_complaint_category,
        "generated_at": datetime.utcnow().isoformat()
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
