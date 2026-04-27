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

import GiftCardSimulator from "./components/GiftCardSimulator.jsx";
import NeonLinesBackground from "./components/NeonLinesBackground";

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

// Imagens locais
import imgCardExemplo from "./cartaoilustrativoTexto-do-seu-paragrafo-6-1024x1024.png";
import imgTabelaUtilizacao from "./Tabela-para-utilizacao-do-3-1024x1024.png";
import imgAcumulo1 from "./1-2-1-1024x512.png";
import imgAcumulo2 from "./2-1-1-1024x512.png";

// Tema
const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#2DE2E6" },     // neon azul
    secondary: { main: "#FF2E93" },   // neon rosa
    error: { main: "#FF3B5C" },
    background: { default: "#070712", paper: "#0B0B16" },
    success: { main: "#31F7A5" },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: ["Inter", "system-ui", "Segoe UI", "Roboto", "Arial"].join(","),
  },
});

// Helpers
const pad2 = (n) => n.toString().padStart(2, "0");

// Mocks
const MOCK_RESERVADOS = [];
const MOCK_INDISPONIVEIS = [];

// Base do backend
const API_BASE = String(
  API_CONFIG.baseUrl || "https://newstore-backend.onrender.com"
).replace(/\/+$/, "");

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
    if (isIndisponivel(n)) {
      return {
        border: "2px solid",
        borderColor: "error.main",
        bgcolor: "rgba(211,47,47,0.15)",
        color: "grey.300",
        cursor: "not-allowed",
        opacity: 0.85,
      };
    }
    if (isSelecionado(n) || isReservado(n)) {
      return {
        border: "2px solid",
        borderColor: "secondary.main",
        bgcolor: "rgba(255,193,7,0.12)",
      };
    }
    return {
      border: "2px solid rgba(255,255,255,0.08)",
      bgcolor: "primary.main",
      color: "#0E0E0E",
      "&:hover": { filter: "brightness(0.95)" },
      transition: "filter 120ms ease",
    };
  };

  const continuarDisabled =
    !selecionados.length ||
    (Number.isFinite(remainingFromServer) &&
      selecionados.length > Math.max(0, remainingFromServer));

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      <Box
        sx={{
          minHeight: "100vh",
          position: "relative",
          isolation: "isolate",
        }}
      >
        <NeonLinesBackground />

        {/* content layer */}
        <Box sx={{ position: "relative", zIndex: 1 }}>
      {/* Topo */}
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background:
            "linear-gradient(180deg, rgba(7,7,18,0.92) 0%, rgba(7,7,18,0.70) 100%)",
          backdropFilter: "saturate(160%) blur(10px)",
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
              color: "rgba(255,255,255,0.92)",
              "&:hover": { bgcolor: "transparent" },
            }}
          >
            xNaMai Sorteios
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
              border: "1px solid rgba(255,255,255,0.10)",
              background:
                "linear-gradient(90deg, rgba(45,226,230,0.08), rgba(255,46,147,0.08))",
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
                  color: it.id === "inicio" ? "secondary.main" : "rgba(255,255,255,0.78)",
                  bgcolor: it.id === "inicio" ? "rgba(255,46,147,0.10)" : "transparent",
                  border: it.id === "inicio" ? "1px solid rgba(255,46,147,0.28)" : "1px solid transparent",
                  "&:hover": {
                    bgcolor: "rgba(255,255,255,0.06)",
                    borderColor: "rgba(255,255,255,0.12)",
                  },
                }}
              >
                {it.label}
              </Button>
            ))}
          </Stack>

          <IconButton color="inherit" sx={{ ml: "auto" }} onClick={handleOpenMenu}>
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
            borderRight: "1px solid rgba(255,255,255,0.08)",
            backgroundImage:
              "radial-gradient(120% 80% at 20% 20%, rgba(45,226,230,0.10) 0%, transparent 60%), radial-gradient(120% 80% at 80% 40%, rgba(255,46,147,0.10) 0%, transparent 60%)",
          },
        }}
      >
        <Stack spacing={1} sx={{ p: 2 }}>
          <Typography sx={{ fontWeight: 900, letterSpacing: 0.6 }}>
            xNaMai Sorteios
          </Typography>
          <Divider sx={{ borderColor: "rgba(255,255,255,0.10)" }} />
          {navItems.map((it) => (
            <Button
              key={it.id}
              onClick={() => scrollToSection(it.id)}
              sx={{
                justifyContent: "flex-start",
                fontWeight: 800,
                textTransform: "none",
                color: "rgba(255,255,255,0.88)",
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
                background:
                  "linear-gradient(90deg, rgba(45,226,230,1) 0%, rgba(255,46,147,1) 100%)",
                color: "#0B0B16",
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
              borderColor: "rgba(255,255,255,0.10)",
              bgcolor: "rgba(11,11,22,0.56)",
              backdropFilter: "blur(10px)",
              backgroundImage:
                "radial-gradient(120% 120% at 10% 10%, rgba(45,226,230,0.14) 0%, transparent 55%), radial-gradient(140% 120% at 95% 15%, rgba(255,46,147,0.14) 0%, transparent 55%), linear-gradient(180deg, rgba(11,11,22,0.92) 0%, rgba(11,11,22,0.70) 100%)",
              boxShadow:
                "0 0 0 1px rgba(45,226,230,0.10), 0 0 22px rgba(45,226,230,0.10), 0 0 28px rgba(255,46,147,0.08)",
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
                        background:
                          "linear-gradient(90deg, rgba(45,226,230,1), rgba(255,46,147,1))",
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        textShadow: "0 0 18px rgba(45,226,230,0.18)",
                      }}
                    >
                      xNaMai
                    </Box>
                  </Typography>

                  <Typography
                    variant="h5"
                    sx={{ fontWeight: 900, color: "rgba(255,255,255,0.92)" }}
                  >
                    “Participe, concorra e ainda receba 100% do valor de volta.”
                  </Typography>

                  <Typography variant="body1" sx={{ opacity: 0.92, maxWidth: 720 }}>
                    A xNaMai apresenta o único sorteio em que você nunca sai perdendo. Ao
                    participar, você garante uma vaga na disputa por{" "}
                    <strong>R$ 5.000 em créditos</strong>, e ainda transforma o valor da sua
                    participação em um Cartão Presente Digital, válido para compras em todo o
                    site.
                  </Typography>

                  <Typography variant="body2" sx={{ opacity: 0.75 }}>
                    Sorteio válido até o preenchimento total da tabela. Baseado no resultado
                    oficial da Loteria Federal (Caixa Econômica Federal).
                  </Typography>
                </Stack>

                <Paper
                  variant="outlined"
                  sx={{
                    width: { xs: "100%", md: 360 },
                    borderRadius: 4,
                    borderColor: "rgba(255,255,255,0.10)",
                    background:
                      "linear-gradient(180deg, rgba(255,46,147,0.10) 0%, rgba(45,226,230,0.08) 100%)",
                    boxShadow:
                      "0 0 0 1px rgba(255,46,147,0.18), 0 0 26px rgba(255,46,147,0.12), 0 0 22px rgba(45,226,230,0.10)",
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
                        background:
                          "linear-gradient(90deg, rgba(255,46,147,1), rgba(166,66,255,1), rgba(45,226,230,1))",
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                      }}
                    >
                      xNaMai
                    </Typography>
                    <Typography sx={{ opacity: 0.85, fontWeight: 800 }}>
                      Sorteios
                    </Typography>
                    <Typography variant="caption" sx={{ opacity: 0.7, textAlign: "center" }}>
                      Premium • Futurista • Neon
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
              borderColor: "rgba(255,255,255,0.10)",
              bgcolor: "rgba(11,11,22,0.58)",
              backdropFilter: "blur(10px)",
              boxShadow:
                "0 0 0 1px rgba(45,226,230,0.10), 0 0 26px rgba(45,226,230,0.10), 0 0 26px rgba(255,46,147,0.08)",
              backgroundImage:
                "radial-gradient(120% 80% at 12% 0%, rgba(45,226,230,0.10) 0%, transparent 55%), radial-gradient(120% 80% at 88% 8%, rgba(255,46,147,0.10) 0%, transparent 55%)",
            }}
          >
            <Box id="sobre" />
            {/* >>>>> BANNER SUPERIOR (dinâmico) */}
            <Box
              sx={{
                mb: 2,
                p: { xs: 1.25, md: 1.5 },
                borderRadius: 3,
                border: "1px solid rgba(255,255,255,0.10)",
                background:
                  "linear-gradient(90deg, rgba(45,226,230,0.12), rgba(166,66,255,0.10), rgba(255,46,147,0.12))",
                boxShadow:
                  "0 0 0 1px rgba(255,46,147,0.10), 0 0 18px rgba(45,226,230,0.10)",
              }}
            >
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 900,
                  textAlign: "center",
                  letterSpacing: 1,
                  background:
                    "linear-gradient(90deg, rgba(45,226,230,1), rgba(166,66,255,1), rgba(255,46,147,1))",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  textShadow: "0 0 18px rgba(45,226,230,0.16)",
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
                    bgcolor: "rgba(49,247,165,0.16)",
                    border: "1px solid rgba(49,247,165,0.45)",
                    color: "rgba(255,255,255,0.92)",
                    fontWeight: 900,
                  }}
                />
                <Chip
                  size="small"
                  label="RESERVADO"
                  sx={{
                    bgcolor: "rgba(255,214,102,0.14)",
                    border: "1px solid rgba(255,214,102,0.45)",
                    color: "rgba(255,255,255,0.90)",
                    fontWeight: 900,
                  }}
                />
                <Chip
                  size="small"
                  label="INDISPONÍVEL"
                  sx={{
                    bgcolor: "rgba(255,46,147,0.12)",
                    border: "1px solid rgba(255,46,147,0.40)",
                    color: "rgba(255,255,255,0.90)",
                    fontWeight: 900,
                  }}
                />
                <Typography variant="body2" sx={{ ml: 0.5, opacity: 0.9 }}>
                  {Number.isFinite(limitUsage.max) && Number.isFinite(limitUsage.current)
                    ? `• Você tem ${Math.max(
                        0,
                        (limitUsage.max ?? 0) - (limitUsage.current ?? 0)
                      )} de ${limitUsage.max} possíveis`
                    : " "}
                </Typography>
                {!!selecionados.length && (
                  <Typography variant="body2" sx={{ ml: 1, opacity: 0.8 }}>
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
                            border: sold
                              ? "1px solid rgba(255,46,147,0.42)"
                              : isSelecionado(idx) || isReservado(idx)
                                ? "1px solid rgba(255,214,102,0.50)"
                                : "1px solid rgba(255,46,147,0.40)",
                            bgcolor: sold
                              ? "rgba(255,46,147,0.10)"
                              : isSelecionado(idx) || isReservado(idx)
                                ? "rgba(255,214,102,0.10)"
                                : "rgba(11,11,22,0.70)",
                            color: sold ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.92)",
                            boxShadow: sold
                              ? "0 0 12px rgba(255,46,147,0.10)"
                              : "0 0 14px rgba(255,46,147,0.10)",
                            "&:hover": sold ? undefined : { filter: "brightness(1.06)" },
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
                                  bgcolor: "rgba(0,0,0,0.45)",
                                  border: "1px solid rgba(255,255,255,0.10)",
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
                      borderColor: "rgba(255,255,255,0.14)",
                      color: "rgba(255,255,255,0.85)",
                      "&:hover": { borderColor: "rgba(255,255,255,0.22)", bgcolor: "rgba(255,255,255,0.04)" },
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
                      color: "#0B0B16",
                      background:
                        "linear-gradient(90deg, rgba(255,46,147,1) 0%, rgba(45,226,230,1) 100%)",
                      boxShadow:
                        "0 0 0 1px rgba(255,46,147,0.18), 0 0 22px rgba(255,46,147,0.12), 0 0 22px rgba(45,226,230,0.10)",
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
                    borderColor: "rgba(255,255,255,0.10)",
                    bgcolor: "rgba(11,11,22,0.52)",
                    backdropFilter: "blur(10px)",
                  }}
                >
                  <Typography sx={{ fontWeight: 900, mb: 0.5 }}>
                    Cartão Presente Digital
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.8 }}>
                    Cada número selecionado gera um Cartão Presente Digital no valor da sua participação.
                  </Typography>
                </Paper>

                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 3,
                    borderColor: "rgba(255,46,147,0.22)",
                    background:
                      "linear-gradient(180deg, rgba(255,46,147,0.10) 0%, rgba(166,66,255,0.08) 50%, rgba(45,226,230,0.08) 100%)",
                    backdropFilter: "blur(10px)",
                  }}
                >
                  <Typography sx={{ fontWeight: 1000, letterSpacing: 0.8 }}>
                    1 GANHADOR
                  </Typography>
                  <Typography sx={{ fontWeight: 1000, fontSize: 22 }}>
                    R$ 5.000 EM CRÉDITOS
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.78 }}>
                    Resultado via Loteria Federal
                  </Typography>
                </Paper>

                <Paper
                  variant="outlined"
                  sx={{
                    p: 1.8,
                    borderRadius: 3,
                    borderColor: "rgba(255,255,255,0.10)",
                    bgcolor: "rgba(11,11,22,0.42)",
                    backdropFilter: "blur(10px)",
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <LockRoundedIcon sx={{ color: "primary.main" }} />
                    <Typography variant="body2" sx={{ opacity: 0.85 }}>
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
        </Box>
      </Box>

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
