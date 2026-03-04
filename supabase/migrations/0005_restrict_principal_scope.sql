-- Restringe leitura/escrita ao usuário autenticado principal (auth.uid()).
-- Objetivo: impedir visualização de dados criados por outros usuários.

-- CLIENTES
drop policy if exists "clientes select" on public.clientes;
create policy "clientes select"
on public.clientes
for select
using (
  auth.uid() is not null
  and (
    created_by = auth.uid()
    or (created_by is null and user_id = auth.uid())
  )
);

drop policy if exists "clientes insert" on public.clientes;
create policy "clientes insert"
on public.clientes
for insert
with check (
  auth.uid() is not null
  and created_by = auth.uid()
  and user_id = auth.uid()
);

drop policy if exists "clientes update" on public.clientes;
create policy "clientes update"
on public.clientes
for update
using (
  auth.uid() is not null
  and (
    created_by = auth.uid()
    or (created_by is null and user_id = auth.uid())
  )
)
with check (
  auth.uid() is not null
  and (
    created_by = auth.uid()
    or (created_by is null and user_id = auth.uid())
  )
);

drop policy if exists "clientes delete" on public.clientes;
create policy "clientes delete"
on public.clientes
for delete
using (
  auth.uid() is not null
  and (
    created_by = auth.uid()
    or (created_by is null and user_id = auth.uid())
  )
);

-- EMPRESTIMOS
drop policy if exists "emprestimos select" on public.emprestimos;
create policy "emprestimos select"
on public.emprestimos
for select
using (
  auth.uid() is not null
  and (
    created_by = auth.uid()
    or (created_by is null and user_id = auth.uid())
  )
);

drop policy if exists "emprestimos insert" on public.emprestimos;
create policy "emprestimos insert"
on public.emprestimos
for insert
with check (
  auth.uid() is not null
  and created_by = auth.uid()
  and user_id = auth.uid()
);

drop policy if exists "emprestimos update" on public.emprestimos;
create policy "emprestimos update"
on public.emprestimos
for update
using (
  auth.uid() is not null
  and (
    created_by = auth.uid()
    or (created_by is null and user_id = auth.uid())
  )
)
with check (
  auth.uid() is not null
  and (
    created_by = auth.uid()
    or (created_by is null and user_id = auth.uid())
  )
);

drop policy if exists "emprestimos delete" on public.emprestimos;
create policy "emprestimos delete"
on public.emprestimos
for delete
using (
  auth.uid() is not null
  and (
    created_by = auth.uid()
    or (created_by is null and user_id = auth.uid())
  )
);

-- PARCELAS (escopo pelo empréstimo dono do usuário)
drop policy if exists "parcelas select" on public.parcelas;
create policy "parcelas select"
on public.parcelas
for select
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.emprestimos e
    where e.id = parcelas.emprestimo_id
      and (
        e.created_by = auth.uid()
        or (e.created_by is null and e.user_id = auth.uid())
      )
  )
);

drop policy if exists "parcelas insert" on public.parcelas;
create policy "parcelas insert"
on public.parcelas
for insert
with check (
  auth.uid() is not null
  and user_id = auth.uid()
  and exists (
    select 1
    from public.emprestimos e
    where e.id = parcelas.emprestimo_id
      and (
        e.created_by = auth.uid()
        or (e.created_by is null and e.user_id = auth.uid())
      )
  )
);

drop policy if exists "parcelas update" on public.parcelas;
create policy "parcelas update"
on public.parcelas
for update
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.emprestimos e
    where e.id = parcelas.emprestimo_id
      and (
        e.created_by = auth.uid()
        or (e.created_by is null and e.user_id = auth.uid())
      )
  )
)
with check (
  auth.uid() is not null
  and exists (
    select 1
    from public.emprestimos e
    where e.id = parcelas.emprestimo_id
      and (
        e.created_by = auth.uid()
        or (e.created_by is null and e.user_id = auth.uid())
      )
  )
);

drop policy if exists "parcelas delete" on public.parcelas;
create policy "parcelas delete"
on public.parcelas
for delete
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.emprestimos e
    where e.id = parcelas.emprestimo_id
      and (
        e.created_by = auth.uid()
        or (e.created_by is null and e.user_id = auth.uid())
      )
  )
);

-- PAGAMENTOS (escopo pelo empréstimo)
drop policy if exists "pagamentos select" on public.pagamentos;
create policy "pagamentos select"
on public.pagamentos
for select
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.emprestimos e
    where e.id = pagamentos.emprestimo_id
      and (
        e.created_by = auth.uid()
        or (e.created_by is null and e.user_id = auth.uid())
      )
  )
);

drop policy if exists "pagamentos insert" on public.pagamentos;
create policy "pagamentos insert"
on public.pagamentos
for insert
with check (
  auth.uid() is not null
  and created_by = auth.uid()
  and user_id = auth.uid()
  and exists (
    select 1
    from public.emprestimos e
    where e.id = pagamentos.emprestimo_id
      and (
        e.created_by = auth.uid()
        or (e.created_by is null and e.user_id = auth.uid())
      )
  )
);

drop policy if exists "pagamentos update" on public.pagamentos;
create policy "pagamentos update"
on public.pagamentos
for update
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.emprestimos e
    where e.id = pagamentos.emprestimo_id
      and (
        e.created_by = auth.uid()
        or (e.created_by is null and e.user_id = auth.uid())
      )
  )
)
with check (
  auth.uid() is not null
  and exists (
    select 1
    from public.emprestimos e
    where e.id = pagamentos.emprestimo_id
      and (
        e.created_by = auth.uid()
        or (e.created_by is null and e.user_id = auth.uid())
      )
  )
);

drop policy if exists "pagamentos delete" on public.pagamentos;
create policy "pagamentos delete"
on public.pagamentos
for delete
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.emprestimos e
    where e.id = pagamentos.emprestimo_id
      and (
        e.created_by = auth.uid()
        or (e.created_by is null and e.user_id = auth.uid())
      )
  )
);

-- Views devem respeitar RLS das tabelas-base.
do $$
begin
  if exists (select 1 from pg_views where schemaname = 'public' and viewname = 'v_emprestimos_status') then
    execute 'alter view public.v_emprestimos_status set (security_invoker = true)';
  end if;
  if exists (select 1 from pg_views where schemaname = 'public' and viewname = 'v_dashboard_metrics') then
    execute 'alter view public.v_dashboard_metrics set (security_invoker = true)';
  end if;
  if exists (select 1 from pg_views where schemaname = 'public' and viewname = 'v_dashboard_metrics_30d') then
    execute 'alter view public.v_dashboard_metrics_30d set (security_invoker = true)';
  end if;
  if exists (select 1 from pg_views where schemaname = 'public' and viewname = 'v_dashboard_lucro_mensal') then
    execute 'alter view public.v_dashboard_lucro_mensal set (security_invoker = true)';
  end if;
exception
  when others then
    raise notice 'Não foi possível ajustar security_invoker das views: %', sqlerrm;
end $$;
