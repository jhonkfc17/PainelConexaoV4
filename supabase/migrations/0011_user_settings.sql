create table if not exists public.user_settings (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_settings_tenant_idx on public.user_settings(tenant_id);

create or replace function public.set_user_settings_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Acesso negado';
  end if;

  new.auth_user_id := auth.uid();
  new.tenant_id := public.current_tenant_id();
  new.payload := coalesce(new.payload, '{}'::jsonb);
  return new;
end;
$$;

drop trigger if exists trg_user_settings_identity on public.user_settings;
create trigger trg_user_settings_identity
before insert or update on public.user_settings
for each row execute function public.set_user_settings_identity();

drop trigger if exists trg_user_settings_updated_at on public.user_settings;
create trigger trg_user_settings_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

alter table public.user_settings enable row level security;

drop policy if exists "user settings select own" on public.user_settings;
create policy "user settings select own"
on public.user_settings
for select
using (
  auth.uid() is not null
  and auth_user_id = auth.uid()
  and tenant_id = public.current_tenant_id()
);

drop policy if exists "user settings insert own" on public.user_settings;
create policy "user settings insert own"
on public.user_settings
for insert
with check (
  auth.uid() is not null
  and auth_user_id = auth.uid()
  and tenant_id = public.current_tenant_id()
);

drop policy if exists "user settings update own" on public.user_settings;
create policy "user settings update own"
on public.user_settings
for update
using (
  auth.uid() is not null
  and auth_user_id = auth.uid()
  and tenant_id = public.current_tenant_id()
)
with check (
  auth.uid() is not null
  and auth_user_id = auth.uid()
  and tenant_id = public.current_tenant_id()
);
