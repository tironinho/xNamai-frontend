import * as React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./authContext";

const ADMIN_EMAIL = "admin@newstore.com.br";
const DBG = String(localStorage.getItem("NS_DEBUG") || "") === "1";
const log = (...a) => { if (DBG) console.log("[guard NonAdminRoute]", ...a); };

export default function NonAdminRoute({ children }) {
  const { user, loading } = useAuth();

  React.useEffect(() => { log("state", { loading, user }); }, [loading, user]);

  // Evite renderizar enquanto não sabemos quem é o usuário
  if (loading) return null;

  const email = (user?.email || "").toLowerCase();
  const isAdmin = !!user?.is_admin || email === ADMIN_EMAIL;

  return isAdmin ? <Navigate to="/admin" replace /> : children;
}
