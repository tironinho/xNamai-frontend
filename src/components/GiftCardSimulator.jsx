// src/components/GiftCardSimulator.jsx
import * as React from "react";
import {
  Box, Card, CardContent, CardHeader, Divider, Grid, Stack, TextField, Typography,
  Table, TableBody, TableCell, TableHead, TableRow, InputAdornment, Alert, Select, MenuItem,
} from "@mui/material";

/* ===================== Helpers ===================== */
const brl = (v) =>
  (Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

/** 🔧 Sanitização enquanto DIGITA: aceita dígitos e vírgula, converte ponto→vírgula,
 * mantém no máximo 1 vírgula e até 2 casas — e **preserva vírgula final** (ex.: "3059,").
 */
function sanitizeWhileTyping(str) {
  let s = String(str ?? "");

  // 1) converter qualquer ponto em vírgula
  s = s.replace(/\./g, ",");

  // 2) manter só dígitos e vírgula
  s = s.replace(/[^\d,]/g, "");

  // 3) manter apenas a primeira vírgula
  const i = s.indexOf(",");
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/,/g, "");

  // 4) limitar a 2 casas (mas se não houver decimais ainda, manter a vírgula)
  if (i !== -1) {
    const intPart = s.slice(0, i);
    const decPart = s.slice(i + 1, i + 3); // até 2
    return `${intPart},${decPart}`;
  }
  return s;
}

/** 🔧 Força sempre vírgula e 2 casas no blur */
function forceTwoDecimals(str) {
  let s = sanitizeWhileTyping(str);
  if (!s) return "0,00";
  if (!s.includes(",")) return `${s},00`;
  let [i, d = ""] = s.split(",");
  if (d.length === 0) d = "00";
  else if (d.length === 1) d = d + "0";
  else d = d.slice(0, 2);
  return `${i},${d}`;
}

/** 🔧 Converte "####,##" (ou "####," durante digitação) para número JS */
function parseCommaMoney(str) {
  const s = String(str ?? "");
  if (!s) return 0;
  const parts = s.split(",");
  const i = parts[0].replace(/\D/g, "") || "0";
  const d = (parts[1] ?? "").slice(0, 2);
  const num = Number(`${i}.${d || "0"}`);
  return Number.isFinite(num) ? num : 0;
}

/** 🔧 Normaliza defaults: número | "6.799,99" | "6799.99" → "####,##" */
function normalizeDefaultToComma2(v) {
  if (typeof v === "number" && Number.isFinite(v)) {
    return String(v.toFixed(2)).replace(".", ",");
  }
  let s = String(v ?? "").trim();
  if (!s) return "0,00";

  // se já tem vírgula (pt-BR), remove milhares e força 2 casas
  if (s.includes(",")) {
    s = s.replace(/\./g, ""); // remove separadores de milhar
    return forceTwoDecimals(s);
  }

  // se tem ponto como decimal (en-US)
  if (s.includes(".")) {
    const lastDot = s.lastIndexOf(".");
    const intPart = s.slice(0, lastDot).replace(/\./g, "");
    const decPart = s.slice(lastDot + 1);
    return forceTwoDecimals(`${intPart},${decPart}`);
  }

  // só dígitos
  s = s.replace(/\D/g, "");
  return forceTwoDecimals(s);
}

/* ===================== Tabela (informativa) ===================== */
const GIFT_RULES = [
  { min: 50, minPurchase: 1500, max: 250 },
  { min: 251, minPurchase: 3500, max: 600 },
  { min: 601, minPurchase: 5500, max: 800 },
  { min: 801, minPurchase: 7500, max: 1000 },
  { min: 1101, minPurchase: 15000, max: 2100 },
  { min: 2101, minPurchase: 22500, max: 3100 },
  { min: 3101, minPurchase: 30000, max: 4200 },
];
const findRule = (v) => GIFT_RULES.find((r) => v >= r.min && v <= r.max) || null;

/* ===================== Componente ===================== */
export default function GiftCardSimulator({
  creditPriceDefault = "6.799,99",
  pixPriceDefault = "5.779,99",
  giftBalanceMax, // opcional: limite pelo saldo do usuário
}) {
  const [paymentMethod, setPaymentMethod] = React.useState("credit"); // 'credit' | 'pix'

  const [creditInput, setCreditInput] = React.useState(
    normalizeDefaultToComma2(creditPriceDefault)
  );
  const [pixInput, setPixInput] = React.useState(
    normalizeDefaultToComma2(pixPriceDefault)
  );
  const [giftUseInput, setGiftUseInput] = React.useState("0,00");

  // valores numéricos
  const creditPrice = parseCommaMoney(creditInput);
  const pixPrice = parseCommaMoney(pixInput);
  let giftUse = parseCommaMoney(giftUseInput);
  if (Number.isFinite(giftBalanceMax) && giftBalanceMax > 0) {
    giftUse = Math.min(giftUse, giftBalanceMax);
  }

  const price = paymentMethod === "credit" ? creditPrice : pixPrice;

  // ✅ SEMPRE desconta o cupom
  const finalToPay = Math.max(price - giftUse, 0);

  // avisos (informativos)
  const rule = findRule(giftUse);
  const warnNoBand = giftUse > 0 && !rule ? "Informativo: o valor aplicado não se encaixa em nenhuma faixa da tabela." : null;
  const infoRule = giftUse > 0 && rule
    ? `Informativo: ao aplicar ${brl(giftUse)}, a compra recomendada pela tabela é superior a ${brl(rule.minPurchase)}.`
    : null;

  // handlers – **type="text"** e SEM pattern para não bloquear vírgula
  const handlePriceChange = (val) => {
    const s = sanitizeWhileTyping(val);
    if (paymentMethod === "credit") setCreditInput(s);
    else setPixInput(s);
  };
  const handlePriceBlur = () => {
    if (paymentMethod === "credit") setCreditInput((v) => forceTwoDecimals(v));
    else setPixInput((v) => forceTwoDecimals(v));
  };

  return (
    <Card elevation={6} sx={{ borderRadius: 3 }}>
      <CardHeader title="💳 Simulador de Uso do Cartão Presente" sx={{ pb: 0 }} />
      <CardContent>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Table size="small" sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ bgcolor: "success.light", color: "black", fontWeight: 700 }}>
                    Uso do Cartão Presente
                  </TableCell>
                  <TableCell sx={{ bgcolor: "success.light" }} />
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Forma de Pagamento</TableCell>
                  <TableCell>
                    <Select size="small" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} fullWidth>
                      <MenuItem value="credit">Crédito</MenuItem>
                      <MenuItem value="pix">Pix</MenuItem>
                    </Select>
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>
                    {paymentMethod === "credit" ? "Valor do Relógio (Crédito)" : "Valor do Relógio (Pix)"}
                  </TableCell>
                  <TableCell>
                    <TextField
                      type="text"
                      inputMode="numeric"
                      size="small"
                      value={paymentMethod === "credit" ? creditInput : pixInput}
                      onChange={(e) => handlePriceChange(e.target.value)}
                      onBlur={handlePriceBlur}
                      InputProps={{ startAdornment: <InputAdornment position="start">R$</InputAdornment> }}
                      placeholder={paymentMethod === "credit" ? "6.799,99" : "5.779,99"}
                      fullWidth
                    />
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Cartão Presente (aplicar agora)</TableCell>
                  <TableCell>
                    <TextField
                      type="text"
                      inputMode="numeric"
                      size="small"
                      value={giftUseInput}
                      onChange={(e) => setGiftUseInput(sanitizeWhileTyping(e.target.value))}
                      onBlur={() => setGiftUseInput((v) => forceTwoDecimals(v))}
                      InputProps={{ startAdornment: <InputAdornment position="start">R$</InputAdornment> }}
                      placeholder="0,00"
                      fullWidth
                    />
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Valor a Pagar</TableCell>
                  <TableCell>
                    <Box sx={{ fontWeight: 700 }}>{brl(finalToPay)}</Box>
                    {paymentMethod === "credit" && (
                      <Typography variant="caption" sx={{ opacity: 0.8 }}>
                        em até 12x de {brl(finalToPay / 12)} sem juros
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Grid>

          <Grid item xs={12} md={6}>
            <Stack spacing={1.5}>
              {warnNoBand && <Alert severity="warning">{warnNoBand}</Alert>}
              {infoRule && <Alert severity="info">{infoRule}</Alert>}

              <Divider />

              <Card variant="outlined" sx={{ borderRadius: 2 }}>
                <CardHeader title="Tabela para Utilização do Cartão Presente (referência)" />
                <CardContent sx={{ pt: 0 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell><b>Cartão Presente (aplicado agora)</b></TableCell>
                        <TableCell align="right"><b>Compra deve ser &gt; que</b></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {GIFT_RULES.map((r) => (
                        <TableRow key={`${r.min}-${r.max}`} selected={!!rule && r.min === rule.min && r.max === rule.max}>
                          <TableCell>{brl(r.min)} até {brl(r.max)}</TableCell>
                          <TableCell align="right">{brl(r.minPurchase)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Typography variant="caption" sx={{ display: "block", mt: 1.5, opacity: 0.8 }}>
                    *A tabela é apenas referência. O simulador sempre desconta o valor aplicado do cupom.
                  </Typography>
                </CardContent>
              </Card>
            </Stack>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}
