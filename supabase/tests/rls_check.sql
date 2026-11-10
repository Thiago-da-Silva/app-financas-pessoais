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
-- Resultado esperado: coluna "ok" = true em todas as linhas (linhas com problema aparecem primeiro).
-- Requer as migrations até 20261110120000_limits_and_account_deletion.sql.
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

-- 4) Configuração do banco (como administrador) ---------------------------
insert into rls_result
select 'RLS ligado', c.relname, (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname),
       'RLS ativo e 1+ política', c.relrowsecurity and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r';

insert into rls_result
select 'visitante pode executar função', f, null, 'false', not has_function_privilege('anon', f, 'execute')
from unnest(array['public.handle_new_user()', 'public.check_owner_refs()', 'public.enforce_row_limit()', 'public.delete_my_account()']) as f
where to_regprocedure(f) is not null;

insert into rls_result
select 'usuário logado pode executar função interna', f, null, 'false', not has_function_privilege('authenticated', f, 'execute')
from unnest(array['public.handle_new_user()', 'public.check_owner_refs()', 'public.enforce_row_limit()']) as f
where to_regprocedure(f) is not null;

insert into rls_result
select 'política de listagem pública das fotos removida', 'storage.objects', count(*), '0', count(*) = 0
from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatar public read';

insert into rls_result
select 'gatilhos de proteção instalados', 'triggers', count(*), '6',
       count(*) = 6
from pg_trigger
where not tgisinternal and tgname in ('transactions_owner_refs', 'series_owner_refs', 'transactions_row_limit',
                                       'series_row_limit', 'categories_row_limit', 'cards_row_limit');

-- guarda IDs do dono para os testes de tentativa de invasão
select set_config('test.owner_id', coalesce((select id::text from auth.users order by created_at limit 1), ''), false);
select set_config('test.owner_card', coalesce((select id::text from public.cards
  where user_id::text = current_setting('test.owner_id') limit 1), ''), false);

-- 5) Visitante sem login tentando listar fotos ------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', false);
set role anon;
insert into rls_result select 'visitante sem login lista fotos', 'storage.objects', count(*), '0', count(*) = 0
from storage.objects where bucket_id = 'avatars';
reset role;

-- 6) Outra pessoa logada tentando usar o cartão do dono --------------------
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, false);
set role authenticated;
do $$
declare
  card_id text := current_setting('test.owner_card', true);
  outcome boolean;
begin
  if card_id is null or card_id = '' then
    insert into rls_result values ('outra pessoa usa cartão do dono', 'transactions', null, 'bloqueado', null);
    return;
  end if;
  begin
    insert into public.transactions (kind, name, amount, date, month, payment_method, card_id)
    values ('expense', 'teste invasao', 1, current_date, date_trunc('month', current_date), 'card', card_id::uuid);
    raise exception 'inseriu';
  exception when others then
    outcome := sqlerrm <> 'inseriu';
  end;
  insert into rls_result values ('outra pessoa usa cartão do dono', 'transactions', null, 'bloqueado', outcome);
end $$;
reset role;

-- 7) Dono tentando gravar textos acima do limite (nada fica salvo) ---------
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.owner_id'), 'role', 'authenticated')::text, false);
set role authenticated;
do $$
declare
  outcome boolean;
begin
  begin
    insert into public.categories (name, color) values (repeat('x', 61), '#000000');
    raise exception 'inseriu';
  exception when others then
    outcome := sqlerrm <> 'inseriu';
  end;
  insert into rls_result values ('nome de categoria com 61 caracteres', 'categories', null, 'bloqueado', outcome);

  begin
    insert into public.transactions (kind, name, description, amount, date, month, payment_method)
    values ('expense', 'teste', repeat('x', 1001), 1, current_date, date_trunc('month', current_date), 'pix');
    raise exception 'inseriu';
  exception when others then
    outcome := sqlerrm <> 'inseriu';
  end;
  insert into rls_result values ('descrição com 1001 caracteres', 'transactions', null, 'bloqueado', outcome);

  begin
    insert into public.transactions (kind, name, amount, date, month, payment_method)
    values ('expense', 'teste', 100000000001, current_date, date_trunc('month', current_date), 'pix');
    raise exception 'inseriu';
  exception when others then
    outcome := sqlerrm <> 'inseriu';
  end;
  insert into rls_result values ('valor acima de R$ 1 bilhão', 'transactions', null, 'bloqueado', outcome);
end $$;
reset role;

select set_config('request.jwt.claims', '', false);
select * from rls_result order by ok nulls first, teste;
