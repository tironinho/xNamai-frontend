// src/AdminUsersPage.jsx
import * as React from "react";
import {
  AppBar, Toolbar, IconButton, Typography, Container, CssBaseline, Paper, Stack,
  TextField, Button, Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Checkbox, Divider, Snackbar, Alert, CircularProgress, createTheme, ThemeProvider, Box, Chip
} from "@mui/material";
import ArrowBackIosNewRoundedIcon from "@mui/icons-material/ArrowBackIosNewRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import DeleteForeverRoundedIcon from "@mui/icons-material/DeleteForeverRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";

import { useNavigate } from "react-router-dom";
import { apiJoin, authHeaders } from "./lib/api";

/* --------------------------- THEME (igual às outras telas) --------------------------- */
const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#67C23A" },
    secondary: { main: "#FFC107" },
    error: { main: "#D32F2F" },
    background: { default: "#0E0E0E", paper: "#121212" },
    success: { main: "#2E7D32" },
    warning: { main: "#B58900" },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: ["Inter", "system-ui", "Segoe UI", "Roboto", "Arial"].join(","),
  },
});

/* ----------------------------------- Helpers ----------------------------------- */
function toBRL(valueNumber) {
  const n = Number(valueNumber || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function centsToBRLString(cents) {
  const v = (Number(cents || 0) / 100);
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function brlStringToCents(str) {
  if (str == null) return 0;
  const clean = String(str).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(clean);
  if (Number.isFinite(n)) return Math.round(n * 100);
  return 0;
}

/** Busca páginas até acabar, retornando lista normalizada. */
async function fetchAllUsersPaged(bases, pageSize = 500) {
  const headers = { "Content-Type": "application/json", ...authHeaders() };
  for (const base of bases) {
    try {
      // Novo backend: usa limit/offset e devolve { users, total, hasMore, limit, offset }
      let out = [];
      let ids = new Set();
      let offset = 0;

      for (;;) {
        const url = `${base}?limit=${pageSize}&offset=${offset}`;
        const r = await fetch(apiJoin(url), { headers, credentials: "include", cache: "no-store" });
        if (!r.ok) break;

        const j = await r.json().catch(() => ({}));
        const page = normalizeUsers(j);

        // evita duplicatas/loops
        const fresh = page.filter(u => !ids.has(u.id));
        fresh.forEach(u => ids.add(u.id));
        out = out.concat(fresh);

        // Preferir sinalização do servidor
        const srvHasMore = typeof j?.hasMore === "boolean"
          ? j.hasMore
          : (page.length > 0 && page.length === (Number(j?.limit) || pageSize));

        if (!srvHasMore || fresh.length === 0) break;

        // avança pelo passo informado pelo servidor; fallback para tam. da página
        const step = Number(j?.limit) || page.length || pageSize;
        const currentOffset = Number(j?.offset);
        offset = Number.isFinite(currentOffset) ? currentOffset + step : offset + step;
      }

      if (out.length > 0) return out;

      // Fallback (compat): se a rota não suporta paginação, tenta simples
      const r0 = await fetch(apiJoin(base), { headers, credentials: "include", cache: "no-store" });
      if (r0.ok) {
        const j0 = await r0.json().catch(() => ({}));
        const once = normalizeUsers(j0);
        if (once.length > 0) return once;
      }
    } catch {
      // tenta próximo base
    }
  }
  return [];
}

/* ------------------------------ Auxiliares de Draw ------------------------------ */
async function safeJSON(path) {
  try {
    const r = await fetch(apiJoin(path), {
      headers: { "Content-Type": "application/json", ...authHeaders() },
      credentials: "include",
      cache: "no-store",
    });
    if (!r.ok) return null;
    return await r.json().catch(() => null);
  } catch {
    return null;
  }
}

function normalizeList(obj) {
  if (!obj) return [];
  if (Array.isArray(obj)) return obj;
  return obj.draws || obj.items || obj.list || obj.data || [];
}

/** Tenta descobrir o sorteio aberto (vigente) e devolve o id. */
async function findOpenDrawId() {
  const candidates = [
    "/admin/draws?status=open",
    "/draws?status=open",
    "/admin/draws/open",
    "/draws/open",
    "/admin/draws",
    "/draws",
  ];
  for (const p of candidates) {
    const j = await safeJSON(p);
    if (!j) continue;

    // pode vir lista ou objeto único
    const arr = normalizeList(j);
    if (arr.length) {
      const open = arr.find(d => /^(open|aberto)$/i.test(String(d?.status || d?.state || ""))) || arr[0];
      if (open?.id != null) return Number(open.id);
    } else if (j?.id != null) {
      // ex.: /draws/open retorna um único
      return Number(j.id);
    }
  }
  return null;
}

/** Normaliza payload do board para [{ n, label, state }] */
function normalizeBoardPayload(payload) {
  let raw = [];
  if (Array.isArray(payload)) raw = payload;
  else raw = payload?.board || payload?.cells || payload?.items || [];

  if (Array.isArray(raw) && raw.length) {
    return raw.map((c, idx) => {
      const n = Number(c?.n ?? c?.number ?? c?.num ?? c?.index ?? idx);
      const s = String(c?.state ?? c?.status ?? "").toLowerCase();
      let state = "open";
      if (/taken|sold|indispon|ocupad|closed|fechado/.test(s)) state = "taken";
      else if (/reserv|hold|pending/.test(s)) state = "reserved";
      return { n, label: String(n).padStart(2, "0"), state, isWinner: !!c?.isWinner, isMine: !!c?.isMine };
    }).filter(c => Number.isInteger(c.n) && c.n >= 0 && c.n <= 99);
  }

  // Outros formatos: listas de reservados/vendidos
  const reserved = new Set((payload?.reserved_numbers || payload?.reservations || []).map(Number));
  const taken = new Set((payload?.taken_numbers || payload?.sold_numbers || []).map(Number));

  const out = [];
  for (let n = 0; n < 100; n++) {
    let state = "open";
    if (taken.has(n)) state = "taken";
    else if (reserved.has(n)) state = "reserved";
    out.push({ n, label: String(n).padStart(2, "0"), state });
  }
  return out;
}

/** Busca a grade (board) para um sorteio. */
async function fetchBoard(drawId) {
  const paths = [
    `/me/draws/${drawId}/board`,
    `/admin/draws/${drawId}/board`,
    `/draws/${drawId}/board`,
    `/draws/${drawId}`, // às vezes devolve { board: [...] }
  ];
  for (const p of paths) {
    const j = await safeJSON(p);
    if (!j) continue;
    const board = normalizeBoardPayload(j);
    if (board.length) return board;
  }
  // fallback: grade "vazia" (tudo livre)
  return Array.from({ length: 100 }, (_, n) => ({ n, label: String(n).padStart(2, "0"), state: "open" }));
}

/* -------------------------------- Normalizadores -------------------------------- */
function normalizeUsers(payload) {
  const list = Array.isArray(payload)
    ? payload
    : payload?.users || payload?.items || [];
  return (list || []).map((u) => ({
    id: Number(u.id),
    name: u.name || "",
    email: u.email || "",
    phone: u.phone || u.cell || u.celular || u.telefone || "",
    is_admin: !!(u.is_admin || u.role === "admin"),
    created_at: u.created_at || u.createdAt || null,
    coupon_code: u.coupon_code || "",
    coupon_value_cents: Number(u.coupon_value_cents || 0),
  }));
}

/* ------------------------------------ Página ------------------------------------ */
export default function AdminUsersPage() {
  const navigate = useNavigate();

  // lista + busca
  const [users, setUsers] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");

  // form
  const blank = {
    id: null, name: "", email: "", phone: "", is_admin: false,
    coupon_code: "", coupon_value_cents: 0,
  };
  const [form, setForm] = React.useState(blank);
  const [saldoStr, setSaldoStr] = React.useState("0,00");

  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState({ open: false, msg: "", sev: "success" });

  // atribuição de números
  const [drawId, setDrawId] = React.useState("");
  const [numbersCsv, setNumbersCsv] = React.useState("");
  const [assigning, setAssigning] = React.useState(false);

  // board (referência)
  const [board, setBoard] = React.useState([]);
  const [boardLoading, setBoardLoading] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const list = await fetchAllUsersPaged(["/admin/users"], 500);
      if (alive) {
        setUsers(list);
        setLoading(false);
      }
    })();

    // descobrir sorteio aberto e preencher o campo
    (async () => {
      const id = await findOpenDrawId();
      if (id != null) {
        setDrawId(String(id));
        setBoardLoading(true);
        const b = await fetchBoard(id);
        setBoard(b);
        setBoardLoading(false);
      }
    })();

    return () => { alive = false; };
  }, []);

  // quando o id digitado mudar, recarrega a grade (se número válido)
  React.useEffect(() => {
    const idNum = Number(drawId);
    if (!Number.isInteger(idNum) || idNum <= 0) return;
    let cancel = false;
    (async () => {
      setBoardLoading(true);
      const b = await fetchBoard(idNum);
      if (!cancel) setBoard(b);
      setBoardLoading(false);
    })();
    return () => { cancel = true; };
  }, [drawId]);

  const filtered = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return users;
    return users.filter(
      (u) =>
        (u.name || "").toLowerCase().includes(s) ||
        (u.email || "").toLowerCase().includes(s) ||
        (u.phone || "").toLowerCase().includes(s) ||
        (u.coupon_code || "").toLowerCase().includes(s)
    );
  }, [users, q]);

  function handleSelect(u) {
    setForm({
      id: u.id,
      name: u.name || "",
      email: u.email || "",
      phone: u.phone || "",
      is_admin: !!u.is_admin,
      coupon_code: u.coupon_code || "",
      coupon_value_cents: Number(u.coupon_value_cents || 0),
    });
    setSaldoStr(centsToBRLString(u.coupon_value_cents || 0));
  }
  function handleNew() {
    setForm(blank);
    setSaldoStr("0,00");
  }

  async function handleSave() {
    try {
      setSaving(true);
      const creating = !form.id;

      const payload = {
        name: String(form.name || "").trim(),
        email: String(form.email || "").trim(),
        phone: String(form.phone || "").trim(),
        is_admin: !!form.is_admin,
        coupon_code: String(form.coupon_code || "").trim(),
        coupon_value_cents: brlStringToCents(saldoStr),
        ...(creating ? { set_default_password: true } : {}),
      };
      const url = form.id ? `/admin/users/${form.id}` : "/admin/users";
      const method = form.id ? "PUT" : "POST";

      const r = await fetch(apiJoin(url), {
        method,
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error("save_failed");
      const j = await r.json().catch(() => ({}));
      const saved = normalizeUsers([j])[0] || { ...form, ...payload, id: j?.id };

      setUsers((prev) => {
        const idx = prev.findIndex((x) => x.id === saved.id);
        if (idx >= 0) {
          const cp = prev.slice();
          cp[idx] = saved;
          return cp;
        }
        return [saved, ...prev];
      });
      setForm(saved);
      setSaldoStr(centsToBRLString(saved.coupon_value_cents || 0));
      setToast({
        open: true,
        sev: "success",
        msg: creating ? "Salvo com sucesso. Senha padrão: newstore" : "Salvo com sucesso."
      });
    } catch {
      setToast({ open: true, sev: "error", msg: "Não foi possível salvar." });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!form.id) return;
    if (!window.confirm("Excluir este usuário?")) return;
    try {
      setSaving(true);
      const r = await fetch(apiJoin(`/admin/users/${form.id}`), {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
      });
      if (!r.ok) throw new Error("delete_failed");
      setUsers((prev) => prev.filter((u) => u.id !== form.id));
      handleNew();
      setToast({ open: true, sev: "success", msg: "Excluído." });
    } catch {
      setToast({ open: true, sev: "error", msg: "Não foi possível excluir." });
    } finally {
      setSaving(false);
    }
  }

  async function handleAssign() {
    if (!form.id) {
      setToast({ open: true, sev: "warning", msg: "Selecione um usuário na lista." });
      return;
    }
    const d = Number(drawId);
    const nums = String(numbersCsv || "")
      .split(/[,\s;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n));

    if (!Number.isInteger(d) || d <= 0 || nums.length === 0) {
      setToast({ open: true, sev: "warning", msg: "Informe um sorteio e pelo menos um número." });
      return;
    }

    try {
      setAssigning(true);
      const r = await fetch(apiJoin(`/admin/users/${form.id}/assign-numbers`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({ user_id: form.id, draw_id: d, numbers: nums }),
      });
      if (!r.ok) throw new Error("assign_failed");
      setToast({ open: true, sev: "success", msg: "Números atribuídos com sucesso." });
      setNumbersCsv("");

      // atualiza a referência do board
      setBoardLoading(true);
      const b = await fetchBoard(d);
      setBoard(b);
      setBoardLoading(false);
    } catch {
      setToast({ open: true, sev: "error", msg: "Falha ao atribuir números." });
    } finally {
      setAssigning(false);
    }
  }

  /* ---- estilo das células (simples e responsivo) ---- */
  const getCellSx = (state) => {
    if (state === "taken") {
      return {
        color: "#FFB3B3",
        border: "1px solid #FF8A8A",
        background:
          "linear-gradient(180deg, #472427 0%, #2B1517 100%)",
      };
    }
    if (state === "reserved") {
      return {
        color: "#FFE7A1",
        border: "1px solid #FFD666",
        background:
          "linear-gradient(180deg, #3A2E12 0%, #2A230D 100%)",
      };
    }
    return {
      color: "#0E0E0E",
      border: "1px solid rgba(255,255,255,.2)",
      background:
        "linear-gradient(180deg, #67C23A 0%, #58A834 100%)",
    };
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      <AppBar position="sticky" elevation={0} sx={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <Toolbar sx={{ minHeight: { xs: 56, md: 64 } }}>
          <IconButton edge="start" color="inherit" onClick={() => navigate(-1)}>
            <ArrowBackIosNewRoundedIcon />
          </IconButton>
          <Typography sx={{ fontWeight: 900, letterSpacing: 0.5 }}>
            Cadastro de Clientes
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: { xs: 2.5, md: 5 } }}>
        <Stack spacing={2.5}>
          {/* CRUD */}
          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, border: "1px solid rgba(255,255,255,0.08)", bgcolor: "background.paper" }}>
            <Typography variant="h6" fontWeight={900} sx={{ mb: 1 }}>
              Cliente
            </Typography>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Nome"
                value={form.name}
                onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                fullWidth
              />
              <TextField
                label="E-mail"
                value={form.email}
                onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Celular"
                value={form.phone}
                onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
                placeholder="(DDD) 9 9999-9999"
                fullWidth
              />
              <Stack direction="row" alignItems="center" sx={{ minWidth: 180 }}>
                <Checkbox
                  checked={!!form.is_admin}
                  onChange={(e) => setForm((s) => ({ ...s, is_admin: e.target.checked }))}
                />
                <Typography sx={{ opacity: 0.9 }}>Administrador</Typography>
              </Stack>
            </Stack>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mt: 2 }}>
              <TextField
                label="Código do Cupom"
                value={form.coupon_code}
                onChange={(e) => setForm((s) => ({ ...s, coupon_code: e.target.value }))}
                sx={{ maxWidth: 280 }}
              />
              <TextField
                label="Saldo (R$)"
                value={saldoStr}
                onChange={(e) => setSaldoStr(e.target.value)}
                helperText="Valor em reais (será salvo em centavos)"
                sx={{ maxWidth: 220 }}
              />
            </Stack>

            <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
              <Button startIcon={<AddRoundedIcon />} onClick={handleNew}>Novo</Button>
              <Button
                variant="contained"
                color="success"
                startIcon={saving ? <CircularProgress size={18} /> : <SaveRoundedIcon />}
                onClick={handleSave}
                disabled={saving}
              >
                Salvar
              </Button>
              <Button
                color="error"
                startIcon={<DeleteForeverRoundedIcon />}
                onClick={handleDelete}
                disabled={!form.id || saving}
              >
                Excluir
              </Button>
            </Stack>

            <Divider sx={{ my: 2, borderColor: "rgba(255,255,255,0.08)" }} />

            {/* Atribuir números */}
            <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1 }}>
              Atribuir números ao cliente selecionado
            </Typography>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ xs: "stretch", md: "center" }}>
              <TextField
                label="Sorteio (ID)"
                value={drawId}
                onChange={(e) => setDrawId(e.target.value)}
                sx={{ maxWidth: 220 }}
              />
              <TextField
                label="Números (separados por vírgula ou espaço)"
                value={numbersCsv}
                onChange={(e) => setNumbersCsv(e.target.value)}
                fullWidth
              />
              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  onClick={async () => {
                    const id = await findOpenDrawId();
                    if (id != null) setDrawId(String(id));
                  }}
                >
                  Carregar sorteio aberto
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={assigning ? <CircularProgress size={18} /> : <SendRoundedIcon />}
                  onClick={handleAssign}
                  disabled={assigning}
                >
                  Atribuir
                </Button>
              </Stack>
            </Stack>

            {/* Referência do board (desktop e mobile) */}
            <Box sx={{ mt: 2.5 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Situação do sorteio</Typography>
                <Chip size="small" label="Disponível" sx={{ bgcolor: "#67C23A", color: "#0E0E0E", fontWeight: 800 }} />
                <Chip size="small" label="Reservado"  sx={{ bgcolor: "#FFD54F", color: "#000", fontWeight: 800 }} />
                <Chip size="small" label="Indisponível" sx={{ bgcolor: "#E57373", color: "#000", fontWeight: 800 }} />
                <Box sx={{ flex: 1 }} />
                <Button size="small" onClick={async () => {
                  const idNum = Number(drawId);
                  if (!Number.isInteger(idNum) || idNum <= 0) return;
                  setBoardLoading(true);
                  const b = await fetchBoard(idNum);
                  setBoard(b);
                  setBoardLoading(false);
                }}>
                  Atualizar grade
                </Button>
              </Stack>

              <Paper variant="outlined" sx={{ p: { xs: 1, md: 1.5 } }}>
                {boardLoading ? (
                  <Stack alignItems="center" py={3} gap={1}>
                    <CircularProgress />
                    <Typography sx={{ opacity: .8 }}>Carregando grade…</Typography>
                  </Stack>
                ) : (
                  <Box
                    role="grid"
                    aria-label="Números do sorteio (referência)"
                    sx={{
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "repeat(5, minmax(40px, 1fr))",
                        sm: "repeat(8, minmax(44px, 1fr))",
                        md: "repeat(10, minmax(46px, 1fr))",
                      },
                      gap: { xs: .6, sm: .7, md: .8 },
                    }}
                  >
                    {board.map((c) => (
                      <Box
                        key={c.n}
                        sx={{
                          userSelect: "none",
                          textAlign: "center",
                          py: .7,
                          borderRadius: 999,
                          fontWeight: 900,
                          letterSpacing: .4,
                          fontSize: { xs: 12, sm: 13 },
                          ...getCellSx(c.state),
                        }}
                        title={
                          c.state === "taken" ? "Indisponível" :
                          c.state === "reserved" ? "Reservado" : "Disponível"
                        }
                      >
                        {c.label}
                      </Box>
                    ))}
                  </Box>
                )}
              </Paper>
            </Box>
          </Paper>

          {/* Busca */}
          <Paper variant="outlined" sx={{ p: 1.5, border: "1px solid rgba(255,255,255,0.08)", bgcolor: "background.paper" }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <SearchRoundedIcon sx={{ opacity: 0.7 }} />
              <TextField
                placeholder="Buscar por nome, e-mail, celular ou cupom…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                fullWidth
              />
            </Stack>
          </Paper>

          {/* Tabela */}
          <Paper variant="outlined" sx={{ p: 1, border: "1px solid rgba(255,255,255,0.08)", bgcolor: "background.paper" }}>
            <TableContainer>
              <Table size="small" sx={{ minWidth: 920 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>ID</TableCell>
                    <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>NOME</TableCell>
                    <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>EMAIL</TableCell>
                    <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>CELULAR</TableCell>
                    <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>CUPOM</TableCell>
                    <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>SALDO</TableCell>
                    <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>ADMIN</TableCell>
                    <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>CRIADO EM</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading && (
                    <TableRow>
                      <TableCell colSpan={8} sx={{ color: "#bbb" }}>Carregando…</TableCell>
                    </TableRow>
                  )}
                  {!loading && filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} sx={{ color: "#bbb" }}>Nenhum usuário encontrado.</TableCell>
                    </TableRow>
                  )}
                  {filtered.map((u) => (
                    <TableRow key={u.id} hover sx={{ cursor: "pointer" }} onClick={() => handleSelect(u)}>
                      <TableCell>{u.id}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{u.name}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{u.phone}</TableCell>
                      <TableCell>{u.coupon_code || "-"}</TableCell>
                      <TableCell>{toBRL((u.coupon_value_cents || 0) / 100)}</TableCell>
                      <TableCell>{u.is_admin ? "Sim" : "Não"}</TableCell>
                      <TableCell>{u.created_at ? new Date(u.created_at).toLocaleString("pt-BR") : "--"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Stack>
      </Container>

      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={toast.sev} variant="filled" sx={{ width: "100%" }}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </ThemeProvider>
  );
}
