const API_BASE = "http://localhost:8000";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`${options.method || "GET"} ${path} failed: ${res.status}`);
  return res.json();
}

export const api = {
  getWards: () => request("/wards"),
  getPulse: () => request("/pulse"),
  getAlerts: () => request("/alerts?limit=15"),
  getComplaints: () => request("/complaints?limit=20"),
  submitComplaint: (ward_id, text) =>
    request("/complaints", { method: "POST", body: JSON.stringify({ ward_id, text }) }),
};
