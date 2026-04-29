import * as React from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  IconButton,
  Box,
  Button,
  Container,
  CssBaseline,
  Paper,
  Stack,
  TextField,
  Typography,
  ThemeProvider,
  createTheme,
} from '@mui/material';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import AccountCircleRoundedIcon from '@mui/icons-material/AccountCircleRounded';
import { apiUrl } from "./config/api";
import BrandLogo from "./components/branding/BrandLogo";
import "./styles/xnamai-register.css";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#1E66FF" },
    secondary: { main: "#0B5FFF" },
    error: { main: "#D32F2F" },
    background: { default: "#F4F8FF", paper: "#FFFFFF" },
    text: { primary: "#0B1B33", secondary: "rgba(11,27,51,0.72)" },
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'Arial'].join(','),
  },
});

async function postJson(path, body) {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

async function registerRequest({ name, email, password, phone }) {
  const payload = {
    name: String(name || '').trim(),
    email: String(email || '').trim().toLowerCase(),
    password: String(password || ''),
    phone: String(phone || '').trim(),
  };

  const paths = ['/api/auth/register', '/api/register', '/api/users/register'];
  let lastErr;
  for (const p of paths) {
    try {
      return await postJson(p, payload);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Falha ao registrar');
}

/* ===================== Página ===================== */

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = React.useState({ name: '', email: '', password: '', phone: '' });
  const [errors, setErrors] = React.useState({});
  const [loading, setLoading] = React.useState(false);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(v).trim());
  const phoneDigits = (v) => String(v || '').replace(/\D+/g, '');
  const phoneOk = (v) => phoneDigits(v).length >= 10; // DDD + número (10 ou 11 dígitos)

  function validateAll() {
    const err = {};
    if (!form.name.trim()) err.name = 'Informe seu nome completo.';
    if (!emailOk(form.email)) err.email = 'E-mail inválido.';
    if (!phoneOk(form.phone)) err.phone = 'Informe um telefone válido com DDD.';
    if (!form.password) err.password = 'Informe uma senha.';
    setErrors(err);
    return Object.keys(err).length === 0;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateAll()) return;

    setLoading(true);
    try {
      await registerRequest(form);
      alert('Conta criada com sucesso! Agora faça login.');
      navigate('/login');
    } catch (err) {
      alert(err.message || 'Falha ao criar conta');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit =
    form.name.trim() && emailOk(form.email) && phoneOk(form.phone) && form.password && !loading;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div className="xnamai-auth">
        <div className="xnamai-auth__bg" />

        <div className="xnamai-auth__content">
          <AppBar
            position="sticky"
            elevation={0}
            sx={{
              borderBottom: "1px solid rgba(15, 23, 42, 0.10)",
              bgcolor: "rgba(255,255,255,0.86)",
              backdropFilter: "saturate(180%) blur(10px)",
              color: "text.primary",
            }}
          >
            <Toolbar sx={{ position: "relative", minHeight: 64 }}>
              <IconButton edge="start" onClick={() => navigate(-1)} aria-label="Voltar" sx={{ color: "text.primary" }}>
                <ArrowBackIosNewIcon />
              </IconButton>

              <Box
                component={RouterLink}
                to="/"
                sx={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  display: "flex",
                  alignItems: "center",
                }}
                aria-label="Voltar para a página inicial"
              >
                <BrandLogo size={32} />
              </Box>

              <IconButton color="inherit" sx={{ ml: "auto", color: "text.primary" }} aria-label="Conta">
                <AccountCircleRoundedIcon />
              </IconButton>
            </Toolbar>
          </AppBar>

          <Container
            maxWidth="sm"
            sx={{
              py: { xs: 5, md: 10 },
              minHeight: "calc(100vh - 64px)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Paper
              className="xnamai-auth__card"
              variant="outlined"
              elevation={0}
              sx={{
                p: { xs: 3, md: 4 },
                borderRadius: 4,
                width: "100%",
              }}
            >
              <Stack spacing={2.2}>
                <Box>
                  <Typography
                    variant="h4"
                    fontWeight={950}
                    sx={{ color: "primary.main", letterSpacing: -0.4 }}
                  >
                    Criar conta
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.4 }}>
                    Use seus dados para acessar a área do cliente.
                  </Typography>
                </Box>

                <Box component="form" onSubmit={handleSubmit} noValidate>
                  <Stack spacing={2}>
                    <TextField
                      label="Nome completo"
                      name="name"
                      value={form.name}
                      onChange={onChange}
                      fullWidth
                      required
                      error={!!errors.name}
                      helperText={errors.name}
                      sx={{ "& .MuiOutlinedInput-root": { bgcolor: "#fff" } }}
                    />

                    <TextField
                      label="E-mail"
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={onChange}
                      fullWidth
                      required
                      error={!!errors.email}
                      helperText={errors.email}
                      sx={{ "& .MuiOutlinedInput-root": { bgcolor: "#fff" } }}
                    />

                    <TextField
                      label="Celular (com DDD)"
                      name="phone"
                      value={form.phone}
                      onChange={onChange}
                      placeholder="(11) 90000-0000"
                      inputMode="tel"
                      fullWidth
                      required
                      error={!!errors.phone}
                      helperText={errors.phone}
                      sx={{ "& .MuiOutlinedInput-root": { bgcolor: "#fff" } }}
                    />

                    <TextField
                      label="Senha"
                      type="password"
                      name="password"
                      value={form.password}
                      onChange={onChange}
                      fullWidth
                      required
                      error={!!errors.password}
                      helperText={errors.password}
                      sx={{ "& .MuiOutlinedInput-root": { bgcolor: "#fff" } }}
                    />

                    <Button
                      type="submit"
                      variant="contained"
                      size="large"
                      disabled={!canSubmit}
                      sx={{
                        py: 1.2,
                        fontWeight: 900,
                        borderRadius: 999,
                        textTransform: "none",
                        backgroundImage: "linear-gradient(90deg, #1E66FF 0%, #0DABFF 100%)",
                        boxShadow: "0 14px 24px rgba(30, 102, 255, 0.24)",
                        "&:hover": { boxShadow: "0 18px 32px rgba(30, 102, 255, 0.28)" },
                        "&.Mui-disabled": {
                          color: "rgba(255,255,255,0.92)",
                          background: "linear-gradient(90deg, rgba(30,102,255,0.55), rgba(13,171,255,0.55))",
                        },
                      }}
                    >
                      {loading ? 'Criando...' : 'CRIAR CONTA'}
                    </Button>

                    <Button
                      component={RouterLink}
                      to="/login"
                      variant="text"
                      sx={{
                        fontWeight: 900,
                        textTransform: "none",
                        color: "primary.main",
                        "&:hover": { bgcolor: "rgba(30,102,255,0.06)" },
                      }}
                    >
                      JÁ TENHO CONTA — ENTRAR
                    </Button>
                  </Stack>
                </Box>
              </Stack>
            </Paper>
          </Container>
        </div>
      </div>
    </ThemeProvider>
  );
}
