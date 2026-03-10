create or replace function public.get_my_staff_wallet()
returns table (
  staff_member_id uuid,
  staff_auth_user_id uuid,
  nome text,
  email text,
  staff_role text,
  active boolean,
  commission_pct numeric,
  realized_profit numeric,
  commission_profit numeric,
  paid_total numeric,
  available_balance numeric,
  payout_count bigint,
  last_payout_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_staff record;
  v_realized numeric := 0;
  v_commission_profit numeric := 0;
  v_paid_total numeric := 0;
  v_payout_count bigint := 0;
  v_last_payout_at timestamptz := null;
begin
  if auth.uid() is null then
    raise exception 'Acesso negado';
  end if;

  select
    s.id,
    s.auth_user_id,
    s.nome,
    s.email,
    s.role,
    s.active,
    coalesce(s.commission_pct, 0) as commission_pct
  into v_staff
  from public.staff_members s
  where s.tenant_id = v_tenant
    and s.auth_user_id = auth.uid()
    and s.active = true
  limit 1;

  if not found then
    return;
  end if;

  v_realized := public.staff_realized_profit(v_staff.auth_user_id);
  v_commission_profit := round(v_realized * (coalesce(v_staff.commission_pct, 0) / 100.0), 2);

  select
    coalesce(sum(p.valor), 0),
    count(*)::bigint,
    max(p.paid_at::timestamptz + interval '12 hours')
  into v_paid_total, v_payout_count, v_last_payout_at
  from public.staff_profit_payouts p
  where p.tenant_id = v_tenant
    and p.staff_member_id = v_staff.id
    and p.estornado_em is null;

  staff_member_id := v_staff.id;
  staff_auth_user_id := v_staff.auth_user_id;
  nome := v_staff.nome;
  email := v_staff.email;
  staff_role := v_staff.role;
  active := v_staff.active;
  commission_pct := v_staff.commission_pct;
  realized_profit := round(coalesce(v_realized, 0), 2);
  commission_profit := round(coalesce(v_commission_profit, 0), 2);
  paid_total := round(coalesce(v_paid_total, 0), 2);
  available_balance := round(coalesce(v_commission_profit, 0) - coalesce(v_paid_total, 0), 2);
  payout_count := coalesce(v_payout_count, 0);
  last_payout_at := v_last_payout_at;
  return next;
end;
$$;
