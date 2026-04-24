// src/AdminAnalytics.jsx
import * as React from "react";
import { useNavigate } from "react-router-dom";
import {
  AppBar, Box, Button, Chip, Container, CssBaseline, IconButton, Paper, Stack,
  Tab, Tabs, ThemeProvider, Toolbar, Typography, createTheme, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow
} from "@mui/material";
import ArrowBackIosNewRoundedIcon from "@mui/icons-material/ArrowBackIosNewRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import AccountCircleRoundedIcon from "@mui/icons-material/AccountCircleRounded";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend
} from "recharts";

/* ============================== TEMA ============================== */
const theme = createTheme({
  palette: { mode: "dark", primary: { main: "#2E7D32" }, background: { default: "#0E0E0E", paper: "#121212" } },
  shape: { borderRadius: 16 },
  typography: { fontFamily: ["Inter", "system-ui", "Segoe UI", "Roboto", "Arial"].join(",") }
});

/* ============================ HELPERS API ============================ */
/**
 * Padrão: backend remoto na Render.
 * Para trocar, salve no localStorage:
 *   REACT_APP_API_BASE_URL  ou  REACT_APP_API_BASE
 * Para forçar proxy local (/api), salve:
 *   REACT_APP_API_FORCE_RELATIVE = "1"
 */
const REMOTE_DEFAULT = "https://newstore-backend.onrender.com";
const FORCE_RELATIVE = localStorage.getItem("REACT_APP_API_FORCE_RELATIVE") === "1";

const RAW_BASE =
  (localStorage.getItem("REACT_APP_API_BASE_URL") ||
    localStorage.getItem("REACT_APP_API_BASE") ||
    (FORCE_RELATIVE ? "/api" : REMOTE_DEFAULT)
  );

const API_BASE = String(RAW_BASE).replace(/\/+$/, "");

const apiJoin = (path) => {
  let p = path.startsWith("/") ? path : `/${path}`;
  const baseHasApi = /\/api\/?$/.test(API_BASE);
  if (baseHasApi && p.startsWith("/api/")) p = p.slice(4);
  if (!baseHasApi && !p.startsWith("/api/")) p = `/api${p}`;
  return `${API_BASE}${p}`;
};

const authHeaders = () => {
  const tk =
    localStorage.getItem("ns_auth_token") ||
    sessionStorage.getItem("ns_auth_token") ||
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("token");
  return tk
    ? { Authorization: `Bearer ${String(tk).replace(/^Bearer\s+/i, "").replace(/^["']|["']$/g, "")}` }
    : {};
};

async function getJSON(path) {
  const r = await fetch(apiJoin(path), {
    headers: { "Content-Type": "application/json", ...authHeaders() },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

const BRL = (c) => (Number(c || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (n) => `${(Number(n || 0) * 100).toFixed(0)}%`;

/* ============================ COMPONENTES ============================ */
function KpiCard({ label, value, hint }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 4, minWidth: 220 }}>
      <Typography sx={{ opacity: .75, fontWeight: 700, mb: .5 }}>{label}</Typography>
      <Typography variant="h5" sx={{ fontWeight: 900 }}>{value}</Typography>
      {hint && <Typography variant="caption" sx={{ opacity: .65 }}>{hint}</Typography>}
    </Paper>
  );
}

function Section({ title, right, children }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 4 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{title}</Typography>
        {right}
      </Stack>
      {children}
    </Paper>
  );
}

/* =============================== PÁGINA =============================== */

export default function AdminAnalytics() {
  const nav = useNavigate();
  const [tab, setTab] = React.useState(0);

  // Estado (GERAL / OVERVIEW)
  const [overview, setOverview] = React.useState(null);
  const [topBuyers, setTopBuyers] = React.useState([]);
  const [hourly, setHourly] = React.useState([]);

  // Estado (LISTAS DE SORTEIO + RESUMO POR SORTEIO)
  const [draws, setDraws] = React.useState([]);
  const [drawsSummary, setDrawsSummary] = React.useState([]);
  const [drawId, setDrawId] = React.useState("");
  const [summary, setSummary] = React.useState(null);
  const [leaks, setLeaks] = React.useState({ expired_reservations: [], expired_payments: [] });
  const [latency, setLatency] = React.useState({ avg_minutes_to_pay: null, weekly: [] });

  // Extras
  const [couponsEff, setCouponsEff] = React.useState([]);
  const [autopayStats, setAutopayStats] = React.useState({ daily: [], avg_missed: null });

  // Placeholders agora ativos
  const [rfm, setRfm] = React.useState([]);
  const [cohorts, setCohorts] = React.useState([]);
  const [latencyGlobal, setLatencyGlobal] = React.useState({ avg_minutes_to_pay: null, weekly: [] });
  const [favorites, setFavorites] = React.useState([]);

  /* ---------------------------- LOADERS ---------------------------- */

  const loadOverview = React.useCallback(async () => {
    const ov = await getJSON("/admin/analytics/overview?days=30");
    setOverview(ov || null);
    setTopBuyers(ov?.topBuyers || []);
    setHourly(ov?.hourly || []);
  }, []);

  const loadDrawLists = React.useCallback(async () => {
    const [d, ds] = await Promise.all([
      getJSON("/admin/analytics/draws"),
      getJSON("/admin/analytics/draws-summary")
    ]);
    setDraws(d || []);
    setDrawsSummary(ds || []);
    if (!drawId && d?.[0]?.id) setDrawId(d[0].id);
  }, [drawId]);

  const loadPerDraw = React.useCallback(async (id) => {
    if (!id) return;
    const [sm, lk, lt] = await Promise.all([
      getJSON(`/admin/analytics/summary/${id}`),
      getJSON(`/admin/analytics/leaks/daily?days=30&drawId=${id}`),
      getJSON(`/admin/analytics/payments/latency?days=120&drawId=${id}`)
    ]);
    setSummary(sm || null);
    setLeaks(lk || { expired_reservations: [], expired_payments: [] });
    setLatency(lt || { avg_minutes_to_pay: null, weekly: [] });
  }, []);

  const loadExtras = React.useCallback(async () => {
    const [ce, ap] = await Promise.all([
      getJSON("/admin/analytics/coupons/efficacy"),
      getJSON("/admin/analytics/autopay/stats")
    ]);
    setCouponsEff(ce || []);
    setAutopayStats(ap || { daily: [], avg_missed: null });
  }, []);

  // Novos loaders para as abas "placeholder"
  const loadRfm = React.useCallback(async () => {
    const rows = await getJSON("/admin/analytics/rfm");
    setRfm(rows || []);
  }, []);

  const loadCohorts = React.useCallback(async () => {
    const rows = await getJSON("/admin/analytics/cohorts");
    setCohorts(rows || []);
  }, []);

  const loadLatencyGlobal = React.useCallback(async () => {
    const r = await getJSON("/admin/analytics/payments/latency?days=120");
    setLatencyGlobal(r || { avg_minutes_to_pay: null, weekly: [] });
  }, []);

  const loadFavorites = React.useCallback(async () => {
    const rows = await getJSON("/admin/analytics/numbers/favorites-by-user");
    setFavorites(rows || []);
  }, []);

  // Efeitos iniciais
  React.useEffect(() => { loadOverview().catch(() => {}); }, [loadOverview]);
  React.useEffect(() => { loadDrawLists().catch(() => {}); }, [loadDrawLists]);
  React.useEffect(() => { loadPerDraw(drawId).catch(() => {}); }, [drawId, loadPerDraw]);
  React.useEffect(() => { loadExtras().catch(() => {}); }, [loadExtras]);

  // Carregamento sob demanda ao trocar de aba
  React.useEffect(() => {
    if (tab === 2) loadRfm().catch(() => {});
    if (tab === 3) loadCohorts().catch(() => {});
    if (tab === 6) loadLatencyGlobal().catch(() => {});
    if (tab === 7) loadFavorites().catch(() => {});
  }, [tab, loadRfm, loadCohorts, loadLatencyGlobal, loadFavorites]);

  /* --------------------------- DERIVADOS --------------------------- */

  // Overview
  const totals = overview?.totals || {};
  const series = overview?.series || [];
  const dailyGMV = series.map(x => ({
    day: new Date(x.day).toISOString().slice(0, 10),
    paid: Number(x.gmv_paid_cents || 0) / 100,
    intent: Number(x.gmv_intent_cents || 0) / 100,
    expired: Number(x.gmv_expired_cents || 0) / 100
  }));
  const dailyOrders = series.map(x => ({
    day: new Date(x.day).toISOString().slice(0, 10),
    paid: Number(x.orders_paid || 0),
    intent: Number(x.orders_intent || 0),
    expired: Number(x.orders_expired || 0)
  }));
  const hourlyPaid = (hourly || []).map(h => ({ h: Number(h.hour_br), paid: Number(h.paid) }));

  // Por sorteio
  const funnel = summary?.funnel || { available: 0, reserved: 0, sold: 0 };
  const paidDraw = summary?.paid || { gmv_cents: 0, avg_ticket_cents: 0, paid_orders: 0 };
  const fillRate = summary?.fill_rate || 0;

  const leaksRes = (leaks?.expired_reservations || []).map(x => ({
    day: new Date(x.day).toISOString().slice(0, 10),
    r: Number(x.expired_reservations || 0)
  }));
  const leaksPay = (leaks?.expired_payments || []).map(x => ({
    day: new Date(x.day).toISOString().slice(0, 10),
    p: Number(x.expired_payments || 0)
  }));
  const leaksMerged = (() => {
    const map = new Map();
    leaksRes.forEach(a => map.set(a.day, { day: a.day, r: a.r, p: 0 }));
    leaksPay.forEach(b => { const it = map.get(b.day) || { day: b.day, r: 0, p: 0 }; it.p = b.p; map.set(b.day, it); });
    return Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day));
  })();

  // Cohorts: agregados simples por mês para gráfico (GMV total por mês)
  const cohortsByMonth = React.useMemo(() => {
    const agg = new Map();
    (cohorts || []).forEach(r => {
      const m = new Date(r.month).toISOString().slice(0, 7);
      const prev = agg.get(m) || { month: m, gmv: 0, buyers: 0 };
      prev.gmv += Number(r.gmv_cents || 0) / 100;
      prev.buyers += Number(r.active_buyers || 0);
      agg.set(m, prev);
    });
    return Array.from(agg.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [cohorts]);

  // Favoritos: top 20 números por frequência
  const favoriteNumbersTop = React.useMemo(() => {
    const map = new Map();
    (favorites || []).forEach(f => {
      const n = Number(f.n);
      const c = Number(f.times_bought || 0);
      map.set(n, (map.get(n) || 0) + c);
    });
    return Array.from(map.entries())
      .map(([n, c]) => ({ n, c }))
      .sort((a, b) => b.c - a.c)
      .slice(0, 20);
  }, [favorites]);

  /* ================================ UI ================================ */

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      <AppBar position="sticky" elevation={0} sx={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <Toolbar sx={{ minHeight: 64 }}>
          <IconButton edge="start" color="inherit" onClick={() => nav(-1)} aria-label="Voltar">
            <ArrowBackIosNewRoundedIcon />
          </IconButton>
          <Typography sx={{ fontWeight: 900, ml: 1 }}>Analytics</Typography>
          <IconButton color="inherit" sx={{ ml: "auto" }}>
            <AccountCircleRoundedIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: { xs: 2, md: 4 } }}>
        <Paper sx={{ mb: 2, borderRadius: 4 }} variant="outlined">
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            textColor="primary"
            indicatorColor="primary"
          >
            <Tab label="Overview (Sorteio)" />
            <Tab label="Todos os sorteios" />
            <Tab label="RFM & Ações" />
            <Tab label="Cohorts" />
            <Tab label="Cupons" />
            <Tab label="Autopay" />
            <Tab label="Latência" />
            <Tab label="Favoritos & Números" />
          </Tabs>
        </Paper>

        {/* ===================== TAB 0 — OVERVIEW GLOBAL ===================== */}
        {tab === 0 && (
          <Stack spacing={2.5}>
            <Section
              title="KPIs gerais (todos os sorteios)"
              right={
                <Button onClick={() => loadOverview()} startIcon={<RefreshRoundedIcon />} size="small" variant="outlined">
                  Atualizar
                </Button>
              }
            >
              <Stack direction="row" spacing={2} flexWrap="wrap">
                <KpiCard label="GMV total" value={BRL(totals.gmv_paid_cents)} />
                <KpiCard label="Pedidos pagos" value={(totals.orders_paid || 0).toLocaleString("pt-BR")} />
                <KpiCard label="Ticket médio" value={BRL(totals.avg_ticket_paid_cents)} />
                <KpiCard label="Compradores únicos" value={(totals.unique_buyers_paid || 0).toLocaleString("pt-BR")} />
                <KpiCard label="Média pedidos/cliente" value={Number(totals.avg_orders_per_buyer || 0).toFixed(2)} />
                <KpiCard
                  label="Quantis do ticket"
                  value={`${BRL(totals.p50_ticket_cents)} (mediana)`}
                  hint={`P25 ${BRL(totals.p25_ticket_cents)} • P75 ${BRL(totals.p75_ticket_cents)} • P90 ${BRL(totals.p90_ticket_cents)}`}
                />
              </Stack>
            </Section>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <Section title="GMV por dia (últimos 30)">
                <Box height={260}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyGMV}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="day" />
                      <YAxis />
                      <Legend />
                      <RTooltip formatter={(v) => `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
                      <Area type="monotone" dataKey="paid" name="Pago (R$)" />
                      <Area type="monotone" dataKey="intent" name="Intenção (R$)" />
                      <Area type="monotone" dataKey="expired" name="Expirado (R$)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </Box>
              </Section>
              <Section title="Pedidos por dia (últimos 30)">
                <Box height={260}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyOrders}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="day" />
                      <YAxis allowDecimals={false} />
                      <Legend />
                      <RTooltip />
                      <Bar dataKey="paid" name="Pago" />
                      <Bar dataKey="intent" name="Intenção" />
                      <Bar dataKey="expired" name="Expirado" />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Section>
              <Section title="Pagos por hora (BR)">
                <Box height={260}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={hourlyPaid}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="h" tickFormatter={(h) => `${h}h`} />
                      <YAxis allowDecimals={false} />
                      <RTooltip />
                      <Line type="monotone" dataKey="paid" name="Pagos" />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </Section>
            </Stack>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <Section title="Top compradores (GMV)">
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Cliente</TableCell>
                        <TableCell>E-mail</TableCell>
                        <TableCell align="right">Pedidos</TableCell>
                        <TableCell align="right">GMV</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(topBuyers || []).map((b, i) => (
                        <TableRow key={b.user_id || i} hover>
                          <TableCell sx={{ fontWeight: 700 }}>{b.name || "(sem nome)"}</TableCell>
                          <TableCell>{b.email || "-"}</TableCell>
                          <TableCell align="right">{b.orders || 0}</TableCell>
                          <TableCell align="right">{BRL(b.gmv_cents)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Section>

              <Section
                title="Sorteio selecionado (snapshot)"
                right={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <select
                      value={drawId || ""}
                      onChange={(e) => setDrawId(e.target.value)}
                      style={{
                        background: "transparent",
                        border: "1px solid rgba(255,255,255,.14)",
                        color: "#fff",
                        padding: "8px 12px",
                        borderRadius: 8
                      }}
                    >
                      {(draws || []).map((d) => (
                        <option key={d.id} value={d.id} style={{ color: "#000" }}>
                          #{d.id} — {d.product_name || "S/ nome"} ({d.status})
                        </option>
                      ))}
                    </select>
                    <Button onClick={() => loadPerDraw(drawId)} startIcon={<RefreshRoundedIcon />} size="small" variant="outlined">
                      Atualizar
                    </Button>
                  </Stack>
                }
              >
                <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1.5 }}>
                  <Chip label={`Disponíveis: ${funnel.available}`} />
                  <Chip color="warning" label={`Reservados: ${funnel.reserved}`} />
                  <Chip color="success" label={`Vendidos: ${funnel.sold}`} />
                  <Chip color="primary" label={`Fill-rate: ${pct(fillRate)}`} />
                  <Chip label={`Pedidos pagos: ${paidDraw.paid_orders}`} />
                  <Chip label={`Ticket médio: ${BRL(paidDraw.avg_ticket_cents)}`} />
                  <Chip label={`GMV: ${BRL(paidDraw.gmv_cents)}`} />
                </Stack>

                <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                  <Box flex={1}>
                    <Typography sx={{ fontWeight: 800, mb: .5 }}>Vazamentos (30d)</Typography>
                    <Box height={220}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={leaksMerged}>
                          <CartesianGrid vertical={false} />
                          <XAxis dataKey="day" />
                          <YAxis allowDecimals={false} />
                          <Legend />
                          <RTooltip />
                          <Area type="monotone" dataKey="r" name="Reservas expiradas" />
                          <Area type="monotone" dataKey="p" name="Pagamentos expirados" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </Box>
                  </Box>
                  <Box flex={1}>
                    <Typography sx={{ fontWeight: 800, mb: .5 }}>Tempo médio até pagar (semanal)</Typography>
                    <Box height={220}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={(latency?.weekly || []).map(x => ({
                            week: new Date(x.week).toISOString().slice(0, 10),
                            avg: Number(x.avg_minutes || 0)
                          }))}
                        >
                          <CartesianGrid vertical={false} />
                          <XAxis dataKey="week" />
                          <YAxis />
                          <RTooltip formatter={(v) => `${Number(v).toFixed(1)} min`} />
                          <Line type="monotone" dataKey="avg" name="Minutos" />
                        </LineChart>
                      </ResponsiveContainer>
                    </Box>
                  </Box>
                </Stack>
              </Section>
            </Stack>
          </Stack>
        )}

        {/* ================== TAB 1 — TODOS OS SORTEIOS ================== */}
        {tab === 1 && (
          <Stack spacing={2}>
            <Section
              title="Fill-rate por sorteio"
              right={
                <Button onClick={() => loadDrawLists()} startIcon={<RefreshRoundedIcon />} size="small" variant="outlined">
                  Atualizar
                </Button>
              }
            >
              <Box height={320}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(drawsSummary || []).map(d => ({ id: d.id, fr: Number(d.fill_rate || 0) * 100 }))}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="id" />
                    <YAxis unit="%" />
                    <RTooltip />
                    <Bar dataKey="fr" name="Fill %" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Section>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <Section title="GMV por data (realized_at/closed_at/opened_at)">
                <Box height={320}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={(drawsSummary || [])
                        .map(d => ({
                          date: new Date(d.realized_at || d.closed_at || d.opened_at || Date.now()).toISOString().slice(0, 10),
                          gmv: Number(d.gmv_cents || 0) / 100
                        }))
                        .sort((a, b) => a.date.localeCompare(b.date))}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <RTooltip formatter={(v) => `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
                      <Line type="monotone" dataKey="gmv" name="GMV (R$)" />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </Section>

              <Section title="Tabela resumida">
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>ID</TableCell>
                        <TableCell>Produto</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell align="right">Vendidos</TableCell>
                        <TableCell align="right">Fill %</TableCell>
                        <TableCell align="right">GMV</TableCell>
                        <TableCell align="right">Ticket médio</TableCell>
                        <TableCell align="right">Pedidos pagos</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(drawsSummary || []).map(d => (
                        <TableRow key={d.id} hover>
                          <TableCell>#{d.id}</TableCell>
                          <TableCell>{d.product_name || "-"}</TableCell>
                          <TableCell>{d.status}</TableCell>
                          <TableCell align="right">{d.sold || 0}</TableCell>
                          <TableCell align="right">{pct(d.fill_rate || 0)}</TableCell>
                          <TableCell align="right">{BRL(d.gmv_cents)}</TableCell>
                          <TableCell align="right">{BRL(d.avg_ticket_cents)}</TableCell>
                          <TableCell align="right">{d.paid_orders || 0}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Section>
            </Stack>
          </Stack>
        )}

        {/* ================== TAB 2 — RFM & AÇÕES ================== */}
        {tab === 2 && (
          <Section
            title="RFM (Recency • Frequency • Monetary)"
            right={<Button onClick={() => loadRfm()} startIcon={<RefreshRoundedIcon />} size="small" variant="outlined">Atualizar</Button>}
          >
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Cliente</TableCell>
                    <TableCell>E-mail</TableCell>
                    <TableCell align="right">Freq.</TableCell>
                    <TableCell align="right">Monetário</TableCell>
                    <TableCell align="right">Recency (dias)</TableCell>
                    <TableCell>Segmento</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(rfm || []).map((r, i) => (
                    <TableRow key={r.id || i} hover>
                      <TableCell>{r.name || "-"}</TableCell>
                      <TableCell>{r.email || "-"}</TableCell>
                      <TableCell align="right">{r.freq || 0}</TableCell>
                      <TableCell align="right">{BRL(r.monetary_cents)}</TableCell>
                      <TableCell align="right">{Number(r.recency_days || 0).toFixed(1)}</TableCell>
                      <TableCell>{r.segment || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Section>
        )}

        {/* ================== TAB 3 — COHORTS ================== */}
        {tab === 3 && (
          <Stack spacing={2}>
            <Section
              title="Retenção/atividade por coortes"
              right={<Button onClick={() => loadCohorts()} startIcon={<RefreshRoundedIcon />} size="small" variant="outlined">Atualizar</Button>}
            >
              <Box height={320}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cohortsByMonth}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Legend />
                    <RTooltip formatter={(v) => `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
                    <Line type="monotone" dataKey="gmv" name="GMV (R$)" />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </Section>

            <Section title="Tabela (cohort x mês)">
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Cohort</TableCell>
                      <TableCell>Mês</TableCell>
                      <TableCell align="right">Compradores ativos</TableCell>
                      <TableCell align="right">GMV</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(cohorts || []).map((c, i) => (
                      <TableRow key={i} hover>
                        <TableCell>{new Date(c.cohort_month).toISOString().slice(0,7)}</TableCell>
                        <TableCell>{new Date(c.month).toISOString().slice(0,7)}</TableCell>
                        <TableCell align="right">{c.active_buyers || 0}</TableCell>
                        <TableCell align="right">{BRL(c.gmv_cents)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Section>
          </Stack>
        )}

        {/* ================== TAB 4 — CUPONS ================== */}
        {tab === 4 && (
          <Section
            title="Eficiência por cupom"
            right={
              <Button onClick={() => loadExtras()} startIcon={<RefreshRoundedIcon />} size="small" variant="outlined">
                Atualizar
              </Button>
            }
          >
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Cupom</TableCell>
                    <TableCell align="right">Pay rate</TableCell>
                    <TableCell align="right">GMV</TableCell>
                    <TableCell align="right">Ticket médio</TableCell>
                    <TableCell align="right">Cupom médio</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(couponsEff || []).map((c, i) => (
                    <TableRow key={c.coupon_code || i} hover>
                      <TableCell>{c.coupon_code || "(sem)"}</TableCell>
                      <TableCell align="right">{(Number(c.pay_rate || 0) * 100).toFixed(1)}%</TableCell>
                      <TableCell align="right">{BRL(c.gmv_cents)}</TableCell>
                      <TableCell align="right">{BRL(c.avg_ticket_cents)}</TableCell>
                      <TableCell align="right">{BRL(c.avg_coupon_cents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Section>
        )}

        {/* ================== TAB 5 — AUTOPAY ================== */}
        {tab === 5 && (
          <Stack spacing={2}>
            <Section
              title="Execuções por dia (autopay)"
              right={
                <Button onClick={() => loadExtras()} startIcon={<RefreshRoundedIcon />} size="small" variant="outlined">
                  Atualizar
                </Button>
              }
            >
              <Box height={300}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={(autopayStats?.daily || []).map(x => ({
                      day: new Date(x.day).toISOString().slice(0, 10),
                      runs: Number(x.runs || 0),
                      ok: Number(x.ok_runs || 0)
                    }))}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="day" />
                    <YAxis allowDecimals={false} />
                    <Legend />
                    <RTooltip />
                    <Line type="monotone" dataKey="runs" name="Runs" />
                    <Line type="monotone" dataKey="ok" name="OK" />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </Section>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 4 }}>
              <Typography>🧠 Média de números "perdidos" por execução: <b>{Number(autopayStats?.avg_missed ?? 0).toFixed(2)}</b></Typography>
            </Paper>
          </Stack>
        )}

        {/* ================== TAB 6 — LATÊNCIA (GLOBAL) ================== */}
        {tab === 6 && (
          <Section
            title="Latência global de pagamento"
            right={<Button onClick={() => loadLatencyGlobal()} startIcon={<RefreshRoundedIcon />} size="small" variant="outlined">Atualizar</Button>}
          >
            <Stack spacing={1} sx={{ mb: 2 }}>
              <Typography>Tempo médio até pagar: <b>{latencyGlobal?.avg_minutes_to_pay != null ? `${latencyGlobal.avg_minutes_to_pay.toFixed(1)} min` : "—"}</b></Typography>
            </Stack>
            <Box height={260}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={(latencyGlobal?.weekly || []).map(x => ({
                    week: new Date(x.week).toISOString().slice(0, 10),
                    avg: Number(x.avg_minutes || 0)
                  }))}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="week" />
                  <YAxis />
                  <RTooltip formatter={(v) => `${Number(v).toFixed(1)} min`} />
                  <Line type="monotone" dataKey="avg" name="Minutos" />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          </Section>
        )}

        {/* ================== TAB 7 — FAVORITOS & NÚMEROS ================== */}
        {tab === 7 && (
          <Stack spacing={2}>
            <Section
              title="Números favoritos por cliente"
              right={<Button onClick={() => loadFavorites()} startIcon={<RefreshRoundedIcon />} size="small" variant="outlined">Atualizar</Button>}
            >
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Cliente</TableCell>
                      <TableCell align="right">Número</TableCell>
                      <TableCell align="right">Vezes comprado</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(favorites || []).slice(0, 300).map((f, i) => (
                      <TableRow key={i} hover>
                        <TableCell>{f.name || `#${f.user_id}`}</TableCell>
                        <TableCell align="right">{String(f.n).padStart(2, "0")}</TableCell>
                        <TableCell align="right">{f.times_bought || 0}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Section>

            <Section title="Top 20 números (todas as compras pagas)">
              <Box height={300}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={favoriteNumbersTop}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="n" />
                    <YAxis allowDecimals={false} />
                    <RTooltip />
                    <Bar dataKey="c" name="Vezes comprado" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Section>
          </Stack>
        )}
      </Container>
    </ThemeProvider>
  );
}
