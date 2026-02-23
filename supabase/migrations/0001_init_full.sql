-- ============================================================
-- SUPABASE DATABASE SETUP (do zero) - compatível com este projeto
-- Execute via Supabase CLI migrations ou no SQL Editor.
-- ============================================================

create extension if not exists pgcrypto;

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid, null),
    auth.uid()
  );
$$;

create or replace function public.is_tenant_member_active()
returns boolean
language sql
stable
as $$
  select
    auth.uid() = public.current_tenant_id()
    or exists (
      select 1
      from public.staff_members s
      where s.tenant_id = public.current_tenant_id()
        and s.auth_user_id = auth.uid()
        and s.active = true
    );
$$;

create or replace function public.is_tenant_admin()
returns boolean
language sql
stable
as $$
  select
    auth.uid() = public.current_tenant_id()
    or exists (
      select 1
      from public.staff_members s
      where s.tenant_id = public.current_tenant_id()
        and s.auth_user_id = auth.uid()
        and s.active = true
        and s.role = 'admin'
    );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_created_by_on_insert()
returns trigger
language plpgsql
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

create or replace function public.set_tenant_columns_on_insert()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is null then
    new.user_id := public.current_tenant_id();
  end if;

  if (to_jsonb(new) ? 'tenant_id') then
    if new.tenant_id is null then
      new.tenant_id := new.user_id;
    end if;
  end if;

  return new;
end;
$$;

-- STAFF
create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  auth_user_id uuid not null unique,
  nome text,
  email text not null,
  role text not null default 'staff' check (role in ('staff','admin')),
  permissions jsonb not null default '{}'::jsonb,
  commission_pct numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists staff_members_tenant_id_idx on public.staff_members(tenant_id);

alter table public.staff_members enable row level security;

drop policy if exists "staff select by tenant" on public.staff_members;
create policy "staff select by tenant"
on public.staff_members
for select
using (tenant_id = public.current_tenant_id());

drop policy if exists "staff admin insert" on public.staff_members;
create policy "staff admin insert"
on public.staff_members
for insert
with check (public.is_tenant_admin() and tenant_id = public.current_tenant_id());

drop policy if exists "staff admin update" on public.staff_members;
create policy "staff admin update"
on public.staff_members
for update
using (public.is_tenant_admin() and tenant_id = public.current_tenant_id())
with check (public.is_tenant_admin() and tenant_id = public.current_tenant_id());

drop policy if exists "staff admin delete" on public.staff_members;
create policy "staff admin delete"
on public.staff_members
for delete
using (public.is_tenant_admin() and tenant_id = public.current_tenant_id());

-- CLIENTES
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  created_by uuid null,
  nome text null,
  cpf text null,
  telefone text null,
  email text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clientes_user_id_idx on public.clientes(user_id);
create index if not exists clientes_created_by_idx on public.clientes(created_by);

drop trigger if exists trg_clientes_updated_at on public.clientes;
create trigger trg_clientes_updated_at
before update on public.clientes
for each row execute function public.set_updated_at();

drop trigger if exists trg_clientes_created_by on public.clientes;
create trigger trg_clientes_created_by
before insert on public.clientes
for each row execute function public.set_created_by_on_insert();

drop trigger if exists trg_clientes_tenant_cols on public.clientes;
create trigger trg_clientes_tenant_cols
before insert on public.clientes
for each row execute function public.set_tenant_columns_on_insert();

alter table public.clientes enable row level security;

drop policy if exists "clientes select" on public.clientes;
create policy "clientes select"
on public.clientes
for select
using (public.is_tenant_member_active() and user_id = public.current_tenant_id());

drop policy if exists "clientes insert" on public.clientes;
create policy "clientes insert"
on public.clientes
for insert
with check (public.is_tenant_member_active() and user_id = public.current_tenant_id());

drop policy if exists "clientes update" on public.clientes;
create policy "clientes update"
on public.clientes
for update
using (public.is_tenant_member_active() and user_id = public.current_tenant_id())
with check (public.is_tenant_member_active() and user_id = public.current_tenant_id());

drop policy if exists "clientes delete" on public.clientes;
create policy "clientes delete"
on public.clientes
for delete
using (public.is_tenant_member_active() and user_id = public.current_tenant_id());

-- EMPRESTIMOS
create table if not exists public.emprestimos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  created_by uuid null,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  cliente_nome text null,
  cliente_contato text null,
  status text not null default 'ativo',
  modalidade text null,
  payload jsonb null default '{}'::jsonb,
  quitado_em timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists emprestimos_user_id_idx on public.emprestimos(user_id);
create index if not exists emprestimos_cliente_id_idx on public.emprestimos(cliente_id);
create index if not exists emprestimos_created_by_idx on public.emprestimos(created_by);

drop trigger if exists trg_emprestimos_updated_at on public.emprestimos;
create trigger trg_emprestimos_updated_at
before update on public.emprestimos
for each row execute function public.set_updated_at();

drop trigger if exists trg_emprestimos_created_by on public.emprestimos;
create trigger trg_emprestimos_created_by
before insert on public.emprestimos
for each row execute function public.set_created_by_on_insert();

drop trigger if exists trg_emprestimos_tenant_cols on public.emprestimos;
create trigger trg_emprestimos_tenant_cols
before insert on public.emprestimos
for each row execute function public.set_tenant_columns_on_insert();

alter table public.emprestimos enable row level security;

drop policy if exists "emprestimos select" on public.emprestimos;
create policy "emprestimos select"
on public.emprestimos
for select
using (public.is_tenant_member_active() and user_id = public.current_tenant_id());

drop policy if exists "emprestimos insert" on public.emprestimos;
create policy "emprestimos insert"
on public.emprestimos
for insert
with check (public.is_tenant_member_active() and user_id = public.current_tenant_id());

drop policy if exists "emprestimos update" on public.emprestimos;
create policy "emprestimos update"
on public.emprestimos
for update
using (public.is_tenant_member_active() and user_id = public.current_tenant_id())
with check (public.is_tenant_member_active() and user_id = public.current_tenant_id());

drop policy if exists "emprestimos delete" on public.emprestimos;
create policy "emprestimos delete"
on public.emprestimos
for delete
using (public.is_tenant_member_active() and user_id = public.current_tenant_id());

-- PARCELAS
create table if not exists public.parcelas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  emprestimo_id uuid not null references public.emprestimos(id) on delete cascade,
  numero int not null,
  valor numeric null default 0,
  vencimento date null,
  pago boolean not null default false,
  valor_pago numeric null default 0,
  juros_atraso numeric null,
  valor_pago_acumulado numeric not null default 0,
  saldo_restante numeric not null default 0,
  pago_em date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parcelas_unique_num unique (emprestimo_id, numero)
);

create index if not exists parcelas_user_id_idx on public.parcelas(user_id);
create index if not exists parcelas_emprestimo_idx on public.parcelas(emprestimo_id);
create index if not exists parcelas_vencimento_idx on public.parcelas(vencimento);
create index if not exists parcelas_pago_idx on public.parcelas(pago);

drop trigger if exists trg_parcelas_updated_at on public.parcelas;
create trigger trg_parcelas_updated_at
before update on public.parcelas
for each row execute function public.set_updated_at();

drop trigger if exists trg_parcelas_tenant_cols on public.parcelas;
create trigger trg_parcelas_tenant_cols
before insert on public.parcelas
for each row execute function public.set_tenant_columns_on_insert();

alter table public.parcelas enable row level security;

drop policy if exists "parcelas select" on public.parcelas;
create policy "parcelas select"
on public.parcelas
for select
using (public.is_tenant_member_active() and user_id = public.current_tenant_id());

drop policy if exists "parcelas insert" on public.parcelas;
create policy "parcelas insert"
on public.parcelas
for insert
with check (public.is_tenant_member_active() and user_id = public.current_tenant_id());

drop policy if exists "parcelas update" on public.parcelas;
create policy "parcelas update"
on public.parcelas
for update
using (public.is_tenant_member_active() and user_id = public.current_tenant_id())
with check (public.is_tenant_member_active() and user_id = public.current_tenant_id());

drop policy if exists "parcelas delete" on public.parcelas;
create policy "parcelas delete"
on public.parcelas
for delete
using (public.is_tenant_member_active() and user_id = public.current_tenant_id());

-- PAGAMENTOS
create table if not exists public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  tenant_id uuid null,
  emprestimo_id uuid not null references public.emprestimos(id) on delete cascade,
  parcela_id uuid null references public.parcelas(id) on delete set null,
  parcela_numero int null,
  tipo text not null,
  valor numeric not null default 0,
  juros_atraso numeric null,
  data_pagamento date not null,
  flags jsonb null,
  snapshot jsonb null,
  created_at timestamptz not null default now(),
  created_by uuid null default auth.uid(),
  estornado_em timestamptz null,
  estornado_por uuid null,
  estornado_motivo text null,
  snapshot_parcela jsonb null,
  snapshot_emprestimo jsonb null,
  snapshot_parcelas jsonb null
);

alter table public.pagamentos
  add constraint pagamentos_tipo_check
  check (
    tipo in (
      'PARCELA_INTEGRAL','ADIANTAMENTO_MANUAL','SALDO_PARCIAL','QUITACAO_TOTAL','DESCONTO',
      'JUROS_SOMENTE','JUROS_PARCIAL','JUROS','PARCELA','AMBOS'
    )
  );

create index if not exists pagamentos_user_id_idx on public.pagamentos(user_id);
create index if not exists pagamentos_tenant_id_idx on public.pagamentos(tenant_id);
create index if not exists pagamentos_emprestimo_idx on public.pagamentos(emprestimo_id);
create index if not exists pagamentos_parcela_idx on public.pagamentos(parcela_id);

drop trigger if exists trg_pagamentos_tenant_cols on public.pagamentos;
create trigger trg_pagamentos_tenant_cols
before insert on public.pagamentos
for each row execute function public.set_tenant_columns_on_insert();

alter table public.pagamentos enable row level security;

drop policy if exists "pagamentos select" on public.pagamentos;
create policy "pagamentos select"
on public.pagamentos
for select
using (public.is_tenant_member_active() and user_id = public.current_tenant_id());

drop policy if exists "pagamentos insert" on public.pagamentos;
create policy "pagamentos insert"
on public.pagamentos
for insert
with check (public.is_tenant_member_active() and user_id = public.current_tenant_id());

drop policy if exists "pagamentos update" on public.pagamentos;
create policy "pagamentos update"
on public.pagamentos
for update
using (public.is_tenant_member_active() and user_id = public.current_tenant_id())
with check (public.is_tenant_member_active() and user_id = public.current_tenant_id());

drop policy if exists "pagamentos delete" on public.pagamentos;
create policy "pagamentos delete"
on public.pagamentos
for delete
using (public.is_tenant_admin() and user_id = public.current_tenant_id());

-- RPC helpers
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

-- RPC registrar pagamento (V2)
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

  v_tenant := v_emprestimo.user_id;

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

  insert into public.pagamentos (
    user_id,
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

    begin
      v_nova_venc := nullif(coalesce(p_flags->>'nova_data_vencimento',''), '')::date;
    exception when others then
      v_nova_venc := null;
    end;

    if v_nova_venc is not null then
      update public.parcelas
        set vencimento = v_nova_venc,
            updated_at = now()
      where id = v_parcela.id;
    end if;

  elsif p_tipo = 'DESCONTO' then
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

    update public.emprestimos
      set status = 'finalizado',
          quitado_em = now(),
          updated_at = now()
    where id = p_emprestimo_id;
  end if;

  perform public._reavaliar_status_emprestimo(p_emprestimo_id);

  return jsonb_build_object(
    'ok', true,
    'pagamento_id', v_pagamento_id,
    'emprestimo_id', p_emprestimo_id
  );
end;
$$;

-- RPC estornar pagamento (V2)
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
  select * into v_pag from public.pagamentos where id = p_pagamento_id;
  if not found then
    raise exception 'Pagamento não encontrado';
  end if;

  if v_pag.estornado_em is not null then
    raise exception 'Pagamento já estornado';
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

-- Wrappers legacy
create or replace function public.register_payment(
  p_emprestimo_id uuid,
  p_parcela_id uuid,
  p_valor_pago numeric,
  p_juros_pago numeric default 0,
  p_tipo text default 'parcela',
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_parcela_num int;
begin
  select numero into v_parcela_num
  from public.parcelas
  where id = p_parcela_id and emprestimo_id = p_emprestimo_id;

  if v_parcela_num is null then
    raise exception 'Parcela não encontrada';
  end if;

  return public.rpc_registrar_pagamento(
    p_emprestimo_id,
    'PARCELA_INTEGRAL',
    current_date,
    p_valor_pago,
    v_parcela_num,
    p_juros_pago,
    jsonb_build_object('observacao', p_observacao, 'legacy', true)
  );
end;
$$;

create or replace function public.revert_payment(p_pagamento_id uuid)
returns jsonb
language plpgsql
security definer
as $$
begin
  return public.rpc_estornar_pagamento(p_pagamento_id, 'legacy revert', true);
end;
$$;
