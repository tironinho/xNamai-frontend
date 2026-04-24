// src/AutoPaySection.jsx
import * as React from "react";
import {
  Paper,
  Stack,
  Typography,
  Switch,
  Chip,
  Button,
  TextField,
  Divider,
  Box,
  Tooltip,
  CircularProgress,
} from "@mui/material";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import ClearRoundedIcon from "@mui/icons-material/ClearRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { authHeaders as _authHeaders } from "./lib/api";
import {
  tokenizeCardWithVindi,
  setupAutopayVindi,
  getAutopayVindiStatus,
  getAutopayClaimedNumbers,
} from "./services/autopayVindi";

const IS_DEV = process.env.NODE_ENV !== "production";
const ADMIN_EMAIL = "admin@newstore.com.br";

const apiJoin = (p) => {
  const base =
    process.env.REACT_APP_API_BASE_URL ||
    process.env.REACT_APP_API_BASE ||
    "/api";
  return `${String(base).replace(/\/+$/, "")}${p.startsWith("/") ? p : `/${p}`}`;
};

const defaultAuthHeaders = () => {
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

const authHeaders = _authHeaders || defaultAuthHeaders;

const pad2 = (n) => String(n).padStart(2, "0");
const onlyDigits = (s) => String(s || "").replace(/\D+/g, "");

// Normaliza números vindos do backend (defensivo):
// - aceita number[], string[], rows do Supabase ({n}), objetos comuns ({number},{value},{num}),
//   string CSV ("35,57,98" ou "35 57 98") e wrapper { data: [...] }
// - retorna sempre number[] ordenado, sem duplicados, apenas 0..99
function normalizeNumbers(raw) {
  const out = [];

  const add = (v) => {
    const n = typeof v === "number" ? v : Number.parseInt(String(v).trim(), 10);
    if (Number.isFinite(n) && n >= 0 && n <= 99) out.push(Math.trunc(n));
  };

  if (!raw) return [];

  if (typeof raw === "string") {
    raw
      .split(/[,;\s]+/g)
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach(add);
    return Array.from(new Set(out)).sort((a, b) => a - b);
  }

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "number" || typeof item === "string") {
        add(item);
      } else if (item && typeof item === "object") {
        if ("n" in item) add(item.n);
        else if ("number" in item) add(item.number);
        else if ("value" in item) add(item.value);
        else if ("num" in item) add(item.num);
      }
    }
    return Array.from(new Set(out)).sort((a, b) => a - b);
  }

  if (raw && typeof raw === "object") {
    if (Array.isArray(raw.data)) return normalizeNumbers(raw.data);
  }

  return [];
}

// Gera um requestId único para rastreamento de requisições
const createRequestId = () => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
};

// Funções removidas - substituídas por inline para evitar TDZ
// cleanHolderName e cleanDocNumber agora são inline onde usadas

function parseExpiry(exp) {
  // Aceita MM/AA ou MM/AAAA
  const str = String(exp || "").trim();
  // Remove tudo exceto dígitos
  const d = str.replace(/\D+/g, "");
  if (d.length < 4) return { mm: "", yyyy: "", valid: false };
  
  const mm = d.slice(0, 2);
  let yy = d.slice(2);
  // Se tem 2 dígitos, assume 20AA; se tem 4, usa como está
  let yyyy = yy.length === 2 ? `20${yy}` : yy.slice(0, 4);
  
  // Valida mês (01-12)
  const monthNum = parseInt(mm, 10);
  // Valida: mês entre 1-12, ano tem 4 dígitos, ano >= 2020
  const yearNum = parseInt(yyyy, 10);
  const valid = monthNum >= 1 && monthNum <= 12 && 
                yyyy.length === 4 && 
                yearNum >= 2020 && 
                yearNum <= 2099;
  
  return { mm, yyyy, valid };
}

// Função removida: loadMpSdkOnce (não mais necessária com Vindi)

export default function AutoPaySection() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const redirectingToLoginRef = React.useRef(false);
  const hasHydratedNumbersRef = React.useRef(false);
  const hasHydratedClaimedRef = React.useRef(false);

  const handleSessionExpired = React.useCallback(() => {
    if (redirectingToLoginRef.current) return;
    redirectingToLoginRef.current = true;
    // Não desloga automaticamente - apenas mostra mensagem e sugere login
    alert("Sessão expirada. Faça login novamente para continuar.");
    // Opcional: redirecionar para login (comentado para não deslogar automaticamente)
    // window.location.assign("/login");
  }, []);
  
  // Função auxiliar para formatar mensagem de erro com requestId
  const formatErrorMessage = React.useCallback((err) => {
    const requestId = err?.requestId || null;
    const message = err?.message || "Erro desconhecido";
    
    // Formata mensagem incluindo requestId se disponível
    if (requestId) {
      return `${message} (requestId: ${requestId})`;
    }
    return message;
  }, []);

  const handleVindiFriendlyError = React.useCallback((err) => {
    const code = String(err?.code || "").toLowerCase();
    if (code === "vindi_not_configured" || code === "vindi_error") {
      console.error("[autopay] Erro Vindi:", err);
      alert(
        "No momento não foi possível configurar o pagamento automático. Tente novamente mais tarde ou fale com o suporte."
      );
      return true;
    }
    if (code === "vindi_auth_error") {
      console.error("[autopay] Erro de autenticação Vindi:", err);
      alert(err?.message || "Falha na Vindi: verifique configuração do cartão/ambiente. Contate o suporte.");
      return true;
    }
    if (code === "service_unavailable") {
      console.error("[autopay] Serviço indisponível:", err);
      alert(err?.message || "Serviço temporariamente indisponível. Tente novamente.");
      return true;
    }
    return false;
  }, []);

  const [active, setActive] = React.useState(true);
  const [savedActive, setSavedActive] = React.useState(true);

  const [numbers, setNumbers] = React.useState([]);
  const [savedNumbers, setSavedNumbers] = React.useState([]);

  // claimed global
  const [claimedNumbers, setClaimedNumbers] = React.useState([]);
  const [myNumbersFromServer, setMyNumbersFromServer] = React.useState([]);
  const [claimedLoading, setClaimedLoading] = React.useState(false);
  const [myUserId, setMyUserId] = React.useState(null);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [runLoading, setRunLoading] = React.useState(false);
  const [runMsg, setRunMsg] = React.useState("");

  const [card, setCard] = React.useState({
    brand: null,
    last4: null,
    has_card: false,
  });

  const [holder, setHolder] = React.useState("");
  const [savedHolder, setSavedHolder] = React.useState("");

  // ✅ correção: hook correto
  const [doc, setDoc] = React.useState("");
  const [savedDoc, setSavedDoc] = React.useState("");

  const [cardNumber, setCardNumber] = React.useState("");
  const [expiry, setExpiry] = React.useState("");
  const [cvv, setCvv] = React.useState("");

  const needsAtLeastOne = numbers.length === 0;

  const numbersDirty = React.useMemo(() => {
    if (!Array.isArray(numbers) || !Array.isArray(savedNumbers)) return false;
    if (numbers.length !== savedNumbers.length) return true;
    const a = [...numbers].sort((x, y) => x - y).join(",");
    const b = [...savedNumbers].sort((x, y) => x - y).join(",");
    return a !== b;
  }, [numbers, savedNumbers]);

  const activeDirty = active !== savedActive;
  const holderDirty = (holder || "").trim() !== (savedHolder || "").trim();
  const docDirty = (doc || "") !== (savedDoc || "");
  const cardFieldsDirty = !!(cardNumber || expiry || cvv);

  // anyDirty: considera mudanças em números, active, holder, doc ou cartão
  // Se usuário digitou cartão OU mudou holder OU mudou números/active/doc, habilita botão
  const anyDirty =
    numbersDirty || activeDirty || holderDirty || docDirty || cardFieldsDirty;
  
  // canSave: habilita se não está carregando/salvando, tem pelo menos 1 número e há mudanças
  const canSave = !loading && !saving && !needsAtLeastOne && anyDirty;
  
  // Diagnóstico: qual condição está impedindo o save
  const saveBlockedReason = React.useMemo(() => {
    if (loading) return "Carregando dados...";
    if (saving) return "Salvando...";
    if (needsAtLeastOne) return "Selecione ao menos 1 número";
    if (!anyDirty) return "Nenhuma alteração detectada";
    return null; // Pode salvar
  }, [loading, saving, needsAtLeastOne, anyDirty]);

  const loadStatus = React.useCallback(async () => {
    try {
      setLoading(true);
      const requestId = createRequestId();
      console.log(
        `[autopay] GET status - requestId: ${requestId}, route: /api/autopay/vindi/status`
      );
      const j = await getAutopayVindiStatus({ requestId });
      if (j) {
        const rawNumbers =
          j?.numbers ??
          j?.autopay_numbers ??
          j?.captive_numbers ??
          j?.saved_numbers ??
          null;
        const gotNumbers = normalizeNumbers(rawNumbers);

        // Logs úteis (sem dados sensíveis)
        console.log("[autopay] status payload keys:", Object.keys(j || {}));
        console.log("[autopay] numbers(raw):", rawNumbers);
        console.log("[autopay] numbers(normalized):", gotNumbers);

        // Não sobrescrever active quando o backend não envia o campo
        if (typeof j.active === "boolean") {
          setActive(j.active);
          setSavedActive(j.active);
        }
        if (!hasHydratedNumbersRef.current || gotNumbers.length > 0) {
          setNumbers(gotNumbers);
          setSavedNumbers(gotNumbers);
          hasHydratedNumbersRef.current = true;
        }
        setCard({
          brand: j.card?.brand || j.brand || null,
          last4: j.card?.last4 || j.last4 || null,
          has_card: !!(j.card?.last4 || j.last4 || j.card?.has_card || j.has_card),
        });
        if (j.holder_name || j.card?.holder_name) {
          const h = j.holder_name || j.card?.holder_name || "";
          setHolder(h);
          setSavedHolder(h);
        }
        if (j.doc_number) {
          setDoc(j.doc_number);
          setSavedDoc(j.doc_number);
        }
      }
    } catch (e) {
      const authExpiredCodes = [
        "AUTH_EXPIRED",
        "JWT_EXPIRED",
        "SESSION_EXPIRED",
        "TOKEN_EXPIRED",
        "INVALID_TOKEN",
        "UNAUTHORIZED",
      ];
      const isAuthExpired =
        e?.code && authExpiredCodes.includes(String(e.code).toUpperCase());
      if (isAuthExpired) {
        handleSessionExpired();
        return;
      }
      console.error(
        `[autopay] GET error - status: ${e?.status || "N/A"}, code: ${e?.code || "N/A"}, requestId: ${e?.requestId || "N/A"}, message:`,
        e?.message || e
      );
      if (!hasHydratedNumbersRef.current) {
        setNumbers([]);
        setSavedNumbers([]);
        setCard({ brand: null, last4: null, has_card: false });
        hasHydratedNumbersRef.current = true;
      }
    } finally {
      setLoading(false);
    }
  }, [handleSessionExpired]);

  const loadClaimed = React.useCallback(async () => {
    setClaimedLoading(true);
    try {
      const requestId = createRequestId();
      const res = await getAutopayClaimedNumbers({ requestId });
      const gotClaimedNumbers = normalizeNumbers(res?.claimed_numbers);
      const gotMyNumbers = normalizeNumbers(res?.my_numbers);

      // Hidratação estável (não pisar em claimed já carregado com vazio por falha momentânea)
      if (!hasHydratedClaimedRef.current || gotClaimedNumbers.length > 0) {
        setClaimedNumbers(gotClaimedNumbers);
        setMyNumbersFromServer(gotMyNumbers);
        hasHydratedClaimedRef.current = true;
      }
    } catch (e) {
      const authExpiredCodes = [
        "AUTH_EXPIRED",
        "JWT_EXPIRED",
        "SESSION_EXPIRED",
        "TOKEN_EXPIRED",
        "INVALID_TOKEN",
        "UNAUTHORIZED",
      ];
      const isAuthExpired =
        e?.code && authExpiredCodes.includes(String(e.code).toUpperCase());
      if (isAuthExpired) {
        handleSessionExpired();
        return;
      }
      console.warn(
        `[autopay] claimed load error - status: ${e?.status || "N/A"}, code: ${e?.code || "N/A"}, requestId: ${e?.requestId || "N/A"}, message:`,
        e?.message || e
      );
      if (!hasHydratedClaimedRef.current) {
        setClaimedNumbers([]);
        setMyNumbersFromServer([]);
        hasHydratedClaimedRef.current = true;
      }
    } finally {
      setClaimedLoading(false);
    }
  }, [handleSessionExpired]);

  React.useEffect(() => {
    // Best-effort: pega id do usuário para debug/comparações futuras (não bloqueia UI)
    (async () => {
      try {
        const endpoints = ["/api/me", "/me"];
        for (const ep of endpoints) {
          const r = await fetch(apiJoin(ep), {
            method: "GET",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            credentials: "include",
            cache: "no-store",
          });
          if (!r.ok) continue;
          const j = await r.json().catch(() => ({}));
          const u = j?.user || j;
          const id = u?.id ?? u?.user_id ?? u?.uid ?? null;
          if (id != null) {
            setMyUserId(id);
            setIsAdmin(!!u?.is_admin || String(u?.email || "").toLowerCase() === ADMIN_EMAIL);
            break;
          }
        }
      } catch {}
    })();
  }, []);

  // Logs de debug (sem dados sensíveis)
  React.useEffect(() => {
    if (IS_DEV && myUserId != null) console.log("[autopay] myUserId:", myUserId);
  }, [myUserId]);

  React.useEffect(() => {
    if (IS_DEV && claimedLoading) console.log("[autopay] loading claimed numbers…");
  }, [claimedLoading]);

  React.useEffect(() => {
    if (!IS_DEV) return;
    console.log("[autopay] claimedNumbers size:", claimedNumbers.length);
    console.log("[autopay] selectedNumbers size:", numbers.length);
  }, [claimedNumbers.length, numbers.length]);

  const selectedLabel = React.useMemo(() => {
    const list = Array.from(new Set((numbers || []).filter((n) => Number.isFinite(Number(n)))))
      .map((n) => Math.trunc(Number(n)))
      .filter((n) => n >= 0 && n <= 99)
      .sort((a, b) => a - b);
    return list.length ? list.map(pad2).join(", ") : "—";
  }, [numbers]);

  const runAutopayNow = React.useCallback(async () => {
    setRunLoading(true);
    setRunMsg("");
    const endpoints = [
      "/api/admin/autopay/run",
      "/api/admin/autopay/runner",
      "/api/admin/dashboard/run-autopay",
      "/api/admin/dashboard/autopay/run",
      // fallback (se o backend só disparar runner ao criar sorteio)
      "/api/admin/dashboard/new",
    ];

    try {
      const requestId = createRequestId();
      for (const ep of endpoints) {
        try {
          const r = await fetch(apiJoin(ep), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Request-Id": requestId,
              ...authHeaders(),
            },
            credentials: "include",
            cache: "no-store",
            body: JSON.stringify({}),
          });
          if (!r.ok) continue;
          const j = await r.json().catch(() => ({}));
          const trace =
            j?.runTraceId ||
            j?.run_trace_id ||
            j?.traceId ||
            j?.requestId ||
            j?.request_id ||
            requestId;
          setRunMsg(`OK (trace: ${trace})`);
          try {
            window.dispatchEvent(new CustomEvent("ns:numbers:reload"));
            window.dispatchEvent(new CustomEvent("ns:draw:changed"));
          } catch {}
          return;
        } catch {
          // tenta próximo
        }
      }
      setRunMsg("Falha ao rodar agora (endpoint não encontrado ou sem permissão).");
    } finally {
      setRunLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      // Carrega status + claimed global na inicialização
      await Promise.allSettled([loadStatus(), loadClaimed()]);
      if (!alive) return;
    })();
    return () => {
      alive = false;
    };
  }, [loadStatus, loadClaimed]);

  function toggle(n) {
    const nn = Number(n);
    if (!Number.isFinite(nn)) return;
    const v = Math.trunc(nn);
    if (v < 0 || v > 99) return;
    setNumbers((prev) => {
      const isMine = prev.includes(v) || myNumbersFromServer.includes(v);
      const occupiedByOther = claimedNumbers.includes(v) && !isMine;
      if (occupiedByOther) return prev;
      return isMine ? prev.filter((x) => x !== v) : [...prev, v].slice(0, 20);
    });
  }

  // Tokenização via backend (endpoint /api/autopay/vindi/tokenize)
  async function createVindiGatewayToken() {
    console.debug("[autopay] Tokenize start");
    
    const num = onlyDigits(cardNumber);
    const expiryParsed = parseExpiry(expiry);
    const { mm, yyyy, valid: expiryValid } = expiryParsed;
    const sc = onlyDigits(cvv).slice(0, 4);
    const holderName = (holder || "").trim();
    const docDigits = onlyDigits(doc);

    // Validação: garante formato correto
    if (!num || num.length < 13) {
      throw new Error("Número do cartão inválido.");
    }
    
    // Valida parse e formato de validade
    if (!mm || mm.length !== 2 || !yyyy || yyyy.length !== 4 || !expiryValid) {
      const monthNum = parseInt(mm, 10);
      if (!expiryValid && monthNum >= 1 && monthNum <= 12) {
        throw new Error("Ano de validade inválido. Use MM/AA ou MM/AAAA.");
      }
      throw new Error("Data de validade inválida. Use MM/AA ou MM/AAAA (mês deve ser 01-12).");
    }
    
    if (!sc || sc.length < 3) {
      throw new Error("CVV inválido.");
    }
    if (!holderName) {
      throw new Error("Nome do titular é obrigatório.");
    }
    
    // Validação obrigatória de CPF/CNPJ
    if (!docDigits || (docDigits.length !== 11 && docDigits.length !== 14)) {
      throw new Error("CPF/CNPJ é obrigatório. Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).");
    }

    console.debug("[autopay] Tokenize calling backend", {
      has_card_number: !!num,
      has_expiry: !!mm && !!yyyy,
      has_cvv: !!sc,
      has_holder: !!holderName,
      has_doc: !!docDigits,
    });

    try {
      const requestId = createRequestId();
      console.log(`[autopay] Tokenize - requestId: ${requestId}, route: /api/autopay/vindi/tokenize`);
      const result = await tokenizeCardWithVindi({
        holderName,
        cardNumber: num,
        expMonth: mm,  // Formato MM
        expYear: yyyy, // Formato YYYY
        cvv: sc,       // Apenas dígitos
        documentNumber: docDigits,
        requestId,
      });
      console.debug("[autopay] Tokenize end - success");
      return result;
    } catch (error) {
      console.debug("[autopay] Tokenize end - error:", error?.message || error);
      throw error;
    }
  }

  async function save() {
    // Instrumentação: logs de diagnóstico
    const holderNameFilled = !!(holder || "").trim();
    const docFilled = !!(doc || "");
    const expiryParsed = parseExpiry(expiry);
    const expiryParsedOk = expiryParsed.valid;
    
    console.debug("[autopay] save() called", {
      needsAtLeastOne,
      anyDirty,
      cardFieldsDirty,
      holderNameFilled,
      docFilled,
      expiryParsedOk,
      has_cardNumber: !!(cardNumber || ""),
      has_expiry: !!(expiry || ""),
      has_cvv: !!(cvv || ""),
      numbers_count: numbers.length,
    });

    if (needsAtLeastOne) {
      alert("Selecione pelo menos 1 número para salvar as preferências.");
      return;
    }

    const holderName = (holder || "").trim();
    const hasSavedCard = !!card.has_card;
    const needsTokenize = cardFieldsDirty || (active && !hasSavedCard);
    // Opcional: se já escolheu número e tem cartão (ou vai tokenizar agora), ativa por padrão
    const effectiveActive =
      !active && numbers.length > 0 && (needsTokenize || hasSavedCard)
        ? true
        : active;
    if (!active && effectiveActive) setActive(true);

    // Só exige holder quando realmente precisar tokenizar/ativar sem cartão salvo
    if (needsTokenize && !holderName) {
      alert("Por favor, informe o nome impresso no cartão.");
      return;
    }

    setSaving(true);
    try {
      // Se há atualização de cartão ou precisa ativar sem cartão salvo, tokeniza via backend
      let tokenizeResult = null;
      let paymentProfileId = null;
      let customerId = null;
      let cardLast4 = null;
      let paymentCompanyCode = null;
      let gatewayToken = null; // fallback modo antigo
      if (needsTokenize) {
        console.debug("[autopay] Will call tokenize", {
          has_card_number: !!(cardNumber || ""),
          has_cvv: !!(cvv || ""),
        });
        try {
          tokenizeResult = await createVindiGatewayToken();
          paymentProfileId = tokenizeResult?.payment_profile_id || null;
          customerId = tokenizeResult?.customer_id || null;
          cardLast4 = tokenizeResult?.card_last4 || onlyDigits(cardNumber).slice(-4) || null;
          paymentCompanyCode = tokenizeResult?.payment_company_code || null;
          gatewayToken = tokenizeResult?.gateway_token || null;

          console.debug("[autopay] Tokenize OK", {
            has_payment_profile_id: !!paymentProfileId,
            has_customer_id: !!customerId,
            card_last4: cardLast4,
            payment_company_code: paymentCompanyCode,
            has_gateway_token: !!gatewayToken,
          });

          // Feedback imediato (sem exigir bandeira do usuário)
          if (cardLast4 || paymentCompanyCode) {
            setCard({
              brand: paymentCompanyCode || card.brand || null,
              last4: cardLast4 || card.last4 || null,
              has_card: true,
            });
          }
        } catch (tokenizeError) {
          // CRÍTICO: Só desloga se code for explicitamente AUTH_EXPIRED, JWT_EXPIRED, SESSION_EXPIRED, etc
          // Não desloga por qualquer 401 - apenas se for erro de autenticação do app
          const authExpiredCodes = ['AUTH_EXPIRED', 'JWT_EXPIRED', 'SESSION_EXPIRED', 'TOKEN_EXPIRED', 'INVALID_TOKEN', 'UNAUTHORIZED'];
          const isAuthExpired = tokenizeError?.code && authExpiredCodes.includes(String(tokenizeError.code).toUpperCase());
          if (isAuthExpired) {
            handleSessionExpired();
            return;
          }
          if (handleVindiFriendlyError(tokenizeError)) return;

          // Mensagem formatada com requestId se disponível
          const errorMessage = formatErrorMessage(tokenizeError);
          console.error(`[autopay] Tokenize error - status: ${tokenizeError?.status || 'N/A'}, code: ${tokenizeError?.code || 'N/A'}, requestId: ${tokenizeError?.requestId || 'N/A'}, message:`, tokenizeError?.message || tokenizeError);
          alert(errorMessage);
          return;
        }
      }

      // Sempre chama setupAutopayVindi para persistir preferências
      // Se não houver gatewayToken mas houver mudanças, tenta salvar mesmo assim
      
      // Validação no front antes de chamar backend
      const cleanedHolderName = holderName?.trim() || "";
      const cleanedDocNumber = doc ? String(doc).replace(/\D+/g, "") : "";
      
      if (!cleanedHolderName || cleanedHolderName.length === 0) {
        alert("Nome do titular é obrigatório. Por favor, informe o nome impresso no cartão.");
        setSaving(false);
        return;
      }
      
      if (!cleanedDocNumber || (cleanedDocNumber.length !== 11 && cleanedDocNumber.length !== 14)) {
        alert("CPF/CNPJ é obrigatório. Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).");
        setSaving(false);
        return;
      }
      
      try {
        const requestId = createRequestId();
        const result = await setupAutopayVindi({
          paymentProfileId: paymentProfileId || undefined, // modo novo
          gatewayToken: gatewayToken || undefined, // fallback modo antigo
          holderName: cleanedHolderName,
          docNumber: cleanedDocNumber,
          numbers,
          active: effectiveActive,
          requestId,
        });

        // Atualiza estado do cartão se retornado
        if (result.card) {
          setCard({
            brand: result.card.brand || null,
            last4: result.card.last4 || null,
            has_card: !!(result.card.last4 || result.card.brand),
          });
        }

        // Limpa campos do cartão após tokenizar (só se houve tokenização)
        if (tokenizeResult) {
          setCardNumber("");
          setExpiry("");
          setCvv("");
        }

        // Atualiza estados salvos
        setSavedNumbers([...numbers]);
        setSavedActive(effectiveActive);
        setSavedHolder(holderName);
        setSavedDoc(doc);

        alert("Preferências salvas!");
      } catch (setupError) {
        // CRÍTICO: Só desloga se code for explicitamente AUTH_EXPIRED, JWT_EXPIRED, SESSION_EXPIRED, etc
        // Não desloga por qualquer 401 - apenas se for erro de autenticação do app
        const authExpiredCodes = ['AUTH_EXPIRED', 'JWT_EXPIRED', 'SESSION_EXPIRED', 'TOKEN_EXPIRED', 'INVALID_TOKEN', 'UNAUTHORIZED'];
        const isAuthExpired = setupError?.code && authExpiredCodes.includes(String(setupError.code).toUpperCase());
        if (isAuthExpired) {
          handleSessionExpired();
          return;
        }
        if (handleVindiFriendlyError(setupError)) return;

        // Conflito de números ocupados (409)
        const errCode = String(
          setupError?.code ||
            setupError?.payload?.code ||
            setupError?.payload?.error_code ||
            ""
        ).toUpperCase();
        if (setupError?.status === 409 || errCode === "NUMBERS_ALREADY_TAKEN") {
          const rawTaken =
            setupError?.payload?.taken_numbers ??
            setupError?.payload?.numbers_taken ??
            setupError?.payload?.taken ??
            setupError?.details?.taken_numbers ??
            setupError?.details?.numbers_taken ??
            null;
          const taken = normalizeNumbers(rawTaken);
          if (taken.length > 0) {
            alert(`Alguns números já estão ocupados: ${taken.map(pad2).join(", ")}`);
            const takenSet = new Set(taken);
            setNumbers((prev) => prev.filter((x) => !takenSet.has(x)));
          } else {
            alert("Alguns números já estão ocupados. Atualizando a lista…");
          }
          await loadClaimed();
          return;
        }

        // Se o erro for porque gateway_token é obrigatório
        if (
          setupError?.message === "GATEWAY_TOKEN_REQUIRED" ||
          (setupError?.status === 400 &&
            !paymentProfileId &&
            !gatewayToken &&
            String(setupError?.message || "")
              .toLowerCase()
              .includes("gateway"))
        ) {
          alert(
            "Para ativar o AutoPay pela primeira vez, cadastre o cartão."
          );
          return;
        }
        
        // Detecta erro de autenticação Vindi específico
        const isVindiAuthError = 
          setupError?.code === 'VINDI_AUTH_ERROR' ||
          setupError?.provider_status === 401 ||
          (setupError?.message && String(setupError.message).includes('Chave da API inválida'));
        
        if (isVindiAuthError) {
          const requestId = setupError?.requestId || setupError?.details?.requestId || 'N/A';
          alert(`Falha de autenticação na Vindi (API KEY privada inválida ou ambiente incorreto). Verifique env do backend. (requestId: ${requestId})`);
          console.error(`[autopay] VINDI_AUTH_ERROR - status: ${setupError?.status || 'N/A'}, provider_status: ${setupError?.provider_status || 'N/A'}, requestId: ${requestId}, message:`, setupError?.message || setupError);
          return;
        }
        
        // Mensagem formatada com requestId se disponível (fallback para outros erros)
        const errorMessage = formatErrorMessage(setupError);
        console.error(`[autopay] Setup error - status: ${setupError?.status || 'N/A'}, code: ${setupError?.code || 'N/A'}, provider_status: ${setupError?.provider_status || 'N/A'}, requestId: ${setupError?.requestId || 'N/A'}, message:`, setupError?.message || setupError);
        alert(`Falha ao salvar compra automática: ${errorMessage}`);
        return;
      }

      // Recarrega status + claimed para refletir imediatamente
      await Promise.allSettled([loadStatus(), loadClaimed()]);
    } catch (e) {
      // CRÍTICO: Só desloga se status === 401 do backend (SESSION_EXPIRED)
      // Não desloga por erros Vindi (502/500/400/422 do fluxo Vindi)
      if (e?.code === "SESSION_EXPIRED" || e?.status === 401) {
        handleSessionExpired();
        return;
      }
      if (handleVindiFriendlyError(e)) return;
      console.error(`[autopay] save error - status: ${e?.status || 'N/A'}, code: ${e?.code || 'N/A'}, requestId: ${e?.requestId || 'N/A'}, message:`, e?.message || e);
      // Mensagem formatada com requestId se disponível
      const errorMsg = formatErrorMessage(e);
      alert(errorMsg);
    } finally {
      setSaving(false);
    }
  }

  async function cancelAutopay() {
    if (
      !window.confirm(
        "Tem certeza que deseja cancelar a compra automática? Isso apagará os números cativos e o cartão salvo."
      )
    )
      return;
    setSaving(true);
    try {
      const requestId = createRequestId();
      console.log(`[autopay] Cancel - requestId: ${requestId}, route: /api/autopay/vindi/cancel`);
      // Tenta o endpoint Vindi primeiro, depois fallback para o antigo
      let r = await fetch(apiJoin("/api/autopay/vindi/cancel"), {
        method: "POST",
        headers: { 
          "Content-Type": "application/json", 
          "X-Request-Id": requestId,
          ...authHeaders() 
        },
        credentials: "include",
      });

      // Se não existir, tenta o endpoint antigo
      if (!r.ok && r.status === 404) {
        console.log(`[autopay] Cancel fallback - requestId: ${requestId}, route: /api/me/autopay/cancel`);
        r = await fetch(apiJoin("/api/me/autopay/cancel"), {
          method: "POST",
          headers: { 
            "Content-Type": "application/json", 
            "X-Request-Id": requestId,
            ...authHeaders() 
          },
          credentials: "include",
        });
      }

      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        const errorCode = j?.code || null;
        const errorMsg = j?.error || j?.message || "cancel_failed";
        
        // CRÍTICO: Só desloga se status === 401 do backend (SESSION_EXPIRED)
        // Não desloga por erros Vindi (502/500/400/422 do fluxo Vindi)
        if (r.status === 401) {
          handleSessionExpired();
          return;
        }
        
        // Log útil para debug
        console.error(`[autopay] Cancel error - status: ${r.status}, code: ${errorCode || 'N/A'}, requestId: ${requestId || 'N/A'}, message:`, errorMsg);
        
        throw new Error(errorMsg);
      }

      setActive(false);
      setSavedActive(false);
      setNumbers([]);
      setSavedNumbers([]);
      setCard({ brand: null, last4: null, has_card: false });
      setCardNumber("");
      setExpiry("");
      setCvv("");
      alert("Compra automática cancelada.");
    } catch (e) {
      console.error("[autopay] cancel error:", e?.message || e);
      alert("Não foi possível cancelar agora.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
      <Stack spacing={2}>
        {/* Cabeçalho */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
        >
          <Typography variant="h6" fontWeight={900}>
            Compra automática (cartão)
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" sx={{ opacity: 0.8 }}>
              Ativar
            </Typography>
            <Switch
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
          </Stack>
        </Stack>

        <Typography variant="body2" sx={{ opacity: 0.8, mt: -1 }}>
          {active
            ? 'Autopay ATIVO: números serão cobrados automaticamente em sorteios futuros.'
            : 'Autopay INATIVO: nenhum número será cobrado automaticamente.'}
        </Typography>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: -1 }}>
          <Chip
            size="small"
            label="Provider: Vindi"
            variant="outlined"
            sx={{ width: "fit-content", fontWeight: 800, opacity: 0.9 }}
          />
          <Typography variant="body2" sx={{ opacity: 0.8 }}>
            Números escolhidos: <b>{selectedLabel}</b>
          </Typography>
        </Stack>

        {/* Texto explicativo */}
        <Typography variant="body2" sx={{ opacity: 0.8, mt: -1 }}>
          Cadastre seu cartão e escolha números "cativos". Quando um novo sorteio
          abrir, cobraremos automaticamente e reservaremos seus números
          (cobrança automática).
          <br />
          <span style={{ opacity: 0.75 }}>
            O CVV e a validade são exigidos apenas para salvar/atualizar o
            cartão.
          </span>
        </Typography>

        {/* Cartão salvo */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            p: 1.25,
            border: "1px solid rgba(255,255,255,.08)",
            borderRadius: 2.5,
            bgcolor: "rgba(255,255,255,.03)",
          }}
        >
          <CreditCardIcon sx={{ opacity: 0.9 }} />
          <Typography sx={{ fontWeight: 800 }}>
            {card.has_card
              ? `${card.brand || "Cartão"} •••• ${card.last4}`
              : "Nenhum cartão salvo"}
          </Typography>
        </Box>

        {/* Form do cartão */}
        <Stack spacing={1}>
          <Typography variant="subtitle2" sx={{ opacity: 0.85 }}>
            Atualizar cartão (opcional)
          </Typography>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <TextField
              label="Número do cartão"
              inputMode="numeric"
              value={cardNumber}
              onChange={(e) =>
                setCardNumber(onlyDigits(e.target.value).slice(0, 19))
              }
              fullWidth
            />
            <TextField
              label="Nome impresso no cartão"
              value={holder}
              onChange={(e) => setHolder(e.target.value)}
              fullWidth
            />
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <TextField
              label="CPF/CNPJ do titular"
              value={doc}
              onChange={(e) => setDoc(onlyDigits(e.target.value).slice(0, 18))}
              fullWidth
            />
            <TextField
              label="Validade (MM/AA)"
              placeholder="ex.: 04/27"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              sx={{ maxWidth: 180 }}
            />
            <TextField
              label="CVV"
              inputMode="numeric"
              value={cvv}
              onChange={(e) => setCvv(onlyDigits(e.target.value).slice(0, 4))}
              sx={{ maxWidth: 140 }}
            />
          </Stack>
        </Stack>

        <Divider />

        {/* Números cativos */}
        <Typography variant="subtitle2" sx={{ opacity: 0.85 }}>
          Números cativos (clique para selecionar)
        </Typography>

        {/* Legenda (mínima) */}
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
          <Chip
            size="small"
            label="Seu cativo"
            sx={{
              borderRadius: 999,
              border: "1px solid #9BD1FF",
              bgcolor: "rgba(155,209,255,.15)",
              color: "#D6EBFF",
              fontWeight: 800,
            }}
          />
          <Chip
            size="small"
            label="Ocupado"
            sx={{
              borderRadius: 999,
              border: "1px solid rgba(255,80,80,.9)",
              bgcolor: "rgba(255,80,80,.12)",
              color: "#FFD6D6",
              fontWeight: 800,
            }}
          />
          <Chip
            size="small"
            label="Livre"
            sx={{
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,.14)",
              bgcolor: "rgba(255,255,255,.04)",
              fontWeight: 800,
            }}
          />
        </Stack>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "repeat(6, 1fr)",
              sm: "repeat(10, 1fr)",
              md: "repeat(12, 1fr)",
            },
            gap: 0.6,
          }}
        >
          {Array.from({ length: 100 }, (_, i) => i).map((n) => {
            const on = numbers.includes(n) || myNumbersFromServer.includes(n);
            const isClaimed = claimedNumbers.includes(n);
            const occupiedByOther = isClaimed && !on;
            return (
              <Tooltip
                key={n}
                title={occupiedByOther ? "Ocupado" : on ? "Remover" : "Adicionar"}
                arrow
              >
                <Chip
                  label={pad2(n)}
                  onClick={occupiedByOther ? undefined : () => toggle(n)}
                  clickable={!occupiedByOther}
                  sx={{
                    fontWeight: 800,
                    borderRadius: 999,
                    cursor: occupiedByOther ? "not-allowed" : "pointer",
                    border: occupiedByOther
                      ? "1px solid rgba(255,80,80,.9)"
                      : on
                        ? "1px solid #9BD1FF"
                        : "1px solid rgba(255,255,255,.14)",
                    bgcolor: occupiedByOther
                      ? "rgba(255,80,80,.12)"
                      : on
                        ? "rgba(155,209,255,.15)"
                        : "rgba(255,255,255,.04)",
                    color: occupiedByOther ? "#FFD6D6" : on ? "#D6EBFF" : "inherit",
                    "&:hover": {
                      bgcolor: occupiedByOther
                        ? "rgba(255,80,80,.12)"
                        : on
                          ? "rgba(155,209,255,.25)"
                          : "rgba(255,255,255,.08)",
                    },
                  }}
                />
              </Tooltip>
            );
          })}
        </Box>

        {/* Ações */}
        <Stack
          direction="row"
          spacing={1}
          justifyContent="space-between"
          alignItems="center"
        >
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ opacity: needsAtLeastOne ? 0.95 : 0.6 }}
          >
            <InfoOutlinedIcon fontSize="small" />
            <Typography variant="body2">
              {saveBlockedReason || (
                <>
                  Selecione <b>pelo menos 1 número</b> para salvar.
                </>
              )}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              color="error"
              startIcon={<ClearRoundedIcon />}
              onClick={cancelAutopay}
              disabled={saving || loading}
            >
              Cancelar compra automática
            </Button>

            <Button
              variant="contained"
              startIcon={
                saving ? <CircularProgress size={16} /> : <AutorenewRoundedIcon />
              }
              onClick={save}
              disabled={!canSave}
              title={saveBlockedReason || undefined}
            >
              {saving ? "Salvando…" : "Atualizar/Salvar Autopay"}
            </Button>
          </Stack>
        </Stack>

        {isAdmin && (
          <>
            <Divider />
            <Stack spacing={1}>
              <Typography variant="subtitle2" sx={{ opacity: 0.85 }}>
                Admin (teste)
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Button
                  variant="outlined"
                  onClick={runAutopayNow}
                  disabled={runLoading}
                  sx={{ borderRadius: 999 }}
                >
                  {runLoading ? "Rodando…" : "Rodar Autopay agora"}
                </Button>
                {!!runMsg && (
                  <Typography variant="body2" sx={{ opacity: 0.85 }}>
                    {runMsg}
                  </Typography>
                )}
              </Stack>
            </Stack>
          </>
        )}
      </Stack>
    </Paper>
  );
}

