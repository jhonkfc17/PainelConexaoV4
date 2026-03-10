alter table public.staff_profit_payouts
  add column if not exists comprovante_data_url text null,
  add column if not exists comprovante_nome text null,
  add column if not exists comprovante_mime_type text null;
