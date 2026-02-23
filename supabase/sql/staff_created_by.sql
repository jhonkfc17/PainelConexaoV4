-- ==========================================================
-- CREATED_BY (origem do cadastro) + triggers
-- - Permite comissão por empréstimos cadastrados pelo funcionário
-- ==========================================================

-- 1) Colunas
alter table public.clientes
  add column if not exists created_by uuid;

alter table public.emprestimos
  add column if not exists created_by uuid;

-- 2) Trigger: seta created_by apenas no INSERT (não altera no update)
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

drop trigger if exists trg_set_created_by_clientes on public.clientes;
create trigger trg_set_created_by_clientes
before insert on public.clientes
for each row execute function public.set_created_by_on_insert();

drop trigger if exists trg_set_created_by_emprestimos on public.emprestimos;
create trigger trg_set_created_by_emprestimos
before insert on public.emprestimos
for each row execute function public.set_created_by_on_insert();

-- 3) Índices (opcional, mas ajuda bastante)
create index if not exists clientes_created_by_idx on public.clientes(created_by);
create index if not exists emprestimos_created_by_idx on public.emprestimos(created_by);
