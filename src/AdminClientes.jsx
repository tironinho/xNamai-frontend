// src/AdminClientes.jsx
import * as React from "react";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import {
  AppBar, Box, Container, CssBaseline, IconButton, Menu, MenuItem, Divider,
  Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  ThemeProvider, Toolbar, Typography, createTheme
} from "@mui/material";
import ArrowBackIosNewRoundedIcon from "@mui/icons-material/ArrowBackIosNewRounded";
import AccountCircleRoundedIcon from "@mui/icons-material/AccountCircleRounded";
import logoNewStore from "./Logo-branca-sem-fundo-768x132.png";
import { useAuth } from "./authContext";

const theme = createTheme({
  palette: { mode: "dark", background: { default: "#0E0E0E", paper: "#121212" }, success: { main: "#67C23A" } },
  typography: { fontFamily: ["Inter", "system-ui", "Segoe UI", "Roboto", "Arial"].join(",") },
});

/* ---------- API base ---------- */
const RAW_BASE =
  process.env.REACT_APP_API_BASE_URL ||
  process.env.REACT_APP_API_BASE ||
  "";
const API_BASE = String(RAW_BASE).replace(/\/+$/, "");
const apiJoin = (path) => {
  let p = path.startsWith("/") ? path : `/${path}`;
  const baseEndsApi = API_BASE.endsWith("/api");
  const pathStartsApi = p.startsWith("/api/");
  if (!API_BASE) return pathStartsApi ? p : `/api${p}`;
  if (baseEndsApi && pathStartsApi) p = p.slice(4);
  if (!baseEndsApi && !pathStartsApi) p = `/api${p}`;
  return `${API_BASE}${p}`;
};

/* ---------- utils ---------- */
const fmtBRL = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(Number.isFinite(Number(v)) ? Number(v) : 0);

const fmtDate = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("pt-BR");
};

const authHeaders = () => {
  const tk =
    localStorage.getItem("ns_auth_token") ||
    sessionStorage.getItem("ns_auth_token") ||
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("token");
  return tk ? { Authorization: `Bearer ${String(tk).replace(/^Bearer\s+/i,"").replace(/^["']|["']$/g,"")}` } : {};
};

async function getJSON(pathOrUrl) {
  const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : apiJoin(pathOrUrl);
  const r = await fetch(url, {
    headers: { "Content-Type": "application/json", ...authHeaders() },
    credentials: "include"
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

/* ---------- helpers cupom ---------- */
const extractCoupon = (obj) =>
  String(
    obj?.coupon ??
    obj?.coupon_code ??
    obj?.discount_coupon ??
    obj?.discount_code ??
    obj?.referral_code ??
    obj?.invite_code ??
    obj?.cupom ??
    obj?.cupom_codigo ??
    obj?.codigo_cupom ??
    obj?.code ??
    obj?.coupon?.code ??
    obj?.cupom?.code ??
    ""
  ).trim() || null;

/** Fallback local: usa SOMENTE coupon_value_cents do payload de usuários */
const readCouponValueCentsOnly = (u) => {
  const n = Number(u?.coupon_value_cents);
  return Number.isFinite(n) ? n : 0;
};

/* ---------- fallback de agregação (caso o endpoint agregado falhe) ---------- */
function normalizeArray(payload, keys) {
  if (Array.isArray(payload)) return payload;
  for (const k of keys) if (Array.isArray(payload?.[k])) return payload[k];
  return [];
}
function addMonths(d, months) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const day = dt.getDate();
  dt.setMonth(dt.getMonth() + months);
  if (dt.getDate() < day) dt.setDate(0);
  return dt;
}
function daysDiff(from, to) {
  const a = new Date(from), b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.ceil((b - a) / 86400000);
}
function buildRowsFallback({ usersPayload, paymentsPayload, drawsPayload }) {
  const users = normalizeArray(usersPayload, ["users", "items", "list"]);
  const pays  = normalizeArray(paymentsPayload, ["payments", "items", "list"]);
  const draws = normalizeArray(drawsPayload, ["draws", "history", "items", "list"]);

  // mapa de última compra e contagem
  const acc = new Map();
  for (const p of pays) {
    const status = String(p.status || p.state || "").trim().toLowerCase();
    if (status !== "approved") continue;
    const uid = Number(p.user_id ?? p.uid ?? p.customer_id ?? p.userId);
    if (!Number.isFinite(uid)) continue;
    const when = p.created_at ?? p.paid_at ?? p.approved_at ?? p.createdAt ?? p.data;
    const it = acc.get(uid) || { compras: 0, last: null };
    it.compras += 1;
    if (when && (!it.last || new Date(when) > new Date(it.last))) it.last = when;
    acc.set(uid, it);
  }

  const wins = new Map();
  for (const d of draws) {
    const uid = Number(d.winner_user_id ?? d.winner_userid ?? d.winner_id ?? d.winner?.id);
    if (!Number.isFinite(uid)) continue;
    wins.set(uid, (wins.get(uid) || 0) + 1);
  }

  // Apenas usuários com coupon_value_cents > 0
  const rows = [];
  for (const u of users) {
    const uid = Number(u.id ?? u.user_id ?? u.uid);
    if (!Number.isFinite(uid)) continue;

    const cents = readCouponValueCentsOnly(u);
    if (cents <= 0) continue; // NÃO lista saldo zerado

    const nome = String(u.name ?? u.full_name ?? u.display_name ?? "").trim() || u.email || "—";
    const cadastro = fmtDate(u.created_at ?? u.createdAt ?? u.cadastro ?? null);
    const info = acc.get(uid);
    const last = info?.last || null;

    const exp = addMonths(last || new Date(), 6);
    const dias = exp ? Math.max(0, daysDiff(new Date(), exp) ?? 0) : "-";

    rows.push({
      key: `${uid}-cv`,
      user_id: uid,
      nome,
      cadastro,
      compras: info?.compras || 0,
      total: +(cents / 100).toFixed(2), // SOMENTE coupon_value_cents
      ultima: fmtDate(last),
      vezes: wins.get(uid) || 0,
      dias,
      cupom: extractCoupon(u) || null,
    });
  }

  return rows.sort((a, b) => (a.dias ?? 999999) - (b.dias ?? 999999) || (b.total - a.total));
}

export default function AdminClientes() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // 1) usa o agregado do back (já filtra por coupon_value_cents > 0)
        try {
          const payload = await getJSON("/admin/clients/active");
          const list = normalizeArray(payload, ["clients", "items", "list"]);
          if (alive && list.length) {
            const mapped = list.map(c => ({
              key: c.user_id,
              user_id: Number(c.user_id ?? c.id) || null,
              nome: (c.name || "").trim() || c.email || "—",
              cadastro: fmtDate(c.created_at),
              compras: c.purchases_count || 0,
              total: c.total_brl || 0, // saldo = coupon_value_cents/100
              ultima: fmtDate(c.last_buy),
              vezes: c.wins || 0,
              dias: c.days_to_expire ?? "-",
              cupom: extractCoupon(c) || null,
            }));
            setRows(mapped);
            return;
          }
        } catch (err) {
          const code = String(err?.message || "");
          if (alive && /^(401|403|404)$/.test(code)) {
            setRows([]);
            setLoading(false);
            return;
          }
        }

        // 2) fallback local (SOMENTE coupon_value_cents)
        const [usersPayload, paymentsPayload, drawsPayload] = await Promise.all([
          getJSON("/admin/users").catch(() => getJSON("/users")),
          getJSON("/admin/payments?status=approved")
            .catch(() => getJSON("/payments?status=approved"))
            .catch(() => getJSON("/admin/payments"))
            .catch(() => getJSON("/payments")),
          getJSON("/admin/draws/history")
            .catch(() => getJSON("/admin/draws"))
            .catch(() => getJSON("/draws")),
        ]);

        const lines = buildRowsFallback({ usersPayload, paymentsPayload, drawsPayload });
        if (alive) setRows(lines);
      } catch (e) {
        console.error("[AdminClientes] fetch error:", e);
        if (alive) setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // menu
  const [menuEl, setMenuEl] = React.useState(null);
  const open = Boolean(menuEl);
  const openMenu = (e) => setMenuEl(e.currentTarget);
  const closeMenu = () => setMenuEl(null);
  const goPainel = () => { closeMenu(); navigate("/admin"); };
  const doLogout = () => { closeMenu(); logout(); navigate("/"); };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="sticky" elevation={0} sx={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <Toolbar sx={{ position: "relative", minHeight: 64 }}>
          <IconButton edge="start" color="inherit" onClick={() => navigate("/admin")} aria-label="Voltar">
            <ArrowBackIosNewRoundedIcon />
          </IconButton>
          <Box component={RouterLink} to="/admin"
               sx={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>
            <Box component="img" src={logoNewStore} alt="NEW STORE" sx={{ height: 40 }} />
          </Box>
          <IconButton color="inherit" sx={{ ml: "auto" }} onClick={openMenu}>
            <AccountCircleRoundedIcon />
          </IconButton>
          <Menu anchorEl={menuEl} open={open} onClose={closeMenu}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}>
            <MenuItem onClick={goPainel}>Painel (Admin)</MenuItem>
            <Divider />
            <MenuItem onClick={doLogout}>Sair</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
        <Typography sx={{
          fontWeight: 900, textTransform: "uppercase",
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          fontSize: { xs: 24, md: 44 }, mb: 2,
        }}>
          Lista de clientes com saldo ativo
        </Typography>

        <Paper variant="outlined" sx={{ bgcolor: "background.paper" }}>
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table sx={{ minWidth: 900 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 800 }}>NOME DO CLIENTE</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>DATA DE CADASTRO</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>QUANTIDADE DE COMPRAS</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>VALOR (saldo do cupom)</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>ÚLTIMA COMPRA</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>VEZES CONTEMPLADO</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>CUPOM</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>DIAS PARA EXPIRAÇÃO</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={8}>Carregando…</TableCell></TableRow>
                )}
                {!loading && rows.length === 0 && (
                  <TableRow><TableCell colSpan={8} sx={{ color: "#bbb" }}>Nenhum cliente com saldo ativo.</TableCell></TableRow>
                )}
                {rows.map((r) => (
                  <TableRow key={r.key} hover>
                    <TableCell>{r.nome}</TableCell>
                    <TableCell>{r.cadastro}</TableCell>
                    <TableCell>{r.compras}</TableCell>
                    <TableCell>{fmtBRL(r.total)}</TableCell>
                    <TableCell>{r.ultima}</TableCell>
                    <TableCell>{r.vezes}</TableCell>
                    <TableCell>{r.cupom || "-"}</TableCell>
                    <TableCell sx={{ color: "success.main", fontWeight: 800 }}>{r.dias}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Container>
    </ThemeProvider>
  );
}
