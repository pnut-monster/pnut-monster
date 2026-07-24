-- Fix loyalty points system:
-- 1. claim_referral_reward fails because it passes p_custom_points to award_loyalty_points
--    which rejects non-admin callers with custom points. Fix: use grant_referral_points directly.
-- 2. apply_referral_code (from 000028) doesn't award points to either party on signup.
--    Fix: restore call to award_referral_rewards so both referrer and referee get points.

-- Fix claim_referral_reward to use grant_referral_points directly
create or replace function public.claim_referral_reward()
returns jsonb as $$
declare
  v_referral_action_id uuid;
  v_referred_user_id uuid;
  v_campaign campaigns%rowtype;
  v_reward_trigger text;
  v_points int;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'message', 'Not authenticated');
  end if;

  select id, points
  into v_referral_action_id, v_points
  from public.loyalty_actions
  where slug = 'referral'
    and is_active = true
  limit 1;

  if v_referral_action_id is null then
    return jsonb_build_object('success', false, 'message', 'Referral action not found');
  end if;

  select *
  into v_campaign
  from public.campaigns
  where type = 'referral'
    and is_active = true
    and starts_at <= now()
    and ends_at >= now()
  order by created_at desc
  limit 1;

  if found then
    v_reward_trigger := coalesce(v_campaign.config->>'reward_trigger', 'signup');
    v_points := coalesce(
      nullif(v_campaign.config->>'referrer_bonus_points', '')::int,
      nullif(v_campaign.config->>'referrer_bonus', '')::int,
      v_points
    );
  else
    v_reward_trigger := 'signup';
  end if;

  select referred.id
  into v_referred_user_id
  from public.profiles referred
  where referred.referred_by = auth.uid()
    and (
      v_reward_trigger = 'signup'
      or exists (
        select 1
        from public.orders o
        where o.user_id = referred.id
          and o.status = 'picked_up'
      )
    )
    and not exists (
      select 1
      from public.loyalty_points_log l
      where l.user_id = auth.uid()
        and l.action_id = v_referral_action_id
        and l.reference_id = 'referral:' || referred.id::text
    )
  order by referred.created_at asc
  limit 1;

  if v_referred_user_id is null then
    return jsonb_build_object('success', false, 'message', 'No referral points available to claim');
  end if;

  -- Use grant_referral_points directly to bypass the is_admin() check in award_loyalty_points
  perform public.grant_referral_points(
    auth.uid(),
    v_points,
    'Referral reward',
    'referral:' || v_referred_user_id::text
  );

  return jsonb_build_object(
    'success', true,
    'points_awarded', v_points,
    'message', 'Referral points claimed'
  );
end;
$$ language plpgsql security definer set search_path = public;

-- Fix apply_referral_code to award points to BOTH referrer and referred user on signup
create or replace function public.apply_referral_code(p_referral_code text)
returns jsonb as $$
declare
  v_referrer_id uuid;
  v_current_referred_by uuid;
  v_code text;
  v_reward_result jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'message', 'Not authenticated');
  end if;

  v_code := upper(trim(coalesce(p_referral_code, '')));

  if v_code = '' then
    return jsonb_build_object('success', true, 'message', 'No referral code provided');
  end if;

  select id
  into v_referrer_id
  from public.profiles
  where upper(referral_code) = v_code
  limit 1;

  if v_referrer_id is null then
    return jsonb_build_object('success', false, 'message', 'Invalid referral code');
  end if;

  if v_referrer_id = auth.uid() then
    return jsonb_build_object('success', false, 'message', 'You cannot use your own referral code');
  end if;

  select referred_by
  into v_current_referred_by
  from public.profiles
  where id = auth.uid();

  if v_current_referred_by is not null then
    return jsonb_build_object('success', true, 'message', 'Referral code already applied');
  end if;

  update public.profiles
  set referred_by = v_referrer_id
  where id = auth.uid()
    and referred_by is null;

  -- Award referral rewards to both parties immediately
  v_reward_result := public.award_referral_rewards(auth.uid(), 'signup');

  return jsonb_build_object(
    'success', true,
    'message', 'Referral code applied',
    'reward', v_reward_result
  );
end;
$$ language plpgsql security definer set search_path = public;

-- Update award_referral_rewards to fall back to loyalty_actions points when no active campaign
create or replace function public.award_referral_rewards(
  p_referred_user_id uuid,
  p_reward_trigger text
)
returns jsonb as $$
declare
  v_referrer_id uuid;
  v_campaign campaigns%rowtype;
  v_config jsonb;
  v_trigger text;
  v_referrer_points int;
  v_referee_points int;
  v_reference_id text;
  v_existing_count int;
  v_action_points int;
begin
  select referred_by
  into v_referrer_id
  from public.profiles
  where id = p_referred_user_id;

  if v_referrer_id is null then
    return jsonb_build_object('success', false, 'message', 'No referrer found');
  end if;

  -- Get default points from the loyalty action
  select points into v_action_points
  from public.loyalty_actions
  where slug = 'referral' and is_active = true
  limit 1;
  v_action_points := coalesce(v_action_points, 100);

  select *
  into v_campaign
  from public.campaigns
  where type = 'referral'
    and is_active = true
    and starts_at <= now()
    and ends_at >= now()
  order by created_at desc
  limit 1;

  if found then
    v_config := v_campaign.config;
    v_trigger := coalesce(v_config->>'reward_trigger', 'signup');

    if v_trigger <> p_reward_trigger then
      return jsonb_build_object('success', true, 'message', 'Referral reward waits for ' || v_trigger);
    end if;

    v_referrer_points := coalesce(
      nullif(v_config->>'referrer_bonus_points', '')::int,
      nullif(v_config->>'referrer_bonus', '')::int,
      v_action_points
    );
    v_referee_points := coalesce(
      nullif(v_config->>'referee_bonus_points', '')::int,
      nullif(v_config->>'referee_bonus', '')::int,
      greatest(v_action_points / 2, 1)
    );
  else
    -- No active campaign: only trigger on signup, use action default points
    if p_reward_trigger <> 'signup' then
      return jsonb_build_object('success', true, 'message', 'Referral reward waits for signup');
    end if;
    v_referrer_points := v_action_points;
    v_referee_points := greatest(v_action_points / 2, 1);
  end if;

  v_reference_id := 'referral:' || p_referred_user_id::text;

  select count(*)
  into v_existing_count
  from public.loyalty_points_log
  where reference_id = v_reference_id
    and description in ('Referral signup bonus', 'Referral first order bonus');

  if v_existing_count > 0 then
    return jsonb_build_object('success', true, 'message', 'Referral reward already awarded');
  end if;

  perform public.grant_referral_points(
    v_referrer_id,
    v_referrer_points,
    case when p_reward_trigger = 'first_order' then 'Referral first order bonus' else 'Referral signup bonus' end,
    v_reference_id
  );

  perform public.grant_referral_points(
    p_referred_user_id,
    v_referee_points,
    case when p_reward_trigger = 'first_order' then 'Referral first order bonus' else 'Referral signup bonus' end,
    v_reference_id
  );

  return jsonb_build_object('success', true, 'message', 'Referral reward awarded');
end;
$$ language plpgsql security definer set search_path = public;

-- Re-create the trigger to award referral rewards on first order
-- (handles the case where campaign reward_trigger = 'first_order')
create or replace function public.award_referral_rewards_on_first_order()
returns trigger as $$
declare
  v_completed_orders int;
begin
  if new.status = 'picked_up' and (old.status is null or old.status <> 'picked_up') then
    select count(*)
    into v_completed_orders
    from public.orders
    where user_id = new.user_id
      and status = 'picked_up';

    if v_completed_orders = 1 then
      perform public.award_referral_rewards(new.user_id, 'first_order');
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_award_referral_rewards_on_first_order on public.orders;
create trigger trg_award_referral_rewards_on_first_order
  after update of status on public.orders
  for each row
  execute function public.award_referral_rewards_on_first_order();

-- Grant execute to authenticated users
grant execute on function public.claim_referral_reward() to authenticated;
grant execute on function public.apply_referral_code(text) to authenticated;
grant execute on function public.grant_referral_points(uuid, int, text, text) to authenticated;
grant execute on function public.award_referral_rewards(uuid, text) to authenticated;
grant execute on function public.award_referral_rewards_on_first_order() to authenticated;
