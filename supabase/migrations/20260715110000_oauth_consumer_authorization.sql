-- I-006-D.0.1: OAuth 2.1 Authorization Code + PKCE state for the private
-- consumer MCP. Raw authorization codes, bearer credentials, PKCE verifiers,
-- SIWE signatures, and OAuth state are intentionally never stored here.

begin;

alter table public.auth_challenges
  add column if not exists session_lifetime_seconds integer not null default 604800;
alter table public.auth_challenges
  add column if not exists flow text not null default 'legacy_session';
alter table public.auth_challenges
  drop constraint if exists auth_challenges_session_lifetime_seconds_check;
alter table public.auth_challenges
  add constraint auth_challenges_session_lifetime_seconds_check
  check (session_lifetime_seconds in (3600, 604800));
alter table public.auth_challenges
  drop constraint if exists auth_challenges_flow_check;
alter table public.auth_challenges
  add constraint auth_challenges_flow_check
  check (flow in ('legacy_session', 'oauth_authorization'));

create table if not exists public.oauth_clients (
  client_id text primary key,
  client_name text,
  redirect_uris text[] not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (length(client_id) between 1 and 160 and client_id ~ '^[A-Za-z0-9_-]+$'),
  check (client_name is null or (length(client_name) between 1 and 128 and client_name !~ '[[:cntrl:]]')),
  check (cardinality(redirect_uris) between 1 and 8),
  check (array_position(redirect_uris, '') is null)
);

create table if not exists public.oauth_authorizations (
  authorization_id text primary key,
  client_id text not null,
  redirect_uri text not null,
  state_digest text not null,
  code_challenge text not null,
  resource text not null,
  scopes text[] not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  siwe_challenge_id text unique,
  tenant_id uuid,
  owner_address text,
  account_address text,
  home_chain_id integer,
  environment text,
  authentication_epoch bigint,
  code_digest text unique,
  code_issued_at timestamptz,
  code_expires_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (client_id) references public.oauth_clients(client_id) on delete restrict,
  foreign key (siwe_challenge_id) references public.auth_challenges(id) on delete restrict,
  foreign key (tenant_id) references public.tenants(id) on delete restrict,
  foreign key (tenant_id, owner_address, account_address)
    references public.agent_wallets(tenant_id, owner_address, account_address)
    on delete restrict,
  check (length(authorization_id) between 1 and 160 and authorization_id ~ '^[A-Za-z0-9_-]+$'),
  check (state_digest ~ '^[0-9a-f]{64}$'),
  check (length(code_challenge) between 43 and 128 and code_challenge ~ '^[A-Za-z0-9_-]+$'),
  check (resource = 'https://wallet.agentpay.site/mcp'),
  check (cardinality(scopes) between 1 and 5),
  check (scopes <@ array['wallet:read', 'payment:prepare', 'payment:read', 'payment:review', 'session:manage']::text[]),
  check (expires_at > issued_at),
  check (
    (code_digest is null
      and code_issued_at is null
      and code_expires_at is null
      and consumed_at is null
      and tenant_id is null
      and owner_address is null
      and account_address is null
      and home_chain_id is null
      and environment is null
      and authentication_epoch is null)
    or
    (code_digest ~ '^[0-9a-f]{64}$'
      and code_issued_at is not null
      and code_expires_at is not null
      and tenant_id is not null
      and owner_address ~ '^0x[0-9a-fA-F]{40}$'
      and account_address ~ '^0x[0-9a-fA-F]{40}$'
      and home_chain_id in (196, 1952)
      and environment in ('staging', 'production')
      and authentication_epoch >= 0
      and code_expires_at > code_issued_at
      and (consumed_at is null or consumed_at >= code_issued_at))
  )
);

create table if not exists public.oauth_rate_limit_buckets (
  bucket text not null check (bucket in ('registration', 'authorization', 'siwe', 'token')),
  key_digest text not null check (key_digest ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 1),
  expires_at timestamptz not null,
  primary key (bucket, key_digest),
  check (expires_at > window_started_at)
);

create index if not exists oauth_clients_active_idx
  on public.oauth_clients (client_id, revoked_at, last_used_at desc);
create index if not exists oauth_authorizations_client_expiry_idx
  on public.oauth_authorizations (client_id, expires_at desc);
create index if not exists oauth_authorizations_code_digest_idx
  on public.oauth_authorizations (code_digest)
  where code_digest is not null;
create index if not exists oauth_rate_limit_buckets_expiry_idx
  on public.oauth_rate_limit_buckets (expires_at);

create or replace function public.consume_oauth_admission(
  p_bucket text,
  p_key_digest text,
  p_now timestamptz,
  p_window_seconds integer,
  p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  accepted_count integer;
begin
  if p_bucket not in ('registration', 'authorization', 'siwe', 'token')
    or p_key_digest !~ '^[0-9a-f]{64}$'
    or p_window_seconds < 1
    or p_window_seconds > 86400
    or p_limit < 1
    or p_limit > 1000 then
    return false;
  end if;

  insert into public.oauth_rate_limit_buckets (
    bucket,
    key_digest,
    window_started_at,
    request_count,
    expires_at
  ) values (
    p_bucket,
    p_key_digest,
    p_now,
    1,
    p_now + make_interval(secs => p_window_seconds)
  )
  on conflict (bucket, key_digest) do update
  set window_started_at = case
        when public.oauth_rate_limit_buckets.window_started_at <= p_now - make_interval(secs => p_window_seconds)
          then p_now
        else public.oauth_rate_limit_buckets.window_started_at
      end,
      request_count = case
        when public.oauth_rate_limit_buckets.window_started_at <= p_now - make_interval(secs => p_window_seconds)
          then 1
        else public.oauth_rate_limit_buckets.request_count + 1
      end,
      expires_at = p_now + make_interval(secs => p_window_seconds)
  where public.oauth_rate_limit_buckets.window_started_at <= p_now - make_interval(secs => p_window_seconds)
     or public.oauth_rate_limit_buckets.request_count < p_limit
  returning request_count into accepted_count;

  return accepted_count is not null;
end;
$$;

create or replace function public.prune_oauth_authorization_data(p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.oauth_rate_limit_buckets
  where expires_at <= p_now;

  delete from public.oauth_authorizations
  where expires_at <= p_now - interval '1 hour';

  delete from public.oauth_clients as client
  where client.last_used_at <= p_now - interval '90 days'
    and not exists (
      select 1
      from public.oauth_authorizations as authorization
      where authorization.client_id = client.client_id
    );
end;
$$;

create or replace function public.exchange_oauth_authorization_code(
  p_authorization_id text,
  p_code_digest text,
  p_consumed_at timestamptz,
  p_session_id text,
  p_session_tenant_id uuid,
  p_session_owner_address text,
  p_session_account_address text,
  p_session_home_chain_id integer,
  p_session_audience text,
  p_session_environment text,
  p_session_scopes text[],
  p_session_authentication_epoch bigint,
  p_session_credential_digest text,
  p_session_issued_at timestamptz,
  p_session_expires_at timestamptz,
  p_session_last_used_at timestamptz
)
returns setof public.oauth_authorizations
language plpgsql
security definer
set search_path = public
as $$
declare
  authorization_row public.oauth_authorizations%rowtype;
begin
  update public.oauth_authorizations
  set consumed_at = p_consumed_at
  where authorization_id = p_authorization_id
    and code_digest = p_code_digest
    and consumed_at is null
    and code_expires_at > p_consumed_at
  returning * into authorization_row;

  if not found then
    return;
  end if;

  insert into public.service_sessions (
    id,
    tenant_id,
    owner_address,
    account_address,
    home_chain_id,
    audience,
    environment,
    scopes,
    authentication_epoch,
    credential_digest,
    issued_at,
    expires_at,
    last_used_at
  ) values (
    p_session_id,
    p_session_tenant_id,
    p_session_owner_address,
    p_session_account_address,
    p_session_home_chain_id,
    p_session_audience,
    p_session_environment,
    p_session_scopes,
    p_session_authentication_epoch,
    p_session_credential_digest,
    p_session_issued_at,
    p_session_expires_at,
    p_session_last_used_at
  );

  return next authorization_row;
end;
$$;

alter table public.oauth_clients enable row level security;
alter table public.oauth_authorizations enable row level security;
alter table public.oauth_rate_limit_buckets enable row level security;

revoke all on table public.oauth_clients from public, anon, authenticated;
revoke all on table public.oauth_authorizations from public, anon, authenticated;
revoke all on table public.oauth_rate_limit_buckets from public, anon, authenticated;
grant select, insert, update on table public.oauth_clients, public.oauth_authorizations, public.oauth_rate_limit_buckets to service_role;
revoke all on function public.consume_oauth_admission(text, text, timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_oauth_admission(text, text, timestamptz, integer, integer) to service_role;
revoke all on function public.prune_oauth_authorization_data(timestamptz) from public, anon, authenticated;
grant execute on function public.prune_oauth_authorization_data(timestamptz) to service_role;
revoke all on function public.exchange_oauth_authorization_code(
  text, text, timestamptz, text, uuid, text, text, integer, text, text, text[], bigint, text, timestamptz, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.exchange_oauth_authorization_code(
  text, text, timestamptz, text, uuid, text, text, integer, text, text, text[], bigint, text, timestamptz, timestamptz, timestamptz
) to service_role;

notify pgrst, 'reload schema';

commit;
