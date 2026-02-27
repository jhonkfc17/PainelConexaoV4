# Conector WhatsApp (Cloud API)

As funções agora falam direto com o WhatsApp Cloud API (Graph), sem o connector da Railway.

- `supabase/functions/wa-connector/*` – Edge Function autenticada para init/status/qr/send (QR sempre dispensa porque Cloud API não usa).
- `supabase/functions/wa-auto-dispatch/*` – Automação para disparos em lote (usa o mesmo Cloud API).
- `src/services/whatsappDispatch.ts` / `src/services/whatsappConnector.ts` – clientes frontend.

## Variáveis de ambiente (Supabase Edge)
Obrigatórias:

- `WA_PHONE_NUMBER_ID` – ID do número do WhatsApp Cloud API.
- `WA_ACCESS_TOKEN` – token de acesso da Cloud API.

Opcionais (fallback para fora da janela de 24h):

- `WA_TEMPLATE_NAME` – nome do template aprovado (ex: `hello_world`).
- `WA_TEMPLATE_LANG` – idioma (ex: `pt_BR`). Padrão: `pt_BR`.

## Deploy

```
supabase functions deploy wa-connector
supabase functions deploy wa-auto-dispatch
```

Depois do deploy, a UI de Configurações -> WhatsApp usa `wa-connector`; automações chamam `wa-auto-dispatch` via `supabase.functions.invoke`.
