import * as React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./authContext";

const DBG = String(localStorage.getItem("NS_DEBUG") || "") === "1";
const log = (...a) => { if (DBG) console.log("[guard ProtectedRoute]", ...a); };

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  React.useEffect(() => { log("state", { loading, hasUser: !!user }); }, [loading, user]);

  // Enquanto está carregando o /me, não decide (evita “rebote” para /login)
  if (loading) return null; // pode renderizar um spinner aqui

  if (!user) {
    log("-> redirect /login");
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}
