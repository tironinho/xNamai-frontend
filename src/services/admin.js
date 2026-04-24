// src/services/admin.js
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

export async function adminListReservations(params = {}) {
  const usp = new URLSearchParams(params);
  const url = `${API_BASE_URL}/api/admin/reservations${usp.toString() ? ('?' + usp.toString()) : ''}`;
  const json = await doFetch(url);
  return json.reservations || [];
}
