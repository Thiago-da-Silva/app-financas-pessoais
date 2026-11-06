-- =====================================================================
-- "Desconsiderar dos saldos": lançamentos que continuam na lista,
-- mas não entram nos cards de saldo (entradas, saídas, realizado, previsto).
-- Pode ser executado mais de uma vez.
-- =====================================================================

alter table public.transactions add column if not exists ignored boolean not null default false;
alter table public.series add column if not exists ignored boolean not null default false;
