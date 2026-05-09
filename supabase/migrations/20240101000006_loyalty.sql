create table public.loyalty_tiers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  min_lifetime_points int not null default 0,
  multiplier numeric(3,1) not null default 1.0,
  benefits jsonb not null default '[]',
  sort_order int not null default 0
);

create table public.loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) unique,
  tier_id uuid not null references public.loyalty_tiers(id),
  current_points int not null default 0,
  lifetime_points int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger loyalty_accounts_updated_at
  before update on public.loyalty_accounts
  for each row execute function public.update_updated_at();

create table public.loyalty_actions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null,
  points int not null,
  event_type text not null,
  max_per_day int,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.loyalty_points_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  action_id uuid references public.loyalty_actions(id),
  mission_id uuid,
  points int not null,
  description text not null,
  reference_id text,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_loyalty_accounts_user on public.loyalty_accounts(user_id);
create index idx_loyalty_points_log_user on public.loyalty_points_log(user_id);
create index idx_loyalty_points_log_created on public.loyalty_points_log(created_at desc);

-- Award loyalty points function (atomic)
create or replace function public.award_loyalty_points(
  p_user_id uuid,
  p_action_slug text,
  p_reference_id text default null
)
returns jsonb as $$
declare
  v_action loyalty_actions%rowtype;
  v_account loyalty_accounts%rowtype;
  v_today_count int;
  v_new_tier loyalty_tiers%rowtype;
begin
  -- Get action
  select * into v_action from loyalty_actions where slug = p_action_slug and is_active = true;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Action not found');
  end if;

  -- Check daily limit
  if v_action.max_per_day is not null then
    select count(*) into v_today_count
    from loyalty_points_log
    where user_id = p_user_id
      and action_id = v_action.id
      and created_at >= current_date;

    if v_today_count >= v_action.max_per_day then
      return jsonb_build_object('success', false, 'error', 'Daily limit reached');
    end if;
  end if;

  -- Get or create loyalty account
  select * into v_account from loyalty_accounts where user_id = p_user_id for update;
  if not found then
    -- Get default tier
    insert into loyalty_accounts (user_id, tier_id)
    select p_user_id, id from loyalty_tiers order by min_lifetime_points asc limit 1
    returning * into v_account;
  end if;

  -- Award points (apply tier multiplier)
  declare
    v_tier loyalty_tiers%rowtype;
    v_points int;
  begin
    select * into v_tier from loyalty_tiers where id = v_account.tier_id;
    v_points := ceil(v_action.points * v_tier.multiplier);

    update loyalty_accounts
    set current_points = current_points + v_points,
        lifetime_points = lifetime_points + v_points
    where id = v_account.id;

    -- Log
    insert into loyalty_points_log (user_id, action_id, points, description, reference_id)
    values (p_user_id, v_action.id, v_points, v_action.name, p_reference_id);

    -- Check tier upgrade
    select * into v_new_tier from loyalty_tiers
    where min_lifetime_points <= (v_account.lifetime_points + v_points)
    order by min_lifetime_points desc limit 1;

    if v_new_tier.id != v_account.tier_id then
      update loyalty_accounts set tier_id = v_new_tier.id where id = v_account.id;
    end if;

    return jsonb_build_object(
      'success', true,
      'points_awarded', v_points,
      'new_total', v_account.current_points + v_points,
      'tier_upgraded', v_new_tier.id != v_account.tier_id
    );
  end;
end;
$$ language plpgsql security definer;
