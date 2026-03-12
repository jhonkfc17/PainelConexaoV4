drop policy if exists "staff select by tenant" on public.staff_members;
drop policy if exists "staff select admin by tenant" on public.staff_members;
drop policy if exists "staff select self" on public.staff_members;

create policy "staff select admin by tenant"
on public.staff_members
for select
using (
  public.is_tenant_admin()
  and tenant_id = public.current_tenant_id()
);

create policy "staff select self"
on public.staff_members
for select
using (
  auth.uid() is not null
  and tenant_id = public.current_tenant_id()
  and auth_user_id = auth.uid()
);
