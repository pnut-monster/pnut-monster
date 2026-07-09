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

create or replace function public.claim_referral_reward()
returns jsonb as $$
declare
  v_referral_action_id uuid;
  v_referred_user_id uuid;
  v_campaign campaigns%rowtype;
  v_reward_trigger text;
  v_points int;
  v_result jsonb;
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

  select public.award_loyalty_points(
    auth.uid(),
    'referral',
    'referral:' || v_referred_user_id::text,
    v_points
  )
  into v_result;

  return v_result;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.apply_referral_code(p_referral_code text)
returns jsonb as $$
declare
  v_referrer_id uuid;
  v_current_referred_by uuid;
  v_code text;
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

  return jsonb_build_object('success', true, 'message', 'Referral code applied');
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_award_referral_rewards_on_first_order on public.orders;
