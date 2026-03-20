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
  v_pag public.pagamentos%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sessao invalida para estornar pagamento';
  end if;

  select * into v_pag from public.pagamentos where id = p_pagamento_id;
  if not found then
    raise exception 'Pagamento nao encontrado';
  end if;

  if v_pag.estornado_em is not null then
    raise exception 'Pagamento ja estornado';
  end if;

  if not (
    coalesce(p_is_admin, false)
    or v_pag.created_by = auth.uid()
  ) then
    raise exception 'Voce nao tem permissao para excluir este pagamento';
  end if;

  update public.pagamentos
    set estornado_em = now(),
        estornado_por = auth.uid(),
        estornado_motivo = p_motivo
  where id = p_pagamento_id;

  if v_pag.snapshot_parcela is not null and v_pag.parcela_id is not null then
    update public.parcelas p
      set
        pago = coalesce((v_pag.snapshot_parcela->>'pago')::boolean, p.pago),
        pago_em = nullif(v_pag.snapshot_parcela->>'pago_em','')::date,
        valor_pago = nullif(v_pag.snapshot_parcela->>'valor_pago','')::numeric,
        juros_atraso = nullif(v_pag.snapshot_parcela->>'juros_atraso','')::numeric,
        valor_pago_acumulado = coalesce(nullif(v_pag.snapshot_parcela->>'valor_pago_acumulado','')::numeric, p.valor_pago_acumulado),
        saldo_restante = coalesce(nullif(v_pag.snapshot_parcela->>'saldo_restante','')::numeric, p.saldo_restante),
        vencimento = coalesce(nullif(v_pag.snapshot_parcela->>'vencimento','')::date, p.vencimento),
        updated_at = now()
    where p.id = v_pag.parcela_id;
  end if;

  if v_pag.tipo = 'QUITACAO_TOTAL' and v_pag.snapshot_parcelas is not null then
    update public.parcelas p
    set
      pago = (sp->>'pago')::boolean,
      pago_em = nullif(sp->>'pago_em','')::date,
      valor_pago = nullif(sp->>'valor_pago','')::numeric,
      juros_atraso = nullif(sp->>'juros_atraso','')::numeric,
      valor_pago_acumulado = coalesce(nullif(sp->>'valor_pago_acumulado','')::numeric, 0),
      saldo_restante = coalesce(nullif(sp->>'saldo_restante','')::numeric, 0),
      vencimento = nullif(sp->>'vencimento','')::date,
      updated_at = now()
    from (
      select jsonb_array_elements(v_pag.snapshot_parcelas) as sp
    ) s
    where p.id = (s.sp->>'id')::uuid;

    update public.emprestimos e
      set status = coalesce(v_pag.snapshot_emprestimo->>'status', e.status),
          quitado_em = nullif(v_pag.snapshot_emprestimo->>'quitado_em','')::timestamptz,
          updated_at = now()
    where e.id = v_pag.emprestimo_id;
  end if;

  perform public._reavaliar_status_emprestimo(v_pag.emprestimo_id);

  return jsonb_build_object('ok', true, 'pagamento_id', p_pagamento_id);
end;
$$;
