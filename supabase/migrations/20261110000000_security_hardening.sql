-- =====================================================================
-- Reforço de segurança
-- 1. Storage: ninguém consegue LISTAR o bucket de fotos (antes qualquer
--    visitante podia listar as pastas = IDs dos usuários). As fotos continuam
--    abrindo pelo link público, que é o que o app usa.
-- 2. Lançamentos/séries só podem apontar para categorias e cartões do próprio
--    usuário (antes o banco aceitava o ID de um cartão de outra pessoa).
-- 3. Função interna do gatilho de cadastro não pode ser chamada pela API.
-- 4. Limites de tamanho para textos.
-- Pode ser executado mais de uma vez.
-- =====================================================================

-- 1) Storage ----------------------------------------------------------
drop policy if exists "avatar public read" on storage.objects;
drop policy if exists "avatar own read" on storage.objects;
-- leitura via API só da própria pasta (necessária para o upload com substituição)
create policy "avatar own read" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- 2) Referências só para dados do próprio usuário ------------------------
create or replace function public.check_owner_refs()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.categories c where c.id = new.category_id and c.user_id = new.user_id
  ) then
    raise exception 'Categoria inválida para este usuário' using errcode = '42501';
  end if;
  if new.card_id is not null and not exists (
    select 1 from public.cards k where k.id = new.card_id and k.user_id = new.user_id
  ) then
    raise exception 'Cartão inválido para este usuário' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_owner_refs on public.transactions;
create trigger transactions_owner_refs
  before insert or update of category_id, card_id, user_id on public.transactions
  for each row execute function public.check_owner_refs();

drop trigger if exists series_owner_refs on public.series;
create trigger series_owner_refs
  before insert or update of category_id, card_id, user_id on public.series
  for each row execute function public.check_owner_refs();

-- 3) Funções internas fora da API ----------------------------------------
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.check_owner_refs() from public, anon, authenticated;

-- 4) Limites de tamanho (NOT VALID: vale para dados novos, sem travar os antigos)
alter table public.transactions drop constraint if exists transactions_description_len;
alter table public.transactions add constraint transactions_description_len
  check (description is null or char_length(description) <= 1000) not valid;

alter table public.series drop constraint if exists series_text_len;
alter table public.series add constraint series_text_len
  check (char_length(name) <= 120 and (description is null or char_length(description) <= 1000)) not valid;

alter table public.cards drop constraint if exists cards_color_len;
alter table public.cards add constraint cards_color_len check (char_length(color) <= 20) not valid;

alter table public.categories drop constraint if exists categories_color_len;
alter table public.categories add constraint categories_color_len check (char_length(color) <= 20) not valid;

alter table public.profiles drop constraint if exists profiles_text_len;
alter table public.profiles add constraint profiles_text_len
  check (char_length(name) <= 80 and (avatar_url is null or char_length(avatar_url) <= 500)) not valid;
