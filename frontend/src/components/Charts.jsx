import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

// Helper to determine status color based on pulse score
const getScoreColor = (score) => {
  if (score >= 80) return "#10b981"; // emerald-500
  if (score >= 60) return "#eab308"; // yellow-500
  return "#ef4444"; // red-500
};

// 1. Live City Pulse Trend Chart (Area Chart)
export function PulseTrendChart({ data }) {
  // Mock fallback data if no trend recorded yet
  const chartData = data && data.length > 0 ? data : [
    { time: "10:00", score: 85 },
    { time: "10:10", score: 84 },
    { time: "10:20", score: 85 },
    { time: "10:30", score: 83 },
    { time: "10:40", score: 82 },
    { time: "10:50", score: 81 },
    { time: "11:00", score: 79 },
  ];

  return (
    <div style={{ width: "100%", height: 180 }}>
      <ResponsiveContainer>
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
          <defs>
            <linearGradient id="colorPulse" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
          <XAxis 
            dataKey="time" 
            stroke="#64748b" 
            fontSize={10} 
            tickLine={false}
          />
          <YAxis 
            domain={[30, 100]} 
            stroke="#64748b" 
            fontSize={10} 
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "#0f172a",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "6px",
              fontSize: "11px",
              color: "#f1f5f9"
            }}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="#38bdf8"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorPulse)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// 2. Selected Ward Domain Breakdown Chart (Bar Chart)
export function DomainComparisonChart({ breakdown }) {
  if (!breakdown) {
    return (
      <div style={{ display: "flex", height: 160, alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: "12px" }}>
        No ward selected to view breakdown.
      </div>
    );
  }

  // Parse breakdown values
  const data = [
    { name: "Traffic", value: breakdown.traffic },
    { name: "Air Quality", value: breakdown.air_quality },
    { name: "Water", value: breakdown.water },
    { name: "Sanitation", value: breakdown.sanitation },
    { name: "Citizen Health", value: breakdown.citizen },
  ];

  return (
    <div style={{ width: "100%", height: 160 }}>
      <ResponsiveContainer>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" horizontal={false} />
          <XAxis 
            type="number" 
            domain={[0, 100]} 
            stroke="#64748b" 
            fontSize={9} 
            tickLine={false}
            axisLine={false}
          />
          <YAxis 
            dataKey="name" 
            type="category" 
            stroke="#94a3b8" 
            fontSize={10} 
            tickLine={false}
            width={75}
          />
          <Tooltip
            cursor={{ fill: "rgba(255, 255, 255, 0.02)" }}
            contentStyle={{
              background: "#0f172a",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "6px",
              fontSize: "11px",
              color: "#f1f5f9"
            }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={10}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getScoreColor(entry.value)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
