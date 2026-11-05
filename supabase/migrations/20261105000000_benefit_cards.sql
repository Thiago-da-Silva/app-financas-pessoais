-- =====================================================================
-- Cartões benefício (VR/VA)
-- - cards.type: 'credit' (padrão) ou 'benefit'
-- - nova forma de pagamento 'benefit' (usa card_id do cartão benefício)
-- - profiles.sum_benefits: somar saldo dos benefícios ao saldo geral
-- Pode ser executado mais de uma vez.
-- =====================================================================

-- Tipo do cartão: todos os cartões existentes passam a ser de crédito
alter table public.cards add column if not exists type text not null default 'credit';
update public.cards set type = 'credit' where type is null or type not in ('credit', 'benefit');
alter table public.cards drop constraint if exists cards_type_check;
alter table public.cards add constraint cards_type_check check (type in ('credit', 'benefit'));

-- Nova forma de pagamento 'benefit'
alter table public.transactions drop constraint if exists transactions_payment_method_check;
alter table public.transactions add constraint transactions_payment_method_check
  check (payment_method in ('cash', 'pix', 'debit', 'card', 'benefit'));

alter table public.series drop constraint if exists series_payment_method_check;
alter table public.series add constraint series_payment_method_check
  check (payment_method in ('cash', 'pix', 'debit', 'card', 'benefit'));

-- Cartão obrigatório para crédito e benefício
alter table public.transactions drop constraint if exists card_required;
alter table public.transactions add constraint card_required
  check ((payment_method in ('card', 'benefit')) = (card_id is not null));

-- Preferência: somar saldo dos cartões benefício ao saldo geral
alter table public.profiles add column if not exists sum_benefits boolean not null default false;
