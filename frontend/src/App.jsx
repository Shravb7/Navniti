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
  
  // Accessibility and criteria states
  const [isTextScaleLarge, setIsTextScaleLarge] = useState(false);
  const [selectedCriteria, setSelectedCriteria] = useState(null);
  const [criteriaDetails, setCriteriaDetails] = useState(null);
  const [isRefreshingCriteria, setIsRefreshingCriteria] = useState(false);

  // Complaint submission form state
  const [complaintWardId, setComplaintWardId] = useState(7);
  const [complaintText, setComplaintText] = useState("");
  const [submittingComplaint, setSubmittingComplaint] = useState(false);
  const [lastClassificationResult, setLastClassificationResult] = useState(null);

  const wsRef = useRef(null);

  // Sync criteria details whenever selected criteria changes
  useEffect(() => {
    if (selectedCriteria) {
      if (selectedCriteria === "pulse") {
        setCriteriaDetails(null);
      } else {
        fetch(`${API_BASE}/metrics/${selectedCriteria}`)
          .then(res => res.ok ? res.json() : null)
          .then(setCriteriaDetails)
          .catch(err => console.error("Error loading criteria: ", err));
      }
    } else {
      setCriteriaDetails(null);
    }
  }, [selectedCriteria]);

  // Handle manual database scan/refresh for a specific criteria
  const handleRefreshCriteria = async (criteria) => {
    setIsRefreshingCriteria(true);
    try {
      const res = await fetch(`${API_BASE}/metrics/refresh/${criteria}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setCriteriaDetails(data);
        showToast(
          "Telemetry Refreshed", 
          `Scanned database and retrieved live updates for Nagpur ${criteria} status.`, 
          "LOW"
        );
        // Reload global states
        fetchInitialData();
      } else {
        showToast("Refresh Failed", "Could not query database sensor tables.", "CRITICAL");
      }
    } catch (err) {
      showToast("Refresh Failed", "Check your backend connection status.", "CRITICAL");
    } finally {
      setIsRefreshingCriteria(false);
    }
  };

  const closeCriteriaDrawer = () => {
    setSelectedCriteria(null);
  };

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
    <div className={`dashboard-container ${isTextScaleLarge ? "text-scale-large" : ""}`}>
      
      {/* 1. HEADER CONTROL LAYER */}
      <header className="dashboard-header">
        <div className="brand-section">
          <div className="brand-logo-container">
            <h1 className="brand-logo">NAVNITI</h1>
          </div>
          <div style={{ borderLeft: "1px solid var(--border-muted)", paddingLeft: "14px" }}>
            <span className="brand-tagline">Proactive Smart City Command Dashboard (Nagpur)</span>
          </div>
        </div>

        {/* Accessibility & Refresh bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          
          {/* Elderly Accessibility Font Size Toggle */}
          <button 
            type="button"
            onClick={() => setIsTextScaleLarge(!isTextScaleLarge)}
            style={{
              background: isTextScaleLarge ? "#0284c7" : "#ffffff",
              color: isTextScaleLarge ? "#ffffff" : "var(--text-main)",
              border: "1px solid var(--border-muted)",
              borderRadius: "20px",
              padding: "6px 14px",
              fontSize: "11px",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.05)"
            }}
            title="Switch text size for elderly readability"
          >
            <span>Aa</span>
            <span>{isTextScaleLarge ? "NORMAL SIZE" : "LARGE TEXT"}</span>
          </button>

          {/* Demo incident control panel */}
          <div className="demo-bar">
            <span className="demo-title">
              <Sliders size={11} style={{ marginRight: "4px" }} />
              Scenarios:
            </span>
            <button 
              className={`demo-btn ${activeScenario === "normal" ? "active" : ""}`}
              onClick={() => handleTriggerScenario("normal")}
            >
              Standard Baseline
            </button>
            <button 
              className={`demo-btn ${activeScenario === "traffic-aqi" ? "active" : ""}`}
              onClick={() => handleTriggerScenario("traffic-aqi")}
            >
              🚦 Traffic Gridlock
            </button>
            <button 
              className={`demo-btn ${activeScenario === "water-pipeline" ? "active" : ""}`}
              onClick={() => handleTriggerScenario("water-pipeline")}
            >
              💧 Pipe Leak
            </button>
            <button 
              className={`demo-btn ${activeScenario === "sanitation" ? "active" : ""}`}
              onClick={() => handleTriggerScenario("sanitation")}
            >
              🗑️ Trash Overflow
            </button>
          </div>

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
        <div 
          className={`kpi-card pulse-highlight ${selectedCriteria === "pulse" ? "selected-kpi" : ""}`}
          onClick={() => setSelectedCriteria("pulse")}
          title="Click to view weights and score definitions"
        >
          <div className="kpi-header">
            <span className="kpi-title">CITY PULSE SCORE</span>
            <Activity className="kpi-icon" size={16} color="#0284c7" />
          </div>
          <div className="kpi-value-container">
            <span className="kpi-value">
              {insights.city_pulse}
            </span>
            <span className="kpi-unit">/100</span>
          </div>
          <span className={`kpi-status-label ${insights.overall_status === "STABLE" ? "status-text-stable" : "status-text-critical"}`} style={{ fontSize: "12px", fontWeight: 700 }}>
            {insights.overall_status} (Click to see weight breakdown)
          </span>
        </div>

        {/* Traffic Average */}
        <div 
          className={`kpi-card ${selectedCriteria === "traffic" ? "selected-kpi" : ""}`}
          onClick={() => setSelectedCriteria("traffic")}
          title="Click to see traffic scores by area and scan for updates"
        >
          <div className="kpi-header">
            <span className="kpi-title">TRAFFIC CONGESTION</span>
            <Navigation className="kpi-icon" size={16} />
          </div>
          <div className="kpi-value-container">
            <span className="kpi-value">{currentAverages.congestion}%</span>
          </div>
          <span className={`kpi-status-label ${trafficStatus.class}`}>
            {trafficStatus.label} (Click for Nagpur area scores)
          </span>
        </div>

        {/* AQI Average */}
        <div 
          className={`kpi-card ${selectedCriteria === "air-quality" ? "selected-kpi" : ""}`}
          onClick={() => setSelectedCriteria("air-quality")}
          title="Click to see air quality scores by area and scan for updates"
        >
          <div className="kpi-header">
            <span className="kpi-title">AIR QUALITY INDEX</span>
            <Flame className="kpi-icon" size={16} />
          </div>
          <div className="kpi-value-container">
            <span className="kpi-value">{currentAverages.aqi}</span>
            <span className="kpi-unit">AQI</span>
          </div>
          <span className={`kpi-status-label ${aqiStatus.class}`}>
            {aqiStatus.label} (Click for Nagpur area scores)
          </span>
        </div>

        {/* Water Average */}
        <div 
          className={`kpi-card ${selectedCriteria === "water" ? "selected-kpi" : ""}`}
          onClick={() => setSelectedCriteria("water")}
          title="Click to see water pressures by area and scan for updates"
        >
          <div className="kpi-header">
            <span className="kpi-title">WATER PIPELINES</span>
            <Droplets className="kpi-icon" size={16} />
          </div>
          <div className="kpi-value-container">
            <span className="kpi-value">{currentAverages.pressure}</span>
            <span className="kpi-unit">PSI</span>
          </div>
          <span className={`kpi-status-label ${waterStatus.class}`}>
            {waterStatus.label} (Click for Nagpur area scores)
          </span>
        </div>

        {/* Sanitation Average */}
        <div 
          className={`kpi-card ${selectedCriteria === "sanitation" ? "selected-kpi" : ""}`}
          onClick={() => setSelectedCriteria("sanitation")}
          title="Click to see trash bin fills by area and scan for updates"
        >
          <div className="kpi-header">
            <span className="kpi-title">SANITATION FILL</span>
            <Trash2 className="kpi-icon" size={16} />
          </div>
          <div className="kpi-value-container">
            <span className="kpi-value">{currentAverages.garbage_fill}%</span>
          </div>
          <span className={`kpi-status-label ${sanitationStatus.class}`}>
            {sanitationStatus.label} (Click for Nagpur area scores)
          </span>
        </div>

        {/* Open Complaints count */}
        <div 
          className="kpi-card"
          onClick={() => {
            const el = document.querySelector(".complaint-list");
            if (el) el.scrollIntoView({ behavior: "smooth" });
          }}
          title="Click to scroll to the reports feed"
        >
          <div className="kpi-header">
            <span className="kpi-title">OPEN COMPLAINTS</span>
            <FileText className="kpi-icon" size={16} />
          </div>
          <div className="kpi-value-container">
            <span className="kpi-value">{insights.open_complaints_count}</span>
          </div>
          <span className="kpi-status-label text-dim" style={{ color: "#0284c7", fontWeight: 700 }}>
            {insights.duplicate_complaints_prevented} Grouped Clusters (Go to log)
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

      {/* 5. CRITERIA DETAIL SLIDE-OUT DRAWER */}
      <div className={`criteria-drawer-overlay ${selectedCriteria ? "active" : ""}`}>
        {selectedCriteria && (
          <>
            <div className="criteria-drawer-header">
              <div className="criteria-drawer-title-container">
                <span className="criteria-drawer-title">
                  {selectedCriteria === "traffic" && "🚦 Traffic Congestion Updates"}
                  {selectedCriteria === "air-quality" && "🌬️ Air Quality Updates"}
                  {selectedCriteria === "water" && "💧 Water Pipeline Updates"}
                  {selectedCriteria === "sanitation" && "🗑️ Sanitation bin Updates"}
                  {selectedCriteria === "pulse" && "📈 City Health Score Details"}
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                  Detailed overview and manual database refresh portal
                </span>
              </div>
              <button className="criteria-drawer-close" onClick={closeCriteriaDrawer}>
                &times;
              </button>
            </div>

            {selectedCriteria === "pulse" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ background: "#f1f5f9", padding: "16px", borderRadius: "10px", border: "1px solid var(--border-muted)" }}>
                  <h4 style={{ margin: "0 0 8px 0", fontSize: "14px" }}>What is City Pulse Score?</h4>
                  <p style={{ fontSize: "12.5px", lineHeight: "1.5", color: "var(--text-muted)", margin: 0 }}>
                    The City Pulse Score is a real-time health indicator calculated out of 100. It computes a weighted average of key metrics (Traffic 25%, AQI 25%, Water 20%, Sanitation 15%, Citizen Complaints 15%) across all neighborhoods.
                  </p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <h4 style={{ margin: "0", fontSize: "13px", fontWeight: 700 }}>Weighted Criteria Breakdown:</h4>
                  <div style={{ fontSize: "12px", display: "grid", gridTemplateColumns: "1fr auto", gap: "8px" }}>
                    <span>🚦 Road Traffic Congestion</span><strong>25% weight</strong>
                    <span>🌬️ Ambient Air Quality Index (AQI)</span><strong>25% weight</strong>
                    <span>💧 Mainline Water Pressure & Flow</span><strong>20% weight</strong>
                    <span>🗑️ Sanitation Bin Fill Levels</span><strong>15% weight</strong>
                    <span>💬 Active Citizen Reports & Alerts</span><strong>15% weight</strong>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <button 
                  className="criteria-refresh-btn" 
                  disabled={isRefreshingCriteria}
                  onClick={() => handleRefreshCriteria(selectedCriteria)}
                  style={{ width: "100%" }}
                >
                  {isRefreshingCriteria ? "Fetching live updates..." : `Scan & Refresh ${selectedCriteria} status`}
                </button>

                {criteriaDetails ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px", flexGrow: 1, minHeight: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", padding: "14px 18px", borderRadius: "8px", border: "1px solid var(--border-muted)" }}>
                      <div>
                        <span style={{ fontSize: "11px", color: "var(--text-dim)", textTransform: "uppercase" }}>City-wide Average</span>
                        <div style={{ fontSize: "20px", fontWeight: 800 }}>
                          {criteriaDetails.average_value}{criteriaDetails.unit}
                        </div>
                      </div>
                      <span className={`kpi-status-label ${criteriaDetails.status_class}`} style={{ fontSize: "13px", fontWeight: 800 }}>
                        {criteriaDetails.status}
                      </span>
                    </div>

                    <h4 style={{ margin: "4px 0 0 0", fontSize: "13px", textTransform: "uppercase", color: "var(--text-dim)", letterSpacing: "0.5px" }}>
                      Regional Scores (Nagpur City)
                    </h4>

                    <div className="criteria-regions-list">
                      {criteriaDetails.regions && criteriaDetails.regions.map((reg) => (
                        <div className="criteria-region-row" key={reg.ward_id}>
                          <div>
                            <span className="criteria-region-name">{reg.region_name}</span>
                            <div className="criteria-region-details">
                              {selectedCriteria === "traffic" && (
                                <>
                                  <span>🚗 Count: {reg.vehicle_count}</span>
                                  <span>⚡ Speed: {reg.average_speed} km/h</span>
                                </>
                              )}
                              {selectedCriteria === "water" && (
                                <>
                                  <span>🌊 Flow: {reg.flow_rate} L/s</span>
                                  <span>📈 Cons: {reg.consumption} L/s</span>
                                </>
                              )}
                              {selectedCriteria === "air-quality" && (
                                <>
                                  <span>pm2.5: {reg.pm25}</span>
                                  <span>pm10: {reg.pm10}</span>
                                </>
                              )}
                              {selectedCriteria === "sanitation" && (
                                <>
                                  <span>Status: {reg.collection_status}</span>
                                  <span>Fill: {reg.value}%</span>
                                </>
                              )}
                            </div>
                          </div>
                          <span className="criteria-region-val" style={{ color: "var(--text-main)" }}>
                            {reg.value}{criteriaDetails.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", height: "150px", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                    Loading database status...
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

    </div>
  );
}

// Helper colors for inline style mappings (High-contrast for accessibility)
const getSeverityColor = (sev) => {
  const s = sev?.toUpperCase();
  if (s === "CRITICAL") return "#b91c1c";
  if (s === "HIGH") return "#c2410c";
  if (s === "MEDIUM") return "#b45309";
  return "#15803d";
};
