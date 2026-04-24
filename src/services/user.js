// src/services/user.js
const API = (process.env.REACT_APP_API_BASE_URL || "").replace(/\/$/, "");

function getToken() {
  return (
    localStorage.getItem("ns_auth_token") ||
    sessionStorage.getItem("ns_auth_token") ||
    ""
  );
}

function authHeaders() {
  const t = getToken();
  const h = { "Content-Type": "application/json" };
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

// GET /api/users/me
export async function getMe() {
  const res = await fetch(`${API}/api/users/me`, {
    method: "GET",
    headers: authHeaders(),
    credentials: "include",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Erro ${res.status} ao carregar usuário`);
  }
  return res.json();
}
