// src/AdminDashboard.jsx
import * as React from "react";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import {
  AppBar,
  Box,
  Button,
  ButtonBase,
  Container,
  CssBaseline,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ThemeProvider,
  Toolbar,
  Typography,
  createTheme,
} from "@mui/material";
import ArrowBackIosNewRoundedIcon from "@mui/icons-material/ArrowBackIosNewRounded";
import AccountCircleRoundedIcon from "@mui/icons-material/AccountCircleRounded";
import logoNewStore from "./Logo-branca-sem-fundo-768x132.png";
import { useAuth } from "./authContext";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#2E7D32" },
    background: { default: "#0E0E0E", paper: "#121212" },
    warning: { main: "#B58900" },
  },
  shape: { borderRadius: 16 },
  typography: { fontFamily: ["Inter", "system-ui", "Segoe UI", "Roboto", "Arial"].join(",") },
});

/* ---------- helpers de API (robusto com /api) ---------- */
const RAW_BASE =
  process.env.REACT_APP_API_BASE_URL ||
  process.env.REACT_APP_API_BASE ||
  "/api";
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
    credentials: "omit",
    cache: "no-store", // evita cache 304
  });
  if (!r.ok) {
    let err = `${r.status}`;
    try { const j = await r.json(); if (j?.error) err = j.error; } catch {}
    throw new Error(err);
  }
  return r.json();
}
async function postJSON(path, body, method = "POST") {
  const r = await fetch(apiJoin(path), {
    method,
    headers: { "Content-Type": "application/json", ...authHeaders() },
    credentials: "omit",
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) {
    let err = `${r.status}`;
    try { const j = await r.json(); if (j?.error) err = j.error; } catch {}
    throw new Error(err);
  }
  return r.json().catch(() => ({}));
}

/* ---------- Card grande clicável (as 3 listas) ---------- */
function BigCard({ children, color, outlined = false, onClick }) {
  return (
    <ButtonBase onClick={onClick} sx={{ width: "100%" }}>
      <Paper
        elevation={0}
        sx={{
          width: "100%",
          p: { xs: 3, md: 4 },
          borderRadius: 4,
          bgcolor: outlined ? "transparent" : color,
          border: outlined ? "1px solid rgba(255,255,255,0.16)" : "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: { xs: 120, md: 140 },
          transition: "transform 120ms ease, filter 120ms ease",
          "&:hover": { transform: "translateY(-2px)", filter: "brightness(1.02)" },
          textAlign: "center",
        }}
      >
        <Typography
          sx={{
            fontWeight: 900,
            letterSpacing: 2,
            fontSize: { xs: 18, md: 28 },
            lineHeight: 1.25,
            color: outlined ? "rgba(255,255,255,0.85)" : "#fff",
            textTransform: "uppercase",
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          }}
        >
          {children}
        </Typography>
      </Paper>
    </ButtonBase>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  // resumo
  const [drawId, setDrawId] = React.useState(null);
  const [sold, setSold] = React.useState(0);
  const [remaining, setRemaining] = React.useState(0);

  // preço (em centavos)
  const [price, setPrice] = React.useState("");

  // novos campos
  const [maxSelect, setMaxSelect] = React.useState(5);
  const [bannerTitle, setBannerTitle] = React.useState("");

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  const loadSummary = React.useCallback(async () => {
    setLoading(true);
    try {
      // resumo do dashboard
      const r = await getJSON("/admin/dashboard/summary");
      setDrawId(r.draw_id ?? null);
      setSold(r.sold ?? 0);
      setRemaining(r.remaining ?? 0);
      if (Number.isFinite(Number(r.price_cents))) {
        setPrice(String(Number(r.price_cents)));
      }

      // configurações públicas
      try {
        const cfg = await getJSON("/config");

        const cfgCents =
          cfg?.ticket_price_cents ??
          cfg?.price_cents ??
          cfg?.current?.price_cents ??
          cfg?.current_draw?.price_cents ??
          null;
        if (cfgCents != null && Number.isFinite(Number(cfgCents))) {
          setPrice(String(Number(cfgCents)));
        }

        const maxSel =
          cfg?.max_numbers_per_selection ??
          cfg?.max_per_selection ??
          cfg?.max_select ??
          null;
        if (maxSel != null && !Number.isNaN(Number(maxSel))) {
          setMaxSelect(Number(maxSel));
        }

        const banner =
          cfg?.banner_title ??
          cfg?.promo_title ??
          cfg?.headline ??
          "";
        if (banner != null) setBannerTitle(String(banner));
      } catch (e) {
        console.warn("[AdminDashboard] GET /config opcional:", e?.message || e);
      }
    } catch (e) {
      console.error("[AdminDashboard] GET /summary failed:", e);
      setDrawId(null);
      setSold(0);
      setRemaining(0);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { loadSummary(); }, [loadSummary]);

  // SALVAR: mantém o fluxo do preço que já funciona e tenta salvar os novos campos
  const onSaveAll = async () => {
    setSaving(true);
    let msg = "Configurações atualizadas.";
    try {
      // 1) preço — usa a rota que já funciona hoje
      const priceCents = Math.max(0, Math.floor(Number(price || 0)));
      await postJSON("/admin/dashboard/ticket-price", { price_cents: priceCents });

      // 2) banner + max — tenta POST /config (se seu backend ainda não tiver, isso cairá no catch)
      try {
        await postJSON("/config", {
          banner_title: String(bannerTitle || ""),
          max_numbers_per_selection: Math.max(1, Math.floor(Number(maxSelect || 1))),
        });
      } catch (e) {
        console.warn("[AdminDashboard] POST /config falhou:", e?.message || e);
        msg =
          "Preço atualizado. Para salvar 'Frase promocional' e 'Máximo de tickets', habilite POST /api/config no backend.";
      }

      await loadSummary();
      alert(msg);
    } catch (e) {
      console.error("[AdminDashboard] salvar configs falhou:", e);
      alert("Não foi possível atualizar as configurações agora.");
    } finally {
      setSaving(false);
    }
  };

  const onNewDraw = async () => {
    try {
      setCreating(true);
      await postJSON("/admin/dashboard/new", {});
      await loadSummary();
      // Notifica o frontend para refetch imediato de config/numbers (reservados) sem esperar polling
      try {
        window.dispatchEvent(new CustomEvent("ns:draw:changed"));
        window.dispatchEvent(new CustomEvent("ns:numbers:reload"));
      } catch {}
    } catch (e) {
      console.error("[AdminDashboard] POST /new failed:", e);
    } finally {
      setCreating(false);
    }
  };

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
          <Menu
            anchorEl={menuEl}
            open={open}
            onClose={closeMenu}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
          >
            <MenuItem onClick={goPainel}>Painel (Admin)</MenuItem>
            <Divider />
            <MenuItem onClick={doLogout}>Sair</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ py: { xs: 4, md: 8 } }}>
        <Stack spacing={4} alignItems="center">
          <Typography sx={{ fontWeight: 900, textAlign: "center", lineHeight: 1.1, fontSize: { xs: 28, md: 56 } }}>
            Painel de Controle
            <br /> dos Sorteios
          </Typography>

          {/* Painel (resumo + preço e configs) */}
          <Paper variant="outlined" sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, width: "100%" }}>
            <Stack direction="row" spacing={4} alignItems="center" flexWrap="wrap">
              <Stack>
                <Typography sx={{ opacity: 0.7, fontWeight: 700 }}>Nº Sorteio Atual</Typography>
                <Typography variant="h4" sx={{ fontWeight: 900 }}>
                  {loading ? "…" : drawId ?? "-"}
                </Typography>
              </Stack>

              <Stack>
                <Typography sx={{ opacity: 0.7, fontWeight: 700 }}>Nºs Vendidos</Typography>
                <Typography variant="h4" sx={{ fontWeight: 900 }}>
                  {loading ? "…" : sold}
                </Typography>
              </Stack>

              <Stack>
                <Typography sx={{ opacity: 0.7, fontWeight: 700 }}>Nºs Restantes</Typography>
                <Typography variant="h4" sx={{ fontWeight: 900 }}>
                  {loading ? "…" : remaining}
                </Typography>
              </Stack>

              <Box sx={{ flex: 1 }} />

              <Button
                onClick={onNewDraw}
                disabled={creating}
                variant="outlined"
                sx={{ borderRadius: 999, px: 3 }}
              >
                {creating ? "Criando..." : "NOVO SORTEIO"}
              </Button>
            </Stack>

            <Divider sx={{ my: 3 }} />

            {/* Valor por Ticket (centavos) */}
            <Typography sx={{ opacity: 0.7, fontWeight: 700, mb: 1 }}>Valor por Ticket</Typography>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <TextField
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="em centavos (ex.: 100 = R$ 1,00)"
                inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
                sx={{ maxWidth: 320 }}
              />
            </Stack>

            {/* Máximo de tickets por seleção */}
            <Typography sx={{ opacity: 0.7, fontWeight: 700, mb: 1 }}>
              Máximo de Tickets permitidos
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <TextField
                type="number"
                value={maxSelect}
                onChange={(e) => setMaxSelect(e.target.value)}
                placeholder="Ex.: 5"
                inputProps={{ min: 1 }}
                sx={{ maxWidth: 320 }}
              />
            </Stack>

            {/* Frase promocional */}
            <Typography sx={{ opacity: 0.7, fontWeight: 700, mb: 1 }}>
              Frase promocional
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
              <TextField
                value={bannerTitle}
                onChange={(e) => setBannerTitle(e.target.value)}
                placeholder="Ex.: Sorteio de um Watch Winder…"
                fullWidth
              />
            </Stack>

            <Button
              onClick={onSaveAll}
              disabled={saving}
              variant="contained"
              color="primary"
              sx={{ borderRadius: 999, px: 3 }}
            >
              {saving ? "Salvando..." : "ATUALIZAR"}
            </Button>
          </Paper>

          {/* As 3 listas */}
          <Stack  spacing={3} sx={{ width: "100%" }}>
             <BigCard color="green"  onClick={() => navigate("/admin/AdminClientesUser")}>
              CADASTRO E MANUTENÇÃO
              <br /> CLIENTES
            </BigCard>

            <br />
            <Divider sx={{ my: 3, borderColor: "rgba(255,255,255,0.18)", borderBottomWidth: 2 }} />
            <br />
            <BigCard color="info.dark" onClick={() => navigate("/admin/sorteiosAtivos")}>
              SORTEIO ATIVO<br /> COMPRADORES
            </BigCard>
            <br />
              <br />
            <BigCard color="info.dark" onClick={() => navigate("/admin/analytics")}>
              DASHBOARD - ANALISE
            </BigCard>
            <br />
            <BigCard outlined onClick={() => navigate("/admin/sorteios")}>
              LISTA DE SORTEIOS
              <br /> REALIZADOS
            </BigCard>

            <BigCard color="primary.main" onClick={() => navigate("/admin/clientes")}>
              LISTA DE CLIENTES
              <br /> COM SALDO ATIVO
            </BigCard>

            <BigCard color="warning.main" onClick={() => navigate("/admin/vencedores")}>
              LISTA DE VENCEDORES
              <br /> DOS SORTEIOS
            </BigCard>
          </Stack>
        </Stack>
      </Container>
    </ThemeProvider>
  );
}
