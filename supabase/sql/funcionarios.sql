-- ===== Funcionários (Staff) =====
-- Execute este SQL no Supabase (SQL Editor) no projeto correto.

-- 1) Helper: tenant_id efetivo (owner = auth.uid(), staff = app_metadata.tenant_id)
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

-- 2) Tabela de funcionários (mapeia auth_user_id -> tenant_id)
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

-- Ensure new columns exist (when table already existed)
alter table public.staff_members add column if not exists commission_pct numeric not null default 0;

create index if not exists staff_members_tenant_id_idx on public.staff_members(tenant_id);

-- 3) RLS + Policies
alter table public.staff_members enable row level security;

-- Owner (tenant) pode ver e gerenciar tudo
create policy "staff owner select"
on public.staff_members
for select
using (tenant_id = public.current_tenant_id());

create policy "staff owner insert"
on public.staff_members
for insert
with check (tenant_id = public.current_tenant_id());

create policy "staff owner update"
on public.staff_members
for update
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

create policy "staff owner delete"
on public.staff_members
for delete
using (tenant_id = public.current_tenant_id());

-- Funcionário pode ver o próprio registro (pra debug/tela de perfil, opcional)
create policy "staff self select"
on public.staff_members
for select
using (auth_user_id = auth.uid());

-- 4) (Recomendado) Ajustar suas tabelas principais para permitir staff
-- A ideia é: manter sua coluna atual de multi-tenant (user_id) como o tenant_id (do dono).
-- Para staff funcionar, troque suas policies de auth.uid() = user_id
-- por: public.current_tenant_id() = user_id  AND (staff ativo)

-- Exemplo para clientes (adapte para suas tabelas: emprestimos, parcelas, etc):
-- drop policy if exists "clientes select" on public.clientes;
-- create policy "clientes select"
-- on public.clientes
-- for select
-- using (user_id = public.current_tenant_id());

-- drop policy if exists "clientes insert" on public.clientes;
-- create policy "clientes insert"
-- on public.clientes
-- for insert
-- with check (user_id = public.current_tenant_id());

-- 5) (Opcional) Bloquear acesso se staff estiver inativo
-- Em vez disso, você pode checar active no app_metadata.active ou numa tabela.
-- Exemplo (mais rígido): exigir que (auth.uid() = current_tenant_id()) OU exista staff_members ativo
-- create or replace function public.is_tenant_member_active()
-- returns boolean
-- language sql
-- stable
-- as $$
--   select
--     auth.uid() = public.current_tenant_id()
--     or exists (
--       select 1 from public.staff_members s
--       where s.tenant_id = public.current_tenant_id()
--         and s.auth_user_id = auth.uid()
--         and s.active = true
--     );
-- $$;
--
-- e nas policies: using (public.is_tenant_member_active() and user_id = public.current_tenant_id());
