create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('wallet_topup_bonus', 'referral', 'birthday', 'first_order')),
  config jsonb not null default '{}',
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  title text not null,
  body text not null,
  type text not null default 'general' check (type in ('order', 'wallet', 'loyalty', 'campaign', 'general')),
  data jsonb not null default '{}',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_notifications_user on public.notifications(user_id, is_read);
create index idx_notifications_created on public.notifications(created_at desc);
create index idx_campaigns_active on public.campaigns(is_active, starts_at, ends_at);
