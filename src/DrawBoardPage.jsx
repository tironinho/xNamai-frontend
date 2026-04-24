// src/DrawBoardPage.jsx
import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AppBar,
  Toolbar,
  IconButton,
  CssBaseline,
  Box,
  Container,
  Paper,
  Typography,
  Stack,
  Chip,
  createTheme,
  ThemeProvider,
  CircularProgress,
  Divider,
} from "@mui/material";
import ArrowBackIosNewRoundedIcon from "@mui/icons-material/ArrowBackIosNewRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#67C23A" },
    success: { main: "#2E7D32" },
    warning: { main: "#FFD54F" },
    background: { default: "#0E0E0E", paper: "#121212" },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: ["Inter", "system-ui", "Segoe UI", "Roboto", "Arial"].join(","),
    fontWeightBold: 800,
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage:
            "radial-gradient(70% 140% at 10% 30%, rgba(103,194,58,.08), transparent 60%), radial-gradient(80% 160% at 120% -10%, rgba(255,213,79,.05), transparent 60%)",
          borderColor: "rgba(255,255,255,.08)",
        },
      },
    },
  },
});

const API = (process.env.REACT_APP_API_BASE_URL ||
  process.env.REACT_APP_API_BASE ||
  "/api").replace(/\/+$/, "");

const authHeaders = () => {
  const tk =
    localStorage.getItem("ns_auth_token") ||
    sessionStorage.getItem("ns_auth_token") ||
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("token");
  return tk
    ? { Authorization: `Bearer ${String(tk).replace(/^Bearer\s+/i, "")}` }
    : {};
};

export default function DrawBoardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${API}/api/me/draws/${id}/board`, {
          headers: { "Content-Type": "application/json", ...authHeaders() },
          credentials: "include",
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "fetch_failed");
        if (alive) setData(j);
      } catch (e) {
        console.error("[DrawBoardPage] error:", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  // Estilo das células do tabuleiro
  const getCellSx = (cell) => {
    const isWinner = !!cell.isWinner;
    const isMine = !!cell.isMine;
    const state = String(cell.state || "");

    let color = "#FFFFFF";
    let border = "1px solid rgba(255,255,255,.18)";
    let backgroundImage =
      "linear-gradient(180deg, #232323 0%, #151515 100%), radial-gradient(80% 100% at 50% 0%, rgba(255,255,255,.10) 0%, transparent 55%)";
    let boxShadow = "0 0 0 0 rgba(0,0,0,0)";

    if (state === "taken") {
      color = "#FFD6D6";
      border = "1px solid rgba(255,138,138,.7)";
      backgroundImage =
        "linear-gradient(180deg, #472427 0%, #2B1517 100%), radial-gradient(80% 100% at 50% 0%, rgba(255,138,138,.20) 0%, transparent 55%)";
    }

    if (state === "reserved") {
      color = "#FFE7A1";
      border = "1px solid rgba(255,214,102,.75)";
      backgroundImage =
        "linear-gradient(180deg, #3A2E12 0%, #2A230D 100%), radial-gradient(80% 100% at 50% 0%, rgba(255,214,102,.22) 0%, transparent 55%)";
    }

    if (isMine) {
      color = "#D6EBFF";
      border = "1px solid #9BD1FF";
      backgroundImage =
        "linear-gradient(180deg, #183051 0%, #10233A 100%), radial-gradient(80% 100% at 50% 0%, rgba(155,209,255,.25) 0%, transparent 55%)";
      boxShadow = "0 0 0 2px rgba(155,209,255,.22)";
    }

    if (isWinner) {
      color = "#000";
      border = "0 solid transparent";
      backgroundImage =
        "linear-gradient(180deg, #FFE680 0%, #FFD048 45%, #E7B83E 100%)";
      boxShadow = "0 0 0 3px rgba(255,215,0,.35)";
    }

    return {
      userSelect: "none",
      display: "flex",
      flexDirection: "column", // número + nome do vencedor
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 999,
      fontWeight: 800,
      letterSpacing: 0.4,
      py: { xs: 1, sm: 1.1 },
      minHeight: { xs: 44, sm: 52 }, // espaço para número + nome
      color,
      border,
      backgroundImage,
      backgroundBlendMode: "overlay, normal",
      boxShadow,
      transition:
        "transform .15s ease, box-shadow .2s ease, border-color .2s ease, background .2s ease",
      "&:active": { transform: "scale(.98)" },
    };
  };

  const winnerName = data?.draw?.winner_name || null;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          borderBottom: "1px solid rgba(255,255,255,.08)",
          backdropFilter: "saturate(160%) blur(8px)",
          background:
            "linear-gradient(180deg, rgba(18,18,18,.9) 0%, rgba(18,18,18,.6) 100%)",
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 56, md: 64 } }}>
          <IconButton edge="start" color="inherit" onClick={() => navigate(-1)}>
            <ArrowBackIosNewRoundedIcon />
          </IconButton>
          <Typography sx={{ fontWeight: 900, letterSpacing: 0.5 }}>
            Detalhes do Sorteio #{String(id).padStart(3, "0")}
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: { xs: 2.5, md: 5 } }}>
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 4 }}>
          {loading && (
            <Stack alignItems="center" py={6} gap={1}>
              <CircularProgress />
              <Typography sx={{ opacity: 0.7 }}>Carregando grade…</Typography>
            </Stack>
          )}

          {!loading && data && (
            <>
              {/* status + legendas */}
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={1.5}
                alignItems={{ xs: "flex-start", md: "center" }}
                justifyContent="space-between"
                sx={{ mb: { xs: 1.5, md: 2 } }}
              >
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  flexWrap="wrap"
                >
                  <Chip
                    icon={<CheckCircleRoundedIcon />}
                    label={String(data.draw?.status || "").toUpperCase()}
                    color={
                      String(data.draw?.status).toLowerCase() === "closed"
                        ? "success"
                        : "default"
                    }
                    variant="outlined"
                    sx={{
                      fontWeight: 800,
                      "& .MuiChip-icon": { color: "success.main" },
                    }}
                  />
                  {!!data.draw?.winner_number && (
                    <Chip
                      icon={<StarRoundedIcon />}
                      label={`Número vencedor: ${String(
                        data.draw.winner_number
                      ).padStart(2, "0")}`}
                      sx={{
                        fontWeight: 900,
                        color: "#000",
                        bgcolor: "warning.main",
                        boxShadow: "0 4px 18px rgba(255,213,79,.25)",
                      }}
                    />
                  )}
                </Stack>

                <Stack direction="row" spacing={0.8} flexWrap="wrap">
                  <Chip
                    size="small"
                    label="Seu número"
                    sx={{
                      bgcolor: "#183051",
                      color: "#9BD1FF",
                      border: "1px solid #9BD1FF",
                    }}
                  />
                  <Chip
                    size="small"
                    icon={<LockRoundedIcon sx={{ fontSize: 16 }} />}
                    label="Indisponível"
                    sx={{
                      bgcolor: "#472427",
                      color: "#FFB3B3",
                      border: "1px solid #FF8A8A",
                    }}
                  />
                  <Chip
                    size="small"
                    icon={<ScheduleRoundedIcon sx={{ fontSize: 16 }} />}
                    label="Reservado"
                    sx={{
                      bgcolor: "#3A2E12",
                      color: "#FFE7A1",
                      border: "1px solid #FFD666",
                    }}
                  />
                  <Chip
                    size="small"
                    icon={<StarRoundedIcon sx={{ fontSize: 16 }} />}
                    label="Vencedor"
                    sx={{ bgcolor: "warning.main", color: "#000", fontWeight: 900 }}
                  />
                </Stack>
              </Stack>

              <Divider
                sx={{
                  mb: { xs: 1.5, md: 2 },
                  borderColor: "rgba(255,255,255,.08)",
                }}
              />

              {/* Grade 00..99 */}
              <Box
                role="grid"
                aria-label="Números do sorteio"
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "repeat(5, minmax(44px, 1fr))",
                    sm: "repeat(8, minmax(48px, 1fr))",
                    md: "repeat(10, minmax(50px, 1fr))",
                  },
                  gap: { xs: 0.75, sm: 0.9, md: 1.1 },
                }}
              >
                {data.board.map((cell) => (
                  <Box key={cell.n} role="gridcell" sx={getCellSx(cell)}>
                    <Typography component="span" sx={{ lineHeight: 1 }}>
                      {cell.label}
                    </Typography>

                    {/* Nome do vencedor abaixo do número vencedor */}
                    {cell.isWinner && !!winnerName && (
                      <Typography
                        variant="caption"
                        sx={{
                          mt: 0.3,
                          px: 0.6,
                          maxWidth: "100%",
                          fontWeight: 900,
                          lineHeight: 1.1,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          color: "#000",
                        }}
                        title={winnerName}
                      >
                        {winnerName}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>

              {/* Prêmio do sorteio (título + nome + link) */}
              <Box
                sx={{
                  mt: { xs: 2.5, md: 3 },
                  px: { xs: 1.5, md: 2 },
                }}
              >
                <Typography
                  sx={{
                    fontWeight: 900,
                    letterSpacing: 0.4,
                    mb: 0.5,
                  }}
                >
                  {(data.draw?.product_name || data.draw?.product_link)
                    ? "Premio do sorteio foi o item abaixo"
                    : "O premio do sorteio será indicado em breve"}
                </Typography>

                {(data.draw?.product_name || data.draw?.product_link) && (
                  <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap">
                    {!!data.draw?.product_name && (
                      <Typography
                        variant="h6"
                        sx={{
                          fontWeight: 900,
                          letterSpacing: 0.3,
                          mr: 1,
                        }}
                      >
                        {data.draw.product_name}
                      </Typography>
                    )}

                    {!!data.draw?.product_link && (
                      <Typography
                        component="a"
                        href={data.draw.product_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{
                          color: "primary.main",
                          fontWeight: 800,
                          textDecoration: "none",
                        }}
                      >
                        link
                      </Typography>
                    )}
                  </Stack>
                )}
              </Box>

              {/* Seus números */}
              <Box
                sx={{
                  mt: { xs: 1.5, md: 2 },
                  p: { xs: 1.5, md: 2 },
                  borderRadius: 3,
                  border: "1px solid rgba(255,255,255,.08)",
                  background:
                    "linear-gradient(180deg, rgba(25,25,25,.8) 0%, rgba(25,25,25,.6) 100%)",
                }}
              >
                <Typography
                  sx={{ fontWeight: 900, mb: 0.5, letterSpacing: 0.4, opacity: 0.9 }}
                >
                  Seus números
                </Typography>
                <Typography sx={{ opacity: 0.9 }}>
                  {data.my_numbers?.length
                    ? data.my_numbers
                        .map((n) => String(n).padStart(2, "0"))
                        .join(", ")
                    : "-"}
                </Typography>
              </Box>
            </>
          )}
        </Paper>
      </Container>
    </ThemeProvider>
  );
}
