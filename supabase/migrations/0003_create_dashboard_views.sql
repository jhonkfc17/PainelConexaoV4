-- Dashboard views (Lucro = juros recebidos)
-- Observação: usa America/Sao_Paulo para fechar o mês corretamente.

create or replace view public.v_dashboard_metrics as
with period as (
  select
    date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date as dt_ini,
    (date_trunc('month', (now() at time zone 'America/Sao_Paulo')) + interval '1 month')::date as dt_fim,
    (now() at time zone 'America/Sao_Paulo')::date as hoje
),
juros_por_emprestimo as (
  select
    e.id as emprestimo_id,
    greatest(coalesce(e.total_receber,0) - coalesce(e.principal,0),0) as juros_total,
    case
      when coalesce(e.numero_parcelas,0) > 0
        then greatest(coalesce(e.total_receber,0) - coalesce(e.principal,0),0) / e.numero_parcelas
      else 0
    end as juros_por_parcela
  from emprestimos e
),
pagas_periodo as (
  select
    p.emprestimo_id,
    count(*) as qtd_pagas,
    sum(coalesce(p.valor_pago, coalesce(p.valor,0))) as total_recebido_parcelas,
    sum(coalesce(p.juros_atraso,0)) as juros_atraso,
    sum(coalesce(p.multa_valor,0)) as multa
  from parcelas p
  cross join period pr
  where p.pago = true
    and p.pago_em >= pr.dt_ini
    and p.pago_em <  pr.dt_fim
  group by p.emprestimo_id
),
agregado as (
  select
    coalesce(sum(pp.qtd_pagas),0) as parcelas_pagas_mes,
    coalesce(sum(pp.total_recebido_parcelas),0) as total_recebido_mes,
    coalesce(sum(pp.juros_atraso),0) as juros_atraso_mes,
    coalesce(sum(pp.multa),0) as multa_mes,
    coalesce(sum(pp.qtd_pagas * j.juros_por_parcela),0) as juros_embutido_mes
  from pagas_periodo pp
  join juros_por_emprestimo j on j.emprestimo_id = pp.emprestimo_id
),
atraso as (
  -- sem depender de dias_atraso: atraso = vencimento < hoje e não pago
  select
    coalesce(sum(coalesce(p.valor,0)),0) as em_atraso_valor,
    count(*) as em_atraso_qtd
  from parcelas p
  cross join period pr
  where p.pago = false
    and p.vencimento < pr.hoje
)
select
  a.total_recebido_mes,
  (a.juros_embutido_mes + a.juros_atraso_mes + a.multa_mes) as lucro_mes,
  a.juros_embutido_mes,
  a.juros_atraso_mes,
  a.multa_mes,
  a.parcelas_pagas_mes,
  at.em_atraso_valor,
  at.em_atraso_qtd
from agregado a
cross join atraso at;


create or replace view public.v_dashboard_metrics_30d as
with period as (
  select
    ((now() at time zone 'America/Sao_Paulo')::date - 30) as dt_ini,
    ((now() at time zone 'America/Sao_Paulo')::date + 1) as dt_fim
),
juros_por_emprestimo as (
  select
    e.id as emprestimo_id,
    case
      when coalesce(e.numero_parcelas,0) > 0
        then greatest(coalesce(e.total_receber,0) - coalesce(e.principal,0),0) / e.numero_parcelas
      else 0
    end as juros_por_parcela
  from emprestimos e
),
pagas_periodo as (
  select
    p.emprestimo_id,
    count(*) as qtd_pagas,
    sum(coalesce(p.valor_pago, coalesce(p.valor,0))) as total_recebido_parcelas,
    sum(coalesce(p.juros_atraso,0)) as juros_atraso,
    sum(coalesce(p.multa_valor,0)) as multa
  from parcelas p
  cross join period pr
  where p.pago = true
    and p.pago_em >= pr.dt_ini
    and p.pago_em <  pr.dt_fim
  group by p.emprestimo_id
)
select
  coalesce(sum(pp.total_recebido_parcelas),0) as total_recebido_30d,
  coalesce(sum(pp.qtd_pagas * j.juros_por_parcela),0) as juros_embutido_30d,
  coalesce(sum(pp.juros_atraso),0) as juros_atraso_30d,
  coalesce(sum(pp.multa),0) as multa_30d,
  (
    coalesce(sum(pp.qtd_pagas * j.juros_por_parcela),0)
    + coalesce(sum(pp.juros_atraso),0)
    + coalesce(sum(pp.multa),0)
  ) as lucro_30d
from pagas_periodo pp
join juros_por_emprestimo j on j.emprestimo_id = pp.emprestimo_id;


-- Índices recomendados
create index if not exists idx_parcelas_pago_pagoem
  on parcelas (pago, pago_em);

create index if not exists idx_parcelas_emprestimo_pagoem
  on parcelas (emprestimo_id, pago_em);

create index if not exists idx_parcelas_atraso
  on parcelas (pago, vencimento);
