# Alterações Necessárias no Backend para AutoPay Vindi

## ✅ Frontend Atualizado e Pronto

O frontend foi completamente atualizado e está pronto para uso:

1. ✅ **Tokenização via backend** - Não chama mais Vindi diretamente do browser
2. ✅ **Tratamento robusto de erros**:
   - 404: "O backend ainda não possui o endpoint de tokenização..."
   - 401/403: "Chave Vindi inválida ou ambiente incorreto"
   - 400/422: Mensagens específicas de validação do cartão
   - GATEWAY_TOKEN_REQUIRED: "Para ativar o AutoPay pela primeira vez, cadastre o cartão"
3. ✅ **Sempre persistir preferências** - Mesmo sem cartão novo, salva numbers/active/holder/doc
4. ✅ **Validação de dados** - expMonth (MM), expYear (YYYY), CVV apenas dígitos
5. ✅ **Nenhum segredo no frontend** - Removidas todas as referências a chaves privadas

## 1. Novo Endpoint Necessário: `/api/autopay/vindi/tokenize`

O frontend agora chama este endpoint para tokenizar cartões. O backend deve:

**Endpoint:** `POST /api/autopay/vindi/tokenize`

**Request Body:**
```json
{
  "holder_name": "NOME COMPLETO",
  "card_number": "4111111111111111",
  "card_expiration_month": "12",
  "card_expiration_year": "2025",
  "card_cvv": "123",
  "payment_method_code": "credit_card",
  "document_number": "12345678900",  // opcional
  "registry_code": "12345678900"     // opcional (backend decide qual usar)
}
```

**Response Success (200):**
```json
{
  "gateway_token": "tok_xxxxxxxxxxxx"
}
```

**Response Errors:**
- `401/403`: Chave da API Vindi inválida → Frontend mostra "Tokenização indisponível (configuração). Contate o suporte."
- `422/400`: Validação do cartão falhou → Frontend mostra mensagem amigável do erro
- Outros: Mensagem genérica de erro

**Implementação Backend:**
```javascript
// Usar VINDI_API_KEY do ambiente (server-side)
// Fazer POST para https://app.vindi.com.br/api/v1/public/payment_profiles
// Authorization: Basic base64(VINDI_API_KEY + ":")
// Retornar gateway_token da resposta
```

## 2. Ajuste no Endpoint `/api/autopay/vindi/setup`

**Mudança necessária:** Tornar `gateway_token` **opcional** quando já existe cartão salvo.

**Lógica:**
- Se usuário **já tem** `vindi_payment_profile_id` salvo:
  - Permitir atualizar `active`, `holder_name`, `doc_number`, `numbers` **SEM** `gateway_token`
  - Não recriar payment profile
  - Retornar status OK com `card.last4` existente
  
- Se usuário **NÃO tem** `vindi_payment_profile_id`:
  - `gateway_token` é **obrigatório**
  - Criar payment profile via Vindi
  - Gravar `vindi_customer_id`, `vindi_payment_profile_id`, `vindi_last_four`
  - **Neutralizar MP**: Limpar `mp_customer_id`, `mp_card_id` (ou marcar `provider='vindi'`)

**Request Body (gateway_token opcional):**
```json
{
  "gateway_token": "tok_xxx",  // opcional se já existe payment_profile
  "holder_name": "Nome Completo",
  "doc_number": "12345678900",
  "numbers": [1, 2, 3, 4, 5],
  "active": true
}
```

**Response quando gateway_token não fornecido mas já existe cartão:**
```json
{
  "success": true,
  "card": {
    "last4": "1111",
    "brand": "visa"
  }
}
```

**Response quando gateway_token obrigatório mas não fornecido:**
```json
{
  "error": "gateway_token é obrigatório para primeira configuração"
}
```
Frontend detecta e mostra: "Para ativar o AutoPay pela primeira vez, cadastre o cartão."

## 3. Ajuste no `autopayRunner.js`

**Problema atual:** Runner tenta MP quando Vindi não está configurado, causando falhas.

**Solução:**

**Opção A (Recomendada):**
- Se `process.env.VINDI_API_KEY` estiver configurado E sistema está em modo Vindi:
  - **Não tentar MP** se perfil não tiver `vindi_payment_profile_id`
  - Logar: `"Perfil sem Vindi configurado — pulando"`
  - **Não registrar** `autopay_runs` como "tentou cobrar"

**Opção B (Fallback):**
- Tentar MP apenas se houver indicador claro de que MP consegue cobrar sem CVV
- Caso contrário, não tentar

**Prioridade no Runner:**
1. Verificar `vindi_payment_profile_id`
2. Se existe, usar Vindi
3. Se não existe E sistema está em modo Vindi, **pular** (não tentar MP)
4. Se sistema está em modo misto, tentar MP apenas se seguro

**Logs Melhorados:**
```javascript
console.log(`[autopayRunner] Perfil ${profileId}: provider=Vindi, payment_profile=${vindi_payment_profile_id}`);
console.log(`[autopayRunner] Perfil ${profileId}: pulando — sem vindi_payment_profile_id (modo Vindi)`);
console.log(`[autopayRunner] Perfil ${profileId}: criando bill ${billId}, charge ${chargeId}`);
```

## 4. Variáveis de Ambiente Backend

Garantir que backend tenha:
```env
VINDI_API_KEY=uXYN-...          # Chave privada (server-side)
VINDI_API_BASE_URL=https://app.vindi.com.br/api/v1
VINDI_DEFAULT_GATEWAY=pagarme   # se aplicável
```

**NÃO expor `VINDI_API_KEY` no frontend** - Tokenização agora é feita via backend.

## 5. Neutralização de MP ao Criar Vindi

Quando `setup` Vindi for bem-sucedido e criar `vindi_payment_profile_id`:

```sql
UPDATE public.autopay_profiles
SET 
  mp_customer_id = NULL,
  mp_card_id = NULL,
  provider = 'vindi'  -- se coluna existir
WHERE id = ?;
```

Isso evita runner tentar MP e falhar com "MP exige CVV".

## 6. Estrutura Esperada no Banco

Após setup bem-sucedido, `autopay_profiles` deve ter:
- `vindi_customer_id` (não NULL)
- `vindi_payment_profile_id` (não NULL)
- `vindi_last_four` (últimos 4 dígitos)
- `holder_name`
- `doc_number`
- `autopay_numbers` (array de números)
- `active` (boolean)

## Testes de Aceite

1. ✅ **Usuário com cartão salvo**: Consegue alterar números/active sem preencher cartão
2. ✅ **Usuário sem cartão**: Salvar sem cartão mostra "precisa cadastrar cartão"
3. ✅ **Tokenização**: Não retorna 401 (chave correta no backend)
4. ✅ **Runner**: Escolhe Vindi quando `vindi_payment_profile_id` existe, não tenta MP
5. ✅ **Runner**: Pula perfil sem Vindi configurado em modo Vindi (não tenta MP)

