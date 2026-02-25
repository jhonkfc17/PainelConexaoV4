# Connector Corrigido

## Variáveis de ambiente

- `PORT` (opcional)
- `API_KEY` (obrigatório)
- `ALLOWED_ORIGINS` (opcional) ex: `https://seu-painel.com,http://localhost:5173`
- `SESSIONS_DIR` (opcional, recomendado `/sessions` no Railway)
- `PUPPETEER_EXECUTABLE_PATH` (opcional, padrão `/usr/bin/chromium`)
- `SEND_TIMEOUT_MS` (opcional, padrão `120000`)

## Endpoints

Todos exigem header:

- `Authorization: Bearer <API_KEY>` ou `x-wa-token: <API_KEY>`

### Inicializar sessão
`POST /whatsapp/init`
```json
{ "tenant_id": "uuid-do-tenant" }
```

### Status
`GET /whatsapp/status?tenant_id=<tenant>`

### QR
`GET /whatsapp/qr?tenant_id=<tenant>`

### Enviar mensagem
`POST /whatsapp/send`
```json
{ "tenant_id": "uuid-do-tenant", "to": "5599999999999", "message": "Olá" }
```

### Enviar em lote (opcional)
`POST /send-batch`
```json
{
  "items": [
    { "tenant_id": "uuid-do-tenant", "to": "5599999999999", "message": "Olá" }
  ]
}
```
