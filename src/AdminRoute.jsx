import * as React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./authContext";

const ADMIN_EMAIL = "admin@newstore.com.br";
const DBG = String(localStorage.getItem("NS_DEBUG") || "") === "1";
const log = (...a) => { if (DBG) console.log("[guard AdminRoute]", ...a); };

export default function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  React.useEffect(() => { log("state", { loading, user }); }, [loading, user]);

  if (loading) return null; // evita decidir cedo demais
  if (!user) {
    log("no user -> /login");
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const isAdmin =
    user.role === "admin" || user.is_admin === true ||
    (user.email || "").toLowerCase() === ADMIN_EMAIL;

  if (!isAdmin) {
    log("not admin -> /");
    return <Navigate to="/" replace />;
  }

  return children;
}
