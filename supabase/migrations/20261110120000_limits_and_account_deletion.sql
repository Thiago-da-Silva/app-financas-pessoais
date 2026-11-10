-- =====================================================================
-- Limites contra flood + exclusão de conta (LGPD)
-- Pode ser executado mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Limites de tamanho e de valor
--    (NOT VALID: valem para dados novos/alterados, sem travar os antigos)
-- ---------------------------------------------------------------------
alter table public.transactions drop constraint if exists transactions_amount_max;
alter table public.transactions add constraint transactions_amount_max
  check (amount <= 100000000000) not valid; -- até R$ 1 bilhão

alter table public.series drop constraint if exists series_amount_max;
alter table public.series add constraint series_amount_max
  check (amount <= 100000000000) not valid;

alter table public.cards drop constraint if exists cards_limit_max;
alter table public.cards add constraint cards_limit_max
  check (credit_limit is null or credit_limit <= 100000000000) not valid;

alter table public.categories drop constraint if exists categories_budget_max;
alter table public.categories add constraint categories_budget_max
  check (budget is null or budget <= 100000000000) not valid;

alter table public.profiles drop constraint if exists profiles_initial_balance_range;
alter table public.profiles add constraint profiles_initial_balance_range
  check (initial_balance between -100000000000 and 100000000000) not valid;

-- ---------------------------------------------------------------------
-- 2) Limite de quantidade de registros por usuário (contra flood pela API)
-- ---------------------------------------------------------------------
create index if not exists categories_user_idx on public.categories (user_id);
create index if not exists cards_user_idx on public.cards (user_id);
create index if not exists series_user_idx on public.series (user_id);

create or replace function public.enforce_row_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  max_rows integer := tg_argv[0]::integer;
  current_rows integer;
begin
  execute format('select count(*) from public.%I where user_id = $1', tg_table_name)
    into current_rows using new.user_id;
  if current_rows >= max_rows then
    raise exception 'Limite de % registros atingido em %', max_rows, tg_table_name using errcode = '54000';
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_row_limit on public.transactions;
create trigger transactions_row_limit before insert on public.transactions
  for each row execute function public.enforce_row_limit(30000);

drop trigger if exists series_row_limit on public.series;
create trigger series_row_limit before insert on public.series
  for each row execute function public.enforce_row_limit(3000);

drop trigger if exists categories_row_limit on public.categories;
create trigger categories_row_limit before insert on public.categories
  for each row execute function public.enforce_row_limit(200);

drop trigger if exists cards_row_limit on public.cards;
create trigger cards_row_limit before insert on public.cards
  for each row execute function public.enforce_row_limit(50);

revoke execute on function public.enforce_row_limit() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) Excluir minha conta (LGPD)
--    Apaga todos os dados do usuário logado e o próprio login.
--    As fotos do Storage são apagadas pelo app antes de chamar esta função.
-- ---------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;
  -- ordem explícita por causa das referências entre tabelas
  delete from public.transactions where user_id = uid;
  delete from public.series where user_id = uid;
  delete from public.cards where user_id = uid;
  delete from public.categories where user_id = uid;
  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
