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
  if (score == null) return "#64748b"; // slate-500
  if (score >= 80) return "#10b981"; // emerald-500
  if (score >= 60) return "#eab308"; // yellow-500
  return "#ef4444"; // red-500
};

// Component to dynamically pan/zoom map when selected ward changes
function MapController({ center }) {
  const map = useMap();
  if (center) {
    map.setView(center, 14, { animate: true });
  }
  return null;
}

export default function WardMap({ wards, pulses, selectedWardId, onSelectWard }) {
  // Center map around Ward 4 (Sitabuldi) which is geographically central
  const mapCenter = [21.145, 79.085];
  
  const selectedWard = wards.find(w => w.id === selectedWardId);
  const controllerCenter = selectedWard ? [selectedWard.latitude, selectedWard.longitude] : null;

  return (
    <div className="map-wrapper">
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
          const color = getScoreColor(score);
          const hexagon = getWardHexagon(ward.latitude, ward.longitude);
          const isSelected = ward.id === selectedWardId;

          return (
            <Polygon
              key={`poly-${ward.id}`}
              positions={hexagon}
              pathOptions={{
                color: isSelected ? "#38bdf8" : color,
                weight: isSelected ? 3 : 1.5,
                fillColor: color,
                fillOpacity: isSelected ? 0.35 : 0.18,
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

        {/* Pulse center markers */}
        {wards.map((ward) => {
          const pulse = pulses[ward.id];
          const score = pulse?.score ?? ward.baseline_pulse_score;
          const color = getScoreColor(score);

          return (
            <CircleMarker
              key={`marker-${ward.id}`}
              center={[ward.latitude, ward.longitude]}
              radius={ward.id === selectedWardId ? 8 : 5}
              pathOptions={{
                color: ward.id === selectedWardId ? "#38bdf8" : color,
                fillColor: ward.id === selectedWardId ? "#38bdf8" : color,
                fillOpacity: 0.9,
                weight: ward.id === selectedWardId ? 3 : 1,
              }}
              eventHandlers={{
                click: () => onSelectWard(ward.id),
              }}
            />
          );
        })}

        <MapController center={controllerCenter} />
      </MapContainer>
    </div>
  );
}
