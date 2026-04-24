// src/authContext.js
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiJoin } from "./lib/api";

/** ===== DEBUG ===== */
const DBG =
  (typeof window !== "undefined" && (window.NS_DEBUG === 1 || window.NS_DEBUG === true)) ||
  String(localStorage.getItem("NS_DEBUG") || "").trim() === "1";
const dlog = (...a) => { if (DBG) console.log("[auth]", ...a); };
const sanit = (t) => (t ? String(t).slice(0, 16) + "…(" + String(t).length + ")" : "");

/** ===== token helpers ===== */
const TOKEN_KEY = "ns_auth_token";
const COMPAT_KEYS = ["token", "access_token"];

function readToken() {
  const raw =
    localStorage.getItem(TOKEN_KEY) ||
    sessionStorage.getItem(TOKEN_KEY) ||
    localStorage.getItem(COMPAT_KEYS[0]) ||
    localStorage.getItem(COMPAT_KEYS[1]) ||
    sessionStorage.getItem(COMPAT_KEYS[0]) ||
    sessionStorage.getItem(COMPAT_KEYS[1]) ||
    "";
  const cleaned = String(raw).replace(/^Bearer\s+/i, "").replace(/^["']|["']$/g, "");
  dlog("readToken()", sanit(cleaned));
  return cleaned;
}

function saveToken(tk, persist = true) {
  const clean = String(tk).replace(/^Bearer\s+/i, "");
  dlog("saveToken(persist:", persist, ") value:", sanit(clean));
  try {
    if (persist) {
      localStorage.setItem(TOKEN_KEY, clean);
      COMPAT_KEYS.forEach((k) => {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
      });
      sessionStorage.removeItem(TOKEN_KEY);
    } else {
      sessionStorage.setItem(TOKEN_KEY, clean);
      localStorage.removeItem(TOKEN_KEY);
      COMPAT_KEYS.forEach((k) => {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
      });
    }
  } catch (e) {
    dlog("saveToken error:", e?.message || e);
  }
}

function clearToken() {
  dlog("clearToken()");
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    COMPAT_KEYS.forEach((k) => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
  } catch {}
}

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setTokenState] = useState(readToken());
  const [loading, setLoading] = useState(true);

  async function loadUser() {
    const tk = readToken();
    setTokenState(tk || "");
    if (!tk) {
      dlog("loadUser(): sem token -> user=null");
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const url = apiJoin("/me");
      dlog("loadUser(): GET", url);
      const r = await fetch(url, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        credentials: "include",
      });
      dlog("loadUser(): status", r.status);
      if (!r.ok) {
        if (r.status === 401) {
          dlog("loadUser(): 401 -> limpar token");
          clearToken();
          setUser(null);
          setTokenState("");
        }
        setLoading(false);
        return;
      }
      const data = await r.json().catch(() => null);
      dlog("loadUser(): body", data);
      setUser(data?.user || data || null);
    } catch (e) {
      dlog("loadUser() failed:", e?.message || e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    dlog("AuthProvider mount. API base:", apiJoin("/").replace(/\/+$/, ""));
    loadUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Faz login, persiste token, busca /me e devolve o user já carregado.
   */
  async function login({ email, password, remember = true }) {
    const loginUrl = apiJoin("/auth/login");
    dlog("login(): POST", loginUrl, { email, remember });

    const r = await fetch(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    dlog("login(): status", r.status);
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      dlog("login(): erro body", err);
      throw new Error(err?.error || "login_failed");
    }

    const data = await r.json().catch(() => ({}));
    const tk = data?.token || data?.access_token || data?.jwt;
    dlog("login(): token recebido?", !!tk, tk && sanit(tk));
    if (!tk) throw new Error("missing_token");

    saveToken(tk, remember);
    setTokenState(readToken());

    // Carrega o usuário imediatamente
    let me = null;
    try {
      const meUrl = apiJoin("/me");
      dlog("login(): fetch /me", meUrl);
      const m = await fetch(meUrl, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        credentials: "include",
      });
      dlog("login(): /me status", m.status);
      if (m.ok) {
        const body = await m.json().catch(() => null);
        dlog("login(): /me body", body);
        me = body?.user || body || null;
      }
    } catch (e) {
      dlog("login(): /me error", e?.message || e);
    }
    setUser(me);
    return me;
  }

  function logout() {
    dlog("logout()");
    clearToken();
    setUser(null);
    setTokenState("");
  }

  const value = useMemo(
    () => ({ user, token, loading, login, logout }),
    [user, token, loading]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
