create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.setup_intents (
  id text primary key,
  owner_address text,
  executor_address text not null,
  message_to_sign text not null,
  signature text,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'SIGNED', 'DEPLOYING', 'COMPLETED', 'EXPIRED', 'FAILED')),
  expires_at timestamptz not null,
  account_address text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (owner_address is null or owner_address ~ '^0x[0-9a-fA-F]{40}$'),
  check (executor_address ~ '^0x[0-9a-fA-F]{40}$'),
  check (account_address is null or account_address ~ '^0x[0-9a-fA-F]{40}$')
);

create table if not exists public.agent_wallets (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_address text not null check (owner_address ~ '^0x[0-9a-fA-F]{40}$'),
  account_address text not null unique check (account_address ~ '^0x[0-9a-fA-F]{40}$'),
  home_chain_id integer not null default 56 check (home_chain_id > 0),
  executor_address text not null check (executor_address ~ '^0x[0-9a-fA-F]{40}$'),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'PAUSED', 'CLOSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_intents (
  id text primary key,
  account_address text not null references public.agent_wallets(account_address) on delete restrict,
  owner_address text not null check (owner_address ~ '^0x[0-9a-fA-F]{40}$'),
  status text not null check (status in (
    'AWAITING_APPROVAL',
    'APPROVED',
    'EXECUTING',
    'COMPLETED',
    'FAILED',
    'EXPIRED',
    'CANCELLED'
  )),
  payment_type text not null check (payment_type in (
    'WALLET_PAYMENT',
    'INVOICE_PAYMENT',
    'X402_PAYMENT',
    'CONTRACT_CALL'
  )),
  source_chain_id integer not null check (source_chain_id > 0),
  destination_chain_id integer not null check (destination_chain_id > 0),
  source_token_address text not null check (source_token_address ~ '^0x[0-9a-fA-F]{40}$'),
  source_token_symbol text not null check (source_token_symbol in ('USDC', 'USDT')),
  destination_token_address text not null check (destination_token_address ~ '^0x[0-9a-fA-F]{40}$'),
  destination_token_symbol text not null check (destination_token_symbol in ('USDC', 'USDT')),
  recipient_address text not null check (recipient_address ~ '^0x[0-9a-fA-F]{40}$'),
  amount_out text not null check (amount_out ~ '^[0-9]+(\.[0-9]+)?$' and amount_out::numeric > 0),
  max_amount_in text not null check (max_amount_in ~ '^[0-9]+(\.[0-9]+)?$' and max_amount_in::numeric > 0),
  max_native_fee text not null default '0' check (max_native_fee ~ '^[0-9]+(\.[0-9]+)?$' and max_native_fee::numeric >= 0),
  route_provider text not null default 'LI.FI' check (route_provider in ('DIRECT', 'LI.FI', 'CONTRACT_CALL')),
  route_target text not null check (route_target ~ '^0x[0-9a-fA-F]{40}$'),
  route_calldata text not null check (route_calldata ~ '^0x([0-9a-fA-F]{2})*$'),
  route_calldata_hash text not null check (route_calldata_hash ~ '^0x[0-9a-fA-F]{64}$'),
  route_summary text not null,
  estimated_fee text check (
    estimated_fee is null or (estimated_fee ~ '^[0-9]+(\.[0-9]+)?$' and estimated_fee::numeric >= 0)
  ),
  estimated_eta_seconds integer check (estimated_eta_seconds is null or estimated_eta_seconds >= 0),
  nonce text not null check (nonce ~ '^[0-9]+$'),
  deadline timestamptz not null,
  purpose text check (purpose is null or length(purpose) <= 280),
  approval_phrase text not null,
  approved_at timestamptz,
  source_tx_hash text check (source_tx_hash is null or source_tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
  destination_tx_hash text check (destination_tx_hash is null or destination_tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
  lifi_tracking_id text,
  error_code text,
  error_message text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_address, nonce)
);

create table if not exists public.payment_events (
  id uuid primary key default extensions.gen_random_uuid(),
  payment_intent_id text not null references public.payment_intents(id) on delete cascade,
  event_type text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists setup_intents_status_expires_at_idx
  on public.setup_intents (status, expires_at);

create index if not exists agent_wallets_owner_status_idx
  on public.agent_wallets (owner_address, status);

create index if not exists agent_wallets_status_created_at_idx
  on public.agent_wallets (status, created_at desc);

create index if not exists payment_intents_account_status_idx
  on public.payment_intents (account_address, status);

create index if not exists payment_intents_created_at_idx
  on public.payment_intents (created_at desc);

create index if not exists payment_intents_owner_created_at_idx
  on public.payment_intents (owner_address, created_at desc);

create index if not exists payment_intents_status_deadline_idx
  on public.payment_intents (status, deadline);

create index if not exists payment_events_payment_intent_id_idx
  on public.payment_events (payment_intent_id);

create index if not exists payment_events_payment_intent_id_created_at_idx
  on public.payment_events (payment_intent_id, created_at desc);

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_agent_wallets_updated_at on public.agent_wallets;
create trigger set_agent_wallets_updated_at
before update on public.agent_wallets
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_payment_intents_updated_at on public.payment_intents;
create trigger set_payment_intents_updated_at
before update on public.payment_intents
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.setup_intents enable row level security;
alter table public.agent_wallets enable row level security;
alter table public.payment_intents enable row level security;
alter table public.payment_events enable row level security;

revoke all on table public.setup_intents from anon, authenticated;
revoke all on table public.agent_wallets from anon, authenticated;
revoke all on table public.payment_intents from anon, authenticated;
revoke all on table public.payment_events from anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.setup_intents to service_role;
grant select, insert, update, delete on table public.agent_wallets to service_role;
grant select, insert, update, delete on table public.payment_intents to service_role;
grant select, insert, update, delete on table public.payment_events to service_role;

revoke all on function public.set_current_timestamp_updated_at() from public;
grant execute on function public.set_current_timestamp_updated_at() to service_role;
