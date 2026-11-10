-- =====================================================================
-- Verificação de segurança (RLS) — rode no SQL Editor do Supabase.
-- NÃO altera nenhum dado: as tentativas de alteração são "name = name"
-- (sem mudança real) e devem afetar 0 linhas.
--
-- Simula três pessoas:
--   1. visitante sem login (anon)
--   2. outra pessoa logada (um usuário inventado, sem dados)
--   3. o dono dos dados (o primeiro usuário cadastrado) — controle do teste
--
-- Resultado esperado: coluna "ok" = true em todas as linhas.
-- =====================================================================

create temp table if not exists rls_result (teste text, tabela text, linhas bigint, esperado text, ok boolean);
truncate rls_result;
grant insert, select on rls_result to anon, authenticated;

-- 1) Visitante sem login -------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', false);
set role anon;
insert into rls_result select 'visitante sem login vê', 'profiles', count(*), '0', count(*) = 0 from public.profiles;
insert into rls_result select 'visitante sem login vê', 'categories', count(*), '0', count(*) = 0 from public.categories;
insert into rls_result select 'visitante sem login vê', 'cards', count(*), '0', count(*) = 0 from public.cards;
insert into rls_result select 'visitante sem login vê', 'series', count(*), '0', count(*) = 0 from public.series;
insert into rls_result select 'visitante sem login vê', 'transactions', count(*), '0', count(*) = 0 from public.transactions;
reset role;

-- 2) Outra pessoa logada (usuário inventado) ------------------------------
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, false);
set role authenticated;
insert into rls_result select 'outra pessoa logada vê', 'profiles', count(*), '0', count(*) = 0 from public.profiles;
insert into rls_result select 'outra pessoa logada vê', 'categories', count(*), '0', count(*) = 0 from public.categories;
insert into rls_result select 'outra pessoa logada vê', 'cards', count(*), '0', count(*) = 0 from public.cards;
insert into rls_result select 'outra pessoa logada vê', 'series', count(*), '0', count(*) = 0 from public.series;
insert into rls_result select 'outra pessoa logada vê', 'transactions', count(*), '0', count(*) = 0 from public.transactions;
with u as (update public.transactions set name = name returning 1)
  insert into rls_result select 'outra pessoa logada altera', 'transactions', count(*), '0', count(*) = 0 from u;
with u as (update public.cards set name = name returning 1)
  insert into rls_result select 'outra pessoa logada altera', 'cards', count(*), '0', count(*) = 0 from u;
with u as (update public.profiles set name = name returning 1)
  insert into rls_result select 'outra pessoa logada altera', 'profiles', count(*), '0', count(*) = 0 from u;
reset role;

-- 3) Dono dos dados (controle: precisa ver os próprios dados) -------------
select set_config('request.jwt.claims',
  (select json_build_object('sub', id::text, 'role', 'authenticated')::text from auth.users order by created_at limit 1), false);
set role authenticated;
insert into rls_result select 'dono vê os próprios dados', 'categories', count(*), '> 0', count(*) > 0 from public.categories;
insert into rls_result select 'dono vê só o próprio perfil', 'profiles', count(*), '1', count(*) = 1 from public.profiles;
reset role;

select set_config('request.jwt.claims', '', false);
select * from rls_result;
