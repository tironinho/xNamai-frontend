// src/RequireAdmin.jsx
import * as React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { useAuth } from "./authContext";

const ADMIN_EMAIL = "admin@newstore.com.br";

// Garante /api no fim mesmo se REACT_APP_API_BASE_URL vier sem /api
const RAW_API = process.env.REACT_APP_API_BASE_URL || "/api";
const API_BASE = (
  RAW_API.endsWith("/api") ? RAW_API : `${RAW_API.replace(/\/+$/, "")}/api`
).replace(/\/+$/, "");

function hasToken() {
  return Boolean(
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("token")
  );
}

const authHeaders = () => {
  const tk =
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("token");
  return tk ? { Authorization: `Bearer ${tk}` } : {};
};

export default function RequireAdmin({ children }) {
  const { user, setUser } = useAuth?.() || {};
  const location = useLocation();

  const [me, setMe] = React.useState(user ?? undefined); // undefined = ainda não checamos
  const [loading, setLoading] = React.useState(false);

  // Se o contexto já tem user, use-o
  React.useEffect(() => {
    if (user && me === undefined) setMe(user);
  }, [user, me]);

  // Buscar /me se ainda não temos e existe algum indício de auth (token/cookie)
  React.useEffect(() => {
    let alive = true;

    async function fetchMe() {
      if (me !== undefined) return; // já sabemos algo
      if (!hasToken()) {            // sem token → sem auth
        setMe(null);
        return;
      }
      setLoading(true);
      try {
        const r = await fetch(`${API_BASE}/me`, {
          method: "GET",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          credentials: "include",
        });
        if (!alive) return;

        if (r.ok) {
          const body = await r.json();
          const u = body?.user || body || null;
          setMe(u);
          if (u && setUser) setUser(u);
          try { localStorage.setItem("me", JSON.stringify(u)); } catch {}
        } else {
          // 401/403: não autenticado → manda pro login
          setMe(null);
        }
      } catch {
        setMe(null);
      } finally {
        if (alive) setLoading(false);
      }
    }

    fetchMe();
    return () => { alive = false; };
  }, [me, setUser]);

  // Enquanto estiver validando /me E existe token, mostramos spinner
  if (me === undefined && (loading || hasToken())) {
    return (
      <Box sx={{ minHeight: "50vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  // Sem auth confirmado → login
  if (!me) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Admin?
  const isAdmin = !!me.is_admin || me.email?.toLowerCase() === ADMIN_EMAIL;

  return isAdmin ? children : <Navigate to="/conta" replace />;
}
