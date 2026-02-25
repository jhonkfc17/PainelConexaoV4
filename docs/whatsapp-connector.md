# Conector WhatsApp (Railway)

Conjunto de funcoes/servicos para integrar o painel ao connector de WhatsApp rodando na Railway.

- `supabase/functions/wa-connector/*` -> Edge Function principal (autenticada) que faz proxy para o connector (`/whatsapp/init|status|qr|send`), validando o usuario Supabase e usando `WA_CONNECTOR_URL` + `WA_TOKEN`.
- `supabase/functions/wa-auto-dispatch/*` -> Edge Function opcional de envio rapido (`/send`) pensada para automacoes; tambem forwarda para o connector.
- `src/services/whatsappDispatch.ts` -> Cliente usado pelo frontend (`sendWhatsAppFromPanel`) que valida status/QR via `wa-connector` antes de enviar.
- `src/services/whatsappConnector.ts` + `src/components/WhatsAppConnectorCard.tsx` -> UI de status/QR/ativacao do WhatsApp.

## Variaveis de ambiente (Supabase Edge)

Obrigatorias para as funcoes acima:

- `WA_CONNECTOR_URL` (alias: `WA_URL`, `RAILWAY_WA_URL`, `RAILWAY_WHATSAPP_URL`) – URL base do connector na Railway.
- `WA_TOKEN` (alias: `WA_CONNECTOR_TOKEN`, `RAILWAY_WA_TOKEN`, `RAILWAY_WHATSAPP_TOKEN`) – token aceito pelo connector (usa header `x-wa-token` e tambem `Authorization: Bearer`).

## Deploy

```
supabase functions deploy wa-connector
supabase functions deploy wa-auto-dispatch
```

Depois do deploy, a UI de Configuracoes -> WhatsApp ja consegue:

1. `wa-connector` -> init / status / qr / send.
2. (Opcional) Automacao/robos podem usar `wa-auto-dispatch` chamando a Edge Function direta via `supabase.functions.invoke("wa-auto-dispatch", ...)`.