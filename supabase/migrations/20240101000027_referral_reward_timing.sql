create or replace function public.grant_referral_points(
  p_user_id uuid,
  p_points int,
  p_description text,
  p_reference_id text
)
returns void as $$
declare
  v_account loyalty_accounts%rowtype;
  v_new_tier loyalty_tiers%rowtype;
  v_action_id uuid;
begin
  if p_user_id is null or p_points <= 0 then
    return;
  end if;

  select id
  into v_action_id
  from public.loyalty_actions
  where slug = 'referral'
  limit 1;

  select *
  into v_account
  from public.loyalty_accounts
  where user_id = p_user_id
  for update;

  if not found then
    insert into public.loyalty_accounts (user_id, tier_id)
    select p_user_id, id
    from public.loyalty_tiers
    order by min_lifetime_points asc
    limit 1
    returning * into v_account;
  end if;

  update public.loyalty_accounts
  set current_points = current_points + p_points,
      lifetime_points = lifetime_points + p_points
  where id = v_account.id;

  insert into public.loyalty_points_log (user_id, action_id, points, description, reference_id)
  values (p_user_id, v_action_id, p_points, p_description, p_reference_id);

  select *
  into v_new_tier
  from public.loyalty_tiers
  where min_lifetime_points <= (v_account.lifetime_points + p_points)
  order by min_lifetime_points desc
  limit 1;

  if v_new_tier.id is not null and v_new_tier.id <> v_account.tier_id then
    update public.loyalty_accounts
    set tier_id = v_new_tier.id
    where id = v_account.id;
  end if;
end;
$$ language plpgsql security definer set search_path = public;

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
begin
  select referred_by
  into v_referrer_id
  from public.profiles
  where id = p_referred_user_id;

  if v_referrer_id is null then
    return jsonb_build_object('success', false, 'message', 'No referrer found');
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

  if not found then
    return jsonb_build_object('success', false, 'message', 'No active referral program');
  end if;

  v_config := v_campaign.config;
  v_trigger := coalesce(v_config->>'reward_trigger', 'signup');

  if v_trigger <> p_reward_trigger then
    return jsonb_build_object('success', true, 'message', 'Referral reward waits for ' || v_trigger);
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

  v_referrer_points := coalesce(
    nullif(v_config->>'referrer_bonus_points', '')::int,
    nullif(v_config->>'referrer_bonus', '')::int,
    0
  );
  v_referee_points := coalesce(
    nullif(v_config->>'referee_bonus_points', '')::int,
    nullif(v_config->>'referee_bonus', '')::int,
    0
  );

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

  v_reward_result := public.award_referral_rewards(auth.uid(), 'signup');

  return jsonb_build_object(
    'success', true,
    'message', 'Referral code applied',
    'reward', v_reward_result
  );
end;
$$ language plpgsql security definer set search_path = public;

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
