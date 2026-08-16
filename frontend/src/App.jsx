import { useEffect, useState, useCallback, useRef } from "react";
import { 
  ShieldAlert, 
  Activity, 
  FileText, 
  Radio, 
  TrendingUp, 
  MapPin, 
  AlertCircle, 
  Sliders, 
  Droplets, 
  Trash2, 
  Flame, 
  Navigation,
  Send,
  CornerDownRight,
  Info
} from "lucide-react";
import confetti from "canvas-confetti";

import WardMap from "./components/Map";
import { PulseTrendChart, DomainComparisonChart } from "./components/Charts";
import AlertDetailModal from "./components/AlertDetailModal";

const API_BASE = "http://localhost:8000/api";
const WS_BASE = "ws://localhost:8000/ws/live";

export default function App() {
  const [wards, setWards] = useState([]);
  const [pulses, setPulses] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [insights, setInsights] = useState({
    city_pulse: 100,
    active_alerts_count: 0,
    critical_alerts_count: 0,
    high_alerts_count: 0,
    open_complaints_count: 0,
    duplicate_complaints_prevented: 0,
    overall_status: "STABLE",
    summary: "Connecting to Digital Nervous System..."
  });
  
  const [selectedWardId, setSelectedWardId] = useState(7); // Default focus on Trimurti Nagar (demo ward)
  const [activeScenario, setActiveScenario] = useState("normal");
  const [connected, setConnected] = useState(false);
  const [activeAlert, setActiveAlert] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [pulseTrend, setPulseTrend] = useState([]);
  
  // Complaint submission form state
  const [complaintWardId, setComplaintWardId] = useState(7);
  const [complaintText, setComplaintText] = useState("");
  const [submittingComplaint, setSubmittingComplaint] = useState(false);
  const [lastClassificationResult, setLastClassificationResult] = useState(null);

  const wsRef = useRef(null);

  // Show floating toast notifications for active alerts
  const showToast = (title, desc, severity) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, desc, severity }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  // Fetch initial state data
  const fetchInitialData = useCallback(async () => {
    try {
      // 1. Fetch wards list
      const wardsRes = await fetch(`${API_BASE}/wards`);
      const wardsData = await wardsRes.json();
      setWards(wardsData);
      
      // 2. Fetch pulse scores
      const pulseRes = await fetch(`${API_BASE}/pulse`);
      const pulseData = await pulseRes.json();
      const pulseMap = {};
      pulseData.wards.forEach(w => {
        pulseMap[w.ward_id] = w;
      });
      setPulses(pulseMap);
      
      // Seed initial pulse average in trend
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setPulseTrend([{ time: timeStr, score: pulseData.city_average }]);

      // 3. Fetch alerts
      const alertsRes = await fetch(`${API_BASE}/alerts`);
      const alertsData = await alertsRes.json();
      setAlerts(alertsData);

      // 4. Fetch complaints
      const complaintsRes = await fetch(`${API_BASE}/complaints`);
      const complaintsData = await complaintsRes.json();
      setComplaints(complaintsData);

      // 5. Fetch general insights
      const insightsRes = await fetch(`${API_BASE}/insights`);
      const insightsData = await insightsRes.json();
      setInsights(insightsData);
      
      // 6. Fetch scenario state
      const scenarioRes = await fetch(`${API_BASE}/demo/scenario`);
      const scenarioData = await scenarioRes.json();
      setActiveScenario(scenarioData.scenario);

      setConnected(true);
    } catch (e) {
      console.error("Error loading command center: ", e);
      setConnected(false);
    }
  }, []);

  // Set up WebSocket listener
  useEffect(() => {
    fetchInitialData();

    const connectWS = () => {
      console.log("Connecting to WebSockets...");
      const ws = new WebSocket(WS_BASE);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected.");
        setConnected(true);
      };

      ws.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        const { type, data } = payload;
        
        console.log("WS Event:", type, data);

        if (type === "METRIC_UPDATE") {
          // Update pulses for the ward
          setPulses(prev => {
            const next = { ...prev };
            next[data.ward_id] = data.pulse;
            
            // Recalculate average pulse trend live
            const pulseList = Object.values(next);
            if (pulseList.length > 0) {
              const avg = pulseList.reduce((sum, p) => sum + p.score, 0) / pulseList.length;
              setPulseTrend(trend => {
                const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const updated = [...trend, { time: timeStr, score: Math.round(avg * 10) / 10 }];
                // Keep last 25 trend measurements
                return updated.slice(-25);
              });
            }
            return next;
          });
          
          // Trigger automatic updates for insights
          fetch(`${API_BASE}/insights`)
            .then(res => res.json())
            .then(setInsights)
            .catch(() => {});
        } 
        
        else if (type === "ALERT_TRIGGERED") {
          // Add alert to feed
          setAlerts(prev => [data, ...prev]);
          
          // Display Toast
          showToast(data.title, data.description, data.severity);
          
          // Increment alerts in insights
          setInsights(prev => ({
            ...prev,
            active_alerts_count: prev.active_alerts_count + 1,
            critical_alerts_count: data.severity === "CRITICAL" ? prev.critical_alerts_count + 1 : prev.critical_alerts_count,
            high_alerts_count: data.severity === "HIGH" ? prev.high_alerts_count + 1 : prev.high_alerts_count
          }));
        } 
        
        else if (type === "COMPLAINT_SUBMITTED") {
          setComplaints(prev => [data, ...prev]);
        } 
        
        else if (type === "SCENARIO_CHANGED") {
          setActiveScenario(data.scenario);
          // Clean slate: reset notifications and visual graphs
          setAlerts([]);
          setComplaints([]);
          setPulseTrend([]);
          
          if (data.scenario === "normal") {
            confetti({
              particleCount: 150,
              spread: 80,
              origin: { y: 0.6 }
            });
            showToast("System Reset Successful", "City status has returned to standard baseline operation.", "LOW");
          } else {
            showToast(`Incident Mode: ${data.scenario.toUpperCase()}`, `Demonstration scenario activated. Observe real-time data telemetry.`, "HIGH");
          }
          
          // Reload fresh data from backend
          fetchInitialData();
        }
      };

      ws.onclose = () => {
        console.log("WebSocket disconnected. Retrying in 4s...");
        setConnected(false);
        setTimeout(connectWS, 4000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connectWS();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [fetchInitialData]);

  // Handle demo scenario trigger clicks
  const handleTriggerScenario = async (scenario) => {
    try {
      await fetch(`${API_BASE}/demo/scenario/${scenario}`, { method: "POST" });
    } catch (e) {
      showToast("Trigger Failed", "Could not reach command server.", "CRITICAL");
    }
  };

  // Submit mock citizen complaint
  const handleComplaintSubmit = async (e) => {
    e.preventDefault();
    if (!complaintText.trim()) return;

    setSubmittingComplaint(true);
    setLastClassificationResult(null);

    try {
      const resp = await fetch(`${API_BASE}/complaints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ward_id: Number(complaintWardId),
          text: complaintText.trim()
        })
      });
      
      if (resp.ok) {
        const result = await resp.json();
        setLastClassificationResult(result);
        setComplaintText("");
        
        // Brief clear interval
        setTimeout(() => setLastClassificationResult(null), 8000);
      } else {
        showToast("Error", "Failed to submit report to command center.", "CRITICAL");
      }
    } catch (err) {
      showToast("Error", "Network connection issues.", "CRITICAL");
    } finally {
      setSubmittingComplaint(false);
    }
  };

  // Calculate dynamic stats across all active pulses for KPI grid
  const getAverageMetrics = () => {
    const list = Object.values(pulses);
    if (list.length === 0) {
      return { congestion: 0, aqi: 0, pressure: 0, garbage_fill: 0 };
    }
    
    const count = list.length;
    let congestion = 0, aqi = 0, pressure = 0, garbage_fill = 0;
    
    list.forEach(p => {
      if (p.raw_values) {
        congestion += p.raw_values.congestion;
        aqi += p.raw_values.aqi;
        pressure += p.raw_values.pressure;
        garbage_fill += p.raw_values.garbage_fill;
      }
    });

    return {
      congestion: Math.round(congestion / count),
      aqi: Math.round(aqi / count),
      pressure: Math.round(pressure / count),
      garbage_fill: Math.round(garbage_fill / count)
    };
  };

  const currentAverages = getAverageMetrics();
  const focusedWardPulse = pulses[selectedWardId];
  const focusedWard = wards.find(w => w.id === selectedWardId);

  // Status mappings
  const getTrafficStatus = (avg) => {
    if (avg >= 70) return { label: "Gridlock", class: "status-text-critical" };
    if (avg >= 50) return { label: "Heavy", class: "status-text-high" };
    if (avg >= 35) return { label: "Moderate", class: "status-text-medium" };
    return { label: "Clear", class: "status-text-low" };
  };

  const getAqiStatus = (avg) => {
    if (avg >= 200) return { label: "Hazardous", class: "status-text-critical" };
    if (avg >= 150) return { label: "Unhealthy", class: "status-text-high" };
    if (avg >= 100) return { label: "Poor", class: "status-text-medium" };
    return { label: "Good", class: "status-text-low" };
  };

  const getWaterStatus = (avg) => {
    if (avg <= 45) return { label: "Critical Drop", class: "status-text-critical" };
    if (avg <= 65) return { label: "Low Pressure", class: "status-text-high" };
    if (avg >= 95) return { label: "Overpressure", class: "status-text-medium" };
    return { label: "Stable", class: "status-text-stable" };
  };

  const getSanitationStatus = (avg) => {
    if (avg >= 80) return { label: "Overflow Risk", class: "status-text-critical" };
    if (avg >= 60) return { label: "Warning backlog", class: "status-text-high" };
    if (avg >= 40) return { label: "Moderate", class: "status-text-medium" };
    return { label: "Clean", class: "status-text-low" };
  };

  const trafficStatus = getTrafficStatus(currentAverages.congestion);
  const aqiStatus = getAqiStatus(currentAverages.aqi);
  const waterStatus = getWaterStatus(currentAverages.pressure);
  const sanitationStatus = getSanitationStatus(currentAverages.garbage_fill);

  return (
    <div className="dashboard-container">
      
      {/* 1. HEADER CONTROL LAYER */}
      <header className="dashboard-header">
        <div className="brand-section">
          <div className="brand-logo-container">
            <h1 className="brand-logo">NAVNITI</h1>
          </div>
          <div style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: "14px" }}>
            <span className="brand-tagline">AI-Powered Digital Nervous System for Proactive Urban Governance</span>
          </div>
        </div>

        {/* Demo incident control panel */}
        <div className="demo-bar">
          <span className="demo-title">
            <Sliders size={11} style={{ marginRight: "4px" }} />
            Demo Scenario Controller:
          </span>
          <button 
            className={`demo-btn ${activeScenario === "normal" ? "active" : ""}`}
            onClick={() => handleTriggerScenario("normal")}
          >
            Normal City
          </button>
          <button 
            className={`demo-btn ${activeScenario === "traffic-aqi" ? "active" : ""}`}
            onClick={() => handleTriggerScenario("traffic-aqi")}
          >
            🚦 Traffic + AQI
          </button>
          <button 
            className={`demo-btn ${activeScenario === "water-pipeline" ? "active" : ""}`}
            onClick={() => handleTriggerScenario("water-pipeline")}
          >
            💧 Pipeline Leak
          </button>
          <button 
            className={`demo-btn ${activeScenario === "sanitation" ? "active" : ""}`}
            onClick={() => handleTriggerScenario("sanitation")}
          >
            🗑️ Garbage Overflow
          </button>
        </div>

        {/* Live heartbeat status */}
        <div className="status-pill">
          <span className={`status-dot ${connected ? "active" : "disconnected"}`} />
          <span>{connected ? "LIVE FEED" : "DISCONNECTED"}</span>
        </div>
      </header>

      {/* 2. OVERVIEW KPI CARDS */}
      <section className="kpi-row">
        
        {/* City Pulse Average */}
        <div className="kpi-card pulse-highlight">
          <div className="kpi-header">
            <span className="kpi-title">CITY PULSE SCORE</span>
            <Activity className="kpi-icon" size={16} color="#38bdf8" />
          </div>
          <div className="kpi-value-container">
            <span className="kpi-value" style={{ textShadow: "0 0 10px rgba(56, 189, 248, 0.3)" }}>
              {insights.city_pulse}
            </span>
            <span className="kpi-unit">/100</span>
          </div>
          <span className={`kpi-status-label ${insights.overall_status === "STABLE" ? "status-text-stable" : "status-text-critical"}`} style={{ fontSize: "12px", fontWeight: 700 }}>
            {insights.overall_status}
          </span>
        </div>

        {/* Traffic Average */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">TRAFFIC CONGESTION</span>
            <Navigation className="kpi-icon" size={16} />
          </div>
          <div className="kpi-value-container">
            <span className="kpi-value">{currentAverages.congestion}%</span>
          </div>
          <span className={`kpi-status-label ${trafficStatus.class}`}>
            {trafficStatus.label}
          </span>
        </div>

        {/* AQI Average */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">AIR QUALITY INDEX</span>
            <Flame className="kpi-icon" size={16} />
          </div>
          <div className="kpi-value-container">
            <span className="kpi-value">{currentAverages.aqi}</span>
            <span className="kpi-unit">AQI</span>
          </div>
          <span className={`kpi-status-label ${aqiStatus.class}`}>
            {aqiStatus.label}
          </span>
        </div>

        {/* Water Average */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">WATER PIPELINES</span>
            <Droplets className="kpi-icon" size={16} />
          </div>
          <div className="kpi-value-container">
            <span className="kpi-value">{currentAverages.pressure}</span>
            <span className="kpi-unit">PSI</span>
          </div>
          <span className={`kpi-status-label ${waterStatus.class}`}>
            {waterStatus.label}
          </span>
        </div>

        {/* Sanitation Average */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">SANITATION FILL</span>
            <Trash2 className="kpi-icon" size={16} />
          </div>
          <div className="kpi-value-container">
            <span className="kpi-value">{currentAverages.garbage_fill}%</span>
          </div>
          <span className={`kpi-status-label ${sanitationStatus.class}`}>
            {sanitationStatus.label}
          </span>
        </div>

        {/* Open Complaints count */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">OPEN COMPLAINTS</span>
            <FileText className="kpi-icon" size={16} />
          </div>
          <div className="kpi-value-container">
            <span className="kpi-value">{insights.open_complaints_count}</span>
          </div>
          <span className="kpi-status-label text-dim" style={{ color: "#38bdf8", fontWeight: 500 }}>
            {insights.duplicate_complaints_prevented} Grouped Clusters
          </span>
        </div>

      </section>

      {/* 3. MAIN DASHBOARD CONTENT GRID */}
      <main className="main-grid">
        
        {/* LEFT COLUMN: Geographic map + Global trend */}
        <div className="grid-panel">
          
          {/* Interactive OSM Ward Map */}
          <div className="panel-card" style={{ flexGrow: 1.4 }}>
            <div className="panel-card-header">
              <span className="panel-card-title">
                <MapPin size={14} color="#38bdf8" />
                Live Ward Health Map
              </span>
              <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Hexagons show ward bounds. Click to inspect.</span>
            </div>
            <div className="panel-card-body" style={{ padding: 0 }}>
              <WardMap 
                wards={wards} 
                pulses={pulses} 
                selectedWardId={selectedWardId} 
                onSelectWard={setSelectedWardId} 
              />
            </div>
          </div>

          {/* City Average Pulse Trend */}
          <div className="panel-card" style={{ flexGrow: 0.6 }}>
            <div className="panel-card-header">
              <span className="panel-card-title">
                <TrendingUp size={14} color="#38bdf8" />
                City Pulse Score Trend
              </span>
            </div>
            <div className="panel-card-body" style={{ padding: "16px 8px 8px 8px" }}>
              <PulseTrendChart data={pulseTrend} />
            </div>
          </div>

        </div>

        {/* CENTER COLUMN: Intelligence Feed + Focused Ward breakdown */}
        <div className="grid-panel">
          
          {/* Live Alerts feed */}
          <div className="panel-card" style={{ flexGrow: 1.2 }}>
            <div className="panel-card-header">
              <span className="panel-card-title">
                <ShieldAlert size={14} color="#ef4444" />
                Live Command Incident Feed
              </span>
              <span className="badge-critical" style={{ fontSize: "10px", background: "rgba(239, 68, 68, 0.12)", color: "#ef4444", padding: "2px 6px", borderRadius: "4px", fontWeight: 700 }}>
                {alerts.filter(a => a.severity === "CRITICAL" || a.severity === "HIGH").length} Urgent
              </span>
            </div>
            <div className="panel-card-body">
              <div className="alert-feed">
                {alerts.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "180px", color: "var(--text-muted)", gap: "10px" }}>
                    <Radio size={24} style={{ animation: "pulse-active 1.5s infinite" }} color="#64748b" />
                    <p style={{ fontSize: "11px" }}>Command feed active. Waiting for sensor alerts...</p>
                  </div>
                ) : (
                  alerts.map((alert) => (
                    <div 
                      key={alert.id} 
                      className={`alert-item-card ${alert.severity.toLowerCase()}`}
                      onClick={() => setActiveAlert(alert)}
                    >
                      <div className="alert-item-header">
                        <span className="alert-item-title" style={{ color: getSeverityColor(alert.severity) }}>
                          {alert.title}
                        </span>
                        <span className="alert-item-time">
                          {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      <p className="alert-item-desc">{alert.description}</p>
                      <div className="alert-item-footer">
                        <span>{alert.ward_name}</span>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <span>Confidence: {alert.confidence.toFixed(0)}%</span>
                          <span className={`alert-badge ${alert.severity.toLowerCase()}`}>{alert.severity}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Focused Ward Status breakdown */}
          <div className="panel-card" style={{ flexGrow: 0.8 }}>
            <div className="panel-card-header">
              <span className="panel-card-title">
                <Sliders size={14} color="#38bdf8" />
                Focused Inspector: {focusedWard?.name || `Ward ${selectedWardId}`}
              </span>
            </div>
            <div className="panel-card-body">
              {focusedWardPulse ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ background: "rgba(56, 189, 248, 0.05)", border: "1px solid rgba(56, 189, 248, 0.15)", borderRadius: "8px", padding: "10px 14px", display: "flex", gap: "8px" }}>
                    <Info size={18} color="#38bdf8" style={{ flexShrink: 0, marginTop: "2px" }} />
                    <div style={{ fontSize: "11.5px", lineHeight: "1.45" }}>
                      <strong>Telemetry status:</strong> {focusedWardPulse.explanation}
                    </div>
                  </div>
                  
                  <DomainComparisonChart breakdown={focusedWardPulse.breakdown} />
                </div>
              ) : (
                <div style={{ display: "flex", height: "100px", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "12px" }}>
                  Waiting for ward readings...
                </div>
              )}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Citizen Complaints Portal */}
        <div className="grid-panel">
          
          <div className="panel-card" style={{ height: "100%" }}>
            <div className="panel-card-header">
              <span className="panel-card-title">
                <FileText size={14} color="#38bdf8" />
                Citizen Complaint Command
              </span>
            </div>
            
            <div className="panel-card-body">
              {/* Submission simulator form */}
              <form className="complaint-form" onSubmit={handleComplaintSubmit}>
                <span className="form-label">Simulate Citizen Input</span>
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "8px" }}>
                  <select 
                    className="form-select" 
                    value={complaintWardId}
                    onChange={(e) => setComplaintWardId(Number(e.target.value))}
                  >
                    {wards.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                  
                  <textarea 
                    className="form-textarea"
                    placeholder="Type complaint (e.g. Garbage piled up near market, low water supply, streetlights are dark...)"
                    value={complaintText}
                    onChange={(e) => setComplaintText(e.target.value)}
                    required
                  />
                  
                  <button 
                    className="form-submit-btn" 
                    type="submit" 
                    disabled={submittingComplaint}
                  >
                    {submittingComplaint ? "Processing NLP..." : "Submit Complaint"}
                  </button>
                </div>

                {/* NLP feedback */}
                {lastClassificationResult && (
                  <div 
                    className="complaint-duplicate-banner"
                    style={{ 
                      flexDirection: "column", 
                      alignItems: "flex-start", 
                      background: lastClassificationResult.is_duplicate ? "rgba(234, 179, 8, 0.08)" : "rgba(16, 185, 129, 0.08)",
                      borderColor: lastClassificationResult.is_duplicate ? "rgba(234, 179, 8, 0.2)" : "rgba(16, 185, 129, 0.2)",
                      color: lastClassificationResult.is_duplicate ? "#eab308" : "#10b981"
                    }}
                  >
                    <div style={{ display: "flex", gap: "6px", alignItems: "center", width: "100%" }}>
                      <span><strong>NLP Classification:</strong> {lastClassificationResult.category}</span>
                      <span className="complaint-ai-badge" style={{ background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", border: "1px solid rgba(56, 189, 248, 0.3)" }}>
                        {lastClassificationResult.severity}
                      </span>
                    </div>
                    
                    <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "4px" }}>
                      Summary: "{lastClassificationResult.summary}"
                    </div>

                    {lastClassificationResult.is_duplicate && (
                      <div style={{ fontSize: "10.5px", color: "#eab308", marginTop: "6px", borderTop: "1px solid rgba(234, 179, 8, 0.15)", paddingTop: "4px", width: "100%" }}>
                        ⚠️ Deduplication: Grouped into Incident Cluster #{lastClassificationResult.duplicate_of}
                      </div>
                    )}
                  </div>
                )}
              </form>

              {/* Complaints feed */}
              <div className="complaint-list">
                <span className="form-label">Recent Reports Portal</span>
                {complaints.length === 0 ? (
                  <p style={{ fontSize: "11px", color: "var(--text-dim)", textAlign: "center", padding: "20px" }}>
                    No citizen reports logged yet.
                  </p>
                ) : (
                  complaints.slice(0, 15).map((complaint) => (
                    <div key={complaint.id} className="complaint-item-card">
                      <div className="complaint-item-top">
                        <span className="complaint-item-category">{complaint.category}</span>
                        <span 
                          style={{ 
                            fontSize: "9px", 
                            fontWeight: 700, 
                            color: getSeverityColor(complaint.severity),
                            background: getSeverityColor(complaint.severity) + "15",
                            padding: "2px 5px",
                            borderRadius: "4px",
                            border: `1px solid ${getSeverityColor(complaint.severity)}30`
                          }}
                        >
                          {complaint.severity}
                        </span>
                      </div>
                      
                      <p className="complaint-item-text">"{complaint.raw_text}"</p>
                      
                      <div className="complaint-item-meta">
                        <span>{complaint.ward_name}</span>
                        <span>{new Date(complaint.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      {complaint.status === "duplicate" && (
                        <div className="complaint-duplicate-banner" style={{ marginTop: "4px" }}>
                          <CornerDownRight size={10} />
                          <span>Deduplicated: Mapped to Cluster #{complaint.duplicate_group_id}</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

        </div>

      </main>

      {/* 4. MODALS & FLOATING TOASTS */}
      {activeAlert && (
        <AlertDetailModal 
          alert={activeAlert} 
          onClose={() => setActiveAlert(null)} 
        />
      )}

      {/* Toast notifications drawer */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className="toast-message" style={{ borderLeftColor: getSeverityColor(t.severity) }}>
            <span className="toast-title" style={{ color: getSeverityColor(t.severity) }}>{t.title}</span>
            <span className="toast-desc">{t.desc}</span>
          </div>
        ))}
      </div>

    </div>
  );
}

// Helper colors for inline style mappings
const getSeverityColor = (sev) => {
  const s = sev?.toUpperCase();
  if (s === "CRITICAL") return "#ef4444";
  if (s === "HIGH") return "#f97316";
  if (s === "MEDIUM") return "#eab308";
  return "#10b981";
};
