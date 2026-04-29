// src/NewStorePage.jsx
// Tamanho aproximado: ~1060 linhas (mantido o conteúdo original + iniciais + fix de número no mobile)

import * as React from "react";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import { SelectionContext } from "./selectionContext";
import PixModal from "./PixModal";
import { createPixPayment, checkPixStatus } from "./services/pix";
import { useAuth } from "./authContext";
import { API_CONFIG } from "./config/api";

import {
   List, ListItem, ListItemText,
  Alert, Accordion, AccordionSummary, AccordionDetails
} from "@mui/material";
import PixIcon from "@mui/icons-material/Pix";
import CreditCardOutlinedIcon from "@mui/icons-material/CreditCardOutlined";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import VerifiedUserRoundedIcon from "@mui/icons-material/VerifiedUserRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";

import GiftCardSimulator from "./components/GiftCardSimulator.jsx";
import xNamaiLogo from "./assets/branding/xnamai-logo.svg";

import {
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  CssBaseline,
  Drawer,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputBase,
  Link,
  Menu,
  MenuItem,
  Paper,
  Stack,
  ThemeProvider,
  Toolbar,
  Typography,
  createTheme,
} from "@mui/material";
import AccountCircleRoundedIcon from "@mui/icons-material/AccountCircleRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";

// Imagens institucionais (neutras, marca xNaMai)
import imgCardExemplo from "./assets/images/giftcard-illustration.svg";
import imgTabelaUtilizacao from "./assets/images/usage-table-illustration.svg";
import imgAcumulo1 from "./assets/images/accumulo-1.svg";
import imgAcumulo2 from "./assets/images/accumulo-2.svg";

// Tema
const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#1E66FF" }, // azul premium
    secondary: { main: "#0B5FFF" },
    error: { main: "#D32F2F" },
    warning: { main: "#F2B705" },
    success: { main: "#2E7D32" },
    background: { default: "#F4F8FF", paper: "#FFFFFF" },
    text: { primary: "#0B1B33", secondary: "rgba(11,27,51,0.72)" },
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: ["Inter", "system-ui", "Segoe UI", "Roboto", "Arial"].join(","),
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          borderColor: "rgba(15, 23, 42, 0.10)",
        },
      },
    },
  },
});

// Helpers
const pad2 = (n) => n.toString().padStart(2, "0");

// Mocks
const MOCK_RESERVADOS = [];
const MOCK_INDISPONIVEIS = [];

// Base do backend
const API_BASE = String(API_CONFIG.baseUrl || "/api").replace(/\/+$/, "");

// ===== Helpers de auth + reserva =====
function sanitizeToken(t) {
  if (!t) return "";
  let s = String(t).trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  )
    s = s.slice(1, -1);
  if (/^Bearer\s+/i.test(s)) s = s.replace(/^Bearer\s+/i, "").trim();
  return s.replace(/\s+/g, "");
}
function getAuthToken() {
  try {
    const keys = ["ns_auth_token", "authToken", "token", "jwt", "access_token"];
    for (const k of keys) {
      const raw = localStorage.getItem(k) || sessionStorage.getItem(k);
      if (raw) return sanitizeToken(raw);
    }
    return "";
  } catch {
    return "";
  }
}
async function reserveNumbers(numbers) {
  const token = getAuthToken();
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const r = await fetch(`${API_BASE}/api/reservations`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ numbers }),
  });

  if (r.status === 409) {
    const j = await r.json().catch(() => ({}));
    const c = j?.conflicts || j?.n || [];
    throw new Error(
      `Alguns números ficaram indisponíveis: ${
        Array.isArray(c) ? c.join(", ") : c
      }`
    );
  }
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j?.error || "Falha ao reservar");
  }
  return r.json(); // { reservationId, drawId, expiresAt, numbers }
}

// Checagem do limite no backend (evita preflight; re-tenta com Authorization se 401)
async function checkUserPurchaseLimit({ addCount = 0, drawId } = {}) {
  const qs = new URLSearchParams();
  qs.set("add", String(addCount));
  if (drawId != null) qs.set("draw_id", String(drawId));

  // 1ª tentativa: sem headers (sem preflight)
  let res = await fetch(`${API_BASE}/api/purchase-limit/check?${qs}`, {
    credentials: "include",
    cache: "no-store",
  });

  // 2ª tentativa (se precisar header Authorization)
  if (res.status === 401) {
    const token = getAuthToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    res = await fetch(`${API_BASE}/api/purchase-limit/check?${qs}`, {
      credentials: "include",
      cache: "no-store",
      headers,
    });
  }

  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error(`limit_check_${res.status}`);

  const j = await res.json().catch(() => ({}));
  const blocked = !!(
    j?.blocked ??
    j?.limitReached ??
    j?.reached ??
    j?.exceeded
  );
  const current = j?.current ?? j?.cnt ?? j?.count ?? null;
  const max = j?.max ?? j?.limit ?? j?.MAX ?? null;
  return { blocked, current, max };
}

export default function NewStorePage({
  reservados = MOCK_RESERVADOS,
  indisponiveis = MOCK_INDISPONIVEIS,
  groupUrl = "https://chat.whatsapp.com/GdosYmyW2Jj1mDXNDTFt6F",
}) {
  const navigate = useNavigate();
  const { selecionados, setSelecionados, limparSelecao } =
    React.useContext(SelectionContext);
  const { user, token, logout } = useAuth();
  const isAuthenticated = !!(user?.email || user?.id || token);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  const navItems = React.useMemo(
    () => [
      { id: "inicio", label: "Início" },
      { id: "sobre", label: "Sobre o Sorteio" },
      { id: "produtos", label: "Produtos" },
      { id: "como-funciona", label: "Como Funciona" },
      { id: "duvidas", label: "Dúvidas" },
      { id: "contato", label: "Contato" },
    ],
    []
  );

  const scrollToSection = React.useCallback((id) => {
    try {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } finally {
      setMobileNavOpen(false);
    }
  }, []);

  // Estados vindos do backend
  const [srvReservados, setSrvReservados] = React.useState([]);
  const [srvIndisponiveis, setSrvIndisponiveis] = React.useState([]);

  // Iniciais dos vendidos (n -> "AB")
  const [soldInitials, setSoldInitials] = React.useState({});

  // Preço dinâmico
  const FALLBACK_PRICE = Number(process.env.REACT_APP_PIX_PRICE) || 55;
  const [unitPrice, setUnitPrice] = React.useState(FALLBACK_PRICE);

  // Config dinâmicas
  const [bannerTitle, setBannerTitle] = React.useState("");
  const [maxSelect, setMaxSelect] = React.useState(5);

  // Draw atual (se o backend expuser)
  const [currentDrawId, setCurrentDrawId] = React.useState(null);

  // Limite acumulado do usuário
  const [limitUsage, setLimitUsage] = React.useState({
    current: null,
    max: null,
  });

  // ===== Carregar preço, textos e (se houver) draw id — sem 404 no console
  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/config`, {
          credentials: "include",
          cache: "no-store",
        });
        if (res.ok) {
          const j = await res.json().catch(() => ({}));

          // preço
          const cents =
            j?.ticket_price_cents ??
            j?.price_cents ??
            j?.current?.price_cents ??
            j?.current_draw?.price_cents;
          const reais =
            cents != null && Number.isFinite(Number(cents))
              ? Number(cents) / 100
              : Number(j?.ticket_price ?? j?.price);
          if (alive && Number.isFinite(reais) && reais > 0) setUnitPrice(reais);

          // draw id (se enviado)
          const did =
            j?.current_draw_id ??
            j?.draw_id ??
            j?.current?.id ??
            j?.current_draw?.id;
          if (alive && did != null) setCurrentDrawId(did);

          // banner dinâmico
          if (alive && typeof j?.banner_title === "string") {
            setBannerTitle(j.banner_title);
          }

          // teto de seleção dinâmico
          const maxSel =
            j?.max_numbers_per_selection ?? j?.max_select ?? j?.selection_limit;
          if (alive && Number.isFinite(Number(maxSel)) && Number(maxSel) > 0) {
            setMaxSelect(Number(maxSel));
          }
        }
      } catch {
        // fallback silencioso
      } finally {
        // também tentamos carregar o uso do limite (add=0)
        try {
          const info = await checkUserPurchaseLimit({
            addCount: 0,
            drawId: currentDrawId,
          });
          if (alive) setLimitUsage({ current: info.current, max: info.max });
        } catch {}
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch imediato quando um novo sorteio for criado/aberto (admin)
  React.useEffect(() => {
    const onDrawChanged = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/config`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const j = await res.json().catch(() => ({}));
        const did =
          j?.current_draw_id ?? j?.draw_id ?? j?.current?.id ?? j?.current_draw?.id;
        if (did != null) setCurrentDrawId(did);
      } catch {}
    };
    window.addEventListener("ns:draw:changed", onDrawChanged);
    return () => window.removeEventListener("ns:draw:changed", onDrawChanged);
  }, []);

  // Polling leve de /api/numbers (sem Content-Type p/ não gerar preflight)
  const reloadSrvNumbers = React.useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/numbers`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const j = await res.json();

      const reserv = [];
      const indis = [];
      const initials = {};

      for (const it of j?.numbers || []) {
        const st = String(it.status || "").toLowerCase();
        const num = Number(it.n);
        if (st === "reserved") reserv.push(num);
        if (st === "taken" || st === "sold") {
          indis.push(num);
          const rawInit =
            it.initials ||
            it.owner_initials ||
            it.ownerInitials ||
            it.owner ||
            it.oi;
          if (rawInit) initials[num] = String(rawInit).slice(0, 3).toUpperCase();
        }
      }

      setSrvReservados(Array.from(new Set(reserv)));
      setSrvIndisponiveis(Array.from(new Set(indis)));
      setSoldInitials(initials);
    } catch {
      /* silencioso */
    }
  }, []);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      await reloadSrvNumbers();
      if (!alive) return;
    })();

    const id = setInterval(() => {
      if (!alive) return;
      reloadSrvNumbers();
    }, 15000);

    const onReload = () => {
      if (!alive) return;
      reloadSrvNumbers();
    };
    window.addEventListener("ns:numbers:reload", onReload);

    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener("ns:numbers:reload", onReload);
    };
  }, [reloadSrvNumbers]);

  const reservadosAll = React.useMemo(
    () => Array.from(new Set([...(reservados || []), ...srvReservados])),
    [reservados, srvReservados]
  );
  const indisponiveisAll = React.useMemo(
    () =>
      Array.from(new Set([...(indisponiveis || []), ...srvIndisponiveis])),
    [indisponiveis, srvIndisponiveis]
  );

  // menu avatar
  const [menuEl, setMenuEl] = React.useState(null);
  const menuOpen = Boolean(menuEl);
  const handleOpenMenu = (e) => setMenuEl(e.currentTarget);
  const handleCloseMenu = () => setMenuEl(null);
  const goConta = () => {
    handleCloseMenu();
    navigate("/conta");
  };
  const goLogin = () => {
    handleCloseMenu();
    navigate("/login");
  };
  const doLogout = () => {
    handleCloseMenu();
    logout();
    navigate("/");
  };

  // modal (confirmação)
  const [open, setOpen] = React.useState(false);
  const handleAbrirConfirmacao = () => setOpen(true);
  const handleFechar = () => setOpen(false);

  // PIX modal
  const [pixOpen, setPixOpen] = React.useState(false);
  const [pixLoading, setPixLoading] = React.useState(false);
  const [pixData, setPixData] = React.useState(null);
  const [pixAmount, setPixAmount] = React.useState(0);

  // sucesso PIX
  const [pixApproved, setPixApproved] = React.useState(false);
  const handlePixApproved = React.useCallback(() => {
    setPixApproved(true);
    setPixOpen(false);
    setPixLoading(false);
  }, []);

  // === Modal de limite ===
  const [limitOpen, setLimitOpen] = React.useState(false);
  const [limitInfo, setLimitInfo] = React.useState({
    type: "purchase",
    current: undefined,
    max: undefined,
  });
  const openLimitModal = (info) => {
    setLimitInfo(info || { type: "purchase" });
    setLimitOpen(true);
  };

  // Quantos ainda pode comprar segundo o servidor
  const remainingFromServer =
    (limitUsage.max ?? Infinity) - (limitUsage.current ?? 0);

  const handleIrPagamento = async () => {
    setOpen(false);

    if (!isAuthenticated) {
      navigate("/login", { replace: false, state: { from: "/", wantPay: true } });
      return;
    }

    const addCount = selecionados.length || 1;

    try {
      const { blocked, current, max } = await checkUserPurchaseLimit({
        addCount,
        drawId: currentDrawId,
      });

      const wouldBe = (current ?? 0) + addCount;
      const overByFront = Number.isFinite(max) && wouldBe > max;

      if (blocked || overByFront) {
        openLimitModal({
          type: "purchase",
          current: current ?? limitUsage.current,
          max: max ?? limitUsage.max ?? 5,
        });
        setLimitUsage({ current: current ?? 0, max: max ?? 5 });
        return;
      }
    } catch (e) {
      console.warn("[limit-check] falhou, seguindo fluxo]:", e);
    }

    const amount = selecionados.length * unitPrice;
    setPixAmount(amount);
    setPixOpen(true);
    setPixLoading(true);
    setPixApproved(false);

    try {
      const { reservationId } = await reserveNumbers(selecionados);
      const data = await createPixPayment({
        orderId: String(Date.now()),
        amount,
        numbers: selecionados,
        reservationId,
      });
      setPixData(data);

      setLimitUsage((old) => ({
        current:
          Number.isFinite(old.current) ? (old.current ?? 0) + addCount : old.current,
        max: old.max,
      }));
    } catch (e) {
      alert(e.message || "Falha ao gerar PIX");
      setPixOpen(false);
    } finally {
      setPixLoading(false);
    }
  };

  // Polling de status PIX
  React.useEffect(() => {
    if (!pixOpen || !pixData?.paymentId || pixApproved) return;
    const id = setInterval(async () => {
      try {
        const st = await checkPixStatus(pixData.paymentId);
        if (st?.status === "approved") handlePixApproved();
      } catch {}
    }, 3500);
    return () => clearInterval(id);
  }, [pixOpen, pixData, pixApproved, handlePixApproved]);

  // Seleção com teto (front)
  const isReservado = (n) => reservadosAll.includes(n);
  const isIndisponivel = (n) => indisponiveisAll.includes(n);
  const isSelecionado = (n) => selecionados.includes(n);
  const handleClickNumero = (n) => {
    if (isIndisponivel(n)) return;
    setSelecionados((prev) => {
      const already = prev.includes(n);
      if (already) return prev.filter((x) => x !== n);

      if (prev.length >= maxSelect) {
        openLimitModal({
          type: "selection",
          current: maxSelect,
          max: maxSelect,
        });
        return prev;
      }

      if (Number.isFinite(remainingFromServer) && remainingFromServer <= prev.length) {
        openLimitModal({
          type: "purchase",
          current: limitUsage.current ?? 0,
          max: limitUsage.max ?? 5,
        });
        return prev;
      }

      return [...prev, n];
    });
  };

  const getCellSx = (n) => {
    if (isIndisponivel(n))
      return {
        border: "1px solid rgba(15, 23, 42, 0.14)",
        bgcolor: "rgba(15, 23, 42, 0.06)",
        color: "rgba(11,27,51,0.40)",
        cursor: "not-allowed",
        opacity: 0.9,
      };

    if (isSelecionado(n))
      return {
        border: "1px solid rgba(30, 102, 255, 0.65)",
        bgcolor: "primary.main",
        color: "#FFFFFF",
        boxShadow: "0 10px 22px rgba(30, 102, 255, 0.22)",
      };

    if (isReservado(n))
      return {
        border: "1px solid rgba(242, 183, 5, 0.55)",
        bgcolor: "rgba(242, 183, 5, 0.16)",
        color: "rgba(11,27,51,0.92)",
      };

    return {
      border: "1px solid rgba(15, 23, 42, 0.16)",
      bgcolor: "#FFFFFF",
      color: "rgba(11,27,51,0.92)",
      "&:hover": { borderColor: "rgba(30, 102, 255, 0.30)", boxShadow: "0 8px 18px rgba(15, 23, 42, 0.08)" },
      transition: "border-color 140ms ease, box-shadow 140ms ease, transform 120ms ease",
      "&:active": { transform: "scale(0.98)" },
    };
  };

  const continuarDisabled =
    !selecionados.length ||
    (Number.isFinite(remainingFromServer) &&
      selecionados.length > Math.max(0, remainingFromServer));

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      <div className="xnamai-page">
        <div className="xnamai-page-content">
      {/* Topo */}
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          borderBottom: "1px solid rgba(15, 23, 42, 0.10)",
          bgcolor: "rgba(255,255,255,0.88)",
          backdropFilter: "saturate(180%) blur(10px)",
        }}
      >
        <Toolbar sx={{ position: "relative", minHeight: 64 }}>
          <IconButton
            edge="start"
            color="inherit"
            onClick={() => setMobileNavOpen(true)}
            sx={{ display: { xs: "inline-flex", md: "none" } }}
            aria-label="Abrir menu"
          >
            <MenuRoundedIcon />
          </IconButton>

          <Button
            onClick={() => scrollToSection("inicio")}
            variant="text"
            sx={{
              px: 0,
              mr: 2,
              fontWeight: 900,
              letterSpacing: 0.6,
              textTransform: "none",
              color: "text.primary",
              "&:hover": { bgcolor: "transparent" },
            }}
          >
            <Stack direction="row" spacing={1.2} alignItems="center">
              <Box
                component="img"
                src={xNamaiLogo}
                alt="xNaMai Sorteios"
                sx={{ height: 28, width: "auto" }}
              />
              <span>xNaMai Sorteios</span>
            </Stack>
          </Button>

          <Stack
            direction="row"
            spacing={0.5}
            alignItems="center"
            sx={{
              display: { xs: "none", md: "flex" },
              mx: "auto",
              px: 1,
              py: 0.5,
              borderRadius: 999,
              border: "1px solid rgba(15, 23, 42, 0.10)",
              bgcolor: "rgba(255,255,255,0.70)",
            }}
          >
            {navItems.map((it) => (
              <Button
                key={it.id}
                onClick={() => scrollToSection(it.id)}
                variant="text"
                sx={{
                  borderRadius: 999,
                  px: 1.6,
                  py: 0.7,
                  fontWeight: 800,
                  textTransform: "none",
                  color: it.id === "inicio" ? "primary.main" : "rgba(11,27,51,0.78)",
                  bgcolor: it.id === "inicio" ? "rgba(30, 102, 255, 0.10)" : "transparent",
                  border: it.id === "inicio" ? "1px solid rgba(30, 102, 255, 0.20)" : "1px solid transparent",
                  "&:hover": {
                    bgcolor: "rgba(15, 23, 42, 0.04)",
                    borderColor: "rgba(15, 23, 42, 0.10)",
                  },
                }}
              >
                {it.label}
              </Button>
            ))}
          </Stack>

          {/* Busca (sem placeholder) */}
          <Paper
            component="form"
            role="search"
            aria-label="Buscar"
            onSubmit={(e) => e.preventDefault()}
            variant="outlined"
            sx={{
              ml: "auto",
              mr: 1,
              px: 1.2,
              py: 0.35,
              borderRadius: 999,
              display: { xs: "none", md: "flex" },
              alignItems: "center",
              gap: 0.8,
              width: 320,
              bgcolor: "rgba(244,248,255,0.90)",
              borderColor: "rgba(15, 23, 42, 0.12)",
              boxShadow: "0 10px 20px rgba(15, 23, 42, 0.06)",
              "&:focus-within": {
                borderColor: "rgba(30, 102, 255, 0.35)",
                boxShadow: "0 0 0 4px rgba(30, 102, 255, 0.10)",
              },
            }}
          >
            <SearchRoundedIcon sx={{ color: "rgba(11,27,51,0.55)" }} />
            <InputBase
              inputProps={{
                "aria-label": "Buscar",
                placeholder: "",
              }}
              placeholder=""
              sx={{
                flex: 1,
                fontSize: 14,
                color: "text.primary",
                "& input::placeholder": { color: "transparent" },
              }}
            />
          </Paper>

          <IconButton
            color="inherit"
            sx={{
              color: "text.primary",
            }}
            onClick={handleOpenMenu}
            aria-label={isAuthenticated ? "Abrir menu do usuário" : "Abrir menu de login"}
          >
            <AccountCircleRoundedIcon />
          </IconButton>
          <Menu
            anchorEl={menuEl}
            open={menuOpen}
            onClose={handleCloseMenu}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
          >
            {isAuthenticated ? (
              <>
                <MenuItem onClick={goConta}>Área do cliente</MenuItem>
                <Divider />
                <MenuItem onClick={doLogout}>Sair</MenuItem>
              </>
            ) : (
              <MenuItem onClick={goLogin}>Entrar</MenuItem>
            )}
          </Menu>
        </Toolbar>
      </AppBar>

      <Drawer
        anchor="left"
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        PaperProps={{
          sx: {
            width: 280,
            bgcolor: "background.paper",
            borderRight: "1px solid rgba(15, 23, 42, 0.10)",
            backgroundImage:
              "radial-gradient(120% 90% at 10% 20%, rgba(30,102,255,0.10) 0%, transparent 60%), radial-gradient(120% 90% at 85% 35%, rgba(30,102,255,0.06) 0%, transparent 60%)",
          },
        }}
      >
        <Stack spacing={1} sx={{ p: 2 }}>
          <Stack direction="row" spacing={1.2} alignItems="center">
            <Box
              component="img"
              src={xNamaiLogo}
              alt="xNaMai Sorteios"
              sx={{ height: 28, width: "auto" }}
            />
            <Typography sx={{ fontWeight: 900, letterSpacing: 0.6 }}>
              xNaMai Sorteios
            </Typography>
          </Stack>
          <Divider sx={{ borderColor: "rgba(255,255,255,0.10)" }} />
          {navItems.map((it) => (
            <Button
              key={it.id}
              onClick={() => scrollToSection(it.id)}
              sx={{
                justifyContent: "flex-start",
                fontWeight: 800,
                textTransform: "none",
                color: "text.primary",
              }}
            >
              {it.label}
            </Button>
          ))}
          {!isAuthenticated && (
            <Button
              component={RouterLink}
              to="/cadastro"
              variant="contained"
              sx={{
                mt: 1,
                fontWeight: 900,
                borderRadius: 999,
                bgcolor: "primary.main",
                color: "#fff",
                boxShadow: "0 12px 22px rgba(30, 102, 255, 0.25)",
              }}
            >
              Criar conta
            </Button>
          )}
        </Stack>
      </Drawer>

      {/* Conteúdo */}
      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 9 } }}>
        <Stack spacing={4}>
          <Box id="inicio" />

          <Paper
            variant="outlined"
            sx={{
              p: { xs: 2.5, md: 4 },
              borderRadius: 4,
              bgcolor: "background.paper",
              boxShadow: "0 16px 40px rgba(15, 23, 42, 0.08)",
              backgroundImage:
                "radial-gradient(120% 120% at 0% 0%, rgba(30,102,255,0.10) 0%, transparent 55%), radial-gradient(120% 120% at 100% 20%, rgba(30,102,255,0.08) 0%, transparent 60%)",
            }}
          >
            <Stack spacing={2}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={{ xs: 2.5, md: 3 }}
                alignItems="stretch"
              >
                <Stack spacing={1.6} sx={{ flex: 1 }}>
                  <Typography
                    variant="h3"
                    sx={{
                      fontWeight: 950,
                      letterSpacing: -0.6,
                      lineHeight: 1.05,
                    }}
                  >
                    Bem-vindos ao Sorteio da{" "}
                    <Box
                      component="span"
                      sx={{
                        background: "linear-gradient(90deg, rgba(30,102,255,1), rgba(13,171,255,1))",
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                      }}
                    >
                      xNaMai
                    </Box>
                  </Typography>

                  <Typography
                    variant="h5"
                    sx={{ fontWeight: 900, color: "primary.main" }}
                  >
                    “Participe, concorra e ainda receba 100% do valor de volta.”
                  </Typography>

                  <Typography variant="body1" sx={{ color: "text.secondary", maxWidth: 720 }}>
                    A xNaMai apresenta o único sorteio em que você nunca sai perdendo. Ao
                    participar, você garante uma vaga na disputa por{" "}
                    <strong>R$ 5.000 em créditos</strong>, e ainda transforma o valor da sua
                    participação em um Cartão Presente Digital, válido para compras em todo o
                    site.
                  </Typography>

                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Sorteio válido até o preenchimento total da tabela. Baseado no resultado
                    oficial da Loteria Federal (Caixa Econômica Federal).
                  </Typography>
                </Stack>

                <Paper
                  variant="outlined"
                  sx={{
                    width: { xs: "100%", md: 360 },
                    borderRadius: 4,
                    bgcolor: "rgba(244,248,255,0.80)",
                    backgroundImage:
                      "radial-gradient(120% 90% at 30% 20%, rgba(30,102,255,0.20) 0%, transparent 65%), linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(244,248,255,0.88) 100%)",
                    boxShadow: "0 18px 40px rgba(15, 23, 42, 0.10)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    p: 3,
                    minHeight: 180,
                  }}
                >
                  <Stack spacing={0.8} alignItems="center">
                    <Typography
                      sx={{
                        fontWeight: 1000,
                        letterSpacing: 2,
                        fontSize: 34,
                        textTransform: "uppercase",
                        background: "linear-gradient(90deg, rgba(30,102,255,1), rgba(13,171,255,1))",
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                      }}
                    >
                      xNaMai
                    </Typography>
                    <Typography sx={{ color: "text.secondary", fontWeight: 800 }}>
                      Sorteios
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary", textAlign: "center" }}>
                      Premium • Seguro • Transparente
                    </Typography>
                  </Stack>
                </Paper>
              </Stack>
            </Stack>
          </Paper>

          {/* === CARTELA === */}
          <Paper
            variant="outlined"
            sx={{
              p: { xs: 1.5, md: 3 },
              borderRadius: 4,
              bgcolor: "background.paper",
              boxShadow: "0 18px 44px rgba(15, 23, 42, 0.08)",
              backgroundImage:
                "radial-gradient(120% 90% at 0% 0%, rgba(30,102,255,0.10) 0%, transparent 55%), radial-gradient(120% 90% at 100% 0%, rgba(30,102,255,0.08) 0%, transparent 60%)",
            }}
          >
            <Box id="sobre" />
            {/* >>>>> BANNER SUPERIOR (dinâmico) */}
            <Box
              sx={{
                mb: 2,
                p: { xs: 1.25, md: 1.5 },
                borderRadius: 3,
                border: "1px solid rgba(15, 23, 42, 0.10)",
                background:
                  "linear-gradient(90deg, rgba(244,248,255,0.90), rgba(30,102,255,0.08), rgba(244,248,255,0.90))",
              }}
            >
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 900,
                  textAlign: "center",
                  letterSpacing: 1,
                  color: "text.primary",
                }}
              >
                {bannerTitle || "SORTEIO TISSOT PRX DAMASCUS"}
              </Typography>
            </Box>

            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              alignItems={{ xs: "stretch", md: "center" }}
              justifyContent="space-between"
              sx={{ mb: 2 }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                <Chip
                  size="small"
                  label="DISPONÍVEL"
                  sx={{
                    bgcolor: "rgba(30,102,255,0.10)",
                    border: "1px solid rgba(30,102,255,0.25)",
                    color: "rgba(11,27,51,0.90)",
                    fontWeight: 900,
                  }}
                />
                <Chip
                  size="small"
                  label="RESERVADO"
                  sx={{
                    bgcolor: "rgba(242,183,5,0.16)",
                    border: "1px solid rgba(242,183,5,0.35)",
                    color: "rgba(11,27,51,0.90)",
                    fontWeight: 900,
                  }}
                />
                <Chip
                  size="small"
                  label="INDISPONÍVEL"
                  sx={{
                    bgcolor: "rgba(15,23,42,0.08)",
                    border: "1px solid rgba(15,23,42,0.18)",
                    color: "rgba(11,27,51,0.80)",
                    fontWeight: 900,
                  }}
                />
                <Typography variant="body2" sx={{ ml: 0.5, color: "text.secondary" }}>
                  {Number.isFinite(limitUsage.max) && Number.isFinite(limitUsage.current)
                    ? `• Você tem ${Math.max(
                        0,
                        (limitUsage.max ?? 0) - (limitUsage.current ?? 0)
                      )} de ${limitUsage.max} possíveis`
                    : " "}
                </Typography>
                {!!selecionados.length && (
                  <Typography variant="body2" sx={{ ml: 1, color: "text.secondary" }}>
                    • {selecionados.length} selecionado(s) (máx. {maxSelect} por seleção)
                  </Typography>
                )}
              </Stack>

              <Box id="produtos" />
            </Stack>

            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              alignItems="stretch"
            >
              {/* Coluna esquerda: grade */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                {/* Grid 10x10 */}
                <Box
                  sx={{
                    width: { xs: "calc(100vw - 32px)", sm: "calc(100vw - 64px)", md: "100%" },
                    maxWidth: 720,
                    aspectRatio: "1 / 1",
                    mx: { xs: "auto", md: 0 },
                  }}
                >
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "repeat(10, minmax(0, 1fr))",
                      gridTemplateRows: "repeat(10, minmax(0, 1fr))",
                      gap: { xs: 1, md: 1.2 },
                      height: "100%",
                      width: "100%",
                      boxSizing: "border-box",
                      p: { xs: 1, md: 1.2 },
                      borderRadius: 3,
                      border: "1px solid rgba(15, 23, 42, 0.10)",
                      background:
                        "linear-gradient(180deg, rgba(244,248,255,0.72) 0%, rgba(255,255,255,0.95) 100%)",
                    }}
                  >
                    {Array.from({ length: 100 }).map((_, idx) => {
                      const sold = isIndisponivel(idx);
                      const initials = soldInitials[idx];
                      return (
                        <Box
                          key={idx}
                          onClick={() => handleClickNumero(idx)}
                          sx={{
                            ...getCellSx(idx),
                            borderRadius: 2.2,
                            userSelect: "none",
                            cursor: sold ? "not-allowed" : "pointer",
                            aspectRatio: "1 / 1",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 950,
                            fontVariantNumeric: "tabular-nums",
                            position: "relative",
                          }}
                        >
                          <Stack spacing={0.2} alignItems="center" sx={{ pointerEvents: "none" }}>
                            <Box component="span" sx={{ fontSize: { xs: 14, md: 18 }, lineHeight: 1 }}>
                              {pad2(idx)}
                            </Box>
                            {sold && initials && (
                              <Box
                                component="span"
                                sx={{
                                  mt: 0.25,
                                  px: 0.8,
                                  py: 0.15,
                                  borderRadius: 999,
                                  fontSize: 10,
                                  fontWeight: 900,
                                  letterSpacing: 0.6,
                                  bgcolor: "rgba(11,27,51,0.08)",
                                  border: "1px solid rgba(15,23,42,0.10)",
                                  color: "rgba(11,27,51,0.80)",
                                }}
                              >
                                {initials}
                              </Box>
                            )}
                          </Stack>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              </Box>

              {/* Coluna direita: painel */}
              <Stack
                spacing={1.5}
                sx={{
                  width: { xs: "100%", md: 360 },
                  flexShrink: 0,
                }}
              >
                <Stack direction="row" spacing={1.2}>
                  <Button
                    fullWidth
                    variant="outlined"
                    disabled={!selecionados.length}
                    onClick={limparSelecao}
                    sx={{
                      borderRadius: 999,
                      fontWeight: 900,
                      borderColor: "rgba(15, 23, 42, 0.16)",
                      color: "text.primary",
                      bgcolor: "#fff",
                      "&:hover": { borderColor: "rgba(30, 102, 255, 0.30)", bgcolor: "rgba(244,248,255,0.90)" },
                    }}
                  >
                    Limpar seleção
                  </Button>
                  <Button
                    fullWidth
                    variant="contained"
                    disabled={continuarDisabled}
                    onClick={handleAbrirConfirmacao}
                    sx={{
                      borderRadius: 999,
                      fontWeight: 1000,
                      color: "#fff",
                      bgcolor: "primary.main",
                      boxShadow: "0 14px 24px rgba(30, 102, 255, 0.26)",
                    }}
                  >
                    Continuar
                  </Button>
                </Stack>

                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 3,
                    bgcolor: "background.paper",
                    boxShadow: "0 14px 28px rgba(15, 23, 42, 0.06)",
                  }}
                >
                  <Typography sx={{ fontWeight: 900, mb: 0.5 }}>
                    Cartão Presente Digital
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Cada número selecionado gera um Cartão Presente Digital no valor da sua participação.
                  </Typography>
                </Paper>

                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 3,
                    bgcolor: "rgba(244,248,255,0.85)",
                    borderColor: "rgba(30, 102, 255, 0.18)",
                    boxShadow: "0 14px 28px rgba(15, 23, 42, 0.06)",
                  }}
                >
                  <Typography sx={{ fontWeight: 1000, letterSpacing: 0.8 }}>
                    1 GANHADOR
                  </Typography>
                  <Typography sx={{ fontWeight: 1000, fontSize: 22 }}>
                    R$ 5.000 EM CRÉDITOS
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Resultado via Loteria Federal
                  </Typography>
                </Paper>

                <Paper
                  variant="outlined"
                  sx={{
                    p: 1.8,
                    borderRadius: 3,
                    bgcolor: "background.paper",
                    boxShadow: "0 14px 28px rgba(15, 23, 42, 0.06)",
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <LockRoundedIcon sx={{ color: "primary.main" }} />
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      Seus dados e participação estão 100% seguros e criptografados.
                    </Typography>
                  </Stack>
                </Paper>
              </Stack>
            </Stack>

            {/* >>>>> LINHA INFERIOR (apenas texto adicionado) */}
            <Box sx={{ mt: 2.5, textAlign: "center" }}>
              {(() => {
                const d = new Date();
                d.setDate(d.getDate() + 7);
                const dia = String(d.getDate()).padStart(2, "0");
                return (
                  <Typography variant="subtitle1" sx={{ opacity: 0.95, fontWeight: 800 }}>
                    📅 Utilizaremos o sorteio do dia <strong>{dia}</strong> ou o
                    primeiro sorteio da <strong>Loteria Federal</strong> após a tabela fechada.
                  </Typography>
                );
              })()}
            </Box>
          </Paper>
          {/* === FIM CARTELA === */}

          {/* === BENEFÍCIOS (barra inferior) === */}
          <Paper
            variant="outlined"
            sx={{
              p: { xs: 2, md: 2.5 },
              borderRadius: 4,
              bgcolor: "rgba(244,248,255,0.85)",
              borderColor: "rgba(15, 23, 42, 0.10)",
              boxShadow: "0 16px 36px rgba(15, 23, 42, 0.06)",
            }}
          >
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={{ xs: 1.4, md: 2 }}
              alignItems={{ xs: "stretch", md: "center" }}
              justifyContent="space-between"
            >
              <Stack direction="row" spacing={1.2} alignItems="center" sx={{ flex: 1 }}>
                <VerifiedUserRoundedIcon sx={{ color: "primary.main" }} />
                <Box>
                  <Typography sx={{ fontWeight: 900, lineHeight: 1.1 }}>
                    Ambiente 100% seguro
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Proteção e transparência em todo o processo.
                  </Typography>
                </Box>
              </Stack>

              <Divider
                flexItem
                orientation="vertical"
                sx={{ display: { xs: "none", md: "block" }, borderColor: "rgba(15,23,42,0.10)" }}
              />

              <Stack direction="row" spacing={1.2} alignItems="center" sx={{ flex: 1 }}>
                <ReplayRoundedIcon sx={{ color: "primary.main" }} />
                <Box>
                  <Typography sx={{ fontWeight: 900, lineHeight: 1.1 }}>
                    100% do valor de volta
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Créditos no Cartão Presente Digital.
                  </Typography>
                </Box>
              </Stack>

              <Divider
                flexItem
                orientation="vertical"
                sx={{ display: { xs: "none", md: "block" }, borderColor: "rgba(15,23,42,0.10)" }}
              />

              <Stack direction="row" spacing={1.2} alignItems="center" sx={{ flex: 1 }}>
                <LockRoundedIcon sx={{ color: "primary.main" }} />
                <Box>
                  <Typography sx={{ fontWeight: 900, lineHeight: 1.1 }}>
                    Transparência total
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Baseado no resultado oficial da Caixa.
                  </Typography>
                </Box>
              </Stack>
            </Stack>
          </Paper>

          {/* Demais seções */}
          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
            <Stack spacing={1.5}>

              <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
  <Stack spacing={1.2}>
    <Box
              sx={{
                mb: 2,
                p: { xs: 1.25, md: 1.5 },
                borderRadius: 2,
                border: "1px solid rgba(255,255,255,0.12)",
                background:
                  "linear-gradient(90deg, rgba(103,194,58,0.12), rgba(255,193,7,0.10))",
              }}
            >
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 900,
                  textAlign: "center",
                  letterSpacing: 1,
                  background: "linear-gradient(90deg, #67C23A, #FFC107)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  textShadow: "0 0 12px rgba(103,194,58,0.18)",
                }}
              >
               Como Funciona Seu Cartão Presente Digital
              </Typography>
            </Box>
              <Typography variant="body1">
      Cada participação que você faz se transforma em crédito no seu Cartão Presente Digital, acumulando automaticamente o valor investido.
      A validade do saldo é de 6 meses, sendo renovada a cada nova participação.
    </Typography>
      <Typography variant="body1">
      • Saldo acumulativo em um único cartão
    </Typography>

    <Typography variant="body1">
      • Validade renovada automaticamente
    </Typography>

    <Typography variant="body1">
              • Uso exclusivo no site da xNaMai Sorteios
    </Typography>

    <Typography variant="body1">
      • Código pessoal e intransferível
    </Typography>
    <Typography variant="body1">
      • Crédito perfeito para planejar a compra do seu próximo relógio
    </Typography>
    <Typography variant="body1">
      <strong>Dica:</strong> É a maneira mais inteligente de participar, enquanto concorre, você acumula crédito para usar quando quiser.
    </Typography>
  </Stack>
</Paper>

             
              <Box
                component="img"
                src={imgCardExemplo}
                alt="Cartão presente - exemplo"
                sx={{ width: "100%", maxWidth: 800, mx: "auto", display: "block", borderRadius: 2 }}
              />
             
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
            <Stack spacing={1.2}>
              <Typography variant="h6" fontWeight={800}>
                Informações do sorteio
              </Typography>
              <Typography variant="body1">
                • A vaga só é confirmada após a compensação do pagamento.
              </Typography>
              <Typography variant="body1">
                • O sorteio é realizado assim que todos os números são vendidos.
              </Typography>
              <Typography variant="body1">
                • O ganhador é o participante com o último número sorteado pela Lotomania.
              </Typography>
              <Typography variant="body1">
                • Prazo máximo: 7 dias após abertura da rodada.
              </Typography>
              <Typography variant="body1">
                • Envio do prêmio: frete por conta do vencedor.
              </Typography>
              <Typography variant="body1">
                • O Cartão Presente não é cumulativo com o prêmio nem com outras promoções do site.
              </Typography>
              <Typography variant="body1">
                Transparência total: o resultado pode ser conferido publicamente no site oficial da Caixa Econômica Federal.
              </Typography>
              
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
            <Stack spacing={2}>
              <Typography variant="h5" fontWeight={900}>
                Regras para utilização dos <Box component="span" sx={{ opacity: 0.85 }}>cartões presente</Box>
              </Typography>
              <Stack component="ul" sx={{ pl: 3, m: 0 }} spacing={1}>
                <Typography component="li">Uso exclusivo no site da <strong>xNaMai Sorteios.</strong></Typography>
                <Typography component="li">
                  Não é possível comprar outro cartão-presente com crédito de sorteio.
                </Typography>
                <Typography component="li">Sem conversão em dinheiro.</Typography>
               <Typography component="li">
                  Utilização em uma única compra, na compra de diversos produtos e também é possível usar somente parte do valor acumulado. 
                  <Link
                    href="https://chat.whatsapp.com/GdosYmyW2Jj1mDXNDTFt6F"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {" "}Solicitar no grupo
                  </Link>
                </Typography>
                
                <Typography component="li">Validade: <strong>6 meses</strong>, renovável automaticamente a cada participação..</Typography>
                <Typography component="li">
                  A xNaMai não se responsabiliza por perda, extravio ou validade expirada.
                </Typography>
                <Typography component="li">
                  O cartão não é cumulativo com outros cupons de desconto.
                </Typography>
                
              </Stack>
              <Box
                component="img"
                src={imgTabelaUtilizacao}
                alt="Tabela para utilização do cartão presente"
                sx={{ width: "100%", maxWidth: 900, mx: "auto", display: "block", borderRadius: 2, mt: 1 }}
              />
              <Typography align="center" sx={{ mt: 1.5, fontWeight: 700, letterSpacing: 1 }}>
                Sempre considerar o valor integral do produto na forma de pagamento escolhida (Pix ou crédito).
              </Typography>
             
            </Stack>
          </Paper>

          <GiftCardSimulator
        productName="Relógio Tissot PRX Powermatic 80"
        creditPriceDefault={6799.99}
        pixPriceDefault={5779.99}
        giftBalanceDefault={800}
      />


           <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, mt: 2 }}>
  <Stack spacing={2}>
    {/* Exemplo Prático */}
    <Typography variant="h6">⌚ Exemplo Prático</Typography>

    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
      Relógio Tissot PRX Powermatic 80
    </Typography>

    <Divider />

    {/* Crédito */}
    <Stack spacing={1}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <CreditCardOutlinedIcon fontSize="small" />
        <Chip size="small" label="Compra no crédito" />
      </Stack>
      <List dense disablePadding>
        <ListItem disableGutters>
          <ListItemText primary="Valor no crédito: R$ 6.799,99" />
        </ListItem>
        <ListItem disableGutters>
          <ListItemText primary="→ Pode usar até R$ 800,00 do cartão presente" />
        </ListItem>
        <ListItem disableGutters>
          <ListItemText primary="→ Valor final: R$ 5.999,99 (parcelado em até 12x sem juros)" />
        </ListItem>
      </List>
    </Stack>

    <Divider />

    {/* Pix */}
    <Stack spacing={1}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <PixIcon fontSize="small" />
        <Chip size="small" color="success" label="À vista (Pix)" />
      </Stack>
      <List dense disablePadding>
        <ListItem disableGutters>
          <ListItemText primary="Valor à vista (Pix): R$ 5.779,99" />
        </ListItem>
        <ListItem disableGutters>
          <ListItemText primary="→ Pode aplicar os mesmos R$ 800,00" />
        </ListItem>
        <ListItem disableGutters>
          <ListItemText primary="→ Valor final: R$ 4.979,99" />
        </ListItem>
      </List>
    </Stack>

    <Alert severity="info" icon={<HelpOutlineOutlinedIcon />}>
      <Typography variant="body2">
        <strong>Importante:</strong> o desconto sempre acompanha a forma de pagamento.
        Compras via Pix devem ter o desconto aplicado <strong>manualmente</strong> pela equipe da loja.
      </Typography>
    </Alert>

    <Divider sx={{ my: 1 }} />

    {/* FAQ */}
    <Typography variant="h6">❓ Perguntas Frequentes (FAQ)</Typography>

    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography>1. Como funciona o sorteio?</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body2">
          Baseado no resultado oficial da Lotomania. O ganhador é quem possui o último número sorteado.
        </Typography>
      </AccordionDetails>
    </Accordion>

    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography>2. Quando o sorteio acontece?</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body2">Assim que todos os números são vendidos.</Typography>
      </AccordionDetails>
    </Accordion>

    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography>3. O que ganho ao participar?</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body2">
          Você concorre ao prêmio e ainda recebe o valor investido de volta em créditos no site.
        </Typography>
      </AccordionDetails>
    </Accordion>

    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography>4. Onde posso usar meu cartão presente?</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body2">
          Somente no site da xNaMai Sorteios, em qualquer produto disponível no site (respeitando a tabela).
        </Typography>
      </AccordionDetails>
    </Accordion>

    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography>5. Posso transferir meu crédito?</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body2">
          Não. O cartão é pessoal, intransferível e sem conversão em dinheiro.
        </Typography>
      </AccordionDetails>
    </Accordion>

    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography>6. O prêmio inclui o frete?</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body2">Não. O custo de envio é por conta do vencedor.</Typography>
      </AccordionDetails>
    </Accordion>

    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography>7. Onde acompanho os resultados e novas rodadas?</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body2">
          No grupo oficial da xNaMai Sorteios no WhatsApp.
        </Typography>
      </AccordionDetails>
    </Accordion>

    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography>8. Posso usar somente uma parte do meu saldo acumulado?</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body2">
          Sim, você pode desmembrar o seu cartão presente e usar somente uma parte do seu saldo.
        </Typography>
      </AccordionDetails>
    </Accordion>

    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography>9. Posso comprar mais de 1 produto usando meus créditos?</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body2">
          Sim, você pode escolher diversos produtos no site para aplicar seu desconto.
          Basta seguir a tabela de utilização dos cartões presente.
        </Typography>
      </AccordionDetails>
    </Accordion>
  </Stack>
</Paper>



          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
            <Stack spacing={1.5}>
              <Typography>
                Dica: A cada participação o valor investido se soma ao 
                valor investido no sorteio anterior e sua validade é automaticamente renovada.

              </Typography>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                alignItems="center"
                sx={{ mt: 1 }}
              >
                <Box component="img" src={imgAcumulo1} alt="Exemplo de acúmulo 1" sx={{ width: "100%", maxWidth: 560, borderRadius: 2 }} />
                <Box component="img" src={imgAcumulo2} alt="Exemplo de acúmulo 2" sx={{ width: "100%", maxWidth: 560, borderRadius: 2 }} />
              </Stack>
            </Stack>
          </Paper>

          {/* Convite grupo */}
          <Paper
            variant="outlined"
            sx={{
              p: { xs: 3, md: 4 },
              textAlign: "center",
              bgcolor: "rgba(103, 194, 58, 0.05)",
              borderColor: "primary.main",
            }}
          >
            <Typography variant="h4" fontWeight={900} sx={{ mb: 1 }}>
              Clique no link abaixo e faça parte do <br /> grupo do sorteio!
            </Typography>
            <Typography sx={{ opacity: 0.85, mb: 2 }}>
              Lá você acompanha novidades, abertura de novas rodadas e avisos importantes.
            </Typography>
            <Button
              component="a"
              href={groupUrl}
              target="_blank"
              rel="noopener"
              size="large"
              variant="contained"
              color="success"
              sx={{ px: 4, py: 1.5, fontWeight: 800, letterSpacing: 0.5 }}
            >
              SIM, EU QUERO PARTICIPAR!
            </Button>
          </Paper>
        </Stack>
      </Container>
        </div>
      </div>

      {/* Modal de confirmação */}
      <Dialog open={open} onClose={handleFechar} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontSize: 22, fontWeight: 800, textAlign: "center" }}>
          Confirme sua seleção
        </DialogTitle>
        <DialogContent sx={{ textAlign: "center" }}>
          {selecionados.length ? (
            <>
              <Typography variant="body2" sx={{ opacity: 0.85, mb: 1 }}>
                Você selecionou {selecionados.length} {selecionados.length === 1 ? "número" : "números"}:
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: 1, mb: 1 }}>
                {selecionados.slice().sort((a, b) => a - b).map(pad2).join(", ")}
              </Typography>
              <Typography variant="body1" sx={{ mt: 0.5, mb: 1 }}>
                Total: <strong>R$ {(selecionados.length * unitPrice).toFixed(2)}</strong>
              </Typography>
              {Number.isFinite(remainingFromServer) && (
                <Typography variant="caption" sx={{ opacity: 0.75 }}>
                  Você ainda pode comprar {Math.max(0, remainingFromServer)} número(s) neste sorteio.
                </Typography>
              )}
            </>
          ) : (
            <Typography variant="body2" sx={{ opacity: 0.8 }}>
              Nenhum número selecionado.
            </Typography>
          )}
        </DialogContent>
        <DialogActions
          sx={{
            px: 3,
            pb: 3,
            gap: 1.2,
            flexWrap: "wrap",
            flexDirection: { xs: "column", sm: "row" },
            "& > *": { flex: 1 },
          }}
        >
          <Button variant="outlined" onClick={handleFechar} sx={{ py: 1.2, fontWeight: 700 }}>
            SELECIONAR MAIS NÚMEROS
          </Button>
          <Button
            variant="outlined"
            color="error"
            onClick={() => {
              limparSelecao();
              setOpen(false);
            }}
            disabled={!selecionados.length}
            sx={{ py: 1.2, fontWeight: 700 }}
          >
            LIMPAR SELEÇÃO
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleIrPagamento}
            disabled={continuarDisabled}
            sx={{ py: 1.2, fontWeight: 700 }}
          >
            IR PARA PAGAMENTO
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal PIX (QR) */}
      <PixModal
        open={pixOpen}
        onClose={() => {
          setPixOpen(false);
          setPixApproved(false);
        }}
        loading={pixLoading}
        data={pixData}
        amount={pixAmount}
        onCopy={() => {
          if (pixData) {
            navigator.clipboard.writeText(
              pixData.copy_paste_code || pixData.qr_code || ""
            );
          }
        }}
        onRefresh={async () => {
          if (!pixData?.paymentId) {
            setPixOpen(false);
            return;
          }
          try {
            const st = await checkPixStatus(pixData.paymentId);
            if (st.status === "approved") {
              handlePixApproved();
            } else {
              alert(`Status: ${st.status || "pendente"}`);
            }
          } catch {
            alert("Não foi possível consultar o status agora.");
          }
        }}
      />

      {/* Modal de sucesso do PIX */}
      <Dialog open={pixApproved} onClose={() => setPixApproved(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontSize: 22, fontWeight: 900, textAlign: "center" }}>
          Pagamento confirmado! 🎉
        </DialogTitle>
        <DialogContent sx={{ textAlign: "center" }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
            Seus números foram reservados.
          </Typography>
          <Typography sx={{ opacity: 0.9 }}>
            Boa sorte! Você pode acompanhar tudo na <strong>Área do cliente</strong>.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button fullWidth variant="contained" color="success" onClick={() => setPixApproved(false)} sx={{ py: 1.2, fontWeight: 800 }}>
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal: limite atingido */}
      <Dialog open={limitOpen} onClose={() => setLimitOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontSize: 20, fontWeight: 900, textAlign: "center" }}>
          {limitInfo?.type === "selection"
            ? `Você pode selecionar no máximo ${maxSelect} números`
            : "Número máximo de compras por usuário atingido"}
        </DialogTitle>
        <DialogContent sx={{ textAlign: "center" }}>
          <Typography sx={{ opacity: 0.9 }}>
            {limitInfo?.type === "selection"
              ? "Para continuar, remova um número antes de adicionar outro."
              : "Você já alcançou o limite de números neste sorteio."}
          </Typography>
          {(Number.isFinite(limitInfo?.current) || Number.isFinite(limitInfo?.max)) && (
            <Typography sx={{ mt: 1, fontWeight: 700 }}>
              ({limitInfo?.current ?? "-"} de {limitInfo?.max ?? "-"})
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button fullWidth variant="contained" onClick={() => setLimitOpen(false)} sx={{ py: 1.1, fontWeight: 800 }}>
            OK
          </Button>
        </DialogActions>
      </Dialog>
    </ThemeProvider>
  );
}
