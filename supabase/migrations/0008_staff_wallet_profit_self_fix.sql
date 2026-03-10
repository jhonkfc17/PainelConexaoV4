create or replace function public.staff_realized_profit(p_staff_auth_user_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_total numeric := 0;
  v_principal_remaining numeric := 0;
  v_payment_value numeric := 0;
  v_juros numeric := 0;
  v_principal_part numeric := 0;
  v_flags jsonb := '{}'::jsonb;
  v_tipo text := '';
  v_modo text := '';
  v_is_profit boolean := false;
  r_loan record;
  r_payment record;
begin
  if p_staff_auth_user_id is null then
    return 0;
  end if;

  if not public.is_tenant_admin() and auth.uid() <> p_staff_auth_user_id then
    raise exception 'Acesso negado';
  end if;

  if not exists (
    select 1
    from public.staff_members s
    where s.tenant_id = v_tenant
      and s.auth_user_id = p_staff_auth_user_id
  ) then
    return 0;
  end if;

  for r_loan in
    select
      e.id,
      coalesce(
        public.try_numeric(e.payload ->> 'valor'),
        public.try_numeric(e.payload ->> 'principal'),
        public.try_numeric(e.payload ->> 'valorEmprestado'),
        public.try_numeric(e.payload ->> 'capital'),
        0
      ) as principal
    from public.emprestimos e
    where e.created_by = p_staff_auth_user_id
  loop
    v_principal_remaining := greatest(coalesce(r_loan.principal, 0), 0);

    for r_payment in
      select
        p.id,
        p.tipo,
        p.valor,
        p.juros_atraso,
        p.flags,
        p.data_pagamento,
        p.created_at
      from public.pagamentos p
      where p.emprestimo_id = r_loan.id
        and p.estornado_em is null
      order by coalesce(p.data_pagamento, (p.created_at at time zone 'UTC')::date), p.created_at, p.id
    loop
      v_flags := coalesce(r_payment.flags, '{}'::jsonb);

      if coalesce(lower(v_flags ->> 'juros_auto') in ('true', 't', '1', 'yes', 'y'), false)
        or (v_flags ? 'origem_pagamento_id')
      then
        continue;
      end if;

      v_payment_value := coalesce(r_payment.valor, 0);
      v_juros := coalesce(r_payment.juros_atraso, 0);
      v_tipo := upper(coalesce(r_payment.tipo, ''));
      v_modo := upper(coalesce(v_flags ->> 'modo', ''));
      v_is_profit :=
        v_tipo = 'JUROS'
        or coalesce(lower(v_flags ->> 'contabilizar_como_lucro') in ('true', 't', '1', 'yes', 'y'), false)
        or v_modo = 'JUROS'
        or coalesce(lower(v_flags ->> 'juros_composto') in ('true', 't', '1', 'yes', 'y'), false)
        or (v_tipo = 'ADIANTAMENTO_MANUAL' and v_juros > 0);

      if v_is_profit then
        v_total := v_total + v_payment_value + v_juros;
        continue;
      end if;

      v_principal_part := least(v_payment_value, v_principal_remaining);
      v_principal_remaining := greatest(0, v_principal_remaining - v_principal_part);
      v_total := v_total + greatest(0, v_payment_value - v_principal_part) + v_juros;
    end loop;
  end loop;

  return round(coalesce(v_total, 0), 2);
end;
$$;
