param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRef,

  [Parameter(Mandatory = $true)]
  [string]$WaConnectorUrl,

  [Parameter(Mandatory = $true)]
  [string]$WaToken
)

$ErrorActionPreference = "Stop"

Write-Host "==> Validando Supabase CLI..."
supabase --version | Out-Null

Write-Host "==> Vinculando projeto: $ProjectRef"
supabase link --project-ref $ProjectRef

Write-Host "==> Atualizando secrets WA_CONNECTOR_URL e WA_TOKEN"
supabase secrets set `
  --project-ref $ProjectRef `
  WA_CONNECTOR_URL="$WaConnectorUrl" `
  WA_TOKEN="$WaToken"

Write-Host "==> Deploy Edge Functions"
supabase functions deploy wa-connector --project-ref $ProjectRef
supabase functions deploy wa-auto-dispatch --project-ref $ProjectRef
supabase functions deploy staff-admin --project-ref $ProjectRef

Write-Host "==> Finalizado com sucesso."
Write-Host "Dica: rode 'supabase functions list --project-ref $ProjectRef' para conferir."
