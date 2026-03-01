-- Add normalized financial columns for accurate profit (juros) calculations
-- This migration makes lucro = juros recebidos possible without relying on JSON payload fields.
-- Date: 2026-02-28

alter table public.emprestimos
  add column if not exists principal numeric,
  add column if not exists total_receber numeric,
  add column if not exists numero_parcelas integer,
  add column if not exists taxa_mensal numeric;

-- Backfill safe fields from parcelas (does NOT guess principal or taxa for old contracts)
with agg as (
  select
    emprestimo_id,
    count(*) as n_parcelas,
    sum(valor) as total_previsto
  from public.parcelas
  group by emprestimo_id
)
update public.emprestimos e
set
  numero_parcelas = coalesce(e.numero_parcelas, agg.n_parcelas),
  total_receber   = coalesce(e.total_receber,   agg.total_previsto)
from agg
where e.id = agg.emprestimo_id
  and (e.numero_parcelas is null or e.total_receber is null);

-- Helpful index for dashboard/report queries
create index if not exists idx_parcelas_pago_em_paid
  on public.parcelas (pago, pago_em, emprestimo_id);
