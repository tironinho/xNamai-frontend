// Centraliza chamadas e injeta Authorization se houver JWT salvo
const API = (process.env.REACT_APP_API_BASE_URL || '').replace(/\/$/, '');

export async function api(path, { method = 'GET', body, params } = {}) {
  const token = localStorage.getItem('ns_auth_token') || sessionStorage.getItem('ns_auth_token');
  const url = API + path + (params ? `?${new URLSearchParams(params).toString()}` : '');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  if (res.status === 401) {
    const t = await res.text().catch(()=>''); 
    throw new Error(`401 Unauthorized: ${t}`);
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}
