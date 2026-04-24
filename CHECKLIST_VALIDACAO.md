# Checklist de Validação Manual - Tokenização Vindi

## Validação no Chrome DevTools (Network Tab)

### 1. Verificar formato de `card_expiration`
- [ ] Abrir DevTools → Network → Filtrar por `/api/autopay/vindi/tokenize`
- [ ] Preencher formulário com cartão válido
- [ ] Clicar em "Salvar" ou equivalente
- [ ] Verificar Request Payload:
  - [ ] `card_expiration` deve estar no formato `"MM/YYYY"` (ex: `"05/2033"`)
  - [ ] **NUNCA** deve aparecer `"05/33"` (ano com 2 dígitos)
  - [ ] Mês sempre com zero-padding (ex: `"05"`, não `"5"`)

### 2. Verificar `payment_company_code` para Elo
- [ ] Usar cartão de teste Elo com BIN `6504...` (ex: `6504000000000000`)
- [ ] Verificar Request Payload:
  - [ ] `payment_company_code` deve estar presente
  - [ ] Valor deve ser exatamente `"elo"` (não `"amex"`, `"diners"`, etc.)
  - [ ] Campo não deve estar presente se bandeira não for detectada

### 3. Verificar `payment_company_code` para outras bandeiras
- [ ] **Visa** (BIN `4...`):
  - [ ] `payment_company_code` deve ser `"visa"` ou não estar presente (Vindi detecta automaticamente)
- [ ] **Mastercard** (BIN `51-55` ou `2221-2720`):
  - [ ] `payment_company_code` deve ser `"mastercard"` ou não estar presente
- [ ] **Amex** (BIN `34...` ou `37...`):
  - [ ] `payment_company_code` deve ser `"american_express"` (não `"amex"`)
- [ ] **Diners** (BIN `300-305`, `36...`, `38...`):
  - [ ] `payment_company_code` deve ser `"diners_club"` (não `"diners"`)
- [ ] **Hipercard** (BIN `606282`, `3841...`):
  - [ ] `payment_company_code` deve ser `"hipercard"`

### 4. Verificar campos não vazios
- [ ] `holderName` não deve ser string vazia (deve ter `trim()` aplicado)
- [ ] `documentNumber` só deve estar presente se fornecido (não enviar se vazio)
- [ ] Todos os campos obrigatórios devem estar presentes:
  - [ ] `holderName`
  - [ ] `cardNumber`
  - [ ] `expMonth`
  - [ ] `expYear`
  - [ ] `card_expiration`
  - [ ] `cvv`
  - [ ] `payment_method_code: "credit_card"`

### 5. Verificar tratamento de erro
- [ ] Testar com cartão de BIN desconhecido (ex: `1234567890123456`)
- [ ] Verificar que o frontend **NÃO bloqueia** o envio
- [ ] Se backend retornar 422 com erro de `payment_company_id`/`payment_company_code`:
  - [ ] Mensagem exibida: "Não foi possível validar a bandeira do cartão. Verifique o número e tente novamente."
- [ ] Se backend retornar outro erro:
  - [ ] Mensagem do backend deve ser exibida fielmente

### 6. Verificar logs de debug (opcional)
- [ ] Abrir Console do DevTools
- [ ] Em modo desenvolvimento, verificar logs:
  - [ ] BIN (6 primeiros dígitos) é logado
  - [ ] `detectedBrandCode` é logado
  - [ ] **NUNCA** o PAN completo é logado

## Testes Unitários

Execute os testes com:
```bash
npm test
```

Ou se usar vitest:
```bash
npx vitest src/services/autopayVindi.test.js
```

### Casos de teste cobertos:
- [ ] Visa: BIN começando com `4`
- [ ] Mastercard: BIN `51-55` e range `2221-2720`
- [ ] Amex: BIN `34` e `37`
- [ ] Diners: BIN `300-305`, `36`, `38`
- [ ] Elo: BIN `6504`, `636368`, `636369`, `6516`, `6550`, range `5090-5099`
- [ ] Hipercard: BIN `606282`, range `384100-384199`
- [ ] Casos de borda: número muito curto, não reconhecido, normalização de espaços/hífens

## Validação de Códigos Exatos

Garantir que o payload **NUNCA** contenha:
- ❌ `"amex"` → deve ser `"american_express"`
- ❌ `"diners"` → deve ser `"diners_club"`
- ❌ `card_expiration: "MM/YY"` → deve ser `"MM/YYYY"`

## Exemplo de Payload Esperado (Elo)

```json
{
  "holderName": "JOAO SILVA",
  "cardNumber": "6504000000000000",
  "expMonth": "05",
  "expYear": "2033",
  "card_expiration": "05/2033",
  "cvv": "123",
  "payment_method_code": "credit_card",
  "payment_company_code": "elo",
  "documentNumber": "12345678901"
}
```

## Exemplo de Payload Esperado (BIN Desconhecido)

```json
{
  "holderName": "JOAO SILVA",
  "cardNumber": "1234567890123456",
  "expMonth": "05",
  "expYear": "2033",
  "card_expiration": "05/2033",
  "cvv": "123",
  "payment_method_code": "credit_card",
  "documentNumber": "12345678901"
}
```

Note: `payment_company_code` **não está presente** quando não detectado.

