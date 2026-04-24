# NewStore – Integração PIX (camada de serviço)

## O que foi adicionado
- `src/services/pix.js`: serviço plugável para criar pagamentos PIX.
  - Usa backend real se `REACT_APP_USE_BACKEND=true` e `REACT_APP_API_BASE_URL` configurados.
  - Caso contrário, usa um *mock* local apenas para testes de UI (sem cobrar).
- `src/PixModal.jsx`: modal reutilizável que exibe QR, copia e cola e ações básicas.
- `src/NewStorePage.jsx`: manteve o layout; apenas injeta a abertura do modal e chama o serviço.

## Como rodar
Os mesmos comandos de antes:
```bash
npm install
npm start
```

### Usando backend real (Render)
Crie `.env` na raiz:
```
REACT_APP_USE_BACKEND=true
REACT_APP_API_BASE_URL=https://lancaster-backend.onrender.com
```
> O `authContext` atual usa um token *fake*; para backend real de pagamentos, salve o JWT de login em `ns_auth_token`.

### Mudanças de arquivos
- `src/services/pix.js` (novo)
- `src/PixModal.jsx` (novo)
- `src/NewStorePage.jsx` (apenas integração do modal e chamada de serviço)

## Ponto de troca de provedor
No futuro, troque o conteúdo de `createPixPayment` em `src/services/pix.js`
para chamar outro provedor ou SDK sem mexer na UI.
