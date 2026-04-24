// Util de API para o frontend (React)

// 1) Leia UMA variável de base. Não use BASE_URL junto.
const RAW =
  process.env.REACT_APP_API_BASE ||
  process.env.REACT_APP_API_BASE_URL || // se alguém esquecer de tirar, ainda respeitamos
  "";

// 2) Normaliza a raiz (sem barra final)
const ROOT = String(RAW || "").replace(/\/+$/, "");

// 3) Garante que termina com /api exatamente uma vez
let API_BASE;
if (!ROOT) {
  API_BASE = "/api";
} else if (/\/api$/i.test(ROOT)) {
  API_BASE = ROOT;           // já tem /api
} else {
  API_BASE = ROOT + "/api";  // acrescenta /api
}

// 4) Junta caminho, removendo /api duplicado no início do path
export const apiJoin = (path) => {
  let p = path.startsWith("/") ? path : `/${path}`;
  if (API_BASE.endsWith("/api") && p.startsWith("/api/")) p = p.slice(4); // tira "/api" extra
  return `${API_BASE}${p}`;
};

/* ---------- token helpers ---------- */
const TOKEN_KEY = "ns_auth_token";
const COMPAT_KEYS = ["token", "access_token"];

export const getStoredToken = () =>
  (
    localStorage.getItem(TOKEN_KEY) ||
    sessionStorage.getItem(TOKEN_KEY) ||
    localStorage.getItem(COMPAT_KEYS[0]) ||
    localStorage.getItem(COMPAT_KEYS[1]) ||
    sessionStorage.getItem(COMPAT_KEYS[0]) ||
    sessionStorage.getItem(COMPAT_KEYS[1]) ||
    ""
  )
    .toString()
    .replace(/^Bearer\s+/i, "")
    .replace(/^["']|["']$/g, "");

export const authHeaders = () => {
  const t = getStoredToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

/* ---------- HTTP helpers ---------- */
async function request(pathOrUrl, opts = {}) {
  const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : apiJoin(pathOrUrl);
  const r = await fetch(url, {
    method: opts.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
      ...authHeaders(), // sempre tenta mandar o token se existir
    },
    credentials: "omit", // usamos Authorization, não cookie
    body: opts.body ? (typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body)) : undefined,
  });
  if (!r.ok) {
    let err = `${r.status}`;
    try {
      const j = await r.json();
      err = j?.error ? `${j.error}:${r.status}` : err;
    } catch {}
    throw new Error(err);
  }
  const ct = r.headers.get("content-type") || "";
  return ct.includes("application/json") ? r.json() : r.text();
}

export const getJSON = (path, opts = {}) => request(path, { ...opts, method: "GET" });
export const postJSON = (path, body, opts = {}) => request(path, { ...opts, method: "POST", body });
export const putJSON = (path, body, opts = {}) => request(path, { ...opts, method: "PUT", body });
export const delJSON = (path, opts = {}) => request(path, { ...opts, method: "DELETE" });
