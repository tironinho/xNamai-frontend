// src/services/pix.js
// Serviço PIX desacoplado da UI. Suporta backend real (Render) e mock local.

const API_BASE =
  (process.env.REACT_APP_API_BASE ||
    process.env.REACT_APP_API_BASE_URL ||
    'https://newstore-backend.onrender.com'
  ).replace(/\/+$/, '');

const USE_BACKEND =
  String(process.env.REACT_APP_USE_BACKEND || (process.env.REACT_APP_AUTH_PROVIDER === 'backend'))
    .toLowerCase() === 'true';

/* -------------------- Auth helpers -------------------- */
function sanitizeToken(t) {
  if (!t) return '';
  let s = String(t).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);
  if (/^Bearer\s+/i.test(s)) s = s.replace(/^Bearer\s+/i, '').trim();
  return s.replace(/\s+/g, '');
}

function getAuthToken() {
  try {
    const keys = ['ns_auth_token', 'authToken', 'token', 'jwt', 'access_token'];
    for (const k of keys) {
      const v = localStorage.getItem(k) || sessionStorage.getItem(k);
      if (v) return sanitizeToken(v);
    }
    const m = document.cookie.match(/(?:^|;\s*)(token|jwt)=([^;]+)/i);
    return m ? sanitizeToken(decodeURIComponent(m[2])) : '';
  } catch {
    return '';
  }
}

/* -------------------- Fetch helper -------------------- */
async function doFetch(url, opts = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(url, { ...opts, headers, credentials: 'include' });

  let text = '';
  try { text = await res.text(); } catch {}
  const asJson = () => { try { return JSON.parse(text || '{}'); } catch { return {}; } };

  if (!res.ok) {
    const j = asJson();
    const msg = j?.error ? String(j.error) : (text && text.length < 400 ? text : `HTTP ${res.status}`);
    const err = new Error(msg);
    err.status = res.status;
    err.body = j;
    throw err;
  }
  if (res.status === 204) return null;
  return text ? JSON.parse(text) : null;
}

/* -------------------- Backend calls -------------------- */
async function createReservationBackend(numbers) {
  return doFetch(`${API_BASE}/api/reservations`, {
    method: 'POST',
    body: JSON.stringify({ numbers }),
  });
}

async function createPixBackend(reservationId) {
  return doFetch(`${API_BASE}/api/payments/pix`, {
    method: 'POST',
    body: JSON.stringify({ reservationId }),
  });
}

export async function checkPixStatus(paymentId) {
  if (!USE_BACKEND) return { id: paymentId, status: 'pending' };
  return doFetch(`${API_BASE}/api/payments/${paymentId}/status`, { method: 'GET' });
}

/* -------------------- Mock provider (dev) -------------------- */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function createPixMock({ amount }) {
  await wait(500);
  const paymentId = String(Math.floor(1e9 + Math.random() * 9e9));
  const cents = String(Number(amount || 0).toFixed(2)).replace('.', '');
  const copy = `00020126580014br.gov.bcb.pix0136EXEMPLO-PIX-NAO-PAGAVEL520400005303986540${cents}`;
  return {
    id: paymentId,
    paymentId,
    status: 'pending',
    qr_code: copy,
    qr_code_base64: '',
    copy_paste_code: copy,
    amount,
    expires_in: 30 * 60,
  };
}

/* -------------------- API principal para a UI -------------------- */
export async function createPixPayment({
  orderId,
  amount,
  numbers = [],
  customer,
  reservationId,
} = {}) {
  if (!USE_BACKEND) return createPixMock({ amount });

  // 1) Garante uma reserva válida (se não foi passada)
  let rid = (reservationId || '').trim();
  if (!rid) {
    try {
      const r = await createReservationBackend(numbers);
      rid = r?.reservationId || r?.id || r;
    } catch (e) {
      if (e.status === 401) throw new Error('Você precisa entrar para reservar e pagar.');
      if (e.status === 409) {
        const conflicts = Array.isArray(e.body?.conflicts) ? e.body.conflicts.join(', ') : e.body?.n || '';
        throw new Error(`Alguns números ficaram indisponíveis: ${conflicts}`);
      }
      throw e;
    }
  }

  // 2) Solicita o PIX
  const data = await createPixBackend(rid);

  // 3) Normaliza
  return {
    paymentId: data.paymentId || data.id,
    id: data.paymentId || data.id,
    status: data.status || 'pending',
    qr_code: data.qr_code || data.copy_paste_code || '',
    qr_code_base64: (data.qr_code_base64 || '').replace(/\s/g, ''),
    copy_paste_code: data.qr_code || data.copy_paste_code || '',
    amount,
    expires_in: data.expires_in ?? 30 * 60,
    reservationId: rid,
    amount_cents: typeof data.amount_cents === 'number' ? data.amount_cents : undefined,
  };
}
