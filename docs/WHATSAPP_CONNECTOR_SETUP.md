# Setup do WhatsApp Connector (Projeto Atual)

Este projeto usa 2 camadas para WhatsApp:

1. Conector externo (Railway): API Node do `Whatsapp-Connector-main`.
2. Edge Function Supabase (`wa-connector`): proxy seguro com validação de tenant.

## 1) Deploy do conector no Railway

Use o conteúdo do `Whatsapp-Connector-main.zip` em um repositório próprio.

Variáveis obrigatórias no Railway:

- `API_KEY`: token do conector.
- `ALLOWED_ORIGINS`: domínios do painel (ex.: `https://seuapp.com,http://localhost:5173`).
- `SESSIONS_DIR`: `/sessions`.

Também configure volume persistente em `/sessions`.

## 2) Secrets no Supabase (projeto do painel)

Defina os secrets na conta Supabase do painel:

- `WA_CONNECTOR_URL`: URL pública do Railway.
- `WA_TOKEN`: mesmo valor de `API_KEY` do Railway.

## 3) Deploy das Edge Functions

No diretório do painel:

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase functions deploy wa-connector --project-ref <PROJECT_REF>
supabase functions deploy wa-auto-dispatch --project-ref <PROJECT_REF>
supabase functions deploy staff-admin --project-ref <PROJECT_REF>
```

Ou via script PowerShell:

```powershell
.\scripts\supabase-deploy-whatsapp.ps1 `
  -ProjectRef "<PROJECT_REF>" `
  -WaConnectorUrl "https://seu-conector.up.railway.app" `
  -WaToken "<SEU_TOKEN>"
```

## 4) Verificação rápida

1. Abra `/config` no painel.
2. Card WhatsApp deve sair de erro para status `idle/qr/ready`.
3. Se aparecer 404 de function, a função não foi deployada nesse projeto.

## 5) GitHub Actions (opcional, recomendado)

O workflow `.github/workflows/deploy-supabase-functions.yml` já está pronto.

Configure estes secrets no GitHub:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `WA_CONNECTOR_URL`
- `WA_TOKEN`

Ao fazer push em `main` (arquivos de `supabase/functions/**`), o deploy roda automático.
