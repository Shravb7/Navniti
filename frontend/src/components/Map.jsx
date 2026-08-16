import { MapContainer, TileLayer, Polygon, CircleMarker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Helper to calculate hexagonal bounds around a ward center coordinate
const getWardHexagon = (lat, lng) => {
  const d = 0.0075; // hexagon radius
  return [
    [lat + d * 0.9, lng],
    [lat + d * 0.45, lng + d * 0.8],
    [lat - d * 0.45, lng + d * 0.8],
    [lat - d * 0.9, lng],
    [lat - d * 0.45, lng - d * 0.8],
    [lat + d * 0.45, lng - d * 0.8],
  ];
};

// Helper to determine status color based on pulse score
const getScoreColor = (score) => {
  if (score == null) return "#64748b";
  if (score >= 80) return "#15803d";
  if (score >= 60) return "#b45309";
  return "#b91c1c";
};

// Priority coloring based on the selected criteria
const getMetricColor = (criteria, pulse) => {
  if (!pulse || !pulse.raw_values) return "#cbd5e1";
  
  const raw = pulse.raw_values;
  if (criteria === "traffic") {
    const val = raw.congestion ?? 0;
    if (val >= 70) return "#b91c1c"; // Red: Gridlock
    if (val >= 50) return "#c2410c"; // Orange: Heavy
    if (val >= 35) return "#b45309"; // Yellow: Moderate
    return "#15803d"; // Green: Clear
  }
  if (criteria === "water") {
    const val = raw.pressure ?? 80;
    if (val <= 45) return "#0284c7"; // Cyan/Deep Blue: Water Logging or Pipeline Break
    if (val <= 65) return "#0e7490"; // Teal: Low pressure
    if (val >= 95) return "#b91c1c"; // Red: Overpressure hazard
    return "#15803d"; // Green: Stable pressure
  }
  if (criteria === "air-quality") {
    const val = raw.aqi ?? 50;
    if (val >= 200) return "#7c3aed"; // Purple: Hazardous
    if (val >= 150) return "#ec4899"; // Pink: Unhealthy
    if (val >= 100) return "#c2410c"; // Orange: Poor
    return "#15803d"; // Green: Good
  }
  if (criteria === "sanitation") {
    const val = raw.garbage_fill ?? 0;
    if (val >= 80) return "#b45309"; // Dark Amber: Overflowing backlog
    if (val >= 60) return "#d97706"; // Medium Amber: Warning backlog
    return "#15803d"; // Green: Clean
  }
  
  // Fallback to overall pulse score
  return getScoreColor(pulse.score);
};

// Component to dynamically pan/zoom map when selected ward changes
function MapController({ center }) {
  const map = useMap();
  if (center) {
    map.setView(center, 14, { animate: true });
  }
  return null;
}

export default function WardMap({ wards, pulses, selectedWardId, onSelectWard, selectedCriteria }) {
  // Center map around Ward 4 (Sitabuldi) which is geographically central
  const mapCenter = [21.145, 79.085];
  
  const selectedWard = wards.find(w => w.id === selectedWardId);
  const controllerCenter = selectedWard ? [selectedWard.latitude, selectedWard.longitude] : null;

  return (
    <div className="map-wrapper" style={{ position: "relative", height: "100%", width: "100%" }}>
      <MapContainer
        center={mapCenter}
        zoom={13}
        zoomControl={true}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {wards.map((ward) => {
          const pulse = pulses[ward.id];
          const score = pulse?.score ?? ward.baseline_pulse_score;
          
          // Use metric-specific priority coloring instead of overall pulse color when active
          const color = getMetricColor(selectedCriteria, pulse);
          const hexagon = getWardHexagon(ward.latitude, ward.longitude);
          const isSelected = ward.id === selectedWardId;

          return (
            <Polygon
              key={`poly-${ward.id}`}
              positions={hexagon}
              pathOptions={{
                color: isSelected ? "#0284c7" : color,
                weight: isSelected ? 3.5 : 1.5,
                fillColor: color,
                fillOpacity: isSelected ? 0.45 : 0.25,
                dashArray: isSelected ? "" : "3",
              }}
              eventHandlers={{
                click: () => onSelectWard(ward.id),
              }}
            >
              <Popup>
                <div style={{ pointerEvents: "auto" }}>
                  <h3 style={{ margin: "0 0 6px 0", color: "var(--text-main)", fontWeight: 700, fontSize: "14px" }}>
                    {ward.name}
                  </h3>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "4px 0" }}>
                    <span
                      style={{
                        background: color + "15",
                        color: color,
                        border: `1px solid ${color}35`,
                        padding: "3.5px 7px",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: 700,
                        fontFamily: "var(--font-sans)"
                      }}
                    >
                      PULSE: {score.toFixed(0)}/100
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 500 }}>
                      Pop: {(ward.population / 1000).toFixed(0)}k
                    </span>
                  </div>
                  
                  {pulse?.raw_values && (
                    <div style={{ marginTop: "10px", fontSize: "11.5px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", color: "var(--text-muted)" }}>
                      <div>🚦 Traffic: {pulse.raw_values.congestion.toFixed(0)}%</div>
                      <div>🌬️ Air (AQI): {pulse.raw_values.aqi.toFixed(0)}</div>
                      <div>💧 Water: {pulse.raw_values.pressure.toFixed(0)} PSI</div>
                      <div>🗑️ Trash: {pulse.raw_values.garbage_fill.toFixed(0)}%</div>
                    </div>
                  )}

                  {pulse?.raw_values?.complaints_count > 0 && (
                    <div
                      style={{
                        marginTop: "8px",
                        fontSize: "11px",
                        color: "var(--color-critical)",
                        fontWeight: 700,
                        background: "rgba(185, 28, 28, 0.08)",
                        padding: "3px 6px",
                        borderRadius: "3px"
                      }}
                    >
                      ⚠️ {pulse.raw_values.complaints_count} Active Reports
                    </div>
                  )}
                  
                  <button
                    onClick={() => onSelectWard(ward.id)}
                    style={{
                      marginTop: "12px",
                      width: "100%",
                      padding: "6px",
                      background: "#0284c7",
                      border: "none",
                      borderRadius: "6px",
                      color: "#ffffff",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                      textAlign: "center"
                    }}
                  >
                    FOCUS REGION
                  </button>
                </div>
              </Popup>
            </Polygon>
          );
        })}

        {/* Pulse center markers colored by current priority */}
        {wards.map((ward) => {
          const pulse = pulses[ward.id];
          const color = getMetricColor(selectedCriteria, pulse);

          return (
            <CircleMarker
              key={`marker-${ward.id}`}
              center={[ward.latitude, ward.longitude]}
              radius={ward.id === selectedWardId ? 8 : 5}
              pathOptions={{
                color: ward.id === selectedWardId ? "#0284c7" : color,
                fillColor: ward.id === selectedWardId ? "#0284c7" : color,
                fillOpacity: 0.9,
                weight: ward.id === selectedWardId ? 3.5 : 1,
              }}
              eventHandlers={{
                click: () => onSelectWard(ward.id),
              }}
            />
          );
        })}

        <MapController center={controllerCenter} />
      </MapContainer>

      {/* Dynamic Map Priority Legend Overlay */}
      <div className="map-legend">
        <span className="legend-title">
          {!selectedCriteria && "Pulse Score Health"}
          {selectedCriteria === "traffic" && "🚦 Traffic Congestion"}
          {selectedCriteria === "water" && "💧 Water Main Pressure"}
          {selectedCriteria === "air-quality" && "🌬️ Air Quality (AQI)"}
          {selectedCriteria === "sanitation" && "🗑️ Trash Bin Fill"}
        </span>
        {!selectedCriteria && (
          <>
            <div className="legend-item"><span className="legend-color-dot" style={{ background: "#15803d" }} /><span>Healthy (Pulse &ge; 80)</span></div>
            <div className="legend-item"><span className="legend-color-dot" style={{ background: "#b45309" }} /><span>Warning (Pulse 60-79)</span></div>
            <div className="legend-item"><span className="legend-color-dot" style={{ background: "#b91c1c" }} /><span>Critical (Pulse &lt; 60)</span></div>
          </>
        )}
        {selectedCriteria === "traffic" && (
          <>
            <div className="legend-item"><span className="legend-color-dot" style={{ background: "#b91c1c" }} /><span>Gridlock (&ge; 70%)</span></div>
            <div className="legend-item"><span className="legend-color-dot" style={{ background: "#c2410c" }} /><span>Heavy (50-69%)</span></div>
            <div className="legend-item"><span className="legend-color-dot" style={{ background: "#b45309" }} /><span>Moderate (35-49%)</span></div>
            <div className="legend-item"><span className="legend-color-dot" style={{ background: "#15803d" }} /><span>Clear (&lt; 35%)</span></div>
          </>
        )}
        {selectedCriteria === "water" && (
          <>
            <div className="legend-item"><span className="legend-color-dot" style={{ background: "#0284c7" }} /><span>Pipeline Leak/Logging (&le; 45 PSI)</span></div>
            <div className="legend-item"><span className="legend-color-dot" style={{ background: "#0e7490" }} /><span>Low Pressure (46-65 PSI)</span></div>
            <div className="legend-item"><span className="legend-color-dot" style={{ background: "#b91c1c" }} /><span>Overpressure (&ge; 95 PSI)</span></div>
            <div className="legend-item"><span className="legend-color-dot" style={{ background: "#15803d" }} /><span>Stable (66-94 PSI)</span></div>
          </>
        )}
        {selectedCriteria === "air-quality" && (
          <>
            <div className="legend-item"><span className="legend-color-dot" style={{ background: "#7c3aed" }} /><span>Hazardous (&ge; 200 AQI)</span></div>
            <div className="legend-item"><span className="legend-color-dot" style={{ background: "#ec4899" }} /><span>Unhealthy (150-199 AQI)</span></div>
            <div className="legend-item"><span className="legend-color-dot" style={{ background: "#c2410c" }} /><span>Poor (100-149 AQI)</span></div>
            <div className="legend-item"><span className="legend-color-dot" style={{ background: "#15803d" }} /><span>Good (&lt; 100 AQI)</span></div>
          </>
        )}
        {selectedCriteria === "sanitation" && (
          <>
            <div className="legend-item"><span className="legend-color-dot" style={{ background: "#b45309" }} /><span>Overflow Risk (&ge; 80% full)</span></div>
            <div className="legend-item"><span className="legend-color-dot" style={{ background: "#d97706" }} /><span>Warning Backlog (60-79% full)</span></div>
            <div className="legend-item"><span className="legend-color-dot" style={{ background: "#15803d" }} /><span>Clean (&lt; 60% full)</span></div>
          </>
        )}
      </div>
    </div>
  );
}
