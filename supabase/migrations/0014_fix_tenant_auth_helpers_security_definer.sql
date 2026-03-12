create or replace function public.is_tenant_member_active()
returns boolean
language sql
stable
security definer
set search_path = public
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
security definer
set search_path = public
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
