create table if not exists public.staff_wallet_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  staff_member_id uuid not null references public.staff_members(id) on delete restrict,
  staff_auth_user_id uuid not null references public.staff_members(auth_user_id) on delete restrict,
  valor numeric not null check (valor <> 0),
  applied_at date not null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null default auth.uid(),
  estornado_em timestamptz null,
  estornado_por uuid null,
  estornado_motivo text null
);

create index if not exists staff_wallet_adjustments_tenant_idx on public.staff_wallet_adjustments(tenant_id);
create index if not exists staff_wallet_adjustments_staff_idx on public.staff_wallet_adjustments(staff_member_id, estornado_em);
create index if not exists staff_wallet_adjustments_applied_at_idx on public.staff_wallet_adjustments(applied_at desc, created_at desc);

drop trigger if exists trg_staff_wallet_adjustments_updated_at on public.staff_wallet_adjustments;
create trigger trg_staff_wallet_adjustments_updated_at
before update on public.staff_wallet_adjustments
for each row execute function public.set_updated_at();

create or replace function public.staff_available_profit_balance(
  p_staff_member_id uuid,
  p_exclude_payout_id uuid default null,
  p_exclude_adjustment_id uuid default null
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
  v_adjustment_total numeric := 0;
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

  select coalesce(sum(a.valor), 0)
  into v_adjustment_total
  from public.staff_wallet_adjustments a
  where a.tenant_id = v_tenant
    and a.staff_member_id = p_staff_member_id
    and a.estornado_em is null
    and (p_exclude_adjustment_id is null or a.id <> p_exclude_adjustment_id);

  return round(v_commission_total - coalesce(v_paid_total, 0) + coalesce(v_adjustment_total, 0), 2);
end;
$$;

create or replace function public.validate_staff_wallet_adjustment()
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
    raise exception 'Funcionario nao encontrado para este ajuste.';
  end if;

  new.tenant_id := v_staff.tenant_id;
  new.staff_auth_user_id := v_staff.auth_user_id;
  new.created_by := coalesce(new.created_by, auth.uid());
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');

  if new.estornado_em is not null then
    return new;
  end if;

  if coalesce(new.valor, 0) = 0 then
    raise exception 'Informe um valor diferente de zero para o ajuste.';
  end if;

  if new.valor < 0 then
    v_available := public.staff_available_profit_balance(
      new.staff_member_id,
      null,
      case when tg_op = 'UPDATE' then new.id else null end
    );

    if abs(new.valor) > v_available + 0.00001 then
      raise exception 'Debito acima do saldo disponivel deste funcionario.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_staff_wallet_adjustments_validate on public.staff_wallet_adjustments;
create trigger trg_staff_wallet_adjustments_validate
before insert or update on public.staff_wallet_adjustments
for each row execute function public.validate_staff_wallet_adjustment();

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
  adjustment_total numeric,
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
  v_adjustment_total numeric := 0;
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

    select coalesce(sum(a.valor), 0)
    into v_adjustment_total
    from public.staff_wallet_adjustments a
    where a.tenant_id = v_tenant
      and a.staff_member_id = r_staff.id
      and a.estornado_em is null;

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
    adjustment_total := round(coalesce(v_adjustment_total, 0), 2);
    available_balance := round(coalesce(v_commission_profit, 0) - coalesce(v_paid_total, 0) + coalesce(v_adjustment_total, 0), 2);
    payout_count := coalesce(v_payout_count, 0);
    last_payout_at := v_last_payout_at;
    return next;
  end loop;
end;
$$;

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
  adjustment_total numeric,
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
  v_adjustment_total numeric := 0;
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

  select coalesce(sum(a.valor), 0)
  into v_adjustment_total
  from public.staff_wallet_adjustments a
  where a.tenant_id = v_tenant
    and a.staff_member_id = v_staff.id
    and a.estornado_em is null;

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
  adjustment_total := round(coalesce(v_adjustment_total, 0), 2);
  available_balance := round(coalesce(v_commission_profit, 0) - coalesce(v_paid_total, 0) + coalesce(v_adjustment_total, 0), 2);
  payout_count := coalesce(v_payout_count, 0);
  last_payout_at := v_last_payout_at;
  return next;
end;
$$;

alter table public.staff_wallet_adjustments enable row level security;

drop policy if exists "staff wallet adjustments select" on public.staff_wallet_adjustments;
create policy "staff wallet adjustments select"
on public.staff_wallet_adjustments
for select
using (
  (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  )
  or (
    auth.uid() = staff_auth_user_id
    and tenant_id = public.current_tenant_id()
  )
);

drop policy if exists "staff wallet adjustments insert" on public.staff_wallet_adjustments;
create policy "staff wallet adjustments insert"
on public.staff_wallet_adjustments
for insert
with check (
  public.is_tenant_admin()
  and tenant_id = public.current_tenant_id()
);

drop policy if exists "staff wallet adjustments update" on public.staff_wallet_adjustments;
create policy "staff wallet adjustments update"
on public.staff_wallet_adjustments
for update
using (
  public.is_tenant_admin()
  and tenant_id = public.current_tenant_id()
)
with check (
  public.is_tenant_admin()
  and tenant_id = public.current_tenant_id()
);
