import { useState } from "react";
import { AlertTriangle, CheckCircle, ShieldAlert, Clock, BarChart3, Wrench } from "lucide-react";

// Helper to determine status color based on severity
const getSeverityColor = (sev) => {
  const s = sev?.toUpperCase();
  if (s === "CRITICAL") return "#ef4444";
  if (s === "HIGH") return "#f97316";
  if (s === "MEDIUM") return "#eab308";
  return "#10b981";
};

export default function AlertDetailModal({ alert, onClose }) {
  const [deployedActions, setDeployedActions] = useState({});

  if (!alert) return null;

  const color = getSeverityColor(alert.severity);

  const handleDeploy = (idx) => {
    setDeployedActions(prev => ({
      ...prev,
      [idx]: true
    }));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content-card" onClick={(e) => e.stopPropagation()}>
        
        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {alert.severity === "CRITICAL" || alert.severity === "HIGH" ? (
              <ShieldAlert color={color} size={20} style={{ animation: "pulse-active 1.5s infinite" }} />
            ) : (
              <AlertTriangle color={color} size={20} />
            )}
            <span className="modal-title" style={{ color: color }}>
              {alert.title}
            </span>
          </div>
          <button className="modal-close-btn" onClick={onClose}>&times;</button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          
          {/* Metadata Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "12px", background: "rgba(0,0,0,0.15)", padding: "12px 16px", borderRadius: "8px" }}>
            <div style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", color: "#cbd5e1" }}>
              <Clock size={14} color="#94a3b8" />
              <span>Time: {new Date(alert.timestamp).toLocaleTimeString()}</span>
            </div>
            <div style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", color: "#cbd5e1" }}>
              <BarChart3 size={14} color="#94a3b8" />
              <span>Confidence: </span>
              <span style={{ fontWeight: 700, color: "#38bdf8", fontFamily: "Orbitron, monospace" }}>
                {alert.confidence}%
              </span>
            </div>
            <div style={{ fontSize: "12px", color: "#94a3b8", gridColumn: "1 / -1" }}>
              Location: <strong style={{ color: "#f1f5f9" }}>{alert.ward_name}</strong>
            </div>
          </div>

          {/* Description */}
          <div>
            <div className="modal-section-title">Incident Description</div>
            <p style={{ fontSize: "12.5px", color: "#cbd5e1", lineHeight: 1.5 }}>
              {alert.description}
            </p>
          </div>

          {/* Explainable AI ("WHY?") */}
          <div>
            <div className="modal-section-title">
              🧠 WHY THIS ALERT? (EXPLAINABLE AI)
            </div>
            <div className="explain-ai-box">
              <p style={{ fontSize: "11.5px", color: "#94a3b8", marginBottom: "8px", fontWeight: 500 }}>
                The AI correlation engine flagged this alert based on the following verified telemetry and citizen inputs:
              </p>
              <div className="explain-factor-list">
                {alert.contributing_factors && alert.contributing_factors.map((factor, idx) => (
                  <div className="explain-factor-item" key={idx}>
                    <span style={{ color: "#38bdf8", marginRight: "4px" }}>•</span>
                    <span>{factor}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recommended Actions */}
          <div>
            <div className="modal-section-title">
              <Wrench size={12} style={{ marginRight: "4px" }} />
              RECOMMENDED DISPATCH CHECKLIST
            </div>
            <div className="recommendations-box">
              <div className="recommendation-list">
                {alert.recommended_actions && alert.recommended_actions.map((action, idx) => {
                  const isDeployed = deployedActions[idx];
                  return (
                    <div className="recommendation-item" key={idx}>
                      <span className="recommendation-text">{action}</span>
                      {isDeployed ? (
                        <div className="action-triggered-state">
                          <CheckCircle size={14} color="#10b981" />
                          <span>DISPATCHED</span>
                        </div>
                      ) : (
                        <button className="action-trigger-btn" onClick={() => handleDeploy(idx)}>
                          DEPLOY
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <button
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "6px",
              color: "#cbd5e1",
              fontSize: "12px",
              padding: "8px 16px",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            DISMISS COMMAND
          </button>
        </div>

      </div>
    </div>
  );
}
