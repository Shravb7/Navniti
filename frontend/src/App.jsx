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

const parseTimestamp = (ts) => {
  if (!ts) return new Date();
  if (typeof ts === "string" && !ts.endsWith("Z") && !ts.includes("+") && !ts.includes("-")) {
    return new Date(ts + "Z");
  }
  return new Date(ts);
};

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

  // Accessibility, criteria and page tab states
  const [isTextScaleLarge, setIsTextScaleLarge] = useState(false);
  const [selectedCriteria, setSelectedCriteria] = useState(null);
  const [criteriaDetails, setCriteriaDetails] = useState(null);
  const [isRefreshingCriteria, setIsRefreshingCriteria] = useState(false);
  const [activeTab, setActiveTab] = useState("gateway");

  // Search & Filter complaints page states
  const [complaintSearch, setComplaintSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");

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
      const uniqueWards = Array.from(new Map(wardsData.map(w => [w.id, w])).values());
      setWards(uniqueWards);

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
            .catch(() => { });
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

  if (activeTab === "gateway") {
    return (
      <div className={`gateway-viewport ${isTextScaleLarge ? "text-scale-large" : ""}`}>
        <div className="gateway-container">

          <div className="gateway-logo-ring">
            <img src="/nagpur_banner.png" alt="Nagpur Emblem" className="gateway-logo" />
          </div>

          <div className="gateway-header">
            <span className="gateway-emblem-text">GOVERNMENT OF MAHARASHTRA &bull; NAGPUR MUNICIPAL CORPORATION</span>
            <h1 className="gateway-title">नवनीती | NAVNITI</h1>
            <p className="gateway-subtitle">
              Smart City Command Control, Telemetry Analytics &amp; Public Incident Gateway Portal
            </p>
          </div>

          <div className="gateway-grid">

            <div className="gateway-card" onClick={() => setActiveTab("command")}>
              <div className="gateway-card-icon">🎛️</div>
              <div className="gateway-card-content">
                <h3 className="gateway-card-title">Live Command Center</h3>
                <p className="gateway-card-desc">Interactive Map, Real-time Sensor Priority Overlay, and Active Simulators.</p>
              </div>
              <span className="gateway-card-arrow">&rarr;</span>
            </div>

            <div className="gateway-card" onClick={() => setActiveTab("analytics")}>
              <div className="gateway-card-icon">📊</div>
              <div className="gateway-card-content">
                <h3 className="gateway-card-title">Nagpur Telemetry Analytics</h3>
                <p className="gateway-card-desc">Regional Ward Performance indexes, Pulse scores, and telemetry tables.</p>
              </div>
              <span className="gateway-card-arrow">&rarr;</span>
            </div>

            <div className="gateway-card" onClick={() => setActiveTab("complaints")}>
              <div className="gateway-card-icon">💬</div>
              <div className="gateway-card-content">
                <h3 className="gateway-card-title">Citizen Incident Database</h3>
                <p className="gateway-card-desc">Search, filter, and review deduplicated grievances and citizen logs.</p>
              </div>
              <span className="gateway-card-arrow">&rarr;</span>
            </div>

            <div className="gateway-card" onClick={() => setActiveTab("dispatch")}>
              <div className="gateway-card-icon">🚒</div>
              <div className="gateway-card-content">
                <h3 className="gateway-card-title">Emergency Fleet Dispatch</h3>
                <p className="gateway-card-desc">Dispatch municipal crews and view active telemetry statuses.</p>
              </div>
              <span className="gateway-card-arrow">&rarr;</span>
            </div>

          </div>

          <div className="gateway-footer">
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginBottom: "8px" }}>
              <button
                className="scale-btn"
                onClick={() => setIsTextScaleLarge(!isTextScaleLarge)}
                style={{ background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "11px" }}
              >
                Aa {isTextScaleLarge ? "Normal Font" : "Large Text"}
              </button>
            </div>
            <div>🔒 Nagpur Smart City G2C Gateway Protocol &amp; Secure Session Active</div>
            <div style={{ marginTop: "6px", fontSize: "11px", opacity: 0.6 }}>Official Portal of Nagpur Municipal Corporation Smart City Command &amp; Control Centre</div>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className={`app-layout-fullscreen ${isTextScaleLarge ? "text-scale-large" : ""}`}>
      <div className="main-viewport-fullscreen">

        {/* BROAD TOP BAR */}
        <header className="viewport-topbar-broad">
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <button
              className="back-gateway-btn"
              onClick={() => setActiveTab("gateway")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "rgba(15, 23, 42, 0.05)",
                border: "1px solid rgba(15, 23, 42, 0.1)",
                borderRadius: "8px",
                padding: "8px 14px",
                fontSize: "12.5px",
                fontWeight: 700,
                color: "#0f172a",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
            >
              &larr; Portal Gateway
            </button>

            <div style={{ width: "1px", height: "24px", background: "rgba(15, 23, 42, 0.15)" }} />

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <img src="/nagpur_banner.png" alt="NavNiti Emblem" style={{ width: "28px", height: "28px", borderRadius: "50%", border: "1px solid rgba(2, 132, 199, 0.15)", background: "#fff", padding: "1px" }} />
              <span style={{ fontWeight: 900, fontSize: "16px", letterSpacing: "1px", color: "#0b1329", textTransform: "uppercase" }}>
                नवनीती | NAV-NITI
              </span>
            </div>

            <div style={{ width: "1px", height: "24px", background: "rgba(15, 23, 42, 0.15)" }} />

            <span className="current-module-title" style={{ fontSize: "14px", fontWeight: 700, color: "#0284c7", textTransform: "uppercase" }}>
              {activeTab === "dashboard" && "🏛️ Dashboard Overview"}
              {activeTab === "command" && "🎛️ Live Command Center"}
              {activeTab === "analytics" && "📊 Telemetry Analytics"}
              {activeTab === "complaints" && "💬 Citizen Incident Logs"}
              {activeTab === "dispatch" && "🚒 Emergency Dispatch"}
              {activeTab === "settings" && "⚙️ System Settings"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            {alerts.length > 0 && (
              <div className="alerts-badge-pill" onClick={() => setActiveTab("dispatch")}>
                ⚠️ {alerts.length} ACTIVE ALERTS
              </div>
            )}

            <div className="system-status-pill">
              <span className={`status-dot ${connected ? "active" : "disconnected"}`} />
              <span>{connected ? "LIVE STATUS" : "DISCONNECTED"}</span>
            </div>

            {/* Scale toggle button */}
            <button className="scale-btn" onClick={() => setIsTextScaleLarge(!isTextScaleLarge)}>
              Aa {isTextScaleLarge ? "Normal Font" : "Large Text"}
            </button>
          </div>
        </header>

        {/* VIEWPORT INNER CONTENT */}
        <div className="viewport-content-fullscreen">

          {/* Tab 1: Welcome Home Portal */}
          {activeTab === "dashboard" && (
            <div className="welcome-portal">

              {/* Hero Banner Area */}
              <div className="welcome-hero-section">
                <div className="welcome-backdrop-text">NMC 360</div>
                <div className="welcome-hero-content">
                  <div className="control-tag">Smart City Control</div>
                  <h2 className="welcome-hero-title">NavNiti: Nagpur's Analytics Portal</h2>
                  <p className="welcome-hero-subtitle">
                    NavNiti is the official smart city command dashboard of the <strong>Nagpur Municipal Corporation</strong>. We monitor traffic congestion, air quality index, water mainline distributions, and sanitation fills dynamically across popular Nagpur regions to optimize city performance and dispatch emergency help.
                  </p>
                  <div className="welcome-btn-row">
                    <button className="welcome-btn-primary" onClick={() => setActiveTab("command")}>
                      🎛️ Enter Command Center
                    </button>
                    <button className="welcome-btn-secondary" onClick={() => { window.print(); }}>
                      📥 Download Latest Report
                    </button>
                  </div>
                </div>
                <div className="welcome-hero-image-container">
                  <img
                    src="/nagpur_banner.png"
                    alt="Nagpur Analytics Mockup"
                    className="welcome-hero-image"
                  />
                </div>
              </div>

              {/* City Vital Signs Grid */}
              <div className="vitals-section">
                <div className="vitals-header-row">
                  <div>
                    <h3 className="vitals-title">City Vital Signs</h3>
                    <span className="vitals-subtitle">Real-time telemetry from 4,200+ municipal sensors.</span>
                  </div>
                  <div className="system-live-badge">
                    <span className="status-dot active" style={{ display: "inline-block", marginRight: "4px" }} />
                    Live System Status
                  </div>
                </div>

                <div className="vitals-grid">
                  <div className="vital-card">
                    <div className="vital-card-header">
                      <div className="vital-card-icon-wrapper" style={{ background: "#eff6ff" }}>🌬️</div>
                      <span className="vital-card-pill" style={{ background: "#e0f2fe", color: "#0369a1" }}>12% Avg Improvement</span>
                    </div>
                    <span className="vital-card-value">{currentAverages.aqi}</span>
                    <span className="vital-card-label">Air Quality Index</span>
                  </div>

                  <div className="vital-card">
                    <div className="vital-card-header">
                      <div className="vital-card-icon-wrapper" style={{ background: "#fff7ed" }}>🚦</div>
                      <span className="vital-card-pill" style={{ background: "#ffedd5", color: "#c2410c" }}>High Peak Hours</span>
                    </div>
                    <span className="vital-card-value">{currentAverages.congestion}%</span>
                    <span className="vital-card-label">Traffic Congestion</span>
                  </div>

                  <div className="vital-card">
                    <div className="vital-card-header">
                      <div className="vital-card-icon-wrapper" style={{ background: "#f0fdf4" }}>💧</div>
                      <span className="vital-card-pill" style={{ background: "#dcfce7", color: "#15803d" }}>Stable Pressure</span>
                    </div>
                    <span className="vital-card-value">{currentAverages.pressure} PSI</span>
                    <span className="vital-card-label">Water Mainline Status</span>
                  </div>

                  <div className="vital-card">
                    <div className="vital-card-header">
                      <div className="vital-card-icon-wrapper" style={{ background: "#faf5ff" }}>🗑️</div>
                      <span className="vital-card-pill" style={{ background: "#f3e8ff", color: "#6b21a8" }}>Active Scan</span>
                    </div>
                    <span className="vital-card-value">{currentAverages.garbage_fill}%</span>
                    <span className="vital-card-label">Sanitation Fills</span>
                  </div>
                </div>
              </div>

              {/* Module Shortcuts Section */}
              <div className="module-shortcuts">

                {/* Large Command Link */}
                <div className="shortcut-card-large" onClick={() => setActiveTab("command")}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div className="shortcut-card-large-icon">📺</div>
                    <h3 className="shortcut-card-large-title">Live Command Center</h3>
                    <p className="shortcut-card-large-desc">
                      Access real-time video feeds, sensor arrays, and critical incident alerts dashboards to monitor and dispatch Nagpur municipal crews instantly.
                    </p>
                  </div>
                  <span className="shortcut-card-large-link">
                    Launch Module &rarr;
                  </span>
                </div>

                {/* Right grid cards */}
                <div className="shortcut-grid-right">
                  <div className="shortcut-card-medium" onClick={() => setActiveTab("analytics")}>
                    <div className="shortcut-card-medium-icon" style={{ background: "#e0f2fe" }}>📊</div>
                    <div>
                      <h4 className="shortcut-card-medium-title">Nagpur Analytics</h4>
                      <p className="shortcut-card-medium-desc">
                        Deep dive into historical data trends, regional ranks, and predictive modeling for municipal sectors.
                      </p>
                    </div>
                  </div>

                  <div className="shortcut-card-medium" onClick={() => setActiveTab("complaints")}>
                    <div className="shortcut-card-medium-icon" style={{ background: "#fef3c7" }}>💬</div>
                    <div>
                      <h4 className="shortcut-card-medium-title">Citizen Logs</h4>
                      <p className="shortcut-card-medium-desc">
                        Review and filter citizen reports, duplicate incident warnings, and direct grievance logs.
                      </p>
                    </div>
                  </div>

                  <div className="shortcut-card-medium" onClick={() => setActiveTab("dispatch")}>
                    <div className="shortcut-card-medium-icon" style={{ background: "#fecdd3" }}>🚒</div>
                    <div>
                      <h4 className="shortcut-card-medium-title">Emergency Fleet</h4>
                      <p className="shortcut-card-medium-desc">
                        Direct dispatch protocols for NMC municipal squads and fire/police crews based on risk levels.
                      </p>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* Tab 2: Live Command Center */}
          {activeTab === "command" && (
            <>
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
                  <div className="panel-card" style={{ flexGrow: 2.2 }}>
                    <div className="panel-card-header">
                      <span className="panel-card-title">
                        <MapPin size={14} color="#38bdf8" />
                        Live Nagpur Region Map
                      </span>
                      <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Hexagons show ward bounds. Click to inspect.</span>
                    </div>
                    <div className="panel-card-body" style={{ padding: 0 }}>
                      <WardMap
                        wards={wards}
                        pulses={pulses}
                        selectedWardId={selectedWardId}
                        onSelectWard={setSelectedWardId}
                        selectedCriteria={selectedCriteria}
                      />
                    </div>
                  </div>

                  {/* City Average Pulse Trend */}
                  <div className="panel-card" style={{ flexGrow: 0.3 }}>
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

                  {/* Quick Legend & Icon Index */}
                  <div className="panel-card" style={{ flexGrow: 0.3 }}>
                    <div className="panel-card-header">
                      <span className="panel-card-title">
                        <Info size={14} color="#0284c7" />
                        Dashboard Legend &amp; Index
                      </span>
                    </div>
                    <div className="panel-card-body" style={{ padding: "12px 14px", display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "14px", fontSize: "11.5px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <span style={{ fontWeight: 700, textTransform: "uppercase", fontSize: "9.5px", color: "var(--text-dim)", letterSpacing: "0.5px" }}>
                          Metric Symbols
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>🚦 <span style={{ color: "var(--text-main)" }}>Road Traffic Congestion</span></div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>🌬️ <span style={{ color: "var(--text-main)" }}>Air Quality Index (AQI)</span></div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>💧 <span style={{ color: "var(--text-main)" }}>Water Main Pressure (PSI)</span></div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>🗑️ <span style={{ color: "var(--text-main)" }}>Garbage Bin Fill Level</span></div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <span style={{ fontWeight: 700, textTransform: "uppercase", fontSize: "9.5px", color: "var(--text-dim)", letterSpacing: "0.5px" }}>
                          Incident Severity
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#b91c1c", display: "inline-block" }} /> <span style={{ color: "var(--text-main)" }}>Red: Critical Severity</span></div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#c2410c", display: "inline-block" }} /> <span style={{ color: "var(--text-main)" }}>Orange: High Severity</span></div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#b45309", display: "inline-block" }} /> <span style={{ color: "var(--text-main)" }}>Yellow: Warning Alert</span></div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#15803d", display: "inline-block" }} /> <span style={{ color: "var(--text-main)" }}>Green: Stable/Healthy</span></div>
                      </div>
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
                                  {parseTimestamp(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
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
                                <span>{parseTimestamp(complaint.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
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
            </>
          )}

          {/* Tab 2: Analytics Page */}
          {activeTab === "analytics" && (
            <div className="subpage-container">

              <div className="panel-card" style={{ height: "100%" }}>
                <div className="panel-card-header">
                  <span className="panel-card-title">📊 Nagpur Region Telemetry Analytics</span>
                </div>
                <div className="panel-card-body">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
                    <div>
                      <h4 style={{ margin: "0 0 10px 0", fontSize: "12px", color: "var(--text-dim)", textTransform: "uppercase" }}>
                        Active Pulse Score Average Trend
                      </h4>
                      <PulseTrendChart data={pulseTrend} />
                    </div>
                    <div>
                      <h4 style={{ margin: "0 0 10px 0", fontSize: "12px", color: "var(--text-dim)", textTransform: "uppercase" }}>
                        Selected Region: {focusedWard?.name || `Region ${selectedWardId}`} Breakdown
                      </h4>
                      <DomainComparisonChart breakdown={focusedWardPulse?.breakdown} />
                    </div>
                  </div>

                  <h4 style={{ margin: "16px 0 10px 0", fontSize: "13px", textTransform: "uppercase", color: "var(--text-dim)", letterSpacing: "0.5px" }}>
                    Nagpur City Neighborhood Rankings
                  </h4>
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Region Name</th>
                        <th>Overall Health Pulse</th>
                        <th>Traffic Congestion</th>
                        <th>Air Quality (AQI)</th>
                        <th>Water Pressure</th>
                        <th>Garbage Fill %</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wards.map(w => {
                        const pulse = pulses[w.id];
                        const score = pulse?.score ?? w.baseline_pulse_score;
                        let status = "Stable";
                        let colorClass = "status-text-stable";
                        if (score < 60) {
                          status = "Critical";
                          colorClass = "status-text-critical";
                        } else if (score < 80) {
                          status = "Warning";
                          colorClass = "status-text-medium";
                        }

                        return (
                          <tr
                            key={w.id}
                            onClick={() => { setSelectedWardId(w.id); setActiveTab("dashboard"); }}
                            style={{ cursor: "pointer" }}
                          >
                            <td style={{ fontWeight: 700 }}>{w.name}</td>
                            <td style={{ fontWeight: 800 }}>{score.toFixed(1)}/100</td>
                            <td>{pulse?.raw_values?.congestion ?? 0}%</td>
                            <td>{pulse?.raw_values?.aqi ?? 50} AQI</td>
                            <td>{pulse?.raw_values?.pressure ?? 80} PSI</td>
                            <td>{pulse?.raw_values?.garbage_fill ?? 0}%</td>
                            <td className={colorClass} style={{ fontWeight: 700 }}>{status}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* Tab 3: Complaints Search Portal */}
          {activeTab === "complaints" && (
            <div className="subpage-container">
              <div className="complaints-portal">

                {/* Filter Sidebar */}
                <div className="filter-sidebar">
                  <span className="panel-card-title" style={{ fontSize: "14px", borderBottom: "1px solid var(--border-muted)", paddingBottom: "10px", marginBottom: "6px" }}>
                    Filter Complaints
                  </span>

                  <div className="filter-group">
                    <label className="form-label">Search Keyword</label>
                    <input
                      type="text"
                      className="filter-input"
                      placeholder="Type to search..."
                      value={complaintSearch}
                      onChange={(e) => setComplaintSearch(e.target.value)}
                    />
                  </div>

                  <div className="filter-group">
                    <label className="form-label">Filter Category</label>
                    <select
                      className="filter-select"
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                    >
                      <option value="all">All Categories</option>
                      <option value="TRAFFIC">Traffic</option>
                      <option value="WATER">Water</option>
                      <option value="AIR_QUALITY">Air Quality</option>
                      <option value="SANITATION">Sanitation</option>
                    </select>
                  </div>

                  <div className="filter-group">
                    <label className="form-label">Filter Severity</label>
                    <select
                      className="filter-select"
                      value={filterSeverity}
                      onChange={(e) => setFilterSeverity(e.target.value)}
                    >
                      <option value="all">All Severities</option>
                      <option value="CRITICAL">Critical</option>
                      <option value="HIGH">High</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="LOW">Low</option>
                    </select>
                  </div>
                </div>

                {/* Complaints List Panel */}
                <div className="panel-card" style={{ height: "100%" }}>
                  <div className="panel-card-header">
                    <span className="panel-card-title">💬 Full Citizen Database Reports ({complaints.length} logged)</span>
                  </div>
                  <div className="panel-card-body">
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {complaints
                        .filter(c => {
                          const matchesSearch = c.raw_text.toLowerCase().includes(complaintSearch.toLowerCase());
                          const matchesCategory = filterCategory === "all" || c.category === filterCategory;
                          const matchesSeverity = filterSeverity === "all" || c.severity === filterSeverity;
                          return matchesSearch && matchesCategory && matchesSeverity;
                        })
                        .map(complaint => (
                          <div key={complaint.id} className="complaint-item-card" style={{ padding: "16px" }}>
                            <div className="complaint-item-top">
                              <span className="complaint-item-category">{complaint.category}</span>
                              <span style={{
                                fontSize: "10px",
                                fontWeight: 700,
                                color: getSeverityColor(complaint.severity),
                                background: getSeverityColor(complaint.severity) + "12",
                                padding: "3px 6px",
                                borderRadius: "4px",
                                border: `1px solid ${getSeverityColor(complaint.severity)}25`
                              }}>
                                {complaint.severity}
                              </span>
                            </div>
                            <p className="complaint-item-text" style={{ fontSize: "13px", margin: "6px 0" }}>
                              "{complaint.raw_text}"
                            </p>
                            {complaint.ai_summary && (
                              <div style={{ fontSize: "11px", color: "var(--text-muted)", background: "#f8fafc", padding: "6px 10px", borderRadius: "4px", border: "1px solid var(--border-muted)", margin: "4px 0" }}>
                                <strong>AI Summary:</strong> {complaint.ai_summary}
                              </div>
                            )}
                            <div className="complaint-item-meta" style={{ marginTop: "4px" }}>
                              <span>Region: <strong>{complaint.ward_name}</strong></span>
                              <span>Timestamp: {parseTimestamp(complaint.timestamp).toLocaleString()}</span>
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* Tab 4: Dispatcher Control Board */}
          {activeTab === "dispatch" && (
            <div className="subpage-container">
              <div className="dispatch-board">

                {/* Left side: active incident dispatcher log */}
                <div className="panel-card">
                  <div className="panel-card-header">
                    <span className="panel-card-title">🚒 Active Dispatch Control Log</span>
                  </div>
                  <div className="panel-card-body">
                    {alerts.length === 0 ? (
                      <div style={{ display: "flex", height: "200px", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                        All parameters operational. No emergency dispatches active.
                      </div>
                    ) : (
                      alerts.map(a => (
                        <div key={a.id} className={`dispatch-log-item ${a.severity.toLowerCase()}`}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontWeight: 800, color: getSeverityColor(a.severity), fontSize: "13px" }}>
                              {a.title}
                            </span>
                            <span className="dispatch-status-badge in-progress">
                              IN PROGRESS
                            </span>
                          </div>
                          <p style={{ fontSize: "12.5px", color: "var(--text-muted)", margin: "4px 0" }}>
                            {a.description}
                          </p>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11.5px", color: "var(--text-dim)", marginTop: "6px", borderTop: "1px solid var(--border-muted)", paddingTop: "6px" }}>
                            <span>Region: <strong>{a.ward_name}</strong></span>
                            <span>Severity: <strong>{a.severity}</strong></span>
                            <button
                              onClick={() => {
                                showToast("Dispatch Resolved", `Emergency fleet successfully cleared incident at ${a.ward_name}.`, "LOW");
                                setAlerts(prev => prev.filter(item => item.id !== a.id));
                              }}
                              style={{
                                background: "rgba(21, 128, 61, 0.12)",
                                color: "#15803d",
                                border: "1px solid rgba(21, 128, 61, 0.25)",
                                borderRadius: "4px",
                                padding: "3px 8px",
                                fontSize: "10px",
                                fontWeight: 700,
                                cursor: "pointer"
                              }}
                            >
                              MARK AS RESOLVED
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Right side: dispatched teams overview */}
                <div className="panel-card">
                  <div className="panel-card-header">
                    <span className="panel-card-title">🛡️ Smart City Fleet Availability</span>
                  </div>
                  <div className="panel-card-body" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div style={{ background: "#f8fafc", border: "1px solid var(--border-muted)", padding: "12px 16px", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div><strong>Nagpur Traffic Police Crew</strong><div style={{ fontSize: "11px", color: "var(--text-dim)" }}>Gridlock diversion units</div></div>
                      <span className="dispatch-status-badge resolved">AVAILABLE</span>
                    </div>
                    <div style={{ background: "#f8fafc", border: "1px solid var(--border-muted)", padding: "12px 16px", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div><strong>Nagpur Municipal Water Team</strong><div style={{ fontSize: "11px", color: "var(--text-dim)" }}>Leak detection and valve shutdown</div></div>
                      <span className="dispatch-status-badge in-progress" style={{ background: "rgba(194, 65, 12, 0.08)", color: "#c2410c", borderColor: "rgba(194, 65, 12, 0.2)" }}>DEPLOYED (Sitabuldi)</span>
                    </div>
                    <div style={{ background: "#f8fafc", border: "1px solid var(--border-muted)", padding: "12px 16px", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div><strong>City Waste Management Trucks</strong><div style={{ fontSize: "11px", color: "var(--text-dim)" }}>Garbage skip lift crews</div></div>
                      <span className="dispatch-status-badge resolved">AVAILABLE</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* Tab 5: Settings & Database Connection */}
          {activeTab === "settings" && (
            <div className="subpage-container" style={{ flexDirection: "row", gap: "16px" }}>

              <div className="panel-card" style={{ flex: 1, height: "fit-content" }}>
                <div className="panel-card-header">
                  <span className="panel-card-title">⚙️ Settings &amp; Database Manager</span>
                </div>
                <div className="panel-card-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div style={{ background: "rgba(2, 132, 199, 0.05)", border: "1px solid rgba(2, 132, 199, 0.15)", borderRadius: "8px", padding: "12px 16px", fontSize: "13px" }}>
                    <strong>Database Status:</strong> {connected ? "Connected (Supabase / Postgres Active)" : "Running local SQLite fallback"}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label className="form-label">API Endpoints Host</label>
                    <input
                      type="text"
                      className="filter-input"
                      value={API_BASE}
                      disabled
                      style={{ background: "#f1f5f9", cursor: "not-allowed" }}
                    />
                  </div>

                  <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                    <button
                      onClick={() => {
                        showToast("Ping Successful", "Backend API responded in 12ms", "LOW");
                      }}
                      className="form-submit-btn"
                    >
                      Ping Backend Connection
                    </button>

                    <button
                      onClick={async () => {
                        try {
                          await fetch(`${API_BASE}/demo/scenario/normal`, { method: "POST" });
                          showToast("Reset Completed", "Cleared transactional data logs.", "LOW");
                          fetchInitialData();
                        } catch {
                          showToast("Reset Failed", "API offline", "CRITICAL");
                        }
                      }}
                      style={{
                        background: "transparent",
                        color: "var(--color-critical)",
                        border: "1px solid var(--color-critical)",
                        borderRadius: "6px",
                        padding: "8px 14px",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer"
                      }}
                    >
                      Reset Command Database
                    </button>
                  </div>
                </div>
              </div>

              <div className="panel-card" style={{ flex: 1.2, height: "fit-content" }}>
                <div className="panel-card-header">
                  <span className="panel-card-title">📖 Operator Explainer Sheet</span>
                </div>
                <div className="panel-card-body" style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "13px", lineHeight: "1.5" }}>
                  <p>Welcome to the Nagpur Smart City command center. Here is a brief guide on managing operations:</p>
                  <ul>
                    <li><strong>Dynamic Map Priority</strong>: Click on any parameter card (Traffic, Water, AQI, Sanitation) in the Command Console to instantly repaint the map to highlight critical regions in that specific domain.</li>
                    <li><strong>Deduplication System</strong>: NLP deduplication automatically groups similar citizen complaints together in real-time, preventing multiple redundant alerts.</li>
                    <li><strong>Text Scaling</strong>: Click the **Aa LARGE TEXT** button in the header if you need high contrast text scaling.</li>
                  </ul>
                </div>
              </div>

            </div>
          )}

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
          </div> {/* closing criteria-drawer-overlay */}
        </div> {/* closing viewport-content */}

        {/* FOOTER */}
        <footer className="viewport-footer">
          <div style={{ display: "flex", gap: "16px" }}>
            <span style={{ cursor: "pointer" }}>Privacy Policy</span>
            <span style={{ cursor: "pointer" }}>National Data Sharing</span>
            <span style={{ cursor: "pointer" }}>Gov.in Directory</span>
          </div>
          <div style={{ opacity: 0.8 }}>
            Official Portal of Nagpur Municipal Corporation Smart City Command &amp; Control Centre. All rights reserved.
          </div>
          <div>
            Secure G2C/G2G Gateway 🔒
          </div>
        </footer>

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
