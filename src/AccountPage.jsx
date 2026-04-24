// src/AccountPage.jsx
import * as React from "react";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import logoNewStore from "./Logo-branca-sem-fundo-768x132 - Copia.png";
import { SelectionContext } from "./selectionContext";
import { useAuth } from "./authContext";
import {
  AppBar, Box, Button, Chip, Container, CssBaseline, IconButton, Menu, MenuItem,
  Divider, Paper, Stack, ThemeProvider, Toolbar, Typography, createTheme,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, LinearProgress,
  TextField, Alert, Dialog, DialogTitle, DialogContent, DialogActions
} from "@mui/material";
import ArrowBackIosNewRoundedIcon from "@mui/icons-material/ArrowBackIosNewRounded";
import AccountCircleRoundedIcon from "@mui/icons-material/AccountCircleRounded";
import { apiJoin, authHeaders, getJSON } from "./lib/api";

// ▼ PIX
import PixModal from "./PixModal";
import { checkPixStatus } from "./services/pix";
// ▲ PIX
import AutoPaySection from "./AutoPaySection";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#67C23A" },
    secondary: { main: "#FFC107" },
    error: { main: "#D32F2F" },
    background: { default: "#0E0E0E", paper: "#121212" },
    success: { main: "#7CFF6B" },
    warning: { main: "#B58900" },
  },
  shape: { borderRadius: 12 },
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
    return <Chip label="PAGO" sx={{ bgcolor: "success.main", color: "#0E0E0E", fontWeight: 800, borderRadius: 999, px: 1.5 }} />;
  }
  return <Chip label="PENDENTE" sx={{ bgcolor: "warning.main", color: "#000", fontWeight: 800, borderRadius: 999, px: 1.5 }} />;
};

const ResultChip = ({ result }) => {
  const r = String(result || "").toLowerCase();
  if (r.includes("contempla") || r.includes("win")) {
    return <Chip label="CONTEMPLADO" sx={{ bgcolor: "success.main", color: "#0E0E0E", fontWeight: 800, borderRadius: 999, px: 1.5 }} />;
  }
  if (r.includes("não") || r.includes("nao") || r.includes("n_contempla")) {
    return <Chip label="NÃO CONTEMPLADO" sx={{ bgcolor: "error.main", color: "#fff", fontWeight: 800, borderRadius: 999, px: 1.5 }} />;
  }
  if (/(sorteado|closed|fechado)/.test(r)) {
    return <Chip label={r.includes("sorteado") ? "SORTEADO" : "FECHADO"} sx={{ bgcolor: "secondary.main", color: "#000", fontWeight: 800, borderRadius: 999, px: 1.5 }} />;
  }
  return <Chip label="ABERTO" sx={{ bgcolor: "primary.main", color: "#0E0E0E", fontWeight: 800, borderRadius: 999, px: 1.5 }} />;
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
  async function loadClaims() {
    try {
      const j = await getJSON("/autopay/claims");
      setClaims({
        taken: Array.isArray(j?.taken) ? j.taken : [],
        mine: Array.isArray(j?.mine) ? j.mine : [],
      });
    } catch {}
  }
  React.useEffect(() => { loadClaims(); }, []);

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
      <AppBar position="sticky" elevation={0} sx={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <Toolbar sx={{ position: "relative", minHeight: { xs: 56, md: 64 }, px: { xs: 1, sm: 2 } }}>
          <IconButton edge="start" color="inherit" onClick={() => navigate(-1)} aria-label="Voltar">
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
              <Box component="img" src={logoNewStore} alt="NEW STORE" sx={{ height: { xs: 42, sm: 58, md: 62 }, objectFit: "contain" }} />
            </Box>
          <IconButton color="inherit" sx={{ ml: "auto" }} onClick={(e) => setMenuEl(e.currentTarget)}>
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

      <Container maxWidth="lg" sx={{ py: { xs: 2.5, md: 5 } }}>
        <Stack spacing={2.5}>
          <Typography
            sx={{
              fontWeight: 900, letterSpacing: 0.5, textTransform: "uppercase", opacity: 0.9,
              textAlign: { xs: "center", md: "left" }, fontSize: { xs: 18, sm: 20, md: 22 }, lineHeight: 1.2, wordBreak: "break-word",
            }}
          >
            {headingName}
          </Typography>

          {/* Configurações do sorteio (apenas admin) */}
          {isAdminUser && (
            <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
              <Stack spacing={2}>
                <Typography variant="h6" fontWeight={900}>Configurações do sorteio</Typography>

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

          {/* Cartão */}
          <Box sx={{ width: "100%", display: "flex", justifyContent: "center" }}>
            <Paper
              elevation={0}
              sx={{
                width: { xs: "min(86vw, 520px)", md: 700 },
                aspectRatio: { xs: "16/9", md: "21/9" },
                borderRadius: 6, position: "relative", overflow: "hidden",
                p: { xs: 1.6, md: 2.2 },
                bgcolor: "#0C0C0C",
                border: "1px solid rgba(255,255,255,0.08)",
                backgroundImage: `
                  radial-gradient(160% 140% at 10% 10%, rgba(255,255,255,0.08), transparent 60%),
                  radial-gradient(120% 140% at 80% 80%, rgba(255,255,255,0.06), transparent 55%),
                  radial-gradient(100% 100% at 50% 50%, rgba(255,255,255,0.02), transparent 70%)
                `,
                backgroundBlendMode: "screen, lighten",
              }}
            >
              {/* Top-right: código + valor */}
              <Stack
                spacing={0.7}
                sx={{
                  position: "absolute",
                  right: { xs: 26, sm: 32, md: 44 },
                  top:   { xs: 22, sm: 26, md: 34 },
                  alignItems: "flex-end",
                }}
              >
                <Typography sx={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: { xs: 10, md: 12 }, color: "success.main", letterSpacing: 1.2 }}>
                  CÓDIGO DE DESCONTO:
                </Typography>
                <Typography
                  sx={{
                    fontWeight: 900,
                    letterSpacing: { xs: 1.5, md: 2.5 },
                    fontSize: { xs: 22, sm: 26, md: 32 },
                    lineHeight: 1,
                    textShadow: "0 0 0.6px rgba(255,255,255,0.6)",
                  }}
                >
                  {couponCode}
                </Typography>
                <Typography sx={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: { xs: 10, md: 12 }, color: "success.main", letterSpacing: 1.2 }}>
                  VALOR ACUMULADO:
                </Typography>
                <Typography sx={{ fontWeight: 900, color: "success.main", fontSize: { xs: 15, sm: 16, md: 18 }, lineHeight: 1 }}>
                  {valorAcumulado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </Typography>
              </Stack>

              {/* Logo + ondas */}
              <Box
                sx={{
                  position: "absolute",
                  left: { xs: 26, md: 44 },
                  top: "50%",
                  transform: "translateY(-50%)",
                  display: "flex",
                  alignItems: "center",
                  gap: { xs: 1, md: 1.3 },
                }}
              >
                <Box
                  component="img"
                  src={logoNewStore}
                  alt="NS"
                  sx={{
                    height: { xs: 46, sm: 70, md: 76 },
                    objectFit: "contain",
                    filter: "brightness(1.02)",
                  }}
                />
                <Box component="svg" viewBox="0 0 60 30" sx={{ width: { xs: 38, md: 50 }, height: { xs: 20, md: 26 } }}>
                  <path d="M20 5 C28 10, 28 20, 20 25" fill="none" stroke="#7CFF6B" strokeWidth="3" strokeLinecap="round"/>
                  <path d="M34 3 C44 10, 44 20, 34 27" fill="none" stroke="#7CFF6B" strokeWidth="3" strokeLinecap="round" opacity={0.95}/>
                  <path d="M48 1 C60 10, 60 20, 48 29" fill="none" stroke="#7CFF6B" strokeWidth="3" strokeLinecap="round" opacity={0.9}/>
                </Box>
              </Box>

              {/* Nome */}
              <Typography
                sx={{
                  position: "absolute",
                  left:   { xs: 26, md: 44 },
                  right: { xs: 16, md: 28 },
                  bottom: { xs: 46, md: 56 },
                  fontWeight: 900,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  fontSize: { xs: 18, sm: 22, md: 28 },
                  textAlign: "left",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {headingName}
              </Typography>

              {/* Validade */}
              <Stack spacing={0.3} sx={{ position: "absolute", left:   { xs: 36, md: 54 }, bottom: { xs: 12, md: 18 } }}>
                <Typography sx={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: { xs: 10, md: 12 }, letterSpacing: 1.2, opacity: 0.85 }}>
                  VÁLIDO
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Typography sx={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: { xs: 10, md: 12 }, letterSpacing: 1.2, opacity: 0.85 }}>
                    ATÉ
                  </Typography>
                  <Typography sx={{ fontWeight: 800, fontSize: { xs: 12, md: 14 }, letterSpacing: 1 }}>
                    {validade}
                  </Typography>
                </Stack>
              </Stack>
            </Paper>
          </Box>

          {/* ====== Números cativos ====== */}
          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
            <Stack spacing={1.5}>
              <Typography variant="h6" fontWeight={900}>Números cativos</Typography>
              <Typography variant="body2" sx={{ opacity: .8 }}>
                Garanta seus números preferidos em todo sorteio novo. Configure um cartão e o sistema compra automaticamente quando o sorteio abre.
              </Typography>

              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: .5, flexWrap: "wrap" }}>
                <Chip size="small" label="Seu cativo" sx={{ bgcolor:"#10233a", color:"#cbe6ff", border:"1px solid #9bd1ff" }} />
                <Chip size="small" label="Ocupado" sx={{ bgcolor:"#2a1c1c", color:"#ffb3b3", border:"1px solid #ff8a8a" }} />
                <Chip size="small" label="Livre" variant="outlined" />
              </Stack>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "repeat(8, 1fr)",
                    sm: "repeat(12, 1fr)",
                    md: "repeat(20, 1fr)",
                  },
                  gap: .5,
                  mt: 1,
                }}
              >
                {Array.from({ length: 100 }, (_, n) => {
                  const isMine  = claims.mine.includes(n);
                  const isTaken = claims.taken.includes(n);
                  const bg = isMine ? "#10233a" : isTaken ? "#2a1c1c" : "transparent";
                  const bd = isMine ? "1px solid #9bd1ff" : isTaken ? "1px solid #ff8a8a" : "1px solid rgba(255,255,255,.14)";
                  const fg = isMine ? "#cbe6ff" : isTaken ? "#ffb3b3" : "inherit";
                  return (
                    <Box
                      key={n}
                      sx={{
                        userSelect: "none",
                        textAlign: "center",
                        py: .6,
                        borderRadius: 999,
                        fontWeight: 800,
                        letterSpacing: .5,
                        fontSize: 12,
                        border: bd,
                        bgcolor: bg,
                        color: fg,
                      }}
                    >
                      {String(n).padStart(2, "0")}
                    </Box>
                  );
                })}
              </Box>

              <Stack direction={{ xs: "column", sm: "row" }} justifyContent="flex-end" sx={{ mt: 1 }}>
                <Button variant="contained" onClick={() => setAutoOpen(true)}>
                  Configurar número cativo
                </Button>
              </Stack>
            </Stack>
          </Paper>

          {/* Tabela */}
          <Paper variant="outlined" sx={{ p: { xs: 1, md: 2 } }}>
            {loading ? (
              <Box sx={{ px: 2, py: 1 }}><LinearProgress /></Box>
            ) : (
              <TableContainer sx={{ width: "100%", overflowX: "auto" }}>
                <Table size="small" sx={{ minWidth: { xs: 0, sm: 560 } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>SORTEIO</TableCell>
                      <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>NÚMERO</TableCell>
                      <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>DIA</TableCell>
                      <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>PAGAMENTO</TableCell>
                      <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>STATUS</TableCell>
                      <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap" }} align="right">PAGAR</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.length === 0 && (
                      <TableRow><TableCell colSpan={6} sx={{ color: "#bbb" }}>Nenhuma participação encontrada.</TableCell></TableRow>
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

            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="flex-end" alignItems={{ xs: "stretch", sm: "center" }} gap={1.5} sx={{ mt: 2 }}>
              <Button component="a" href="http://newstorerj.com.br/" target="_blank" rel="noopener" variant="contained" color="success" fullWidth sx={{ maxWidth: { sm: 220 } }}>
                Resgatar cupom
              </Button>
              <Button variant="text" onClick={doLogout} fullWidth sx={{ maxWidth: { sm: 120 } }}>
                Sair
              </Button>
            </Stack>
          </Paper>
        </Stack>
      </Container>

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
      <Dialog open={autoOpen} onClose={() => setAutoOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ fontWeight: 900 }}>Compra automática — número cativo</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <AutoPaySection />
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5 }}>
          <Button
            variant="contained"
            onClick={async () => { await loadClaims(); setAutoOpen(false); }}
          >
            Fechar
          </Button>
        </DialogActions>
      </Dialog>
    </ThemeProvider>
  );
}
