-- Drop the old 3-param overload so PostgreSQL can resolve calls unambiguously
drop function if exists public.award_loyalty_points(uuid, text, text);

-- Replace award_loyalty_points to support custom points override (for percentage-based actions)
create or replace function public.award_loyalty_points(
  p_user_id uuid,
  p_action_slug text,
  p_reference_id text default null,
  p_custom_points int default null
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
    insert into loyalty_accounts (user_id, tier_id)
    select p_user_id, id from loyalty_tiers order by min_lifetime_points asc limit 1
    returning * into v_account;
  end if;

  -- Award points (apply tier multiplier)
  declare
    v_tier loyalty_tiers%rowtype;
    v_base_points int;
    v_points int;
  begin
    select * into v_tier from loyalty_tiers where id = v_account.tier_id;

    -- Use custom points if provided, otherwise use action's fixed points
    v_base_points := coalesce(p_custom_points, v_action.points);
    v_points := ceil(v_base_points * v_tier.multiplier);

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
