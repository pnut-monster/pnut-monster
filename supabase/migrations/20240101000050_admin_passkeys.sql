-- Custom WebAuthn credentials provide a passwordless first factor for admins.
-- Supabase TOTP remains the required second factor that upgrades the session to
-- AAL2. These tables are intentionally service-role-only (RLS with no policies).

create table public.admin_passkeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 64),
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0 check (counter >= 0),
  transports text[] not null default '{}',
  device_type text,
  backed_up boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index admin_passkeys_user_id_idx on public.admin_passkeys(user_id);

alter table public.admin_passkeys enable row level security;

create table public.admin_passkey_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ceremony text not null check (ceremony in ('registration', 'authentication')),
  challenge text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index admin_passkey_challenges_lookup_idx
  on public.admin_passkey_challenges(user_id, ceremony, created_at desc);
create index admin_passkey_challenges_expiry_idx
  on public.admin_passkey_challenges(expires_at);

alter table public.admin_passkey_challenges enable row level security;

revoke all on public.admin_passkeys from anon, authenticated;
revoke all on public.admin_passkey_challenges from anon, authenticated;
