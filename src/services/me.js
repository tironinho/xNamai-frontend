// src/services/me.js
import supabase from "../utils/supabaseClient";
import { apiJoin, authHeaders } from "../lib/api";

async function request(path, opts = {}) {
  const r = await fetch(apiJoin(path), {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}), ...authHeaders() },
    credentials: "omit",
    body:
      opts.body == null
        ? undefined
        : typeof opts.body === "string"
        ? opts.body
        : JSON.stringify(opts.body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    const err = new Error(text || `${r.status}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

export async function getMyReservations() {
  const json = await request("/me/reservations");
  return json.reservations || [];
}

export async function pingSupabase() {
  const { data, error } = await supabase.from("teste").select("*").limit(1);
  if (error) throw error;
  return data;
}
