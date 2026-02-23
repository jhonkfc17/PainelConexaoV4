-- =============================================================
-- PATCH: adicionar tipo DESCONTO + (opcional) prorrogação de vencimento via flags
-- Projeto: Conexão Painel
--
-- O que este patch faz:
-- 1) Permite `DESCONTO` na coluna pagamentos.tipo (check constraint)
-- 2) Atualiza o RPC `rpc_registrar_pagamento` para aceitar DESCONTO
--    - grava o pagamento com valor NEGATIVO (para não inflar "recebido")
--    - aplica desconto reduzindo o saldo da parcela (via valor_pago_acumulado/saldo_restante)
-- 3) (Opcional) se `p_flags` contiver `nova_data_vencimento` (YYYY-MM-DD),
--    ao registrar SALDO_PARCIAL ele atualiza parcelas.vencimento.
-- =============================================================

-- 1) Atualiza a constraint do tipo
do $$
declare
  c_name text;
begin
  select conname into c_name
  from pg_constraint
  where conrelid = 'public.pagamentos'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%tipo in (%'
  limit 1;

  if c_name is not null then
    execute format('alter table public.pagamentos drop constraint if exists %I', c_name);
  end if;

  alter table public.pagamentos
    add constraint pagamentos_tipo_check
    check (tipo in ('PARCELA_INTEGRAL','ADIANTAMENTO_MANUAL','SALDO_PARCIAL','QUITACAO_TOTAL','DESCONTO'));
end $$;


-- 2) Atualiza o RPC
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
  v_abs numeric;
  v_nova_venc date;
begin
  select * into v_emprestimo from public.emprestimos where id = p_emprestimo_id;
  if not found then
    raise exception 'Empréstimo não encontrado';
  end if;
  v_tenant := v_emprestimo.tenant_id;

  if p_tipo not in ('PARCELA_INTEGRAL','ADIANTAMENTO_MANUAL','SALDO_PARCIAL','QUITACAO_TOTAL','DESCONTO') then
    raise exception 'Tipo inválido: %', p_tipo;
  end if;

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

  v_abs := abs(coalesce(p_valor,0));

  -- grava pagamento (DESCONTO entra com valor NEGATIVO)
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
    case when p_tipo = 'DESCONTO' then (0 - v_abs) else coalesce(p_valor,0) end,
    nullif(coalesce(p_juros_atraso,0),0),
    p_data_pagamento,
    case when p_tipo = 'DESCONTO'
      then (coalesce(p_flags,'{}'::jsonb) || jsonb_build_object('desconto', true))
      else p_flags
    end,
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

    -- opcional: prorrogar vencimento
    begin
      v_nova_venc := nullif(coalesce(p_flags->>'nova_data_vencimento',''), '')::date;
    exception when others then
      v_nova_venc := null;
    end;
    if v_nova_venc is not null then
      update public.parcelas set vencimento = v_nova_venc, updated_at = now() where id = v_parcela.id;
    end if;

  elsif p_tipo = 'DESCONTO' then
    -- desconto: reduz saldo (valor NEGATIVO no histórico)
    v_acumulado := coalesce(v_parcela.valor_pago_acumulado,0) + v_abs;
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
