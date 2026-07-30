-- Fix referral system bugs:
-- 1. award_referral_rewards duplicate check only looks for specific descriptions,
--    missing entries from claim_referral_reward ('Referral reward'). This causes
--    double-awarding when the referrer claims manually and then the first-order
--    trigger fires. Fix: check by reference_id + action_id regardless of description.
-- 2. Referee has no way to manually claim points if auto-award missed them.
--    Fix: add claim_referee_referral_reward() for the referred user.

-- Fix award_referral_rewards to use reference_id-only duplicate detection
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
  v_referral_action_id uuid;
begin
  select referred_by
  into v_referrer_id
  from public.profiles
  where id = p_referred_user_id;

  if v_referrer_id is null then
    return jsonb_build_object('success', false, 'message', 'No referrer found');
  end if;

  select id, points into v_referral_action_id, v_action_points
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
    if p_reward_trigger <> 'signup' then
      return jsonb_build_object('success', true, 'message', 'Referral reward waits for signup');
    end if;
    v_referrer_points := v_action_points;
    v_referee_points := greatest(v_action_points / 2, 1);
  end if;

  v_reference_id := 'referral:' || p_referred_user_id::text;

  -- Check if EITHER party already received points for this referral (any description)
  select count(*) into v_existing_count
  from public.loyalty_points_log
  where reference_id = v_reference_id
    and action_id = v_referral_action_id;

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

-- Fix claim_referral_reward to use consistent description for duplicate detection
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

  perform public.grant_referral_points(
    auth.uid(),
    v_points,
    'Referral signup bonus',
    'referral:' || v_referred_user_id::text
  );

  return jsonb_build_object(
    'success', true,
    'points_awarded', v_points,
    'message', 'Referral points claimed'
  );
end;
$$ language plpgsql security definer set search_path = public;

-- New: Allow referee to claim their own referral bonus if it wasn't auto-awarded
create or replace function public.claim_referee_reward()
returns jsonb as $$
declare
  v_referral_action_id uuid;
  v_referrer_id uuid;
  v_campaign campaigns%rowtype;
  v_reward_trigger text;
  v_points int;
  v_reference_id text;
  v_already_awarded boolean;
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

  -- Check if this user was referred
  select referred_by into v_referrer_id
  from public.profiles
  where id = auth.uid();

  if v_referrer_id is null then
    return jsonb_build_object('success', false, 'message', 'You were not referred by anyone');
  end if;

  v_reference_id := 'referral:' || auth.uid()::text;

  -- Check if referee already received points
  select exists(
    select 1 from public.loyalty_points_log
    where user_id = auth.uid()
      and action_id = v_referral_action_id
      and reference_id = v_reference_id
  ) into v_already_awarded;

  if v_already_awarded then
    return jsonb_build_object('success', false, 'message', 'Referral bonus already claimed');
  end if;

  -- Get campaign points config
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

    -- For first_order trigger, require at least one picked_up order
    if v_reward_trigger = 'first_order' then
      if not exists (
        select 1 from public.orders
        where user_id = auth.uid() and status = 'picked_up'
      ) then
        return jsonb_build_object('success', false, 'message', 'Complete your first order to claim referral bonus');
      end if;
    end if;

    v_points := coalesce(
      nullif(v_campaign.config->>'referee_bonus_points', '')::int,
      nullif(v_campaign.config->>'referee_bonus', '')::int,
      greatest(v_points / 2, 1)
    );
  else
    v_points := greatest(v_points / 2, 1);
  end if;

  perform public.grant_referral_points(
    auth.uid(),
    v_points,
    'Referral signup bonus',
    v_reference_id
  );

  return jsonb_build_object(
    'success', true,
    'points_awarded', v_points,
    'message', 'Referral bonus claimed'
  );
end;
$$ language plpgsql security definer set search_path = public;

-- Also fix get_claimable_referral_rewards to check is_active on loyalty_actions
create or replace function public.get_claimable_referral_rewards()
returns int as $$
declare
  v_referral_action_id uuid;
  v_reward_trigger text;
  v_count int;
begin
  if auth.uid() is null then
    return 0;
  end if;

  select id
  into v_referral_action_id
  from public.loyalty_actions
  where slug = 'referral'
    and is_active = true
  limit 1;

  if v_referral_action_id is null then
    return 0;
  end if;

  select coalesce(config->>'reward_trigger', 'signup')
  into v_reward_trigger
  from public.campaigns
  where type = 'referral'
    and is_active = true
    and starts_at <= now()
    and ends_at >= now()
  order by created_at desc
  limit 1;

  v_reward_trigger := coalesce(v_reward_trigger, 'signup');

  select count(*)
  into v_count
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
    );

  return coalesce(v_count, 0);
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.get_claimable_referral_rewards() to authenticated;
grant execute on function public.claim_referee_reward() to authenticated;
grant execute on function public.claim_referral_reward() to authenticated;
grant execute on function public.award_referral_rewards(uuid, text) to authenticated;
