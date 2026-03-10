alter table public.parcelas
  add column if not exists descricao text null,
  add column if not exists referencia_parcela_numero int null;
