alter table public.payment_intents
  add column if not exists completed_at timestamptz;

alter table public.setup_intents
  add column if not exists home_chain_id integer not null default 196 check (home_chain_id in (196, 1952));

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

alter table public.payment_intents
  drop constraint if exists payment_intents_source_token_symbol_check;

alter table public.payment_intents
  add constraint payment_intents_source_token_symbol_check
  check (source_token_symbol in ('USDT0', 'USDC', 'USDT'));

alter table public.payment_intents
  drop constraint if exists payment_intents_destination_token_symbol_check;

alter table public.payment_intents
  add constraint payment_intents_destination_token_symbol_check
  check (destination_token_symbol in ('USDT0', 'USDC', 'USDT'));

alter table public.agent_wallets
  alter column home_chain_id set default 196;

notify pgrst, 'reload schema';
