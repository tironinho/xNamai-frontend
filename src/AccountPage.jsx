// src/AccountPage.jsx
import * as React from "react";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import { SelectionContext } from "./selectionContext";
import { useAuth } from "./authContext";
import BrandLogo from "./components/branding/BrandLogo";
import "./styles/xnamai-account.css";
import "./styles/xnamai-account-modal.css";
import {
  AppBar, Box, Button, Chip, Container, CssBaseline, IconButton, Menu, MenuItem,
  Divider, Paper, Stack, ThemeProvider, Toolbar, Typography, createTheme,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, LinearProgress,
  TextField, Alert, Dialog, DialogContent
} from "@mui/material";
import ArrowBackIosNewRoundedIcon from "@mui/icons-material/ArrowBackIosNewRounded";
import AccountCircleRoundedIcon from "@mui/icons-material/AccountCircleRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { apiJoin, authHeaders, getJSON } from "./lib/api";

// ▼ PIX
import PixModal from "./PixModal";
import { checkPixStatus } from "./services/pix";
// ▲ PIX
import AutoPaySection from "./AutoPaySection";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#256DFF" },
    secondary: { main: "#5EA8FF" },
    error: { main: "#E43D3D" },
    background: { default: "#F6FAFF", paper: "#FFFFFF" },
    success: { main: "#2F7FFF" },
    warning: { main: "#F4B740" },
  },
  shape: { borderRadius: 18 },
  typography: { fontFamily: ["Inter","system-ui","Segoe UI","Roboto","Arial"].join(",") },
});

const pad2 = (n) => String(n).padStart(2, "0");
const ADMIN_EMAIL = "admin@newstore.com.br";
const TTL_MINUTES = Number(process.env.REACT_APP_RESERVATION_TTL_MINUTES || 15);
const COUPON_VALIDITY_DAYS = Number(process.env.REACT_APP_COUPON_VALIDITY_DAYS || 180);

// chips
const PayChip = ({ status }) => {
  const st = String(status || "").toLowerCase();
  if (["approved","paid","pago"].includes(st)) {
    return (
      <Chip
        label="PAGO"
        sx={{
          bgcolor: "rgba(37,109,255,0.12)",
          color: "#16325c",
          fontWeight: 900,
          borderRadius: 999,
          px: 1.5,
          border: "1px solid rgba(37,109,255,0.26)",
        }}
      />
    );
  }
  return (
    <Chip
      label="PENDENTE"
      sx={{
        bgcolor: "rgba(244,183,64,0.18)",
        color: "#6a4b00",
        fontWeight: 900,
        borderRadius: 999,
        px: 1.5,
        border: "1px solid rgba(244,183,64,0.35)",
      }}
    />
  );
};

const ResultChip = ({ result }) => {
  const r = String(result || "").toLowerCase();
  if (r.includes("contempla") || r.includes("win")) {
    return (
      <Chip
        label="CONTEMPLADO"
        sx={{
          bgcolor: "rgba(37,109,255,0.14)",
          color: "#16325c",
          fontWeight: 900,
          borderRadius: 999,
          px: 1.5,
          border: "1px solid rgba(37,109,255,0.30)",
        }}
      />
    );
  }
  if (r.includes("não") || r.includes("nao") || r.includes("n_contempla")) {
    return (
      <Chip
        label="NÃO CONTEMPLADO"
        sx={{
          bgcolor: "rgba(228,61,61,0.10)",
          color: "#9a1b1b",
          fontWeight: 900,
          borderRadius: 999,
          px: 1.5,
          border: "1px solid rgba(228,61,61,0.25)",
        }}
      />
    );
  }
  if (/(sorteado|closed|fechado)/.test(r)) {
    return (
      <Chip
        label={r.includes("sorteado") ? "SORTEADO" : "FECHADO"}
        sx={{
          bgcolor: "rgba(94,168,255,0.16)",
          color: "#16325c",
          fontWeight: 900,
          borderRadius: 999,
          px: 1.5,
          border: "1px solid rgba(94,168,255,0.32)",
        }}
      />
    );
  }
  return (
    <Chip
      label="ABERTO"
      sx={{
        bgcolor: "rgba(37,109,255,0.10)",
        color: "#16325c",
        fontWeight: 900,
        borderRadius: 999,
        px: 1.5,
        border: "1px solid rgba(37,109,255,0.22)",
      }}
    />
  );
};

// tenta uma lista de endpoints e retorna o primeiro que responder 2xx com JSON
async function tryManyJson(paths) {
  for (const p of paths) {
    try {
      const data = await getJSON(p);
      return { data, from: p };
    } catch {}
  }
  return { data: null, from: null };
}

// POST em uma lista de endpoints, parando no primeiro 2xx
async function tryManyPost(paths, body) {
  for (const p of paths) {
    try {
      const r = await fetch(apiJoin(p), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify(body || {}),
      });
      if (r.ok) return await r.json().catch(() => ({}));
    } catch {}
  }
  throw new Error("save_failed");
}

// normaliza payloads diferentes para um único formato
function normalizeToEntries(payPayload, reservationsPayload) {
  if (payPayload) {
    const list = Array.isArray(payPayload)
      ? payPayload
      : payPayload.payments || payPayload.items || [];
    return list.flatMap(p => {
      const drawId = p.draw_id ?? p.drawId ?? p.sorteio_id ?? null;
      const numbers = Array.isArray(p.numbers) ? p.numbers : [];
      const payStatus = p.status || p.paymentStatus || "pending";
      const when = p.paid_at || p.updated_at || p.created_at || null;
      return numbers.map(n => ({
        payment_id: p.id ?? p.payment_id ?? null,
        draw_id: drawId,
        number: Number(n),
        status: String(payStatus).toLowerCase(),
        when,
        expires_at: p.expires_at || p.expire_at || null,
      }));
    });
  }

  if (reservationsPayload) {
    const list = reservationsPayload.reservations || reservationsPayload.items || [];
    return list.map(r => {
      const raw = String(r.status || "").toLowerCase();
      // mapear corretamente os estados do reservations
      let st = "pending";
      if (raw === "paid" || raw === "sold" || raw === "approved") st = "approved";
      else if (/(active|reserved|pending|await|aguard)/.test(raw)) st = "pending";
      else if (/(expired|cancel)/.test(raw)) st = "expired";
      return {
        reservation_id: r.id ?? r.reservation_id ?? null,
        draw_id: r.draw_id ?? r.sorteio_id ?? null,
        number: Number(r.n ?? r.number ?? r.numero),
        status: st,
        when: r.paid_at || r.updated_at || r.created_at || null,
        expires_at: r.reserved_until || r.expires_at || r.expire_at || null,
      };
    });
  }

  return [];
}

// parse JSON tolerante
async function fetchJsonLoose(url, options) {
  const r = await fetch(apiJoin(url), options);
  if (!r.ok) return null;
  try {
    return await r.json();
  } catch {
    try {
      const txt = await r.text();
      const cleaned = String(txt).trim().replace(/^[^{[]*/, "");
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}

// ▸▸ helpers para sincronizar o cupom com novas compras
function asTime(v) {
  const t = Date.parse(v || "");
  return Number.isFinite(t) ? t : 0;
}

// ⚠️ Incremento de cupom: usar apenas endpoints de sync/incremento.
// Nada de fallback para rotas "update" (elas fazem SET e causam sobrescrita).
async function postIncrementCoupon({ addCents, lastPaymentSyncAt }) {
  const payload = {
    add_cents: Number(addCents) || 0,
    last_payment_sync_at: lastPaymentSyncAt,
  };
  // Somente os endpoints de incremento
  return await tryManyPost(
    ["/coupons/sync", "/me/coupons/sync"],
    payload
  );
}

export default function AccountPage() {
  const navigate = useNavigate();
  React.useContext(SelectionContext);
  const { logout, user: ctxUser } = useAuth();

  const [menuEl, setMenuEl] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [user, setUser] = React.useState(ctxUser || null);
  const [rows, setRows] = React.useState([]);

  // ► saldo composto
  const [, setBaseCents] = React.useState(0); // pode incluir safeUi p/ nunca regredir visualmente
  const [, setPaidCents] = React.useState(0); // soma payments approved (não usado na UI)

  // Valor oficial vindo do servidor (coupon_value_cents)
  const [officialCents, setOfficialCents] = React.useState(0);
  const valorAcumulado = (Number(officialCents) || 0) / 100;

  const [cupom, setCupom] = React.useState("CUPOMAQUI");
  const [validade, setValidade] = React.useState("--/--/--");

  // estado das configurações (apenas admin)
  const [cfgLoading, setCfgLoading] = React.useState(false);
  const [cfgSaved, setCfgSaved] = React.useState(null);
  const [cfg, setCfg] = React.useState({
    banner_title: "",
    max_numbers_per_selection: 5,
  });

  // ▼ PIX
  const [pixOpen, setPixOpen] = React.useState(false);
  const [pixLoading, setPixLoading] = React.useState(false);
  const [pixData, setPixData] = React.useState(null);
  const [pixAmount, setPixAmount] = React.useState(null);
  const [pixMsg, setPixMsg] = React.useState("");

  // AutoPay
  const [autoOpen, setAutoOpen] = React.useState(false);
  const [claims, setClaims] = React.useState({ taken: [], mine: [] });
  const loadClaims = React.useCallback(async () => {
    try {
      const j = await getJSON("/autopay/claims");
      setClaims({
        taken: Array.isArray(j?.taken) ? j.taken : [],
        mine: Array.isArray(j?.mine) ? j.mine : [],
      });
    } catch {}
  }, []);
  React.useEffect(() => { loadClaims(); }, [loadClaims]);
  const handleCloseAutoModal = React.useCallback(async () => {
    await loadClaims();
    setAutoOpen(false);
  }, [loadClaims]);

  // NOVO: busca a ÚLTIMA reserva ATIVA do sorteio, priorizando os números informados
  async function findLatestActiveReservation(drawId, numbersHint) {
    const want = new Set(
      Array.isArray(numbersHint)
        ? numbersHint.map(n => Number(n))
        : Number.isFinite(Number(numbersHint)) ? [Number(numbersHint)] : []
    );

    const endpoints = [
      "/me/reservations?active=1",
      "/me/reservations",
      "/reservations/me?active=1",
      "/reservations/me",
    ];

    let best = null; // { id, number, when }

    for (const base of endpoints) {
      const url = `${base}${base.includes("?") ? "&" : "?"}_=${Date.now()}`;
      try {
        const r = await fetch(apiJoin(url), {
          headers: { "Content-Type": "application/json", ...authHeaders() },
          credentials: "include",
          cache: "no-store",
        });
        if (!r.ok) continue;

        const j = await r.json().catch(() => ({}));
        const list = Array.isArray(j) ? j : (j.reservations || j.items || []);

        for (const x of list || []) {
          const d = Number(x?.draw_id ?? x?.sorteio_id);
          if (d !== Number(drawId)) continue;

          const raw = String(x?.status || "").toLowerCase();
          const isActive = /(active|reserved|pending|await|aguard)/.test(raw) && !/(expired|cancel)/.test(raw);
          if (!isActive) continue;

          const nums = Array.isArray(x?.numbers)
            ? x.numbers.map(Number)
            : [Number(x?.n ?? x?.number ?? x?.numero)].filter(Number.isFinite);

          const candidates = want.size ? nums.filter(n => want.has(n)) : nums;
          if (!candidates.length) continue;

          const when = asTime(x?.updated_at) || asTime(x?.created_at) || asTime(x?.reserved_until) || 0;
          for (const n of candidates) {
            if (!best || when > best.when) {
              best = { id: x.id ?? x.reservation_id ?? x.reservationId, number: n, when };
            }
          }
        }
      } catch {}
      if (best) break; // já achou uma ativa recente neste endpoint
    }

    return best ? { reservationId: best.id, number: best.number } : null;
  }

  // Procura payment pendente p/ (drawId, number)
  async function findPendingPayment(drawId, number) {
    try {
      const url = `/payments/me?_=${Date.now()}`;
      const r = await fetch(apiJoin(url), {
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        cache: "no-store",
      });
      if (!r.ok) return null;
      const j = await r.json().catch(() => ({}));
      const list = Array.isArray(j) ? j : (j.payments || j.items || []);
      return (list || []).find(p => {
        const d = Number(p?.draw_id ?? p?.drawId ?? p?.sorteio_id);
        const ns = Array.isArray(p?.numbers) ? p.numbers.map(n => Number(n)) : [];
        const status = String(p?.status || "").toLowerCase();
        return d === Number(drawId) && ns.includes(Number(number)) && status === "pending";
      }) || null;
    } catch {
      return null;
    }
  }

  // --------- GERAR PIX ----------
  async function handleGeneratePix(row) {
    setPixMsg("Gerando PIX…");
    setPixOpen(true);
    setPixLoading(true);

    try {
      const drawId = Number(row?.draw_id ?? row?.sorteio ?? row?.draw ?? row?.id);

      // ► Prioriza a ÚLTIMA reserva ATIVA dentro dos números exibidos na linha
      const hintNumbers = Array.isArray(row?.numeros)
        ? row.numeros
        : (Number.isFinite(Number(row?.number ?? row?.numero ?? row?.num))
            ? [Number(row?.number ?? row?.numero ?? row?.num)]
            : []);

      const latest = await findLatestActiveReservation(drawId, hintNumbers);
      if (!latest) {
        setPixMsg("Falha ao gerar PIX: sua reserva não está ativa. Volte ao sorteio para reservar novamente.");
        return;
      }

      let selectedNumber = Number(latest.number);

      // Reaproveita pagamento pendente existente (para o número correto)
      const already = await findPendingPayment(drawId, selectedNumber);
      if (already && (already.qr_code || already.qr_code_base64 || already.copy || already.copy_paste)) {
        setPixData(already);
        const cents = already?.amount_cents ?? null;
        setPixAmount(typeof cents === "number" ? cents / 100 : null);
        setPixMsg(already?.status ? `Status: ${already.status}` : `PIX pendente do nº ${pad2(selectedNumber)} recuperado.`);
        return;
      }

      // Função local para pedir PIX (com revalidação caso a reserva esteja inativa)
      const requestPix = async (reservationId) => {
        const r = await fetch(apiJoin("/payments/pix"), {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({ reservationId, reservation_id: reservationId }),
        });

        // Se a API disser que a reserva não está ativa, tenta novamente com a última ativa
        if (!r.ok && r.status === 400) {
          let msg = "";
          try { const j = await r.json(); msg = String(j?.error || j?.message || ""); } catch {}
          if (/reservation[_\s-]?not[_\s-]?active|expired|inativa|expirada/i.test(msg)) {
            const fresh = await findLatestActiveReservation(drawId, hintNumbers);
            if (fresh && fresh.reservationId !== reservationId) {
              selectedNumber = Number(fresh.number); // atualiza o nº
              return await requestPix(fresh.reservationId);
            }
            setPixMsg("Falha ao gerar PIX: sua reserva não está ativa. Volte ao sorteio para reservar novamente.");
            return null;
          }
        }
        if (!r.ok) {
          if (r.status === 404) setPixMsg("Falha ao gerar PIX (rota não encontrada no servidor).");
          else setPixMsg(`Falha ao gerar PIX (HTTP ${r.status}).`);
          return null;
        }
        return await r.json().catch(() => ({}));
      };

      const created = await requestPix(latest.reservationId);
      if (!created) return;

      setPixData(created);

      // Descobre o valor (centavos)
      let amountCents =
        (typeof created?.amount_cents === "number" && created.amount_cents) ||
        (typeof created?.payment?.amount_cents === "number" && created.payment.amount_cents) ||
        null;

      if (amountCents == null) {
        const nowPending = await findPendingPayment(drawId, selectedNumber);
        if (nowPending?.amount_cents != null) amountCents = nowPending.amount_cents;
      }
      if (amountCents == null) {
        const id = created?.paymentId || created?.id || created?.txid || created?.e2eid;
        if (id) {
          try {
            const det = await checkPixStatus(id);
            if (det?.amount_cents != null) amountCents = det.amount_cents;
          } catch {}
        }
      }

      setPixAmount(amountCents != null ? amountCents / 100 : null);
      setPixMsg(created?.status ? `Status: ${created.status}` : `PIX criado para o nº ${pad2(selectedNumber)}.`);
    } catch (e) {
      console.error("[AccountPage] createPixPayment error:", e);
      setPixMsg("Falha ao gerar PIX.");
    } finally {
      setPixLoading(false);
    }
  }

  async function refreshPix() {
    try {
      const txid = pixData?.txid || pixData?.id || pixData?.e2eid || pixData?.paymentId;
      if (!txid) return;
      const r = await checkPixStatus(txid);
      setPixData(prev => ({ ...(prev || {}), ...(r || {}) }));
      if (r?.status) setPixMsg(`Status: ${r.status}`);
      if (typeof r?.amount_cents === "number") setPixAmount(r.amount_cents / 100);
    } catch (e) {
      console.error("[AccountPage] checkPixStatus error:", e);
    }
  }

  function copyPix() {
    const key = pixData?.copy || pixData?.copy_paste || pixData?.copy_paste_code || pixData?.emv || pixData?.qr_code || "";
    if (key) navigator.clipboard.writeText(key).catch(() => {});
  }

  const doLogout = () => { setMenuEl(null); logout(); navigate("/"); };
  const storedMe = React.useMemo(() => {
    try { return JSON.parse(localStorage.getItem("me") || "null"); } catch { return null; }
  }, []);

  // ---- RELOAD BALANCES (composição base + compras aprovadas) ----
  const reloadBalances = React.useCallback(async () => {
    try {
      // 1) Cupom atual (valor oficial do servidor)
      const mine = await fetchJsonLoose("/coupons/mine", {
        headers: { ...authHeaders() }, credentials: "include",
      });

      let currentCents = 0;
      let code = null;

      if (mine) {
        currentCents = Number(mine.cents ?? mine.coupon_value_cents ?? mine.value_cents ?? 0) || 0;
        code = mine.code || mine.coupon_code || null;
      }

      // atualiza o valor OFICIAL exibido
      setOfficialCents(Number.isFinite(currentCents) && currentCents >= 0 ? currentCents : 0);

      if (Number.isFinite(currentCents) && currentCents >= 0) setBaseCents(currentCents);
      if (code) setCupom(String(code));

      // carimbo de sincronização
      let lastSyncMs =
        asTime(mine?.last_payment_sync_at) ||
        asTime(mine?.coupon_updated_at) ||
        asTime(mine?.updated_at);

      const uid = (mine?.id || ctxUser?.id || "").toString();
      const lsKey = uid ? `ns_coupon_last_sync_${uid}` : null;
      if (!lastSyncMs && lsKey) {
        lastSyncMs = Number(localStorage.getItem(lsKey) || 0) || 0;
      }

      // 2) Delta de pagamentos aprovados após o carimbo
      let deltaCents = 0;
      try {
        const r = await fetch(apiJoin("/payments/me?_=" + Date.now()), {
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          credentials: "include",
        });
        if (r.ok) {
          const j = await r.json().catch(() => ({}));
          const list = Array.isArray(j) ? j : (j.payments || j.items || []);
          for (const p of (list || [])) {
            const status = String(p?.status || "").toLowerCase();
            if (status !== "approved" && status !== "paid" && status !== "pago") continue;
            const whenMs = asTime(p?.paid_at) || asTime(p?.updated_at) || asTime(p?.created_at);
            if (!whenMs) continue;
            if (lastSyncMs && whenMs <= lastSyncMs) continue;
            deltaCents += Number(p?.amount_cents || 0);
          }
        }
      } catch {}

      // 3) Incremento no backend (sem sobrescrever total) e REFRESH do valor oficial
      if (deltaCents > 0) {
        const nowIso = new Date().toISOString();
        try {
          await postIncrementCoupon({
            addCents: deltaCents,
            lastPaymentSyncAt: nowIso,
          });
          // Recarrega o valor oficial após sincronizar
          const updated = await fetchJsonLoose("/coupons/mine", {
            headers: { ...authHeaders() }, credentials: "include",
          });
          const centsAfter = Number(updated?.cents ?? updated?.coupon_value_cents ?? updated?.value_cents ?? currentCents) || currentCents;

          // valor oficial pós-sync
          setOfficialCents(centsAfter);

          // Nunca diminuir na UI por conta de replicação/latência (safeUi só para base interna)
          const safeUi = Math.max(centsAfter, currentCents + deltaCents);
          setBaseCents(safeUi);

          if (lsKey) localStorage.setItem(lsKey, String(Date.parse(nowIso)));
        } catch (e) {
          console.warn("[coupon.increment] falhou ao persistir incremento:", e?.message || e);
        }
      }

      setPaidCents(0); // não somar pagamentos diretamente na UI
    } catch (e) {
      console.warn("[reloadBalances] erro silencioso:", e?.message || e);
    }
  }, [ctxUser?.id]);

  // efeito principal
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // /me
        let me = ctxUser || storedMe || null;
        try {
          const meResp = await getJSON("/me");
          me = meResp?.user || meResp || me;
        } catch {}
        if (alive) {
          setUser(me || null);
          try { if (me) localStorage.setItem("me", JSON.stringify(me)); } catch {}
          // NÃO atualizar baseCents a partir de /me para não sobrescrever o saldo
        }

        // pagamentos/linhas p/ tabela + validade
        const { data: pay, from } = await tryManyJson([
          "/payments/me",
          "/me/reservations?active=1",
          "/reservations/me?active=1",
          "/me/reservations",
          "/reservations/me",
        ]);

        // draws (status)
        let drawsMap = new Map();
        try {
          const draws = await getJSON("/draws");
          const arr = Array.isArray(draws) ? draws : (draws.draws || draws.items || []);
          drawsMap = new Map(arr.map(d => [Number(d.id ?? d.draw_id), (d.status ?? d.result ?? "")]));
        } catch {}

        if (alive && pay) {
          const entries = normalizeToEntries(
            from === "/payments/me" ? pay : null,
            from !== "/payments/me" ? pay : null
          );

          const now = Date.now();
          const ttlMs = TTL_MINUTES * 60 * 1000;

          const filtered = entries.filter(e => {
            const st = String(e.status || "").toLowerCase();
            if (["approved","paid","pago"].includes(st)) return true;
            if (e.expires_at) {
              const expMs = new Date(e.expires_at).getTime();
              if (!isNaN(expMs)) return expMs > now;
            }
            if (e.when) {
              const whenMs = new Date(e.when).getTime();
              if (!isNaN(whenMs)) return (whenMs + ttlMs) > now;
            }
            return true;
          });

          // DEDUPE por (sorteio, número) preferindo status aprovado
          const byKey = new Map();
          const priority = (st) => {
            const s = String(st || "").toLowerCase();
            if (["approved","paid","pago"].includes(s)) return 2;
            if (/(expired|cancel)/.test(s)) return 0;
            return 1; // pending/active/await…
          };
          for (const e of filtered) {
            const key = `${Number(e.draw_id)}|${Number(e.number)}`;
            const cur = byKey.get(key);
            if (!cur) { byKey.set(key, e); continue; }
            const pNew = priority(e.status), pOld = priority(cur.status);
            if (pNew > pOld) byKey.set(key, e);
            else if (pNew === pOld) {
              const tNew = e.when ? new Date(e.when).getTime() : 0;
              const tOld = cur.when ? new Date(cur.when).getTime() : 0;
              if (tNew >= tOld) byKey.set(key, e);
            }
          }
          const deduped = Array.from(byKey.values());

          // AGRUPAR por sorteio (approved só se todos aprovados)
          const byDraw = new Map();
          const isPendingStatus = (s) => /pending|pendente|await|aguard|active|ativo|reserv/.test(String(s || "").toLowerCase());
          const isApprovedStatus = (s) => /^(approved|paid|pago)$/.test(String(s || "").toLowerCase());

          for (const e of deduped) {
            const id = Number(e.draw_id);
            if (!byDraw.has(id)) {
              byDraw.set(id, {
                draw_id: id,
                numeros: [],
                when: e.when ? new Date(e.when).getTime() : 0,
                hasPending: false,
                hasApproved: false,
              });
            }
            const g = byDraw.get(id);
            g.numeros.push(Number(e.number));
            g.when = Math.max(g.when, e.when ? new Date(e.when).getTime() : 0);
            g.hasPending  = g.hasPending  || isPendingStatus(e.status);
            g.hasApproved = g.hasApproved || isApprovedStatus(e.status);
          }

          const grouped = Array.from(byDraw.values()).map(g => {
            const whenDate = g.when ? new Date(g.when) : null;
            const pagamento = g.hasPending ? "pending" : (g.hasApproved ? "approved" : "pending");
            return {
              draw_id: g.draw_id,
              sorteio: g.draw_id != null ? String(g.draw_id) : "--",
              numeros: Array.from(new Set(g.numeros)).sort((a,b)=>a-b),
              dia: whenDate ? whenDate.toLocaleDateString("pt-BR") : "--/--/----",
              pagamento,
              resultado: drawsMap.get(Number(g.draw_id)) || "aberto",
              whenMs: g.when || 0,
            };
          });

          // >>> ORDEM: última compra primeiro (decrescente por whenMs)
          grouped.sort((a, b) => (b.whenMs || 0) - (a.whenMs || 0));
          setRows(grouped);

          // validade (último approved)
          let lastApprovedAtMs = null;
          const listForValidity = from === "/payments/me"
            ? (Array.isArray(pay) ? pay : (pay.payments || []))
            : deduped;

          for (const p of listForValidity) {
            const st = String((p.status ?? p?.status)?.toString() || "").toLowerCase();
            const ok = st === "approved" || st === "paid" || st === "pago";
            const t = Date.parse(p.paid_at || p.when || p.updated_at || p.created_at || "");
            if (ok && !isNaN(t)) lastApprovedAtMs = Math.max(lastApprovedAtMs ?? 0, t);
          }

          if (lastApprovedAtMs) {
            const exp = new Date(lastApprovedAtMs + COUPON_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
            const yy = String(exp.getFullYear()).slice(-2);
            setValidade(`${pad2(exp.getDate())}/${pad2(exp.getMonth()+1)}/${yy}`);
          } else {
            setValidade("--/--/--");
          }
        }

        await reloadBalances();
      } finally {
        setLoading(false);
      }
    })();

    const onFocus = () => reloadBalances();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [ctxUser, storedMe, reloadBalances]);

  // quando PIX vira approved, atualiza saldo
  React.useEffect(() => {
    const st = String(pixData?.status || "").toLowerCase();
    if (st === "approved" || st === "paid" || st === "pago") {
      reloadBalances();
    }
  }, [pixData?.status, reloadBalances]);

  // carregar config (banner_title e max_numbers_per_selection)
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const j = await getJSON("/config");
        const banner = typeof j?.banner_title === "string" ? j.banner_title : "";
        const maxSel = Number(j?.max_numbers_per_selection ?? j?.max_select ?? 5);
        if (alive) setCfg({
          banner_title: banner,
          max_numbers_per_selection: Number.isFinite(maxSel) && maxSel > 0 ? maxSel : 5,
        });
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  const u = user || {};
  const headingName =
    u.name || u.fullName || u.nome || u.displayName || u.username || u.email || "NOME DO CLIENTE";
  const couponCode = u?.coupon_code || cupom || "CUPOMAQUI";
  const isAdminUser = !!(u?.is_admin || u?.role === "admin" || (u?.email && u.email.toLowerCase() === ADMIN_EMAIL));

  // salvar config
  async function handleSaveConfig() {
    try {
      setCfgLoading(true);
      setCfgSaved(null);
      const payload = {
        banner_title: String(cfg.banner_title || "").slice(0, 240),
        max_numbers_per_selection: Math.max(1, Number(cfg.max_numbers_per_selection || 1)),
      };
      await tryManyPost(
        ["/config", "/admin/config", "/config/update"],
        payload
      );
      setCfgSaved("ok");
    } catch {
      setCfgSaved("err");
    } finally {
      setCfgLoading(false);
      setTimeout(() => setCfgSaved(null), 4000);
    }
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box className="xn-accountPage">
        <Box className="xn-accountPageContent">
          <AppBar position="fixed" elevation={0} className="xn-accountHeader" sx={{ color: "#16325c" }}>
            <Toolbar sx={{ position: "relative", minHeight: { xs: 68, md: 68 }, px: { xs: 1, sm: 2 } }}>
              <IconButton edge="start" onClick={() => navigate(-1)} aria-label="Voltar" sx={{ color: "inherit" }}>
                <ArrowBackIosNewRoundedIcon />
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
              >
                <BrandLogo size={52} />
              </Box>
              <IconButton sx={{ ml: "auto", color: "inherit" }} onClick={(e) => setMenuEl(e.currentTarget)} aria-label="Menu do usuário">
                <AccountCircleRoundedIcon />
              </IconButton>
              <Menu
                anchorEl={menuEl}
                open={Boolean(menuEl)}
                onClose={() => setMenuEl(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
              >
                {isAdminUser && <MenuItem onClick={() => { setMenuEl(null); navigate("/admin"); }}>Painel Admin</MenuItem>}
                {isAdminUser && <Divider />}
                <MenuItem onClick={() => { setMenuEl(null); navigate("/conta"); }}>Área do cliente</MenuItem>
                <Divider />
                <MenuItem onClick={doLogout}>Sair</MenuItem>
              </Menu>
            </Toolbar>
          </AppBar>

          <Container maxWidth={false} disableGutters className="xn-accountContainer">
            <Box sx={{ height: 68 }} />
            <Stack spacing={{ xs: 2, md: 2.5 }}>
              <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
                <Typography className="xn-sectionTitle" sx={{ fontSize: { xs: 20, md: 26 }, lineHeight: 1.15 }}>
                  Conta
                </Typography>
                <Typography className="xn-muted" sx={{ fontWeight: 700 }}>
                  {headingName}
                </Typography>
              </Box>

          {/* Configurações do sorteio (apenas admin) */}
          {isAdminUser && (
            <Paper className="xn-card" variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
              <Stack spacing={2}>
                <Typography variant="h6" className="xn-sectionTitle">Configurações do sorteio</Typography>

                <TextField
                  label="Título do banner (página principal)"
                  value={cfg.banner_title}
                  onChange={(e) => setCfg(s => ({ ...s, banner_title: e.target.value }))}
                  fullWidth
                  inputProps={{ maxLength: 240 }}
                />

                <TextField
                  label="Máx. de números por seleção"
                  type="number"
                  value={cfg.max_numbers_per_selection}
                  onChange={(e) =>
                    setCfg(s => ({ ...s, max_numbers_per_selection: Math.max(1, Number(e.target.value || 1)) }))
                  }
                  inputProps={{ min: 1, step: 1 }}
                  sx={{ maxWidth: 260 }}
                />

                <Stack direction="row" spacing={1.5}>
                  <Button
                    variant="contained"
                    color="success"
                    onClick={handleSaveConfig}
                    disabled={cfgLoading}
                    className="xn-btnPrimary"
                  >
                    {cfgLoading ? "Salvando…" : "Salvar configurações"}
                  </Button>
                </Stack>

                {cfgSaved === "ok" && (
                  <Alert severity="success" variant="outlined">Configurações salvas com sucesso.</Alert>
                )}
                {cfgSaved === "err" && (
                  <Alert severity="error" variant="outlined">Não foi possível salvar. Tente novamente.</Alert>
                )}
              </Stack>
            </Paper>
          )}

              {/* Seção 1 — Cartão / Cupom / Resumo */}
              <Paper className="xn-card xn-heroCard" variant="outlined" sx={{ p: { xs: 2, md: 2.5 } }}>
                <Box className="xn-heroGrid">
                  <Box className="xn-virtualCard">
                    <Box className="xn-virtualCard__top">
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.2, minWidth: 0 }}>
                        <BrandLogo size={52} />
                        <Typography className="xn-virtualCard__name" sx={{ fontSize: { xs: 16, md: 18 }, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          xNaMai
                        </Typography>
                      </Box>
                      <span className="xn-pill">
                        <span className="xn-mono" style={{ opacity: 0.7 }}>Válido até</span>
                        <span style={{ fontWeight: 900 }}>{validade}</span>
                      </span>
                    </Box>

                    <Box sx={{ mt: 2.2 }}>
                      <Typography sx={{ fontWeight: 950, fontSize: { xs: 20, md: 26 }, letterSpacing: -0.6, color: "#16325c" }}>
                        {headingName}
                      </Typography>
                      <Typography className="xn-muted" sx={{ mt: 0.6, fontWeight: 700 }}>
                        Área da conta • Cupom e números cativos
                      </Typography>
                    </Box>
                  </Box>

                  <Box className="xn-statCard">
                    <Stack spacing={1.3}>
                      <Box>
                        <Typography className="xn-statLabel xn-mono">CÓDIGO DE DESCONTO</Typography>
                        <Typography className="xn-code xn-mono">{couponCode}</Typography>
                      </Box>
                      <Divider sx={{ borderColor: "rgba(219,232,255,0.85)" }} />
                      <Box>
                        <Typography className="xn-statLabel xn-mono">VALOR ACUMULADO</Typography>
                        <Typography className="xn-value">
                          {valorAcumulado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </Typography>
                      </Box>
                      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                        <span className="xn-pill">
                          <span style={{ opacity: 0.75 }}>Seus cativos</span>
                          <span style={{ fontWeight: 900 }}>{claims?.mine?.length || 0}</span>
                        </span>
                        <span className="xn-pill">
                          <span style={{ opacity: 0.75 }}>Ocupados</span>
                          <span style={{ fontWeight: 900 }}>{claims?.taken?.length || 0}</span>
                        </span>
                      </Box>
                    </Stack>
                  </Box>
                </Box>
              </Paper>

          {/* ====== Números cativos ====== */}
              <Paper className="xn-card" variant="outlined" sx={{ p: { xs: 2, md: 2.5 } }}>
                <Stack spacing={1.6}>
                  <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
                    <Box>
                      <Typography variant="h6" className="xn-sectionTitle">Números cativos</Typography>
                      <Typography variant="body2" className="xn-muted" sx={{ mt: 0.6, maxWidth: 780 }}>
                Garanta seus números preferidos em todo sorteio novo. Configure um cartão e o sistema compra automaticamente quando o sorteio abre.
              </Typography>
                    </Box>
                    <Button variant="contained" className="xn-btnPrimary" onClick={() => setAutoOpen(true)}>
                      CONFIGURAR NÚMERO CATIVO
                    </Button>
                  </Box>

                  <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap" }}>
                    <Chip size="small" label="Seu cativo" sx={{ bgcolor: "rgba(37,109,255,0.14)", color: "#16325c", border: "1px solid rgba(37,109,255,0.28)", fontWeight: 900 }} />
                    <Chip size="small" label="Ocupado" sx={{ bgcolor: "rgba(11,27,51,0.06)", color: "rgba(22,50,92,0.70)", border: "1px solid rgba(11,27,51,0.10)", fontWeight: 900 }} />
                    <Chip size="small" label="Livre" sx={{ bgcolor: "#fff", color: "rgba(22,50,92,0.72)", border: "1px solid rgba(37,109,255,0.22)", fontWeight: 900 }} />
                  </Stack>

                  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
                    <Typography className="xn-muted" sx={{ fontWeight: 700 }}>
                      Selecionados: <b>{claims?.mine?.length || 0}</b> • Para alterar, use “Configurar número cativo”.
                    </Typography>
                  </Box>

                  {(claims?.mine?.length || 0) + (claims?.taken?.length || 0) === 0 ? (
                    <Box className="xn-emptyState">
                      <Typography sx={{ fontWeight: 900, color: "#16325c" }}>Nenhum dado de números cativos ainda.</Typography>
                      <Typography className="xn-muted" sx={{ mt: 0.4, fontWeight: 700 }}>
                        Clique em “Configurar número cativo” para escolher seus números e ativar a compra automática.
                      </Typography>
                    </Box>
                  ) : (
                    <Box className="xn-numbersGrid" sx={{ mt: 0.5 }}>
                      {Array.from({ length: 100 }, (_, n) => {
                        const isMine = claims.mine.includes(n);
                        const isTaken = claims.taken.includes(n);
                        const cls = isMine ? "xn-numberPill xn-numberPill--mine" : isTaken ? "xn-numberPill xn-numberPill--taken" : "xn-numberPill xn-numberPill--free";
                        return (
                          <Box key={n} className={cls}>
                            {String(n).padStart(2, "0")}
                          </Box>
                        );
                      })}
                    </Box>
                  )}
                </Stack>
              </Paper>

          {/* Tabela */}
              <Paper className="xn-card" variant="outlined" sx={{ p: { xs: 2, md: 2.5 } }}>
                <Stack spacing={1.4}>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 2 }}>
                    <Typography variant="h6" className="xn-sectionTitle">Minhas participações</Typography>
                    <Typography className="xn-muted" sx={{ fontWeight: 700 }}>
                      {rows.length ? `${rows.length} registro(s)` : "—"}
                    </Typography>
                  </Box>

                  {loading ? (
                    <Box sx={{ px: 0.5, py: 0.5 }}><LinearProgress /></Box>
                  ) : (
                    <TableContainer sx={{ width: "100%", overflowX: "auto" }}>
                      <Table size="small" sx={{ minWidth: { xs: 720, sm: 920 } }}>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 900, whiteSpace: "nowrap", color: "rgba(22,50,92,0.72)" }}>SORTEIO</TableCell>
                            <TableCell sx={{ fontWeight: 900, whiteSpace: "nowrap", color: "rgba(22,50,92,0.72)" }}>NÚMERO</TableCell>
                            <TableCell sx={{ fontWeight: 900, whiteSpace: "nowrap", color: "rgba(22,50,92,0.72)" }}>DIA</TableCell>
                            <TableCell sx={{ fontWeight: 900, whiteSpace: "nowrap", color: "rgba(22,50,92,0.72)" }}>PAGAMENTO</TableCell>
                            <TableCell sx={{ fontWeight: 900, whiteSpace: "nowrap", color: "rgba(22,50,92,0.72)" }}>STATUS</TableCell>
                            <TableCell sx={{ fontWeight: 900, whiteSpace: "nowrap", color: "rgba(22,50,92,0.72)" }} align="right">PAGAR</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {rows.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={6}>
                                <Box className="xn-emptyState">
                                  <Typography sx={{ fontWeight: 900, color: "#16325c" }}>Nenhuma participação encontrada.</Typography>
                                  <Typography className="xn-muted" sx={{ mt: 0.4, fontWeight: 700 }}>
                                    Quando você participar de um sorteio, ele aparecerá aqui.
                                  </Typography>
                                </Box>
                              </TableCell>
                            </TableRow>
                          )}
                          {rows.map((row, idx) => {
                      const isPending = /pendente|pending|await|aguard|open|ativo|active/i.test(String(row.pagamento || ""));
                      const clickable = true;

                      const isPaid   = /^(approved|paid|pago)$/i.test(String(row.pagamento || ""));
                      const isClosed = /(closed|fechado|sorteado)/i.test(String(row.resultado || ""));
                      const isOpen   = /(open|aberto)/i.test(String(row.resultado || ""));

                      const handleRowClick = () => {
                        const drawId = Number(row.draw_id ?? row.sorteio);
                        if (isPaid && isClosed && Number.isFinite(drawId)) navigate(`/me/draw/${drawId}`);
                        else if (isOpen) navigate("/");
                      };

                      return (
                        <TableRow
                          key={`${row.sorteio}-${idx}`}
                          hover
                          onClick={clickable ? handleRowClick : undefined}
                          sx={{ cursor: clickable ? "pointer" : "default" }}
                        >
                          <TableCell sx={{ width: 100, fontWeight: 700 }}>{String(row.sorteio || "--")}</TableCell>
                          <TableCell sx={{ minWidth: 160, fontWeight: 700 }}>
                            {Array.isArray(row.numeros) ? row.numeros.map(pad2).join(", ") : (row.numero != null ? pad2(row.numero) : "--")}
                          </TableCell>
                          <TableCell sx={{ width: 140 }}>{row.dia}</TableCell>
                          <TableCell><PayChip status={row.pagamento} /></TableCell>
                          <TableCell><ResultChip result={row.resultado} /></TableCell>
                          <TableCell align="right" sx={{ width: 120 }}>
                            {isPending ? (
                              <Button
                                size="small"
                                variant="contained"
                                className="xn-btnPrimary"
                                onClick={(e) => { e.stopPropagation(); handleGeneratePix(row); }}
                              >
                                Gerar PIX
                              </Button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}

                  <Box className="xn-actionsRow" sx={{ pt: 1 }}>
                    <Button
                      component="a"
                      href="http://newstorerj.com.br/"
                      target="_blank"
                      rel="noopener"
                      variant="outlined"
                      className="xn-btnSoft"
                      sx={{
                        borderColor: "rgba(37,109,255,0.26)",
                        color: "#16325c",
                        bgcolor: "rgba(255,255,255,0.65)",
                        "&:hover": { borderColor: "rgba(37,109,255,0.46)", bgcolor: "rgba(37,109,255,0.06)" },
                      }}
                    >
                      RESGATAR CUPOM
                    </Button>
                    <Button
                      variant="text"
                      onClick={doLogout}
                      className="xn-btnSoft"
                      sx={{ color: "rgba(22,50,92,0.72)", "&:hover": { bgcolor: "rgba(11,27,51,0.04)" } }}
                    >
                      SAIR
                    </Button>
                  </Box>
                </Stack>
              </Paper>
            </Stack>
          </Container>
        </Box>
      </Box>

      {/* Modal de PIX */}
      <PixModal
        open={pixOpen}
        onClose={() => setPixOpen(false)}
        loading={pixLoading}
        data={pixData}
        amount={pixAmount}
        inlineMessage={pixMsg}
        onCopy={copyPix}
        onRefresh={refreshPix}
      />

      {/* Modal: configuração de compra automática */}
      <Dialog
        open={autoOpen}
        onClose={handleCloseAutoModal}
        fullWidth
        maxWidth="lg"
        PaperProps={{ className: "xn-accountModalMuiPaper" }}
        BackdropProps={{ sx: { backgroundColor: "rgba(9, 18, 35, 0.38)" } }}
        sx={{
          "& .MuiDialog-container": { alignItems: { xs: "flex-end", md: "center" } },
        }}
      >
        <DialogContent className="xn-accountModalContent" dividers={false}>
          <Box className="xn-accountModalClose">
            <IconButton onClick={handleCloseAutoModal} aria-label="Fechar" sx={{ bgcolor: "rgba(255,255,255,0.72)", border: "1px solid rgba(219,232,255,0.95)" }}>
              <CloseRoundedIcon />
            </IconButton>
          </Box>
          <Box className="xn-autopayWrap">
            <AutoPaySection />
          </Box>
        </DialogContent>
      </Dialog>
    </ThemeProvider>
  );
}
