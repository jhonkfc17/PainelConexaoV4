-- =============================================================
-- Pagamentos (histórico + estorno com auditoria) + suporte a parcial/adiantamento + quitação total
-- Projeto: Conexão Painel
--
-- IMPORTANTE:
-- - Este script cria a tabela public.pagamentos e 2 RPCs:
--     rpc_registrar_pagamento
--     rpc_estornar_pagamento
-- - Também garante colunas auxiliares em public.parcelas.
-- - O estorno NÃO apaga registro: marca como estornado e restaura snapshots.
--
-- Recomenda-se executar primeiro em ambiente de teste.
-- =============================================================

-- 1) Colunas auxiliares em parcelas (para parcial/adiantamento)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='parcelas' and column_name='valor_pago_acumulado'
  ) then
    alter table public.parcelas add column valor_pago_acumulado numeric default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='parcelas' and column_name='saldo_restante'
  ) then
    alter table public.parcelas add column saldo_restante numeric default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='parcelas' and column_name='pago_em'
  ) then
    alter table public.parcelas add column pago_em date;
  end if;
end $$;

-- 2) Tabela de pagamentos (auditoria + snapshot)
create table if not exists public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  emprestimo_id uuid not null,
  parcela_id uuid null,
  parcela_numero int null,
  tipo text not null check (tipo in ('PARCELA_INTEGRAL','ADIANTAMENTO_MANUAL','SALDO_PARCIAL','QUITACAO_TOTAL')),
  valor numeric not null default 0,
  juros_atraso numeric null,
  data_pagamento date not null,
  flags jsonb null,
  created_at timestamptz not null default now(),
  created_by uuid null default auth.uid(),

  -- auditoria de estorno
  estornado_em timestamptz null,
  estornado_por uuid null,
  estornado_motivo text null,

  -- snapshots p/ reversão exata
  snapshot_parcela jsonb null,
  snapshot_emprestimo jsonb null,
  snapshot_parcelas jsonb null
);

create index if not exists pagamentos_emprestimo_idx on public.pagamentos (emprestimo_id);
create index if not exists pagamentos_parcela_idx on public.pagamentos (parcela_id);

-- 3) Função utilitária: reavaliar status do contrato
create or replace function public._reavaliar_status_emprestimo(p_emprestimo_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_total int;
  v_pagas int;
begin
  select count(*) into v_total from public.parcelas where emprestimo_id = p_emprestimo_id;
  select count(*) into v_pagas from public.parcelas where emprestimo_id = p_emprestimo_id and coalesce(pago,false) = true;

  if v_total > 0 and v_pagas = v_total then
    update public.emprestimos
      set status = 'finalizado',
          quitado_em = coalesce(quitado_em, now())
    where id = p_emprestimo_id;
  else
    update public.emprestimos
      set status = 'ativo',
          quitado_em = null
    where id = p_emprestimo_id and status = 'finalizado';
  end if;
end;
$$;

-- 4) RPC: Registrar pagamento
create or replace function public.rpc_registrar_pagamento(
  p_emprestimo_id uuid,
  p_tipo text,
  p_data_pagamento date,
  p_valor numeric,
  p_parcela_numero int default null,
  p_juros_atraso numeric default 0,
  p_flags jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_parcela public.parcelas%rowtype;
  v_emprestimo public.emprestimos%rowtype;
  v_pagamento_id uuid;
  v_tenant uuid;
  v_acumulado numeric;
  v_saldo numeric;
  v_snapshot_parcelas jsonb;
begin
  select * into v_emprestimo from public.emprestimos where id = p_emprestimo_id;
  if not found then
    raise exception 'Empréstimo não encontrado';
  end if;
  v_tenant := v_emprestimo.tenant_id;

  if p_tipo not in ('PARCELA_INTEGRAL','ADIANTAMENTO_MANUAL','SALDO_PARCIAL','QUITACAO_TOTAL') then
    raise exception 'Tipo inválido: %', p_tipo;
  end if;

  -- Snapshot do empréstimo sempre
  -- (mínimo necessário p/ reversão de quitação total)
  -- Obs: snapshot_emprestimo não inclui colunas grandes, mas aqui pegamos a linha inteira.

  if p_tipo = 'QUITACAO_TOTAL' then
    select jsonb_agg(to_jsonb(p)) into v_snapshot_parcelas
    from public.parcelas p
    where p.emprestimo_id = p_emprestimo_id;
  end if;

  if p_tipo <> 'QUITACAO_TOTAL' then
    if p_parcela_numero is null then
      raise exception 'Parcela obrigatória para o tipo %', p_tipo;
    end if;
    select * into v_parcela
    from public.parcelas
    where emprestimo_id = p_emprestimo_id and numero = p_parcela_numero
    limit 1;
    if not found then
      raise exception 'Parcela % não encontrada', p_parcela_numero;
    end if;
  end if;

  insert into public.pagamentos (
    tenant_id,
    emprestimo_id,
    parcela_id,
    parcela_numero,
    tipo,
    valor,
    juros_atraso,
    data_pagamento,
    flags,
    snapshot_parcela,
    snapshot_emprestimo,
    snapshot_parcelas
  ) values (
    v_tenant,
    p_emprestimo_id,
    case when p_tipo = 'QUITACAO_TOTAL' then null else v_parcela.id end,
    case when p_tipo = 'QUITACAO_TOTAL' then null else p_parcela_numero end,
    p_tipo,
    coalesce(p_valor,0),
    nullif(coalesce(p_juros_atraso,0),0),
    p_data_pagamento,
    p_flags,
    case when p_tipo = 'QUITACAO_TOTAL' then null else to_jsonb(v_parcela) end,
    to_jsonb(v_emprestimo),
    v_snapshot_parcelas
  )
  returning id into v_pagamento_id;

  -- Aplicar regras
  if p_tipo = 'PARCELA_INTEGRAL' then
    update public.parcelas
      set pago = true,
          pago_em = p_data_pagamento,
          valor_pago = coalesce(v_parcela.valor,0),
          juros_atraso = nullif(coalesce(p_juros_atraso,0),0),
          valor_pago_acumulado = 0,
          saldo_restante = 0,
          updated_at = now()
    where id = v_parcela.id;

  elsif p_tipo = 'ADIANTAMENTO_MANUAL' then
    -- não quita a parcela
    v_acumulado := coalesce(v_parcela.valor_pago_acumulado,0) + coalesce(p_valor,0);
    v_saldo := greatest(coalesce(v_parcela.valor,0) - v_acumulado, 0);

    update public.parcelas
      set pago = false,
          valor_pago_acumulado = v_acumulado,
          saldo_restante = v_saldo,
          updated_at = now()
    where id = v_parcela.id;

  elsif p_tipo = 'SALDO_PARCIAL' then
    v_acumulado := coalesce(v_parcela.valor_pago_acumulado,0) + coalesce(p_valor,0);
    v_saldo := greatest(coalesce(v_parcela.valor,0) - v_acumulado, 0);

    if v_saldo <= 0 then
      update public.parcelas
        set pago = true,
            pago_em = p_data_pagamento,
            valor_pago = coalesce(v_parcela.valor,0),
            valor_pago_acumulado = 0,
            saldo_restante = 0,
            updated_at = now()
      where id = v_parcela.id;
    else
      update public.parcelas
        set pago = false,
            valor_pago_acumulado = v_acumulado,
            saldo_restante = v_saldo,
            updated_at = now()
      where id = v_parcela.id;
    end if;

  elsif p_tipo = 'QUITACAO_TOTAL' then
    -- marca tudo como pago e finaliza
    update public.emprestimos
      set status = 'finalizado',
          quitado_em = coalesce(p_data_pagamento::timestamptz, now()),
          updated_at = now()
    where id = p_emprestimo_id;

    update public.parcelas
      set pago = true,
          pago_em = p_data_pagamento,
          valor_pago = coalesce(valor,0),
          valor_pago_acumulado = 0,
          saldo_restante = 0,
          updated_at = now()
    where emprestimo_id = p_emprestimo_id;
  end if;

  perform public._reavaliar_status_emprestimo(p_emprestimo_id);

  return jsonb_build_object('ok', true, 'pagamento_id', v_pagamento_id);
end;
$$;

-- 5) RPC: Estornar pagamento (auditoria + reversão por snapshot)
create or replace function public.rpc_estornar_pagamento(
  p_pagamento_id uuid,
  p_motivo text default null,
  p_is_admin boolean default false
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_pay public.pagamentos%rowtype;
  v_parcela jsonb;
  v_emprestimo jsonb;
  v_parcelas jsonb;
  v_emprestimo_id uuid;
begin
  select * into v_pay from public.pagamentos where id = p_pagamento_id;
  if not found then
    raise exception 'Pagamento não encontrado';
  end if;

  if v_pay.estornado_em is not null then
    return jsonb_build_object('ok', true, 'message', 'Já estornado');
  end if;

  if v_pay.tipo = 'ADIANTAMENTO_MANUAL' and not coalesce(p_is_admin,false) then
    raise exception 'ADIANTAMENTO_MANUAL só pode ser estornado por admin';
  end if;

  update public.pagamentos
    set estornado_em = now(),
        estornado_por = auth.uid(),
        estornado_motivo = p_motivo
  where id = p_pagamento_id;

  v_emprestimo_id := v_pay.emprestimo_id;
  v_parcela := v_pay.snapshot_parcela;
  v_emprestimo := v_pay.snapshot_emprestimo;
  v_parcelas := v_pay.snapshot_parcelas;

  -- restaura parcela (se houver)
  if v_pay.tipo <> 'QUITACAO_TOTAL' then
    if v_parcela is null then
      raise exception 'Snapshot da parcela ausente. Não é possível estornar com segurança.';
    end if;

    update public.parcelas
      set pago = coalesce((v_parcela->>'pago')::boolean, false),
          pago_em = nullif(v_parcela->>'pago_em','')::date,
          valor_pago = nullif(v_parcela->>'valor_pago','')::numeric,
          juros_atraso = nullif(v_parcela->>'juros_atraso','')::numeric,
          valor_pago_acumulado = coalesce(nullif(v_parcela->>'valor_pago_acumulado','')::numeric, 0),
          saldo_restante = coalesce(nullif(v_parcela->>'saldo_restante','')::numeric, 0),
          updated_at = now()
    where id = (v_parcela->>'id')::uuid;
  end if;

  -- restaura quitação total (emprestimo + todas parcelas)
  if v_pay.tipo = 'QUITACAO_TOTAL' then
    if v_emprestimo is null or v_parcelas is null then
      raise exception 'Snapshots ausentes para quitação total. Não é possível estornar com segurança.';
    end if;

    update public.emprestimos
      set status = coalesce(v_emprestimo->>'status','ativo'),
          quitado_em = nullif(v_emprestimo->>'quitado_em','')::timestamptz,
          updated_at = now()
    where id = (v_emprestimo->>'id')::uuid;

    -- restaura cada parcela
    with snap as (
      select jsonb_array_elements(v_parcelas) as p
    )
    update public.parcelas pa
      set pago = coalesce((snap.p->>'pago')::boolean, false),
          pago_em = nullif(snap.p->>'pago_em','')::date,
          valor_pago = nullif(snap.p->>'valor_pago','')::numeric,
          juros_atraso = nullif(snap.p->>'juros_atraso','')::numeric,
          valor_pago_acumulado = coalesce(nullif(snap.p->>'valor_pago_acumulado','')::numeric, 0),
          saldo_restante = coalesce(nullif(snap.p->>'saldo_restante','')::numeric, 0),
          updated_at = now()
    from snap
    where pa.id = (snap.p->>'id')::uuid;
  end if;

  perform public._reavaliar_status_emprestimo(v_emprestimo_id);

  return jsonb_build_object('ok', true);
end;
$$;

-- Observação: policies/RLS devem ser ajustadas no seu projeto.
-- Se você usa multi-tenant via tenant_id, crie policies que filtram por tenant_id.
