create or replace function public.try_numeric(v text)
returns numeric
language plpgsql
immutable
as $$
begin
  if v is null or btrim(v) = '' then
    return null;
  end if;
  return v::numeric;
exception
  when others then
    return null;
end;
$$;

create table if not exists public.staff_profit_payouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  staff_member_id uuid not null references public.staff_members(id) on delete restrict,
  staff_auth_user_id uuid not null references public.staff_members(auth_user_id) on delete restrict,
  valor numeric not null check (valor > 0),
  paid_at date not null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null default auth.uid(),
  estornado_em timestamptz null,
  estornado_por uuid null,
  estornado_motivo text null
);

create index if not exists staff_profit_payouts_tenant_idx on public.staff_profit_payouts(tenant_id);
create index if not exists staff_profit_payouts_staff_idx on public.staff_profit_payouts(staff_member_id, estornado_em);
create index if not exists staff_profit_payouts_paid_at_idx on public.staff_profit_payouts(paid_at desc, created_at desc);

drop trigger if exists trg_staff_profit_payouts_updated_at on public.staff_profit_payouts;
create trigger trg_staff_profit_payouts_updated_at
before update on public.staff_profit_payouts
for each row execute function public.set_updated_at();

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

  if not public.is_tenant_admin() then
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

create or replace function public.staff_available_profit_balance(
  p_staff_member_id uuid,
  p_exclude_payout_id uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_staff record;
  v_realized numeric := 0;
  v_commission_total numeric := 0;
  v_paid_total numeric := 0;
begin
  if p_staff_member_id is null then
    return 0;
  end if;

  if not public.is_tenant_admin() then
    raise exception 'Acesso negado';
  end if;

  select
    s.id,
    s.tenant_id,
    s.auth_user_id,
    coalesce(s.commission_pct, 0) as commission_pct
  into v_staff
  from public.staff_members s
  where s.id = p_staff_member_id
    and s.tenant_id = v_tenant
  limit 1;

  if not found then
    return 0;
  end if;

  v_realized := public.staff_realized_profit(v_staff.auth_user_id);
  v_commission_total := round(v_realized * (coalesce(v_staff.commission_pct, 0) / 100.0), 2);

  select coalesce(sum(p.valor), 0)
  into v_paid_total
  from public.staff_profit_payouts p
  where p.tenant_id = v_tenant
    and p.staff_member_id = p_staff_member_id
    and p.estornado_em is null
    and (p_exclude_payout_id is null or p.id <> p_exclude_payout_id);

  return round(v_commission_total - coalesce(v_paid_total, 0), 2);
end;
$$;

create or replace function public.validate_staff_profit_payout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff record;
  v_available numeric := 0;
begin
  if not public.is_tenant_admin() then
    raise exception 'Acesso negado';
  end if;

  select
    s.id,
    s.tenant_id,
    s.auth_user_id
  into v_staff
  from public.staff_members s
  where s.id = new.staff_member_id
  limit 1;

  if not found then
    raise exception 'Funcionário não encontrado para este repasse.';
  end if;

  new.tenant_id := v_staff.tenant_id;
  new.staff_auth_user_id := v_staff.auth_user_id;
  new.created_by := coalesce(new.created_by, auth.uid());
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');

  if new.estornado_em is not null then
    return new;
  end if;

  v_available := public.staff_available_profit_balance(
    new.staff_member_id,
    case when tg_op = 'UPDATE' then new.id else null end
  );

  if coalesce(new.valor, 0) > v_available + 0.00001 then
    raise exception 'Repasse acima do saldo disponível deste funcionário.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_staff_profit_payouts_validate on public.staff_profit_payouts;
create trigger trg_staff_profit_payouts_validate
before insert or update on public.staff_profit_payouts
for each row execute function public.validate_staff_profit_payout();

create or replace function public.get_staff_wallets()
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
  v_realized numeric := 0;
  v_commission_profit numeric := 0;
  v_paid_total numeric := 0;
  v_payout_count bigint := 0;
  v_last_payout_at timestamptz := null;
  r_staff record;
begin
  if not public.is_tenant_admin() then
    raise exception 'Acesso negado';
  end if;

  for r_staff in
    select
      s.id,
      s.auth_user_id,
      s.nome,
      s.email,
      s.role,
      s.active,
      coalesce(s.commission_pct, 0) as commission_pct
    from public.staff_members s
    where s.tenant_id = v_tenant
    order by coalesce(s.nome, s.email), s.created_at desc
  loop
    v_realized := public.staff_realized_profit(r_staff.auth_user_id);
    v_commission_profit := round(v_realized * (coalesce(r_staff.commission_pct, 0) / 100.0), 2);

    select
      coalesce(sum(p.valor), 0),
      count(*)::bigint,
      max(p.paid_at::timestamptz + interval '12 hours')
    into v_paid_total, v_payout_count, v_last_payout_at
    from public.staff_profit_payouts p
    where p.tenant_id = v_tenant
      and p.staff_member_id = r_staff.id
      and p.estornado_em is null;

    staff_member_id := r_staff.id;
    staff_auth_user_id := r_staff.auth_user_id;
    nome := r_staff.nome;
    email := r_staff.email;
    staff_role := r_staff.role;
    active := r_staff.active;
    commission_pct := r_staff.commission_pct;
    realized_profit := round(coalesce(v_realized, 0), 2);
    commission_profit := round(coalesce(v_commission_profit, 0), 2);
    paid_total := round(coalesce(v_paid_total, 0), 2);
    available_balance := round(coalesce(v_commission_profit, 0) - coalesce(v_paid_total, 0), 2);
    payout_count := coalesce(v_payout_count, 0);
    last_payout_at := v_last_payout_at;
    return next;
  end loop;
end;
$$;

alter table public.staff_profit_payouts enable row level security;

drop policy if exists "staff payouts select" on public.staff_profit_payouts;
create policy "staff payouts select"
on public.staff_profit_payouts
for select
using (
  public.is_tenant_admin()
  and tenant_id = public.current_tenant_id()
);

drop policy if exists "staff payouts insert" on public.staff_profit_payouts;
create policy "staff payouts insert"
on public.staff_profit_payouts
for insert
with check (
  public.is_tenant_admin()
  and tenant_id = public.current_tenant_id()
);

drop policy if exists "staff payouts update" on public.staff_profit_payouts;
create policy "staff payouts update"
on public.staff_profit_payouts
for update
using (
  public.is_tenant_admin()
  and tenant_id = public.current_tenant_id()
)
with check (
  public.is_tenant_admin()
  and tenant_id = public.current_tenant_id()
);
