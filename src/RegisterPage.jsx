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

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#67C23A' },
    secondary: { main: '#FFC107' },
    error: { main: '#D32F2F' },
    background: { default: '#0E0E0E', paper: '#121212' },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'Arial'].join(','),
  },
});

/* ===== helpers de API (com fallback para o backend real) ===== */
const RAW =
  process.env.REACT_APP_API_BASE ||
  process.env.REACT_APP_API_BASE_URL ||
  'https://newstore-backend.onrender.com';

const ROOT = String(RAW).replace(/\/+$/, '');
const API_BASE = /\/api$/i.test(ROOT) ? ROOT : `${ROOT}/api`;

function apiUrl(path) {
  let p = path.startsWith('/') ? path : `/${path}`;
  if (API_BASE.endsWith('/api') && p.startsWith('/api/')) p = p.slice(4);
  return `${API_BASE}${p}`;
}

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

  const paths = ['/auth/register', '/register', '/users/register'];
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
      <AppBar position="sticky" elevation={0} sx={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={() => navigate(-1)} aria-label="Voltar">
            <ArrowBackIosNewIcon />
          </IconButton>
          <Box sx={{ flexGrow: 1 }} />
          <IconButton color="inherit">
            <AccountCircleRoundedIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="sm" sx={{ py: { xs: 4, md: 6 } }}>
        <Paper variant="outlined" sx={{ p: { xs: 3, md: 4 }, bgcolor: 'background.paper' }}>
          <Stack spacing={2}>
            <Typography variant="h4" fontWeight={800} textAlign="center">
              Criar conta
            </Typography>
            <Typography variant="body2" textAlign="center" sx={{ opacity: 0.8 }}>
              Use seus dados para acessar a área do cliente.
            </Typography>

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
                />

                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={!canSubmit}
                  sx={{ py: 1.2, fontWeight: 700 }}
                >
                  {loading ? 'Criando...' : 'Criar conta'}
                </Button>

                <Button component={RouterLink} to="/login" variant="text" sx={{ fontWeight: 700 }}>
                  Já tenho conta — entrar
                </Button>
              </Stack>
            </Box>
          </Stack>
        </Paper>
      </Container>
    </ThemeProvider>
  );
}
