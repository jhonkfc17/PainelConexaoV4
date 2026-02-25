# Conector WhatsApp (Railway)

Arquivos criados para ligar o painel ao connector de WhatsApp hospedado na Railway:

- `supabase/functions/wa-auto-dispatch/*` → Edge Function autenticada que envia mensagens para o connector.
- `supabase/functions/wa-connector/*` → Webhook público para receber eventos/status do connector.
- `src/services/whatsappDispatch.ts` → Cliente usado pelo frontend (`sendWhatsAppFromPanel`) que chama a Edge Function.

## Variáveis de ambiente necessárias (Supabase Edge)

Defina **pelo menos**:

- `WA_CONNECTOR_URL` (ou `RAILWAY_WA_URL`) – Base URL do connector, ex: `https://meu-whatsapp.up.railway.app`
- `WA_CONNECTOR_TOKEN` (ou `RAILWAY_WA_TOKEN`) – Bearer token aceito pelo connector para envio.
- Opcional: `WA_WEBHOOK_SECRET` (ou `RAILWAY_WA_WEBHOOK_SECRET`) – Segredo que o connector envia no header `x-connector-secret` para validar o webhook.

## Deploy das funções

1) Configure as variáveis acima em **Supabase > Edge Functions > Environment variables**.  
2) Rode no projeto (ou no CI):  
   ```bash
   supabase functions deploy wa-auto-dispatch
   supabase functions deploy wa-connector
   ```
3) No connector Railway, aponte o webhook para:  
   `https://<PROJECT>.supabase.co/functions/v1/wa-connector`

Com isso, o painel pode enviar mensagens via `sendWhatsAppFromPanel`, e o connector consegue devolver eventos via webhook seguro.
