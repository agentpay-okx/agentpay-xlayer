alter table public.payment_intents
  add column if not exists completed_at timestamptz;

alter table public.payment_intents
  drop constraint if exists payment_intents_route_provider_check;

alter table public.payment_intents
  add constraint payment_intents_route_provider_check
  check (route_provider in ('DIRECT', 'LI.FI', 'CONTRACT_CALL'));

alter table public.payment_intents
  drop constraint if exists payment_intents_payment_type_check;

alter table public.payment_intents
  add constraint payment_intents_payment_type_check
  check (payment_type in ('WALLET_PAYMENT', 'INVOICE_PAYMENT', 'X402_PAYMENT', 'CONTRACT_CALL'));

notify pgrst, 'reload schema';
