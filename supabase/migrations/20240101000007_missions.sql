create table public.missions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  type text not null check (type in ('one_time', 'recurring', 'streak')),
  target_event text not null,
  target_count int not null default 1,
  reward_points int not null default 0,
  reward_type text not null default 'points' check (reward_type in ('points', 'coupon', 'badge')),
  reward_value jsonb not null default '{}',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Add foreign key to loyalty_points_log
alter table public.loyalty_points_log
  add constraint loyalty_points_log_mission_fk
  foreign key (mission_id) references public.missions(id);

create table public.mission_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  mission_id uuid not null references public.missions(id),
  current_count int not null default 0,
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, mission_id)
);

create trigger mission_progress_updated_at
  before update on public.mission_progress
  for each row execute function public.update_updated_at();

-- Indexes
create index idx_missions_active on public.missions(is_active, starts_at, ends_at);
create index idx_mission_progress_user on public.mission_progress(user_id);
create index idx_mission_progress_mission on public.mission_progress(mission_id);
