// src/services/autopayVindi.js
// Serviço para autopay via Vindi (tokenização + setup no backend)
// Tokenização é feita via backend para manter segredos no servidor

import { apiJoin, authHeaders } from "../lib/api";

/**
 * Classe de erro padronizada para erros de API
 * Inclui status, code, requestId, provider_status, details e payload para melhor rastreamento
 */
export class ApiError extends Error {
  constructor(message, { status, code, requestId, provider_status, details, payload } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status || null;
    this.code = code || null;
    this.requestId = requestId || null;
    this.provider_status = provider_status || null;
    this.details = details || null;
    this.payload = payload || null;
  }
}

/**
 * Bandeiras suportadas pela Vindi
 * Códigos exatos esperados pelo backend/Vindi
 */
const SUPPORTED_BRANDS = new Set(['visa', 'mastercard', 'elo', 'american_express', 'diners_club', 'hipercard']);

/**
 * Detecta a bandeira do cartão pelo BIN/IIN
 * Remove tudo que não for dígito antes da detecção
 * @param {string} cardNumber - Número do cartão (pode conter espaços/hífens)
 * @returns {"visa" | "mastercard" | "elo" | "american_express" | "diners_club" | "hipercard" | null} Código exato esperado pelo backend/Vindi ou null
 */
export function detectBrandCode(cardNumber) {
  // Sanitiza: remove tudo que não for dígito
  const digitsOnly = String(cardNumber || "").replace(/\D/g, "");
  if (digitsOnly.length < 6) return null;
  
  const bin = digitsOnly.slice(0, 6);
  const binPrefix4 = digitsOnly.slice(0, 4);
  const binPrefix3 = digitsOnly.slice(0, 3);
  const binPrefix2 = digitsOnly.slice(0, 2);
  const binNum = parseInt(bin, 10);
  const binPrefix4Num = parseInt(binPrefix4, 10);
  const binPrefix3Num = parseInt(binPrefix3, 10);
  const binPrefix2Num = parseInt(binPrefix2, 10);
  
  // IMPORTANTE: Elo deve ser detectado ANTES de Visa para evitar sobreposição
  // Elo: prefixos conhecidos - verificação por ordem de especificidade (6 dígitos primeiro, depois 4, depois 2)
  
  // Prefixos de 6 dígitos exatos para Elo
  const eloBin6 = ['636368', '636369', '627780', '636297', '401178', '431274', '438935',
                    '451416', '457393', '504175', '506768', '509048', '509067', '509151', '509389'];
  if (eloBin6.includes(bin)) {
    return 'elo';
  }
  
  // Prefixos de 4 dígitos para Elo
  const eloPrefix4 = ['6504', '6505', '6506', '6507', '6509', '6516', '6550', '5067', 
                       '4314', '4514', '6363', '6500', '6277', '4389', '5041'];
  if (eloPrefix4.some(prefix => bin.startsWith(prefix))) {
    return 'elo';
  }
  
  // Prefixos de 2 dígitos para Elo (5090-5099)
  if (binPrefix2 === '50' && binPrefix4Num >= 5090 && binPrefix4Num <= 5099) {
    return 'elo';
  }
  
  // Mastercard: 51-55 (prefixo de 2 dígitos) OU 2221-2720 (prefixo de 4 dígitos)
  if ((binPrefix2Num >= 51 && binPrefix2Num <= 55) || 
      (binPrefix4Num >= 2221 && binPrefix4Num <= 2720)) {
    return 'mastercard';
  }
  
  // Visa: começa com 4 (após Elo para evitar sobreposição)
  if (digitsOnly.startsWith('4')) {
    return 'visa';
  }
  
  // Amex: começa com 34 ou 37
  if (binPrefix2 === '34' || binPrefix2 === '37') {
    return 'american_express';
  }
  
  // Hipercard: 606282 (6 dígitos) OU 384100-384199 (range de 4 dígitos)
  if (bin === '606282' || (binPrefix4 === '3841' && binNum >= 384100 && binNum <= 384199)) {
    return 'hipercard';
  }

  // Diners: 300-305 (prefixo de 3 dígitos) OU começa com 36 OU 38 (prefixo de 2 dígitos)
  // IMPORTANTE: Hipercard (3841...) deve ser detectado antes de Diners (38...) para evitar sobreposição.
  if ((binPrefix3Num >= 300 && binPrefix3Num <= 305) ||
      binPrefix2 === '36' || binPrefix2 === '38') {
    return 'diners_club';
  }
  
  return null;
}

/**
 * Tokeniza um cartão via backend (endpoint proxy para Vindi).
 * Modo novo (backend atualizado): retorna payment_profile_id e customer_id.
 * Modo antigo (fallback): pode retornar gateway_token.
 *
 * Formato esperado (novo):
 * { ok, customer_id, payment_profile_id, card_last4, payment_company_code }
 *
 * @param {Object} params - Dados do cartão
 * @param {string} params.holderName - Nome do titular
 * @param {string} params.cardNumber - Número do cartão (apenas dígitos)
 * @param {string} params.expMonth - Mês de expiração (MM)
 * @param {string} params.expYear - Ano de expiração (YYYY)
 * @param {string} params.cvv - CVV
 * @param {string} [params.documentNumber] - CPF/CNPJ do titular (opcional)
 * @param {string} [params.requestId] - Request ID para rastreamento (opcional)
 * @returns {Promise<{ok: boolean, customer_id?: string|number, payment_profile_id?: string|number, card_last4?: string, payment_company_code?: string, gateway_token?: string}>}
 */
export async function tokenizeCardWithVindi({
  holderName,
  cardNumber,
  expMonth,
  expYear,
  cvv,
  documentNumber,
  requestId,
}) {
  // Sanitiza número do cartão: remove tudo que não for dígito
  const num = String(cardNumber || "").replace(/\D/g, "");
  
  // Garante expMonth no formato MM (zero-padded, 2 dígitos)
  const mm = String(expMonth || "").padStart(2, "0");
  
  // Garante expYear no formato YYYY (4 dígitos)
  // Se usuário digitar 2 dígitos, prefixa com 20
  let yyyy = String(expYear || "");
  if (yyyy.length === 2) {
    yyyy = `20${yyyy}`;
  } else if (yyyy.length > 4) {
    // Se tiver mais de 4 dígitos, pega os últimos 4
    yyyy = yyyy.slice(-4);
  }
  
  // CVV apenas dígitos, máximo 4 caracteres
  const sc = String(cvv || "").replace(/\D+/g, "").slice(0, 4);
  // Trim para evitar enviar strings vazias
  const holder = String(holderName || "").trim();
  const doc = String(documentNumber || "").replace(/\D+/g, "");

  if (!num || !mm || mm.length !== 2 || !yyyy || yyyy.length !== 4 || !sc || !holder) {
    throw new Error("Dados do cartão incompletos.");
  }

  // Detecta bandeira - não barra no frontend. Se detectar e for suportada, envia payment_company_code
  const brandCode = detectBrandCode(num);
  
  // Monta payload em snake_case conforme especificado pelo backend
  // Formato: { holder_name, card_number, card_expiration, card_cvv, payment_company_code? }
  const card_expiration = `${mm}/${yyyy}`; // Sempre MM/YYYY (4 dígitos no ano)
  
  const payload = {
    holder_name: holder,
    card_number: num,
    card_expiration,
    card_cvv: sc,
    // Adiciona payment_company_code apenas se detectar bandeira suportada (opcional, não bloqueia)
    ...(brandCode && SUPPORTED_BRANDS.has(brandCode) ? { payment_company_code: brandCode } : {}),
    // Adiciona documento apenas se fornecido (não envia string vazia)
    ...(doc ? { document_number: doc } : {}),
  };

  // Log não sensível para debug (nunca logar PAN completo, CVV ou dados sensíveis)
  const url = apiJoin("/api/autopay/vindi/tokenize");
  
  // Payload mascarado para logs (sem dados sensíveis)
  const maskedPayload = {
    bin: num.slice(0, 6), // Apenas 6 primeiros dígitos (BIN)
    last4: num.slice(-4),
    detectedBrandCode: brandCode || "não detectada",
    payment_company_code: brandCode && SUPPORTED_BRANDS.has(brandCode) ? brandCode : "não enviado",
    card_expiration: `${mm}/${yyyy}`,
    holder_name_length: holder.length,
    has_document: !!doc,
    payload_keys: Object.keys(payload),
  };
  console.log(`[autopay] Tokenize (etapa: tokenizar cartão) - requestId: ${requestId || 'N/A'}, route: ${url}, payload:`, maskedPayload);

  const headers = {
    "Content-Type": "application/json",
    ...authHeaders(), // Garante Authorization: Bearer <token>
    // Adiciona X-Request-Id se fornecido para rastreamento
    ...(requestId ? { "X-Request-Id": requestId } : {}),
  };

  // Confirma que não está chamando Vindi diretamente
  if (url.includes("app.vindi.com.br") || url.includes("vindi.com.br")) {
    throw new Error("Erro de configuração: tentando chamar Vindi diretamente do frontend. Use o backend.");
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    // Tratamento específico para 404 - endpoint não existe
    if (response.status === 404) {
      throw new ApiError("Endpoint de tokenização não encontrado (backend desatualizado).", {
        status: 404,
        code: "TOKENIZE_ENDPOINT_NOT_FOUND",
        requestId,
      });
    }
    
    // Tenta parsear JSON do erro
    let errorBody = null;
    let errorText = null;
    const contentType = response.headers.get("content-type") || "";
    
    try {
      if (contentType.includes("application/json")) {
        errorBody = await response.json();
      } else {
        errorText = await response.text();
      }
    } catch (parseError) {
      // Se falhar ao parsear, usa texto vazio
      errorText = "";
    }
    
    // Extrai informações do erro de forma padronizada
    const body = errorBody || {};
    const extractedRequestId = body.requestId || body.request_id || response.headers.get("x-request-id") || requestId || null;
    const errorCode = body.code || body.error_code || body.name || null;
    const providerStatus = body.provider_status || body.providerStatus || null;
    // Prioriza error_message, depois msg, depois message, depois error, depois errorText
    let errorMessage = body.error_message || body.msg || body.message || body.error || errorText || `HTTP ${response.status}`;
    const errorDetails = body.details || body.data?.details || null;
    
    // Log útil para debug com requestId e provider_status retornado pelo backend
    console.error(`[autopay] Error - route: ${url}, status: ${response.status}, code: ${errorCode || 'N/A'}, provider_status: ${providerStatus || 'N/A'}, requestId: ${extractedRequestId || 'N/A'}, message: ${errorMessage}`);
    
    // CRÍTICO: Só trata como sessão expirada se o backend retornar explicitamente um code de autenticação
    // Não desloga automaticamente por qualquer 401 - apenas se code for AUTH_EXPIRED, JWT_EXPIRED, SESSION_EXPIRED, etc
    if (response.status === 401) {
      const authExpiredCodes = ['AUTH_EXPIRED', 'JWT_EXPIRED', 'SESSION_EXPIRED', 'TOKEN_EXPIRED', 'INVALID_TOKEN', 'UNAUTHORIZED'];
      const isAuthExpired = errorCode && authExpiredCodes.includes(String(errorCode).toUpperCase());
      
      if (isAuthExpired) {
        throw new ApiError("Sessão expirada. Faça login novamente para continuar.", {
          status: 401,
          code: errorCode || "SESSION_EXPIRED",
          requestId: extractedRequestId,
          payload: body,
        });
      }
      // 401 mas não é erro de autenticação do app (ex: erro Vindi)
      // Trata como erro normal, não desloga - continua para propagar erro normalizado abaixo
    }
    
    // Monta mensagem de erro priorizando details se disponível
    if (errorDetails && Array.isArray(errorDetails) && errorDetails.length > 0) {
      const detailsMessages = errorDetails.map((detail) => {
        const parameter = detail.parameter || detail.field || "campo";
        const message = detail.message || detail.error || "";
        return `${parameter}: ${message}`;
      });
      errorMessage = detailsMessages.join("; ");
    }
    
    // Para outros status codes (400/422/500/502/503) ou 401 sem code de auth, propaga erro normalizado
    // NÃO desloga - preserva metadados completos do erro (code, provider_status, details) para uso no componente
    throw new ApiError(errorMessage, {
      status: response.status,
      code: errorCode || null, // Usa code do backend (ex: VINDI_AUTH_ERROR, VINDI_BACKEND_ERROR, etc)
      requestId: extractedRequestId,
      provider_status: providerStatus,
      details: body, // Preserva todos os metadados do erro do backend
      payload: body,
    });
  }

  // Sucesso - extrai requestId retornado pelo backend para logs
  const result = await response.json();
  const backendRequestId = result?.requestId || result?.request_id || response.headers.get("x-request-id") || requestId || null;
  if (backendRequestId) {
    console.log(`[autopay] Tokenize success - route: ${url}, requestId: ${backendRequestId}`);
  }

  // Extrai gateway_token de forma resiliente - aceita múltiplos formatos (fallback modo antigo)
  const gatewayToken =
    result?.gateway_token ||
    result?.payment_profile?.gateway_token ||
    result?.data?.gateway_token ||
    result?.data?.payment_profile?.gateway_token ||
    null;

  // Extrai campos do modo novo
  const ok = typeof result?.ok === "boolean" ? result.ok : true;
  const payment_profile_id =
    result?.payment_profile_id ||
    result?.paymentProfileId ||
    result?.payment_profile?.id ||
    result?.data?.payment_profile_id ||
    result?.data?.paymentProfileId ||
    result?.data?.payment_profile?.id ||
    null;
  const customer_id =
    result?.customer_id ||
    result?.customerId ||
    result?.customer?.id ||
    result?.data?.customer_id ||
    result?.data?.customerId ||
    result?.data?.customer?.id ||
    null;
  const card_last4 =
    (result?.card_last4 ||
      result?.cardLast4 ||
      result?.card?.last4 ||
      result?.data?.card_last4 ||
      result?.data?.cardLast4 ||
      result?.data?.card?.last4 ||
      null) ??
    null;
  const payment_company_code =
    result?.payment_company_code ||
    result?.paymentCompanyCode ||
    result?.card?.payment_company_code ||
    result?.data?.payment_company_code ||
    result?.data?.paymentCompanyCode ||
    brandCode ||
    null;

  // Se backend antigo: não vem payment_profile_id, mas vem gateway_token
  // Se backend novo: deve vir payment_profile_id (e opcionalmente gateway_token)
  if (!payment_profile_id && !gatewayToken) {
    console.error("[autopay] Resposta do backend não contém payment_profile_id nem gateway_token:", {
      ok,
      has_payment_profile_id: !!result?.payment_profile_id,
      has_gateway_token: !!result?.gateway_token,
      has_payment_profile: !!result?.payment_profile,
      has_data: !!result?.data,
      response_keys: Object.keys(result || {}),
    });
    const err = new Error(
      "Resposta do backend inválida: não contém payment_profile_id (modo novo) nem gateway_token (modo antigo)."
    );
    err.code = "TOKENIZE_INVALID_RESPONSE";
    throw err;
  }

  // Log não sensível de sucesso
  console.log("[autopay] Tokenização bem-sucedida:", {
    ok,
    brandCode: brandCode || "não detectada",
    payment_profile_id: payment_profile_id ? "[present]" : null,
    customer_id: customer_id ? "[present]" : null,
    card_last4: card_last4 || num.slice(-4),
    payment_company_code: payment_company_code || null,
    has_gateway_token: !!gatewayToken,
  });

  return {
    ok,
    customer_id: customer_id || undefined,
    payment_profile_id: payment_profile_id || undefined,
    card_last4: (card_last4 || num.slice(-4) || undefined),
    payment_company_code: payment_company_code || undefined,
    ...(gatewayToken ? { gateway_token: gatewayToken } : {}),
  };
}

/**
 * Configura o autopay no backend usando payment_profile_id (modo novo) ou gateway_token (fallback).
 * Separa dados internos do autopay (holderName/docNumber/números/active) de dados da Vindi (gatewayToken/paymentProfileId).
 * @param {Object} params
 * @param {string|number} [params.paymentProfileId] - payment_profile_id (modo novo)
 * @param {string|number} [params.payment_profile_id] - payment_profile_id (modo novo, snake_case)
 * @param {string} [params.gatewayToken] - Token retornado pela Vindi (modo antigo / fallback)
 * @param {string} [params.holderName] - Nome do titular (metadata interna, não enviado para Vindi)
 * @param {string} [params.docNumber] - CPF/CNPJ do titular (metadata interna, não enviado para Vindi)
 * @param {number[]} params.numbers - Array de números cativos (config do autopay)
 * @param {boolean} params.active - Status ativo/inativo do autopay (config do autopay)
 * @param {string} [params.requestId] - Request ID para rastreamento (opcional)
 * @returns {Promise<Object>} Resposta do backend (pode incluir card.last4, card.brand, etc.)
 */
export async function setupAutopayVindi({
  paymentProfileId,
  payment_profile_id,
  gatewayToken,
  holderName,
  docNumber,
  numbers,
  active,
  requestId,
}) {
  // Constrói o body conforme esperado pelo backend
  const body = {};
  
  // Config do autopay (dados internos para o backend/DB)
  if (typeof active === "boolean") {
    body.active = active;
  }
  
  if (Array.isArray(numbers)) {
    body.numbers = numbers.map((n) => Number(n)).filter(Number.isFinite);
  }

  // holder_name e doc_number são obrigatórios (dados do perfil para o backend/DB)
  if (holderName) {
    body.holder_name = String(holderName || "").trim();
  }
  if (docNumber) {
    body.doc_number = String(docNumber).replace(/\D+/g, "");
  }

  // Dados da Vindi (quando houver alteração de cartão)
  const ppId = payment_profile_id ?? paymentProfileId;
  if (ppId) {
    body.payment_profile_id = ppId;
  } else if (gatewayToken) {
    body.gateway_token = String(gatewayToken);
  }

  const url = apiJoin("/api/autopay/vindi/setup");
  
  // Função auxiliar para mascarar doc_number nos logs (ex.: 830******91)
  const maskDocNumber = (doc) => {
    if (!doc || doc.length < 4) return doc;
    const digits = String(doc).replace(/\D+/g, "");
    if (digits.length === 11) {
      // CPF: 830******91
      return `${digits.slice(0, 3)}${'*'.repeat(5)}${digits.slice(-2)}`;
    } else if (digits.length === 14) {
      // CNPJ: 12******0001
      return `${digits.slice(0, 2)}${'*'.repeat(6)}${digits.slice(-4)}`;
    }
    return `${digits.slice(0, 2)}${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-2)}`;
  };
  
  // Log com requestId, etapa e payload mascarado (doc_number mascarado)
  const maskedPayload = {
    active: body.active,
    numbers_count: body.numbers?.length || 0,
    holder_name: body.holder_name ? `${body.holder_name.slice(0, 3)}...` : undefined,
    doc_number: body.doc_number ? maskDocNumber(body.doc_number) : undefined,
    has_payment_profile_id: !!body.payment_profile_id,
    has_gateway_token: !!body.gateway_token,
  };
  console.log(`[autopay] Setup (etapa: config autopay) - requestId: ${requestId || 'N/A'}, route: ${url}, payload:`, maskedPayload);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      // Adiciona X-Request-Id se fornecido para rastreamento
      ...(requestId ? { "X-Request-Id": requestId } : {}),
    },
    credentials: "include",
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    // Tenta parsear JSON do erro
    let errorBody = null;
    let errorText = null;
    const contentType = response.headers.get("content-type") || "";
    
    try {
      if (contentType.includes("application/json")) {
        errorBody = await response.json();
      } else {
        errorText = await response.text();
      }
    } catch (parseError) {
      errorText = "";
    }
    
    // Extrai informações do erro de forma padronizada
    const body = errorBody || {};
    const extractedRequestId = body.requestId || body.request_id || response.headers.get("x-request-id") || requestId || null;
    const errorCode = body.code || body.error_code || body.name || null;
    const providerStatus = body.provider_status || body.providerStatus || null;
    // Prioriza error_message, depois msg, depois message, depois error, depois errorText
    let errorMessage = body.error_message || body.msg || body.message || body.error || errorText || "Falha ao configurar autopay";
    const errorDetails = body.details || body.data?.details || null;
    
    // Log útil para debug com requestId e provider_status retornado pelo backend
    console.error(`[autopay] Error - route: ${url}, status: ${response.status}, code: ${errorCode || 'N/A'}, provider_status: ${providerStatus || 'N/A'}, requestId: ${extractedRequestId || 'N/A'}, message: ${errorMessage}`);
    
    // Verifica se o erro indica que gateway_token é obrigatório
    const errorStr = String(errorMessage || "").toLowerCase();
    if (
      response.status === 400 &&
      (!ppId && (!gatewayToken || gatewayToken === null)) &&
      (errorStr.includes("gateway_token") ||
        errorStr.includes("gateway token") ||
        errorStr.includes("obrigatório") ||
        errorStr.includes("required"))
    ) {
      errorMessage = "GATEWAY_TOKEN_REQUIRED";
    }
    
    // Monta mensagem de erro priorizando details se disponível
    if (errorDetails && Array.isArray(errorDetails) && errorDetails.length > 0) {
      const detailsMessages = errorDetails.map((detail) => {
        const parameter = detail.parameter || detail.field || "campo";
        const message = detail.message || detail.error || "";
        return `${parameter}: ${message}`;
      });
      errorMessage = detailsMessages.join("; ");
    }
    
    // CRÍTICO: Só trata como sessão expirada se o backend retornar explicitamente um code de autenticação
    // Não desloga automaticamente por qualquer 401 - apenas se code for AUTH_EXPIRED, JWT_EXPIRED, SESSION_EXPIRED, etc
    if (response.status === 401) {
      const authExpiredCodes = ['AUTH_EXPIRED', 'JWT_EXPIRED', 'SESSION_EXPIRED', 'TOKEN_EXPIRED', 'INVALID_TOKEN', 'UNAUTHORIZED'];
      const isAuthExpired = errorCode && authExpiredCodes.includes(String(errorCode).toUpperCase());
      
      if (isAuthExpired) {
        throw new ApiError("Sessão expirada. Faça login novamente para continuar.", {
          status: 401,
          code: errorCode || "SESSION_EXPIRED",
          requestId: extractedRequestId,
          provider_status: providerStatus,
          details: body,
          payload: body,
        });
      }
      // 401 mas não é erro de autenticação do app (ex: erro Vindi)
      // Trata como erro normal, não desloga - continua para propagar erro normalizado abaixo
    }
    
    // Para outros status codes ou 401 sem code de auth, propaga erro normalizado (NÃO desloga)
    // Preserva metadados completos do erro (code, provider_status, details) para uso no componente
    throw new ApiError(errorMessage, {
      status: response.status,
      code: errorCode || null, // Usa code do backend (ex: VINDI_AUTH_ERROR, VINDI_BACKEND_ERROR, etc)
      requestId: extractedRequestId,
      provider_status: providerStatus,
      details: body, // Preserva todos os metadados do erro do backend
      payload: body,
    });
  }

  // Sucesso - extrai requestId retornado pelo backend para logs
  const result = await response.json();
  const backendRequestId = result?.requestId || result?.request_id || response.headers.get("x-request-id") || requestId || null;
  if (backendRequestId && backendRequestId !== requestId) {
    console.log(`[autopay] Setup success - route: ${url}, requestId: ${backendRequestId}`);
  }
  return result;
}

/**
 * Alias sem quebrar imports antigos/novos
 * (Alguns lugares podem referenciar "tokenizeVindiCard" ao invés de tokenizeCardWithVindi)
 */
export async function tokenizeVindiCard(params) {
  return tokenizeCardWithVindi(params);
}

/**
 * Busca o status do autopay via backend
 * @param {Object} [params] - Parâmetros opcionais
 * @param {string} [params.requestId] - Request ID para rastreamento (opcional)
 * @returns {Promise<Object>} Status do autopay (active, card.last4, card.brand, etc.)
 */
export async function getAutopayVindiStatus({ requestId } = {}) {
  // Evita cache/304: sempre força URL única + headers no-cache + fetch no-store
  let url = apiJoin(`/api/autopay/vindi/status?ts=${Date.now()}`);
  if (requestId) {
    console.log(`[autopay] GET status - requestId: ${requestId}, route: ${url}`);
  }
  const makeRequest = async (targetUrl) =>
    fetch(targetUrl, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      ...authHeaders(),
      // Adiciona X-Request-Id se fornecido para rastreamento
      ...(requestId ? { "X-Request-Id": requestId } : {}),
    },
    credentials: "include",
    cache: "no-store",
  });

  let response = await makeRequest(url);
  // Se por algum motivo vier 304, tenta novamente com novo ts
  if (response.status === 304) {
    const retryUrl = apiJoin(`/api/autopay/vindi/status?ts=${Date.now()}&retry=1`);
    console.warn(`[autopay] GET status 304 - retrying with ts. route: ${retryUrl}`);
    url = retryUrl;
    response = await makeRequest(url);
  }

  if (!response.ok) {
    // Se 404, pode ser que o autopay não esteja configurado ainda
    if (response.status === 404) {
      return { active: false, has_card: false };
    }
    
    // Tenta parsear JSON do erro
    let errorBody = null;
    let errorText = null;
    const contentType = response.headers.get("content-type") || "";
    
    try {
      if (contentType.includes("application/json")) {
        errorBody = await response.json();
      } else {
        errorText = await response.text();
      }
    } catch (parseError) {
      errorText = "";
    }
    
    // Extrai informações do erro de forma padronizada
    const body = errorBody || {};
    const extractedRequestId = body.requestId || body.request_id || response.headers.get("x-request-id") || requestId || null;
    const errorCode = body.code || body.error_code || body.name || null;
    const providerStatus = body.provider_status || body.providerStatus || null;
    // Prioriza error_message, depois msg, depois message, depois error, depois errorText
    const errorMessage = body.error_message || body.msg || body.message || body.error || errorText || "Falha ao buscar status do autopay";
    const errorDetails = body.details || body.data?.details || null;
    
    // Log útil para debug com requestId e provider_status retornado pelo backend
    console.error(`[autopay] Error - route: ${url}, status: ${response.status}, code: ${errorCode || 'N/A'}, provider_status: ${providerStatus || 'N/A'}, requestId: ${extractedRequestId || 'N/A'}, message: ${errorMessage}`);
    
    // CRÍTICO: Só trata como sessão expirada se o backend retornar explicitamente um code de autenticação
    // Não desloga automaticamente por qualquer 401 - apenas se code for AUTH_EXPIRED, JWT_EXPIRED, SESSION_EXPIRED, etc
    if (response.status === 401) {
      const authExpiredCodes = ['AUTH_EXPIRED', 'JWT_EXPIRED', 'SESSION_EXPIRED', 'TOKEN_EXPIRED', 'INVALID_TOKEN', 'UNAUTHORIZED'];
      const isAuthExpired = errorCode && authExpiredCodes.includes(String(errorCode).toUpperCase());
      
      if (isAuthExpired) {
        throw new ApiError("Sessão expirada. Faça login novamente para continuar.", {
          status: 401,
          code: errorCode || "SESSION_EXPIRED",
          requestId: extractedRequestId,
          provider_status: providerStatus,
          details: body,
          payload: body,
        });
      }
      // 401 mas não é erro de autenticação do app (ex: erro Vindi)
      // Trata como erro normal, não desloga - continua para propagar erro normalizado abaixo
    }
    
    // Monta mensagem de erro priorizando details se disponível
    let finalErrorMessage = errorMessage;
    if (errorDetails && Array.isArray(errorDetails) && errorDetails.length > 0) {
      const detailsMessages = errorDetails.map((detail) => {
        const parameter = detail.parameter || detail.field || "campo";
        const message = detail.message || detail.error || "";
        return `${parameter}: ${message}`;
      });
      finalErrorMessage = detailsMessages.join("; ");
    }
    
    // Para outros status codes ou 401 sem code de auth, propaga erro normalizado (NÃO desloga)
    // Preserva metadados completos do erro (code, provider_status, details) para uso no componente
    throw new ApiError(finalErrorMessage, {
      status: response.status,
      code: errorCode || null, // Usa code do backend (ex: VINDI_AUTH_ERROR, VINDI_BACKEND_ERROR, etc)
      requestId: extractedRequestId,
      provider_status: providerStatus,
      details: body, // Preserva todos os metadados do erro do backend
      payload: body,
    });
  }

  // Sucesso - extrai requestId retornado pelo backend para logs
  const result = await response.json();
  const backendRequestId = result?.requestId || result?.request_id || response.headers.get("x-request-id") || requestId || null;
  if (backendRequestId) {
    console.log(`[autopay] GET status success - route: ${url}, requestId: ${backendRequestId}`);
  }
  return result;
}

/**
 * Busca números cativos (claimed) globalmente (todos os usuários)
 * Endpoint principal (novo): GET /api/autopay/vindi/claimed
 * Fallback (compat): GET /api/autopay/vindi/claimed-numbers
 *
 * Retorno normalizado:
 * {
 *   claimed_numbers: number[],
 *   my_numbers: number[]
 * }
 */
export async function getAutopayClaimedNumbers({ requestId } = {}) {
  // Evita cache/304: sempre força URL única + headers no-cache + fetch no-store
  let url = apiJoin(`/api/autopay/vindi/claimed?ts=${Date.now()}`);
  if (requestId) {
    console.log(`[autopay] GET claimed - requestId: ${requestId}, route: ${url}`);
  }

  const makeRequest = async (targetUrl) =>
    fetch(targetUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        ...authHeaders(),
        ...(requestId ? { "X-Request-Id": requestId } : {}),
      },
      credentials: "include",
      cache: "no-store",
    });

  let response = await makeRequest(url);
  if (response.status === 304) {
    const retryUrl = apiJoin(`/api/autopay/vindi/claimed?ts=${Date.now()}&retry=1`);
    console.warn(`[autopay] GET claimed 304 - retrying with ts. route: ${retryUrl}`);
    url = retryUrl;
    response = await makeRequest(url);
  }

  if (!response.ok) {
    // Se 404, pode ser que o backend ainda não tenha o endpoint; retorna vazio sem quebrar a UI
    if (response.status === 404) {
      // fallback para endpoint antigo
      const fallbackUrl = apiJoin(`/api/autopay/vindi/claimed-numbers?ts=${Date.now()}&fallback=1`);
      const fallbackResp = await makeRequest(fallbackUrl);
      if (fallbackResp.ok) {
        const fj = await fallbackResp.json().catch(() => ({}));
        const payload = fj ?? {};
        const list =
          Array.isArray(payload)
            ? payload
            : Array.isArray(payload.claimed)
              ? payload.claimed
              : Array.isArray(payload.numbers)
                ? payload.numbers
                : Array.isArray(payload.items)
                  ? payload.items
                  : [];

        const claimed = [];
        for (const row of list || []) {
          if (!row) continue;
          const n = Number.parseInt(
            String(row.n ?? row.number ?? row.num ?? row.value ?? "").trim(),
            10
          );
          if (!Number.isFinite(n) || n < 0 || n > 99) continue;
          claimed.push(Math.trunc(n));
        }
        const claimed_numbers = Array.from(new Set(claimed)).sort((a, b) => a - b);
        return { claimed_numbers, my_numbers: [] };
      }
      return { claimed_numbers: [], my_numbers: [] };
    }

    let errorBody = null;
    let errorText = null;
    const contentType = response.headers.get("content-type") || "";

    try {
      if (contentType.includes("application/json")) {
        errorBody = await response.json();
      } else {
        errorText = await response.text();
      }
    } catch {
      errorText = "";
    }

    const body = errorBody || {};
    const extractedRequestId =
      body.requestId ||
      body.request_id ||
      response.headers.get("x-request-id") ||
      requestId ||
      null;
    const errorCode = body.code || body.error_code || body.name || null;
    const providerStatus = body.provider_status || body.providerStatus || null;
    const errorMessage =
      body.error_message ||
      body.msg ||
      body.message ||
      body.error ||
      errorText ||
      "Falha ao buscar números ocupados";

    console.error(
      `[autopay] GET claimed error - route: ${url}, status: ${response.status}, code: ${errorCode || "N/A"}, provider_status: ${providerStatus || "N/A"}, requestId: ${extractedRequestId || "N/A"}, message: ${errorMessage}`
    );

    if (response.status === 401) {
      const authExpiredCodes = [
        "AUTH_EXPIRED",
        "JWT_EXPIRED",
        "SESSION_EXPIRED",
        "TOKEN_EXPIRED",
        "INVALID_TOKEN",
        "UNAUTHORIZED",
      ];
      const isAuthExpired =
        errorCode && authExpiredCodes.includes(String(errorCode).toUpperCase());
      if (isAuthExpired) {
        throw new ApiError("Sessão expirada. Faça login novamente para continuar.", {
          status: 401,
          code: errorCode || "SESSION_EXPIRED",
          requestId: extractedRequestId,
          provider_status: providerStatus,
          details: body,
          payload: body,
        });
      }
    }

    throw new ApiError(errorMessage, {
      status: response.status,
      code: errorCode || null,
      requestId: extractedRequestId,
      provider_status: providerStatus,
      details: body,
      payload: body,
    });
  }

  const j = await response.json().catch(() => ({}));
  const claimed_numbers = Array.isArray(j?.claimed_numbers) ? j.claimed_numbers : [];
  const my_numbers = Array.isArray(j?.my_numbers) ? j.my_numbers : [];
  return { claimed_numbers, my_numbers };
}

