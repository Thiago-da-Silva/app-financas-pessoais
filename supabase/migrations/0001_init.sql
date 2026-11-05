-- =====================================================================
-- Controle Financeiro — schema inicial
-- Rode este arquivo no SQL Editor do Supabase (ou via `supabase db push`).
-- Valores monetários são guardados em CENTAVOS (bigint).
-- Meses (coluna `month`) são guardados como o 1º dia do mês (YYYY-MM-01).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Perfis
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  name            text not null default '',
  avatar_url      text,
  initial_balance bigint not null default 0,
  carry_balance   boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Categorias
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  color      text not null default '#64748b',
  budget     bigint check (budget is null or budget >= 0),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Cartões de crédito
-- ---------------------------------------------------------------------
create table if not exists public.cards (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  color        text not null default '#8b5cf6',
  credit_limit bigint check (credit_limit is null or credit_limit >= 0),
  closing_day  smallint not null check (closing_day between 1 and 31),
  due_day      smallint not null check (due_day between 1 and 31),
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Séries (parcelados e fixos mensais). Cada ocorrência vira uma linha
-- em `transactions`, permitindo editar meses individualmente.
-- ---------------------------------------------------------------------
create table if not exists public.series (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type           text not null check (type in ('installment', 'fixed')),
  kind           text not null check (kind in ('income', 'expense')),
  name           text not null,
  description    text,
  amount         bigint not null check (amount >= 0),
  category_id    uuid references public.categories (id) on delete set null,
  payment_method text not null check (payment_method in ('cash', 'pix', 'debit', 'card')),
  card_id        uuid references public.cards (id) on delete restrict,
  day            smallint not null check (day between 1 and 31),
  start_month    date not null,
  end_month      date,
  generated_until date, -- último mês já gerado (séries fixas)
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Lançamentos
-- ---------------------------------------------------------------------
create table if not exists public.transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  series_id      uuid references public.series (id) on delete cascade,
  kind           text not null check (kind in ('income', 'expense')),
  name           text not null check (char_length(name) between 1 and 120),
  description    text,
  amount         bigint not null check (amount >= 0),
  date           date not null,
  month          date not null,
  category_id    uuid references public.categories (id) on delete set null,
  payment_method text not null check (payment_method in ('cash', 'pix', 'debit', 'card')),
  card_id        uuid references public.cards (id) on delete restrict,
  paid           boolean not null default false,
  created_at     timestamptz not null default now(),
  constraint card_required check ((payment_method = 'card') = (card_id is not null))
);

create index if not exists transactions_user_month_idx on public.transactions (user_id, month);
create index if not exists transactions_series_idx on public.transactions (series_id);
create index if not exists transactions_card_idx on public.transactions (card_id);

-- ---------------------------------------------------------------------
-- Row Level Security: cada usuário só enxerga os próprios dados
-- ---------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.categories   enable row level security;
alter table public.cards        enable row level security;
alter table public.series       enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "own categories" on public.categories;
create policy "own categories" on public.categories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own cards" on public.cards;
create policy "own cards" on public.cards
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own series" on public.series;
create policy "own series" on public.series
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own transactions" on public.transactions;
create policy "own transactions" on public.transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Novo usuário: cria perfil + categorias padrão
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)));

  insert into public.categories (user_id, name, color) values
    (new.id, 'Salário',      '#10b981'),
    (new.id, 'Alimentação',  '#f97316'),
    (new.id, 'Mercado',      '#eab308'),
    (new.id, 'Moradia',      '#6366f1'),
    (new.id, 'Transporte',   '#0ea5e9'),
    (new.id, 'Saúde',        '#ef4444'),
    (new.id, 'Lazer',        '#ec4899'),
    (new.id, 'Educação',     '#8b5cf6'),
    (new.id, 'Assinaturas',  '#14b8a6'),
    (new.id, 'Outros',       '#64748b');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Storage: fotos de perfil (bucket público, cada usuário escreve na
-- própria pasta: avatars/<user_id>/arquivo)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatar public read" on storage.objects;
create policy "avatar public read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatar own insert" on storage.objects;
create policy "avatar own insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar own update" on storage.objects;
create policy "avatar own update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar own delete" on storage.objects;
create policy "avatar own delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
