// src/services/numbers.js
const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000').replace(/\/+$/,'');

function getAuthToken() {
  try {
    const raw = localStorage.getItem('ns_auth_token') || sessionStorage.getItem('ns_auth_token') || '';
    return raw?.replace(/^Bearer\s+/i,'').replace(/^["']|["']$/g,'');
  } catch { return ''; }
}

async function doFetch(url, opts = {}) {
  const token = getAuthToken();
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, Object.assign({}, opts, { headers }));
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(text || `${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function getDrawNumbers(drawId) {
  const json = await doFetch(`${API_BASE_URL}/api/draws/${drawId}/numbers`);
  return json.numbers || [];
}
