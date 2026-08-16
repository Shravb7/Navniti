import { useEffect, useState, useCallback } from "react";
import { api } from "./api";
import "./App.css";

const POLL_MS = 4000;

function scoreBand(score) {
  if (score == null) return "unknown";
  if (score >= 80) return "healthy";
  if (score >= 50) return "warning";
  return "danger";
}

function WardCard({ ward, pulse }) {
  const band = scoreBand(pulse?.score);
  return (
    <div className={`ward-card band-${band}`}>
      <div className="ward-card-top">
        <div>
          <p className="ward-name">{ward.name}</p>
          <span className="ward-id-label">WARD-{String(ward.id).padStart(2, "0")}</span>
        </div>
        <div className={`ward-score band-${band}`}>
          {pulse?.score != null ? pulse.score.toFixed(0) : "--"}
        </div>
      </div>
      {pulse?.breakdown && Object.keys(pulse.breakdown).length > 0 ? (
        <div className="ward-metrics">
          {Object.entries(pulse.breakdown).map(([metric, data]) => (
            <span className="metric-chip" key={metric}>
              {metric.replace(/_/g, " ")}: {data.value}
            </span>
          ))}
        </div>
      ) : (
        <p className="ward-empty">Waiting for sensor data — start simulator.py</p>
      )}
    </div>
  );
}

function AlertsPanel({ alerts }) {
  return (
    <div className="side-panel">
      <p className="section-label">Live alerts</p>
      {alerts.length === 0 ? (
        <p className="empty-state">No alerts yet. The correlation engine fires here in real time.</p>
      ) : (
        alerts.map((a) => (
          <div className="alert-row" key={a.id}>
            <span className={`alert-dot ${a.severity}`} />
            <div className="alert-body">
              <p className="alert-message">{a.message || a.alert_type}</p>
              <span className="alert-meta">{a.ward_name} · {a.created_at}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function ComplaintPanel({ wards, complaints, onSubmitted }) {
  const [wardId, setWardId] = useState(wards[0]?.id || "");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (!wardId && wards.length) setWardId(wards[0].id);
  }, [wards, wardId]);

  const submit = async () => {
    if (!text.trim() || !wardId) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const result = await api.submitComplaint(Number(wardId), text.trim());
      setFeedback(result);
      setText("");
      onSubmitted();
    } catch (e) {
      setFeedback({ error: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="side-panel">
      <p className="section-label">Report an issue</p>
      <div className="complaint-form">
        <select value={wardId} onChange={(e) => setWardId(e.target.value)}>
          {wards.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <textarea
          placeholder="Describe the issue (e.g. pothole on MG road near the market)"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button onClick={submit} disabled={submitting || !text.trim()}>
          {submitting ? "Submitting..." : "Submit report"}
        </button>
        {feedback && !feedback.error && (
          <div className={`form-feedback ${feedback.is_duplicate ? "duplicate" : "ok"}`}>
            {feedback.is_duplicate
              ? `Flagged as a likely duplicate of complaint #${feedback.duplicate_of}`
              : `Logged under "${feedback.category.replace(/_/g, " ")}"`}
          </div>
        )}
      </div>

      <p className="section-label" style={{ marginTop: 18 }}>Recent reports</p>
      {complaints.length === 0 ? (
        <p className="empty-state">No reports yet.</p>
      ) : (
        complaints.slice(0, 8).map((c) => (
          <div className="complaint-row" key={c.id}>
            <div className="complaint-tags">
              <span className="tag">{c.category.replace(/_/g, " ")}</span>
              {c.status === "duplicate" && <span className="tag dup">duplicate</span>}
            </div>
            {c.text}
          </div>
        ))
      )}
    </div>
  );
}

export default function App() {
  const [wards, setWards] = useState([]);
  const [pulses, setPulses] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [connected, setConnected] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [pulseData, alertData, complaintData] = await Promise.all([
        api.getPulse(),
        api.getAlerts(),
        api.getComplaints(),
      ]);
      const byWard = Object.fromEntries(pulseData.map((p) => [p.ward_id, p]));
      setPulses(byWard);
      setAlerts(alertData);
      setComplaints(complaintData);
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    api.getWards().then(setWards).catch(() => setConnected(false));
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="app">
      <div className="header">
        <div className="brand-mark">
          <div>
            <h1 className="brand-name">NavNiti</h1>
            <p className="brand-tagline">The AI-powered digital nervous system for proactive urban governance</p>
          </div>
        </div>
        <div className="live-indicator">
          <span className="live-dot" style={{ background: connected ? "var(--signal)" : "var(--danger)" }} />
          {connected ? "LIVE — LOCAL" : "DISCONNECTED"}
        </div>
      </div>

      <div className="grid-layout">
        <div>
          <p className="section-label">City pulse — {wards.length} wards</p>
          <div className="ward-grid">
            {wards.map((w) => (
              <WardCard key={w.id} ward={w} pulse={pulses[w.id]} />
            ))}
          </div>
        </div>

        <div>
          <AlertsPanel alerts={alerts} />
          <ComplaintPanel wards={wards} complaints={complaints} onSubmitted={refresh} />
        </div>
      </div>
    </div>
  );
}
