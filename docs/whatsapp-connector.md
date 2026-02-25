# Conector WhatsApp (Railway)

Conjunto de funções/serviços para integrar o painel ao connector de WhatsApp rodando na Railway.

- `supabase/functions/wa-connector/*` ? Edge Function principal (autenticada) que faz proxy para o connector (`/whatsapp/init|status|qr|send`), validando o usuário Supabase e usando `WA_CONNECTOR_URL` + `WA_TOKEN`.
- `supabase/functions/wa-auto-dispatch/*` ? Edge Function opcional de envio rápido (`/send`) pensada para automações; também forwarda para o connector.
- `src/services/whatsappDispatch.ts` ? Cliente usado pelo frontend (`sendWhatsAppFromPanel`) que valida status/QR via `wa-connector` antes de enviar.
- `src/services/whatsappConnector.ts` + `src/components/WhatsAppConnectorCard.tsx` ? UI de status/QR/ativação do WhatsApp.

## Variáveis de ambiente (Supabase Edge)

Obrigatórias para as funções acima:

- `WA_CONNECTOR_URL` (alias: `WA_URL`, `RAILWAY_WA_URL`, `RAILWAY_WHATSAPP_URL`) – URL base do connector na Railway.
- `WA_TOKEN` (alias: `WA_CONNECTOR_TOKEN`, `RAILWAY_WA_TOKEN`, `RAILWAY_WHATSAPP_TOKEN`) – token aceito pelo connector (usa header `x-wa-token` e também `Authorization: Bearer`).

## Deploy

```
supabase functions deploy wa-connector
supabase functions deploy wa-auto-dispatch
```

Depois do deploy, a UI de Configurações ? WhatsApp já consegue:

1. `wa-connector` ? init / status / qr / send.
2. (Opcional) Automação/robôs podem usar `wa-auto-dispatch` chamando a Edge Function direta via `supabase.functions.invoke("wa-auto-dispatch", ...)`.