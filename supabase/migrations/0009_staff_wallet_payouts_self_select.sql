drop policy if exists "staff payouts self select" on public.staff_profit_payouts;
create policy "staff payouts self select"
on public.staff_profit_payouts
for select
using (
  auth.uid() is not null
  and tenant_id = public.current_tenant_id()
  and staff_auth_user_id = auth.uid()
);
