


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."apply_referral_code"("p_referral_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."apply_referral_code"("p_referral_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."award_loyalty_points"("p_user_id" "uuid", "p_action_slug" "text", "p_reference_id" "text" DEFAULT NULL::"text", "p_custom_points" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_action loyalty_actions%rowtype;
  v_account loyalty_accounts%rowtype;
  v_today_count int;
  v_new_tier loyalty_tiers%rowtype;
  v_tier loyalty_tiers%rowtype;
  v_base_points int;
  v_points int;
  v_order orders%rowtype;
  v_wallet_tx wallet_transactions%rowtype;
  v_order_pct numeric;
  v_topup_pct numeric;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_user_id <> auth.uid() and not public.is_admin() then
    raise exception 'Cannot award points for another user';
  end if;

  select * into v_action from loyalty_actions where slug = p_action_slug and is_active = true;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Action not found');
  end if;

  if p_reference_id is not null and exists (
    select 1
    from loyalty_points_log
    where user_id = p_user_id
      and action_id = v_action.id
      and reference_id = p_reference_id
  ) then
    return jsonb_build_object('success', false, 'error', 'Points already awarded');
  end if;

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

  v_base_points := v_action.points;

  if p_action_slug = 'order_placed' then
    if p_reference_id is null or p_reference_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Valid order reference required';
    end if;

    select * into v_order
    from orders
    where id = p_reference_id::uuid
      and user_id = p_user_id
      and status = 'picked_up';

    if not found then
      raise exception 'Eligible completed order not found';
    end if;

    if not exists (
      select 1 from order_ratings
      where order_id = v_order.id and user_id = p_user_id
    ) then
      raise exception 'Order rating is required before claiming order points';
    end if;

    select coalesce((select value from app_settings where key = 'points_pct_order_placed'), '5')::numeric
    into v_order_pct;
    v_base_points := greatest(1, round(v_order.total * v_order_pct / 100));
  elsif p_action_slug = 'wallet_topup' then
    if p_reference_id is null or p_reference_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Valid wallet transaction reference required';
    end if;

    select wt.* into v_wallet_tx
    from wallet_transactions wt
    join wallets w on w.id = wt.wallet_id
    where wt.id = p_reference_id::uuid
      and w.user_id = p_user_id
      and wt.type = 'topup';

    if not found then
      raise exception 'Eligible wallet top-up not found';
    end if;

    select coalesce((select value from app_settings where key = 'points_pct_wallet_topup'), '2')::numeric
    into v_topup_pct;
    v_base_points := greatest(1, round(v_wallet_tx.amount * v_topup_pct / 100));
  elsif p_custom_points is not null and not public.is_admin() then
    raise exception 'Custom points are not allowed for this action';
  elsif p_custom_points is not null then
    v_base_points := p_custom_points;
  end if;

  if v_base_points <= 0 then
    raise exception 'Invalid point amount';
  end if;

  select * into v_account from loyalty_accounts where user_id = p_user_id for update;
  if not found then
    insert into loyalty_accounts (user_id, tier_id)
    select p_user_id, id from loyalty_tiers order by min_lifetime_points asc limit 1
    returning * into v_account;
  end if;

  select * into v_tier from loyalty_tiers where id = v_account.tier_id;
  v_points := ceil(v_base_points * coalesce(v_tier.multiplier, 1));

  update loyalty_accounts
  set current_points = current_points + v_points,
      lifetime_points = lifetime_points + v_points,
      updated_at = now()
  where id = v_account.id;

  insert into loyalty_points_log (user_id, action_id, points, description, reference_id)
  values (p_user_id, v_action.id, v_points, v_action.name, p_reference_id);

  select * into v_new_tier from loyalty_tiers
  where min_lifetime_points <= (v_account.lifetime_points + v_points)
  order by min_lifetime_points desc limit 1;

  if v_new_tier.id is not null and v_new_tier.id != v_account.tier_id then
    update loyalty_accounts set tier_id = v_new_tier.id where id = v_account.id;
  end if;

  return jsonb_build_object(
    'success', true,
    'points_awarded', v_points,
    'new_total', v_account.current_points + v_points,
    'tier_upgraded', coalesce(v_new_tier.id != v_account.tier_id, false)
  );
end;
$_$;


ALTER FUNCTION "public"."award_loyalty_points"("p_user_id" "uuid", "p_action_slug" "text", "p_reference_id" "text", "p_custom_points" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."award_membership_bonus"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_enabled boolean;
  v_tier1_threshold int;
  v_tier2_threshold int;
  v_bonus_pct numeric;
  v_cycle_months int;
  v_cycle membership_cycles%rowtype;
  v_bonus_points int;
  v_order_total numeric;
  v_account loyalty_accounts%rowtype;
  v_new_balance int;
BEGIN
  -- Only fire when status changes to 'picked_up'
  IF NEW.status <> 'picked_up' OR OLD.status = 'picked_up' THEN
    RETURN NEW;
  END IF;

  -- Check if membership system is enabled
  SELECT coalesce((SELECT value FROM app_settings WHERE key = 'membership_enabled'), 'true')::boolean INTO v_enabled;
  IF NOT v_enabled THEN
    RETURN NEW;
  END IF;

  -- Load settings
  SELECT coalesce((SELECT value FROM app_settings WHERE key = 'membership_tier1_threshold'), '15')::int INTO v_tier1_threshold;
  SELECT coalesce((SELECT value FROM app_settings WHERE key = 'membership_tier2_threshold'), '25')::int INTO v_tier2_threshold;
  SELECT coalesce((SELECT value FROM app_settings WHERE key = 'membership_bonus_pct'), '5')::numeric INTO v_bonus_pct;
  SELECT coalesce((SELECT value FROM app_settings WHERE key = 'membership_cycle_months'), '6')::int INTO v_cycle_months;

  -- Find or create active cycle
  SELECT * INTO v_cycle FROM membership_cycles
    WHERE user_id = NEW.user_id AND is_active = true
    ORDER BY cycle_start DESC LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO membership_cycles (user_id, cycle_start, cycle_end, starting_tier, current_tier, cycle_order_count)
    VALUES (
      NEW.user_id,
      now(),
      now() + (v_cycle_months || ' months')::interval,
      'sprout_star',
      'sprout_star',
      0
    )
    RETURNING * INTO v_cycle;
  END IF;

  -- Increment order count in cycle
  UPDATE membership_cycles
    SET cycle_order_count = cycle_order_count + 1,
        updated_at = now()
    WHERE id = v_cycle.id;

  v_cycle.cycle_order_count := v_cycle.cycle_order_count + 1;

  -- Determine new tier based on updated order count
  IF v_cycle.cycle_order_count >= v_tier2_threshold THEN
    UPDATE membership_cycles SET current_tier = 'pnut_legend', updated_at = now() WHERE id = v_cycle.id;
    v_cycle.current_tier := 'pnut_legend';
  ELSIF v_cycle.cycle_order_count >= v_tier1_threshold THEN
    UPDATE membership_cycles SET current_tier = 'sprout_hero', updated_at = now() WHERE id = v_cycle.id;
    v_cycle.current_tier := 'sprout_hero';
  END IF;

  -- Award bonus points if user is Sprout Hero or PNUT Legend
  IF v_cycle.current_tier IN ('sprout_hero', 'pnut_legend') THEN
    v_order_total := NEW.subtotal;
    v_bonus_points := GREATEST(1, round(v_order_total * v_bonus_pct / 100));

    -- Credit to loyalty_accounts
    SELECT * INTO v_account FROM loyalty_accounts WHERE user_id = NEW.user_id;
    IF FOUND THEN
      v_new_balance := v_account.current_points + v_bonus_points;

      UPDATE loyalty_accounts
        SET current_points = v_new_balance,
            lifetime_points = lifetime_points + v_bonus_points,
            updated_at = now()
        WHERE id = v_account.id;

      -- Log in loyalty_ledger
      INSERT INTO loyalty_ledger (user_id, type, points, monetary_value, balance_after, source, order_id, description)
      VALUES (
        NEW.user_id,
        'earn',
        v_bonus_points,
        0,
        v_new_balance,
        'membership_bonus',
        NEW.id,
        'Membership bonus (' || v_bonus_pct || '%) - ' || initcap(replace(v_cycle.current_tier, '_', ' '))
      );

      -- Also log in loyalty_points_log for user history
      INSERT INTO loyalty_points_log (user_id, points, description, reference_id)
      VALUES (
        NEW.user_id,
        v_bonus_points,
        'Membership bonus (' || v_bonus_pct || '%) - ' || initcap(replace(v_cycle.current_tier, '_', ' ')),
        NEW.id::text
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."award_membership_bonus"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."award_referral_rewards"("p_referred_user_id" "uuid", "p_reward_trigger" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."award_referral_rewards"("p_referred_user_id" "uuid", "p_reward_trigger" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."award_referral_rewards_on_first_order"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."award_referral_rewards_on_first_order"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_max_redeemable_points"("p_user_id" "uuid", "p_subtotal" numeric, "p_tax" numeric, "p_packaging" numeric, "p_has_coupon" boolean DEFAULT false, "p_has_discounted_items" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_account loyalty_accounts%rowtype;
  v_point_value numeric;
  v_min_balance int;
  v_max_order_pct numeric;
  v_max_points_per_order int;
  v_allow_with_coupon boolean;
  v_allow_on_discounted boolean;
  v_cover_tax boolean;
  v_cover_packaging boolean;
  v_redemption_enabled boolean;
  v_eligible_amount numeric;
  v_max_points_by_pct int;
  v_max_redeemable int;
  v_monetary_value numeric;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_user_id <> auth.uid() and not public.is_admin() then
    raise exception 'Cannot inspect another user';
  end if;

  select coalesce((select value from app_settings where key = 'loyalty_redemption_enabled'), 'true')::boolean into v_redemption_enabled;
  if not v_redemption_enabled then
    return jsonb_build_object('eligible', false, 'reason', 'Redemption is disabled', 'max_points', 0, 'monetary_value', 0);
  end if;

  select coalesce((select value from app_settings where key = 'loyalty_point_value'), '0.25')::numeric into v_point_value;
  select coalesce((select value from app_settings where key = 'loyalty_min_balance_to_redeem'), '100')::int into v_min_balance;
  select coalesce((select value from app_settings where key = 'loyalty_max_order_pct'), '50')::numeric into v_max_order_pct;
  select coalesce((select value from app_settings where key = 'loyalty_max_points_per_order'), '500')::int into v_max_points_per_order;
  select coalesce((select value from app_settings where key = 'loyalty_allow_with_coupon'), 'true')::boolean into v_allow_with_coupon;
  select coalesce((select value from app_settings where key = 'loyalty_allow_on_discounted'), 'true')::boolean into v_allow_on_discounted;
  select coalesce((select value from app_settings where key = 'loyalty_cover_tax'), 'false')::boolean into v_cover_tax;
  select coalesce((select value from app_settings where key = 'loyalty_cover_packaging'), 'false')::boolean into v_cover_packaging;

  if p_has_coupon and not v_allow_with_coupon then
    return jsonb_build_object('eligible', false, 'reason', 'Cannot use points with coupon', 'max_points', 0, 'monetary_value', 0);
  end if;

  if p_has_discounted_items and not v_allow_on_discounted then
    return jsonb_build_object('eligible', false, 'reason', 'Cannot use points on discounted items', 'max_points', 0, 'monetary_value', 0);
  end if;

  select * into v_account from loyalty_accounts where user_id = p_user_id;
  if not found or v_account.current_points < v_min_balance then
    return jsonb_build_object('eligible', false, 'reason', 'Minimum balance not met (' || v_min_balance || ' points required)', 'max_points', 0, 'monetary_value', 0);
  end if;

  v_eligible_amount := p_subtotal;
  if v_cover_tax then v_eligible_amount := v_eligible_amount + p_tax; end if;
  if v_cover_packaging then v_eligible_amount := v_eligible_amount + p_packaging; end if;

  v_max_points_by_pct := floor((v_eligible_amount * v_max_order_pct / 100) / v_point_value);
  v_max_redeemable := least(v_account.current_points, v_max_points_per_order, v_max_points_by_pct);

  if v_max_redeemable <= 0 then
    return jsonb_build_object('eligible', false, 'reason', 'No points eligible for this order', 'max_points', 0, 'monetary_value', 0);
  end if;

  v_monetary_value := v_max_redeemable * v_point_value;

  return jsonb_build_object(
    'eligible', true,
    'max_points', v_max_redeemable,
    'monetary_value', v_monetary_value,
    'point_value', v_point_value,
    'user_balance', v_account.current_points
  );
end;
$$;


ALTER FUNCTION "public"."calculate_max_redeemable_points"("p_user_id" "uuid", "p_subtotal" numeric, "p_tax" numeric, "p_packaging" numeric, "p_has_coupon" boolean, "p_has_discounted_items" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_order"("p_order_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_admin() or public.is_outlet_staff_for_order(p_order_id);
$$;


ALTER FUNCTION "public"."can_manage_order"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_membership_renewals"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return public.renew_expired_membership_cycles();
end;
$$;


ALTER FUNCTION "public"."check_membership_renewals"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_nth_order_discount"("p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_enabled boolean;
  v_interval int;
  v_discount_pct numeric;
  v_stack_with_loyalty boolean;
  v_completed_orders int;
  v_next_order_number int;
  v_qualifies boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_user_id <> auth.uid() and not public.is_admin() then
    raise exception 'Cannot inspect another user';
  end if;

  select coalesce((select value from app_settings where key = 'nth_order_discount_enabled'), 'true')::boolean into v_enabled;
  if not v_enabled then
    return jsonb_build_object('eligible', false, 'reason', 'Discount is disabled');
  end if;

  select coalesce((select value from app_settings where key = 'nth_order_interval'), '5')::int into v_interval;
  select coalesce((select value from app_settings where key = 'nth_order_discount_pct'), '10')::numeric into v_discount_pct;
  select coalesce((select value from app_settings where key = 'nth_order_stack_with_loyalty'), 'true')::boolean into v_stack_with_loyalty;
  select count(*) into v_completed_orders from orders where user_id = p_user_id and status = 'picked_up';

  v_next_order_number := v_completed_orders + 1;
  v_qualifies := v_interval > 0 and (v_next_order_number % v_interval = 0);

  return jsonb_build_object(
    'eligible', v_qualifies,
    'discount_pct', v_discount_pct,
    'next_order_number', v_next_order_number,
    'interval', v_interval,
    'stack_with_loyalty', v_stack_with_loyalty,
    'completed_orders', v_completed_orders
  );
end;
$$;


ALTER FUNCTION "public"."check_nth_order_discount"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_referral_reward"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."claim_referral_reward"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_order_with_pickup_code"("p_order_id" "uuid", "p_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_order public.orders%rowtype;
begin
  if not public.can_manage_order(p_order_id) then
    raise exception 'Order management access required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.status <> 'ready' then
    raise exception 'Only ready orders can be completed';
  end if;

  if v_order.payment_status <> 'paid' then
    raise exception 'Cannot complete an unpaid order';
  end if;

  if v_order.delivery_code is null or p_code <> v_order.delivery_code then
    raise exception 'Invalid pickup code';
  end if;

  update public.orders
  set status = 'picked_up'
  where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', 'picked_up',
    'changed', true
  );
end;
$$;


ALTER FUNCTION "public"."complete_order_with_pickup_code"("p_order_id" "uuid", "p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_title" "text", "p_body" "text", "p_type" "text" DEFAULT 'general'::"text", "p_data" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id uuid;
begin
  insert into public.notifications (user_id, title, body, type, data)
  values (
    p_user_id,
    p_title,
    p_body,
    case when p_type in ('order', 'wallet', 'loyalty', 'campaign', 'general') then p_type else 'general' end,
    coalesce(p_data, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_title" "text", "p_body" "text", "p_type" "text", "p_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_customer_address_default"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.is_default then
    update public.customer_addresses
      set is_default = false
      where user_id = new.user_id and id <> new.id and is_default;
  elsif not exists (
    select 1 from public.customer_addresses
    where user_id = new.user_id and id <> new.id
  ) then
    new.is_default := true;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."ensure_customer_address_default"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_gift_cards"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_expired_count int;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  update gift_cards
    set status = 'expired', updated_at = now()
    where status in ('active', 'sold', 'generated')
      and expires_at < now();

  get diagnostics v_expired_count = row_count;
  return jsonb_build_object('expired_count', v_expired_count);
end;
$$;


ALTER FUNCTION "public"."expire_gift_cards"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_captured_payment_attempt"("p_attempt_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_attempt payment_attempts%rowtype;
  v_result jsonb;
  v_claim_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    current_setting('role', true)
  );
begin
  if v_claim_role <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select * into v_attempt from payment_attempts
  where id = p_attempt_id for update;

  if not found then raise exception 'Payment attempt not found'; end if;
  if v_attempt.status = 'completed' then
    return jsonb_build_object('order_id', v_attempt.app_order_id, 'idempotent', true);
  end if;
  if v_attempt.status <> 'captured' or v_attempt.razorpay_payment_id is null then
    raise exception 'Payment has not been captured';
  end if;

  perform set_config('request.jwt.claim.sub', v_attempt.user_id::text, true);

  v_result := place_order_with_wallet(
    v_attempt.order_payload || jsonb_build_object(
      'user_id', v_attempt.user_id,
      'payment_status', 'paid',
      'razorpay_order_id', v_attempt.razorpay_order_id,
      'razorpay_payment_id', v_attempt.razorpay_payment_id,
      'razorpay_amount_paid', v_attempt.amount_paise::numeric / 100
    ),
    array(select value from jsonb_array_elements(v_attempt.items_payload)),
    v_attempt.wallet_amount,
    v_attempt.loyalty_points,
    v_attempt.nth_order_discount
  );

  update payment_attempts
  set status = 'completed',
      app_order_id = (v_result->>'order_id')::uuid,
      updated_at = now()
  where id = v_attempt.id;

  return v_result;
exception when others then
  update payment_attempts
  set failure_reason = sqlerrm, updated_at = now()
  where id = p_attempt_id;
  raise;
end;
$$;


ALTER FUNCTION "public"."finalize_captured_payment_attempt"("p_attempt_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_delivery_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.delivery_code := lpad(floor(random() * 10000)::text, 4, '0');
  return new;
end;
$$;


ALTER FUNCTION "public"."generate_delivery_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_gift_card_batch"("p_template_id" "uuid", "p_batch_name" "text", "p_quantity" integer, "p_code_format" "text" DEFAULT 'alphanumeric_12'::"text", "p_code_prefix" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_template gift_card_templates%rowtype;
  v_batch_id uuid;
  v_year text;
  v_seq int;
  v_gift_card_id text;
  v_redeem_code text;
  v_expires_at timestamptz;
  v_generated int := 0;
  v_user_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if p_quantity < 1 or p_quantity > 1000 then
    raise exception 'Quantity must be between 1 and 1000';
  end if;

  select * into v_template from gift_card_templates where id = p_template_id;
  if not found then raise exception 'Template not found'; end if;
  if v_template.status <> 'active' then raise exception 'Template is not active'; end if;

  select auth.uid() into v_user_id;

  insert into gift_card_batches (template_id, batch_name, quantity, code_format, code_prefix, generated_count, created_by)
  values (p_template_id, p_batch_name, p_quantity, p_code_format, p_code_prefix, 0, v_user_id)
  returning id into v_batch_id;

  v_year := to_char(now(), 'YYYY');
  select coalesce(max(
    case when gift_card_id like 'GC-' || v_year || '-%'
    then (substring(gift_card_id from 9))::int
    else 0 end
  ), 0) into v_seq from gift_cards;

  v_expires_at := now() + (v_template.validity_days || ' days')::interval;

  for i in 1..p_quantity loop
    v_seq := v_seq + 1;
    v_gift_card_id := 'GC-' || v_year || '-' || lpad(v_seq::text, 6, '0');

    case p_code_format
      when 'alphanumeric_12' then
        v_redeem_code := upper(substr(md5(gen_random_uuid()::text), 1, 12));
      when 'numeric_12' then
        v_redeem_code := lpad((floor(random() * 999999999999)::bigint)::text, 12, '0');
      when 'prefix_alphanumeric' then
        v_redeem_code := coalesce(p_code_prefix, 'GC') || upper(substr(md5(gen_random_uuid()::text), 1, 12 - length(coalesce(p_code_prefix, 'GC'))));
      when 'prefix_3_numeric' then
        v_redeem_code := coalesce(left(p_code_prefix, 3), 'GCR') || lpad((floor(random() * 999999999)::bigint)::text, 9, '0');
      else
        v_redeem_code := upper(substr(md5(gen_random_uuid()::text), 1, 12));
    end case;

    if exists (select 1 from gift_cards where redeem_code = v_redeem_code) then
      v_redeem_code := upper(substr(md5(gen_random_uuid()::text || i::text), 1, 12));
    end if;

    insert into gift_cards (gift_card_id, redeem_code, template_id, batch_id, purchase_price, wallet_credit, status, expires_at)
    values (v_gift_card_id, v_redeem_code, p_template_id, v_batch_id, v_template.purchase_price, v_template.wallet_credit, 'active', v_expires_at);

    v_generated := v_generated + 1;
  end loop;

  update gift_card_batches set generated_count = v_generated where id = v_batch_id;

  insert into gift_card_audit_logs (entity_type, entity_id, admin_id, admin_name, action, new_value)
  values ('batch', v_batch_id, v_user_id, null, 'batch_generated',
    jsonb_build_object('batch_name', p_batch_name, 'quantity', v_generated, 'template', v_template.name));

  return jsonb_build_object('batch_id', v_batch_id, 'generated_count', v_generated, 'template_name', v_template.name);
end;
$$;


ALTER FUNCTION "public"."generate_gift_card_batch"("p_template_id" "uuid", "p_batch_name" "text", "p_quantity" integer, "p_code_format" "text", "p_code_prefix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_claimable_referral_rewards"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_claimable_referral_rewards"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_loyalty_analytics"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_total_issued int;
  v_total_redeemed int;
  v_point_value numeric;
  v_outstanding_liability numeric;
  v_total_accounts int;
  v_accounts_with_redemptions int;
  v_avg_redemption_rate numeric;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select coalesce((select value from app_settings where key = 'loyalty_point_value'), '0.25')::numeric into v_point_value;
  select coalesce(sum(case when type = 'earn' then points else 0 end), 0),
         coalesce(sum(case when type = 'redeem' then points else 0 end), 0)
  into v_total_issued, v_total_redeemed
  from loyalty_ledger;

  if v_total_issued = 0 then
    select coalesce(sum(points), 0) into v_total_issued from loyalty_points_log where points > 0;
  end if;

  select coalesce(sum(current_points), 0) * v_point_value into v_outstanding_liability from loyalty_accounts;
  select count(*) into v_total_accounts from loyalty_accounts;
  select count(distinct user_id) into v_accounts_with_redemptions from loyalty_ledger where type = 'redeem';

  if v_total_accounts > 0 then
    v_avg_redemption_rate := round((v_accounts_with_redemptions::numeric / v_total_accounts) * 100, 1);
  else
    v_avg_redemption_rate := 0;
  end if;

  return jsonb_build_object(
    'total_points_issued', v_total_issued,
    'total_points_redeemed', v_total_redeemed,
    'outstanding_points', v_total_issued - v_total_redeemed,
    'outstanding_liability', coalesce(v_outstanding_liability, (v_total_issued - v_total_redeemed) * v_point_value),
    'point_value', v_point_value,
    'total_accounts', v_total_accounts,
    'accounts_with_redemptions', v_accounts_with_redemptions,
    'redemption_rate', v_avg_redemption_rate
  );
end;
$$;


ALTER FUNCTION "public"."get_loyalty_analytics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_membership_status"("p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_enabled boolean;
  v_tier1_threshold int;
  v_tier2_threshold int;
  v_bonus_pct numeric;
  v_cycle_months int;
  v_cycle membership_cycles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_user_id <> auth.uid() and not public.is_admin() then
    raise exception 'Cannot inspect another user';
  end if;

  select coalesce((select value from app_settings where key = 'membership_enabled'), 'true')::boolean into v_enabled;
  if not v_enabled then
    return jsonb_build_object('enabled', false);
  end if;

  select coalesce((select value from app_settings where key = 'membership_tier1_threshold'), '15')::int into v_tier1_threshold;
  select coalesce((select value from app_settings where key = 'membership_tier2_threshold'), '25')::int into v_tier2_threshold;
  select coalesce((select value from app_settings where key = 'membership_bonus_pct'), '5')::numeric into v_bonus_pct;
  select coalesce((select value from app_settings where key = 'membership_cycle_months'), '6')::int into v_cycle_months;

  select * into v_cycle from membership_cycles
    where user_id = p_user_id and is_active = true
    order by cycle_start desc limit 1;

  if not found then
    insert into membership_cycles (user_id, cycle_start, cycle_end, starting_tier, current_tier, cycle_order_count)
    values (p_user_id, now(), now() + (v_cycle_months || ' months')::interval, 'sprout_star', 'sprout_star', 0)
    returning * into v_cycle;
  end if;

  return jsonb_build_object(
    'enabled', true,
    'current_tier', v_cycle.current_tier,
    'cycle_order_count', v_cycle.cycle_order_count,
    'cycle_start', v_cycle.cycle_start,
    'cycle_end', v_cycle.cycle_end,
    'tier1_threshold', v_tier1_threshold,
    'tier2_threshold', v_tier2_threshold,
    'bonus_pct', v_bonus_pct,
    'cycle_months', v_cycle_months,
    'has_bonus', v_cycle.current_tier in ('sprout_hero', 'pnut_legend'),
    'goodie_eligible', v_cycle.current_tier = 'pnut_legend'
  );
end;
$$;


ALTER FUNCTION "public"."get_membership_status"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."grant_referral_points"("p_user_id" "uuid", "p_points" integer, "p_description" "text", "p_reference_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."grant_referral_points"("p_user_id" "uuid", "p_points" integer, "p_description" "text", "p_reference_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_outlet_settings"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.outlet_settings (outlet_id) values (new.id);
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_outlet_settings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_profile_wallet"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.wallets (user_id) values (new.id);
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_profile_wallet"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, phone, email, full_name, referral_code)
  values (
    new.id,
    new.phone,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', null),
    upper(substr(md5(new.id::text), 1, 8))
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin', 'super_admin')
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_outlet_staff_for_order"("p_order_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.orders o
    join public.outlet_staff os on os.outlet_id = o.outlet_id
    where o.id = p_order_id
      and os.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_outlet_staff_for_order"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_outlet_staff_for_outlet"("p_outlet_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.outlet_staff os
    where os.outlet_id = p_outlet_id
      and os.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_outlet_staff_for_outlet"("p_outlet_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."manual_refund_order"("p_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_order orders%rowtype;
  v_wallet wallets%rowtype;
  v_new_balance numeric;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status != 'cancelled' then raise exception 'Only cancelled orders can be refunded'; end if;
  if v_order.payment_status = 'refunded' then raise exception 'Order already refunded'; end if;
  if v_order.wallet_used <= 0 then raise exception 'No wallet amount to refund on this order'; end if;

  update orders set payment_status = 'refunded' where id = p_order_id;
  select * into v_wallet from wallets where user_id = v_order.user_id for update;

  if found then
    v_new_balance := v_wallet.loaded_balance + v_order.wallet_used;
    update wallets set loaded_balance = v_new_balance, updated_at = now() where id = v_wallet.id;
    insert into wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id)
    values (v_wallet.id, 'refund', v_order.wallet_used, v_new_balance + v_wallet.bonus_balance, 'Manual refund for order #' || v_order.order_number, p_order_id::text);
  end if;

  return jsonb_build_object('order_id', p_order_id, 'refunded', v_order.wallet_used, 'payment_status', 'refunded');
end;
$$;


ALTER FUNCTION "public"."manual_refund_order"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_loyalty_ledger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_title text;
  v_body text;
begin
  v_title := case new.type
    when 'earn' then 'Loyalty points earned'
    when 'redeem' then 'Loyalty points redeemed'
    when 'expire' then 'Loyalty points expired'
    when 'adjust' then 'Loyalty points adjusted'
    else 'Loyalty updated'
  end;

  v_body := coalesce(new.description, abs(new.points)::text || ' loyalty points updated.');

  perform public.create_notification(
    new.user_id,
    v_title,
    v_body,
    'loyalty',
    jsonb_build_object('loyalty_ledger_id', new.id, 'type', new.type, 'points', new.points)
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_loyalty_ledger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_order_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.create_notification(
    new.user_id,
    'Order placed',
    'Your order #' || new.order_number || ' has been placed successfully.',
    'order',
    jsonb_build_object('order_id', new.id, 'order_number', new.order_number, 'status', new.status)
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_order_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_order_status_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_title text;
  v_body text;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  v_title := case new.status
    when 'confirmed' then 'Order confirmed'
    when 'preparing' then 'Order is being prepared'
    when 'ready' then 'Order ready for pickup'
    when 'picked_up' then 'Order completed'
    when 'cancelled' then 'Order cancelled'
    when 'rejected' then 'Order rejected'
    else 'Order updated'
  end;

  v_body := case new.status
    when 'confirmed' then 'Your order #' || new.order_number || ' has been confirmed.'
    when 'preparing' then 'Your order #' || new.order_number || ' is now being prepared.'
    when 'ready' then 'Your order #' || new.order_number || ' is ready for pickup.'
    when 'picked_up' then 'Your order #' || new.order_number || ' has been completed.'
    when 'cancelled' then 'Your order #' || new.order_number || ' has been cancelled.'
    when 'rejected' then 'Your order #' || new.order_number || ' was rejected. Refund details will be updated if applicable.'
    else 'Your order #' || new.order_number || ' status changed to ' || new.status || '.'
  end;

  perform public.create_notification(
    new.user_id,
    v_title,
    v_body,
    'order',
    jsonb_build_object('order_id', new.id, 'order_number', new.order_number, 'status', new.status)
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_order_status_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_wallet_transaction"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_title text;
  v_body text;
begin
  select user_id into v_user_id
  from public.wallets
  where id = new.wallet_id;

  if v_user_id is null then
    return new;
  end if;

  v_title := case new.type
    when 'topup' then 'Wallet topped up'
    when 'bonus' then 'Wallet bonus added'
    when 'debit' then 'Wallet payment'
    when 'refund' then 'Wallet refund processed'
    else 'Wallet updated'
  end;

  v_body := case new.type
    when 'debit' then 'Rs. ' || new.amount || ' was deducted from your wallet.'
    else 'Rs. ' || new.amount || ' was added to your wallet.'
  end;

  perform public.create_notification(
    v_user_id,
    v_title,
    v_body,
    'wallet',
    jsonb_build_object('wallet_transaction_id', new.id, 'type', new.type, 'amount', new.amount)
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_wallet_transaction"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."place_order_with_wallet"("p_order" "jsonb", "p_items" "jsonb"[], "p_wallet_amount" numeric DEFAULT 0, "p_loyalty_points" integer DEFAULT 0, "p_nth_order_discount" numeric DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_outlet_id uuid := (p_order->>'outlet_id')::uuid;
  v_coupon_code text := nullif(upper(trim(coalesce(p_order->>'coupon_code', ''))), '');
  v_coupon coupons%rowtype;
  v_group record;
  v_group_rows integer;
  v_option_count integer;
  v_distinct_option_count integer;
  v_usage_count integer;
  v_order_count integer;
  v_max_redemption jsonb;
  v_customer_eligibility text;
  v_student_verified boolean;
  v_authoritative_subtotal numeric := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from outlets
    where id = v_outlet_id
      and is_active = true
      and coalesce(is_manually_closed, false) = false
  ) then
    raise exception 'Outlet is closed or unavailable';
  end if;

  -- Enforce every active customization group against the submitted item JSON.
  for v_group in
    select g.id, g.item_id, g.name, g.is_required, g.min_select, g.max_select
    from item_customization_groups g
    where g.item_id in (
      select (item->>'item_id')::uuid from unnest(p_items) item
    )
  loop
    select count(*) into v_group_rows
    from unnest(p_items) submitted_item
    cross join lateral jsonb_array_elements(coalesce(submitted_item->'customizations', '[]'::jsonb)) chosen_group
    where (submitted_item->>'item_id')::uuid = v_group.item_id
      and (chosen_group->>'group_id')::uuid = v_group.id;

    select count(*), count(distinct chosen_option->>'id')
    into v_option_count, v_distinct_option_count
    from unnest(p_items) submitted_item
    cross join lateral jsonb_array_elements(coalesce(submitted_item->'customizations', '[]'::jsonb)) chosen_group
    cross join lateral jsonb_array_elements(coalesce(chosen_group->'options', '[]'::jsonb)) chosen_option
    where (submitted_item->>'item_id')::uuid = v_group.item_id
      and (chosen_group->>'group_id')::uuid = v_group.id;

    if v_group_rows > 1 then
      raise exception 'Duplicate customization group: %', v_group.name;
    end if;
    if v_option_count <> v_distinct_option_count then
      raise exception 'Duplicate customization option: %', v_group.name;
    end if;
    if v_group.is_required and v_option_count < v_group.min_select then
      raise exception 'Required customization is incomplete: %', v_group.name;
    end if;
    if not v_group.is_required and v_option_count > 0 and v_option_count < v_group.min_select then
      raise exception 'Customization minimum is not met: %', v_group.name;
    end if;
    if v_option_count > v_group.max_select then
      raise exception 'Too many customization options: %', v_group.name;
    end if;
  end loop;

  if v_coupon_code is not null then
    select * into v_coupon
    from coupons
    where upper(code) = v_coupon_code
    for update;

    if not found or not v_coupon.is_active
       or v_coupon.starts_at > now() or v_coupon.ends_at <= now()
       or coalesce(v_coupon.status, 'active') not in ('active', 'scheduled') then
      raise exception 'Coupon is not active';
    end if;

    if coalesce(v_coupon.discount_type_ext, v_coupon.discount_type) not in ('percentage', 'flat', 'fixed') then
      raise exception 'Coupon type is not supported by checkout';
    end if;

    if v_coupon.per_user_limit is not null then
      select count(*) into v_usage_count from coupon_usage
      where coupon_id = v_coupon.id and user_id = v_user_id;
      if v_usage_count >= v_coupon.per_user_limit then
        raise exception 'Coupon per-user limit reached';
      end if;
    end if;

    if v_coupon.daily_limit is not null then
      select count(*) into v_usage_count from coupon_usage
      where coupon_id = v_coupon.id and created_at >= current_date;
      if v_usage_count >= v_coupon.daily_limit then
        raise exception 'Coupon daily limit reached';
      end if;
    end if;

    if exists (select 1 from coupon_outlet_restrictions where coupon_id = v_coupon.id)
       and not exists (
         select 1 from coupon_outlet_restrictions
         where coupon_id = v_coupon.id and outlet_id = v_outlet_id
       ) then
      raise exception 'Coupon is not valid at this outlet';
    end if;

    if v_coupon.applicable_type = 'products'
       and not exists (
         select 1 from unnest(p_items) item
         where (item->>'item_id')::uuid = any(v_coupon.applicable_product_ids)
       ) then
      raise exception 'Coupon is not valid for these products';
    end if;

    if v_coupon.applicable_type = 'categories'
       and not exists (
         select 1
         from unnest(p_items) item
         join menu_items mi on mi.id = (item->>'item_id')::uuid
         join menu_subcategories ms on ms.id = mi.subcategory_id
         where ms.category_id = any(v_coupon.applicable_category_ids)
       ) then
      raise exception 'Coupon is not valid for these categories';
    end if;

    v_customer_eligibility := coalesce(v_coupon.customer_eligibility, 'all');
    select count(*) into v_order_count from orders where user_id = v_user_id;
    if v_customer_eligibility = 'new' and v_order_count > 0 then
      raise exception 'Coupon is only for new customers';
    elsif v_customer_eligibility = 'existing' and v_order_count = 0 then
      raise exception 'Coupon is only for existing customers';
    elsif v_customer_eligibility = 'premium' and not exists (
      select 1 from membership_cycles
      where user_id = v_user_id and is_active = true and current_tier in ('sprout_hero', 'pnut_legend')
    ) then
      raise exception 'Coupon requires premium membership';
    elsif v_customer_eligibility = 'student' then
      select coalesce((raw_user_meta_data->>'student_verified')::boolean, false)
      into v_student_verified from auth.users where id = v_user_id;
      if not coalesce(v_student_verified, false) then
        raise exception 'Coupon requires verified student status';
      end if;
    end if;
  end if;

  if coalesce(p_loyalty_points, 0) > 0 then
    select coalesce(sum(
      (coalesce(omi.price_override, mi.base_price) + coalesce((
        select sum(co.price)
        from jsonb_array_elements(coalesce(item->'customizations', '[]'::jsonb)) selected_group
        cross join lateral jsonb_array_elements(coalesce(selected_group->'options', '[]'::jsonb)) selected_option
        join customization_options co on co.id = (selected_option->>'id')::uuid
        where co.is_active = true
      ), 0)) * greatest(1, least(coalesce((item->>'quantity')::integer, 1), 99))
    ), 0)
    into v_authoritative_subtotal
    from unnest(p_items) item
    join menu_items mi on mi.id = (item->>'item_id')::uuid
    left join outlet_menu_items omi on omi.item_id = mi.id and omi.outlet_id = v_outlet_id;

    v_max_redemption := calculate_max_redeemable_points(
      v_user_id,
      v_authoritative_subtotal,
      0,
      0,
      v_coupon_code is not null,
      false
    );
    if not coalesce((v_max_redemption->>'eligible')::boolean, false)
       or p_loyalty_points > coalesce((v_max_redemption->>'max_points')::integer, 0) then
      raise exception 'Loyalty redemption exceeds the allowed limit';
    end if;
  end if;

  return place_order_with_wallet_validated_impl(
    p_order, p_items, p_wallet_amount, p_loyalty_points, p_nth_order_discount
  );
end;
$$;


ALTER FUNCTION "public"."place_order_with_wallet"("p_order" "jsonb", "p_items" "jsonb"[], "p_wallet_amount" numeric, "p_loyalty_points" integer, "p_nth_order_discount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."place_order_with_wallet_validated_impl"("p_order" "jsonb", "p_items" "jsonb"[], "p_wallet_amount" numeric DEFAULT 0, "p_loyalty_points" integer DEFAULT 0, "p_nth_order_discount" numeric DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_auth_uid uuid;
  v_order_id uuid;
  v_existing_order_id uuid;
  v_order_number text;
  v_outlet_id uuid;
  v_item jsonb;
  v_group jsonb;
  v_option jsonb;
  v_item_id uuid;
  v_group_id uuid;
  v_option_id uuid;
  v_item_name text;
  v_unit_price numeric;
  v_option_price numeric;
  v_options_total numeric;
  v_quantity int;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_tax_rate numeric;
  v_tax numeric;
  v_packaging_charge_setting numeric;
  v_packaging_mode text;
  v_packaging numeric := 0;
  v_item_count int := 0;
  v_coupon coupons%rowtype;
  v_coupon_code text;
  v_coupon_discount numeric := 0;
  v_completed_orders int;
  v_nth_enabled boolean;
  v_nth_interval int;
  v_nth_pct numeric;
  v_nth_discount numeric := 0;
  v_total_discount numeric := 0;
  v_point_value numeric;
  v_loyalty_discount numeric := 0;
  v_account loyalty_accounts%rowtype;
  v_wallet wallets%rowtype;
  v_wallet_amount numeric := coalesce(p_wallet_amount, 0);
  v_bonus_debit numeric := 0;
  v_loaded_debit numeric := 0;
  v_total numeric;
  v_payment_method text;
  v_payment_status text;
begin
  v_auth_uid := auth.uid();
  if v_auth_uid is null then
    raise exception 'Authentication required';
  end if;

  if coalesce(jsonb_array_length(to_jsonb(p_items)), 0) = 0 then
    raise exception 'Order must contain at least one item';
  end if;

  if (p_order->>'user_id')::uuid <> v_auth_uid and not public.is_admin() then
    raise exception 'Cannot place an order for another user';
  end if;

  v_outlet_id := (p_order->>'outlet_id')::uuid;
  if not exists (select 1 from outlets where id = v_outlet_id and is_active = true) then
    raise exception 'Outlet is not available';
  end if;

  foreach v_item in array p_items loop
    v_item_id := (v_item->>'item_id')::uuid;
    v_quantity := greatest(1, least(coalesce((v_item->>'quantity')::int, 1), 99));
    v_item_count := v_item_count + v_quantity;

    select mi.name, coalesce(omi.price_override, mi.base_price)
    into v_item_name, v_unit_price
    from menu_items mi
    left join outlet_menu_items omi
      on omi.item_id = mi.id and omi.outlet_id = v_outlet_id
    where mi.id = v_item_id
      and mi.is_active = true
      and coalesce(omi.is_available, true) = true;

    if not found then
      raise exception 'Menu item is unavailable';
    end if;

    v_options_total := 0;

    for v_group in
      select value from jsonb_array_elements(coalesce(v_item->'customizations', '[]'::jsonb))
    loop
      v_group_id := (v_group->>'group_id')::uuid;

      if not exists (
        select 1 from item_customization_groups
        where id = v_group_id and item_id = v_item_id
      ) then
        raise exception 'Invalid customization group';
      end if;

      for v_option in
        select value from jsonb_array_elements(coalesce(v_group->'options', '[]'::jsonb))
      loop
        v_option_id := (v_option->>'id')::uuid;

        select price into v_option_price
        from customization_options
        where id = v_option_id
          and group_id = v_group_id
          and is_active = true;

        if not found then
          raise exception 'Invalid customization option';
        end if;

        v_options_total := v_options_total + v_option_price;
      end loop;
    end loop;

    v_line_total := round((v_unit_price + v_options_total) * v_quantity, 2);
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  select coalesce((select value from app_settings where key = 'tax_rate'), '0.05')::numeric into v_tax_rate;
  select coalesce((select value from app_settings where key = 'packaging_charge'), '10')::numeric into v_packaging_charge_setting;
  select coalesce((select value from app_settings where key = 'packaging_mode'), 'per_order') into v_packaging_mode;

  v_coupon_code := nullif(upper(trim(coalesce(p_order->>'coupon_code', ''))), '');
  if v_coupon_code is not null then
    select * into v_coupon
    from coupons
    where upper(code) = v_coupon_code
      and is_active = true
      and starts_at <= now()
      and ends_at > now()
    for update;

    if not found then
      raise exception 'Invalid coupon';
    end if;

    if v_subtotal < v_coupon.min_order then
      raise exception 'Coupon minimum order not met';
    end if;

    if v_coupon.usage_limit is not null and v_coupon.used_count >= v_coupon.usage_limit then
      raise exception 'Coupon usage limit reached';
    end if;

    if v_coupon.discount_type = 'percentage' then
      v_coupon_discount := round(v_subtotal * v_coupon.discount_value / 100, 2);
      if v_coupon.max_discount is not null then
        v_coupon_discount := least(v_coupon_discount, v_coupon.max_discount);
      end if;
    else
      v_coupon_discount := least(v_coupon.discount_value, v_subtotal);
    end if;
  end if;

  select coalesce((select value from app_settings where key = 'nth_order_discount_enabled'), 'true')::boolean into v_nth_enabled;
  if v_nth_enabled and v_coupon_code is null then
    select coalesce((select value from app_settings where key = 'nth_order_interval'), '5')::int into v_nth_interval;
    select coalesce((select value from app_settings where key = 'nth_order_discount_pct'), '10')::numeric into v_nth_pct;
    select count(*) into v_completed_orders from orders where user_id = v_auth_uid and status = 'picked_up';

    if v_nth_interval > 0 and ((v_completed_orders + 1) % v_nth_interval = 0) then
      v_nth_discount := round(v_subtotal * v_nth_pct / 100, 2);
    end if;
  end if;

  v_total_discount := least(v_subtotal, v_coupon_discount + v_nth_discount);
  v_tax := round(greatest(0, v_subtotal - v_total_discount) * v_tax_rate, 2);

  if v_packaging_mode = 'per_item' then
    v_packaging := v_packaging_charge_setting * v_item_count;
  else
    v_packaging := v_packaging_charge_setting;
  end if;

  if p_loyalty_points > 0 then
    select * into v_account from loyalty_accounts where user_id = v_auth_uid for update;
    if not found or v_account.current_points < p_loyalty_points then
      raise exception 'Insufficient loyalty points';
    end if;

    select coalesce((select value from app_settings where key = 'loyalty_point_value'), '0.25')::numeric into v_point_value;
    v_loyalty_discount := round(p_loyalty_points * v_point_value, 2);
  end if;

  v_total := round(greatest(0, v_subtotal - v_total_discount + v_tax + v_packaging - v_loyalty_discount), 2);

  if v_wallet_amount < 0 or v_wallet_amount > v_total then
    raise exception 'Invalid wallet amount';
  end if;

  if v_wallet_amount > 0 then
    select * into v_wallet from wallets where user_id = v_auth_uid for update;
    if not found then
      raise exception 'Wallet not found';
    end if;

    if (v_wallet.loaded_balance + v_wallet.bonus_balance) < v_wallet_amount then
      raise exception 'Insufficient wallet balance';
    end if;
  end if;

  v_payment_method := case
    when v_wallet_amount >= v_total then 'wallet'
    when v_wallet_amount > 0 then 'split'
    else 'online'
  end;
  if coalesce(p_order->>'payment_status', '') = 'paid'
    and coalesce(p_order->>'razorpay_order_id', '') <> ''
    and coalesce(p_order->>'razorpay_payment_id', '') <> '' then
    if coalesce(nullif(p_order->>'razorpay_amount_paid', '')::numeric, -1)
      < round(greatest(0, v_total - v_wallet_amount), 2) then
      raise exception 'Razorpay payment amount does not match order total';
    end if;

    select id into v_existing_order_id
    from orders
    where razorpay_payment_id = p_order->>'razorpay_payment_id'
      and user_id = v_auth_uid;

    if found then
      return jsonb_build_object(
        'order_id', v_existing_order_id,
        'payment_status', 'paid',
        'idempotent', true
      );
    end if;

    v_payment_status := 'paid';
  elsif v_wallet_amount >= v_total then
    v_payment_status := 'paid';
  else
    v_payment_status := 'pending';
  end if;

  v_order_number := 'PM' || upper(substr(md5(gen_random_uuid()::text), 1, 8));

  insert into orders (
    order_number, user_id, outlet_id, status,
    subtotal, tax, packaging_charge, discount, wallet_used, total,
    payment_method, payment_status, coupon_code, notes, loyalty_points_used, loyalty_discount, razorpay_order_id, razorpay_payment_id
  ) values (
    v_order_number, v_auth_uid, v_outlet_id, 'pending',
    v_subtotal, v_tax, v_packaging, v_total_discount, v_wallet_amount, v_total,
    v_payment_method, v_payment_status, v_coupon_code, nullif(p_order->>'notes', ''),
    p_loyalty_points, v_loyalty_discount,
    nullif(p_order->>'razorpay_order_id', ''),
    nullif(p_order->>'razorpay_payment_id', '')
  ) returning id into v_order_id;

  foreach v_item in array p_items loop
    v_item_id := (v_item->>'item_id')::uuid;
    v_quantity := greatest(1, least(coalesce((v_item->>'quantity')::int, 1), 99));

    select mi.name, coalesce(omi.price_override, mi.base_price)
    into v_item_name, v_unit_price
    from menu_items mi
    left join outlet_menu_items omi
      on omi.item_id = mi.id and omi.outlet_id = v_outlet_id
    where mi.id = v_item_id;

    v_options_total := 0;
    for v_group in
      select value from jsonb_array_elements(coalesce(v_item->'customizations', '[]'::jsonb))
    loop
      v_group_id := (v_group->>'group_id')::uuid;
      for v_option in
        select value from jsonb_array_elements(coalesce(v_group->'options', '[]'::jsonb))
      loop
        v_option_id := (v_option->>'id')::uuid;
        select price into v_option_price
        from customization_options
        where id = v_option_id and group_id = v_group_id and is_active = true;
        v_options_total := v_options_total + coalesce(v_option_price, 0);
      end loop;
    end loop;

    v_line_total := round((v_unit_price + v_options_total) * v_quantity, 2);
    insert into order_items (order_id, item_id, item_name, quantity, unit_price, total_price, customizations)
    values (v_order_id, v_item_id, v_item_name, v_quantity, v_unit_price + v_options_total, v_line_total, coalesce(v_item->'customizations', '[]'::jsonb));
  end loop;

  if v_wallet_amount > 0 then
    v_bonus_debit := least(v_wallet.bonus_balance, v_wallet_amount);
    v_loaded_debit := v_wallet_amount - v_bonus_debit;

    update wallets
    set bonus_balance = bonus_balance - v_bonus_debit,
        loaded_balance = loaded_balance - v_loaded_debit,
        updated_at = now()
    where id = v_wallet.id;

    insert into wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id)
    values (
      v_wallet.id, 'debit', v_wallet_amount,
      (v_wallet.loaded_balance - v_loaded_debit) + (v_wallet.bonus_balance - v_bonus_debit),
      'Order payment', v_order_id::text
    );
  end if;

  if p_loyalty_points > 0 then
    update loyalty_accounts
    set current_points = current_points - p_loyalty_points,
        updated_at = now()
    where id = v_account.id;

    insert into loyalty_ledger (user_id, type, points, monetary_value, balance_after, source, order_id, description)
    values (
      v_auth_uid, 'redeem', p_loyalty_points, v_loyalty_discount,
      v_account.current_points - p_loyalty_points,
      'order_redemption', v_order_id, 'Points redeemed for order #' || v_order_number
    );
  end if;

  if v_coupon.id is not null then
    update coupons set used_count = used_count + 1 where id = v_coupon.id;
    insert into coupon_usage (coupon_id, user_id, order_id, discount_amount)
    values (v_coupon.id, v_auth_uid, v_order_id, v_coupon_discount);
  end if;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'status', 'pending',
    'subtotal', v_subtotal,
    'discount', v_total_discount,
    'loyalty_discount', v_loyalty_discount,
    'total', v_total,
    'payment_status', v_payment_status
  );
end;
$$;


ALTER FUNCTION "public"."place_order_with_wallet_validated_impl"("p_order" "jsonb", "p_items" "jsonb"[], "p_wallet_amount" numeric, "p_loyalty_points" integer, "p_nth_order_discount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_profile_privilege_escalation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_caller_role text;
  v_jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    current_setting('role', true)
  );
begin
  if old.id is distinct from new.id then
    raise exception 'Profile id cannot be changed';
  end if;

  -- Service-role operations are trusted server-side provisioning tasks.
  if v_jwt_role = 'service_role' then
    return new;
  end if;

  select role into v_caller_role
  from public.profiles
  where id = auth.uid();

  if old.role is distinct from new.role then
    -- Any transition into or out of an elevated role requires super-admin.
    -- Ordinary admins may still manage customer <-> outlet_staff changes.
    if old.role in ('admin', 'super_admin')
       or new.role in ('admin', 'super_admin') then
      if v_caller_role is distinct from 'super_admin' then
        raise exception 'Super admin access required for elevated role changes';
      end if;
    elsif coalesce(v_caller_role, '') not in ('admin', 'super_admin') then
      raise exception 'Profile role cannot be changed by this user';
    end if;
  end if;

  if old.referral_code is distinct from new.referral_code
     and coalesce(v_caller_role, '') not in ('admin', 'super_admin') then
    raise exception 'Referral code cannot be changed by this user';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_profile_privilege_escalation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_unpaid_order_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.payment_status <> 'paid' then
    raise exception 'Online payments are not configured; unpaid orders cannot be created';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_unpaid_order_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_gift_card"("p_redeem_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_card gift_cards%rowtype;
  v_user_id uuid;
  v_wallet wallets%rowtype;
  v_new_balance numeric;
BEGIN
  -- Get current user
  SELECT auth.uid() INTO v_user_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Find the gift card
  SELECT * INTO v_card FROM gift_cards WHERE redeem_code = upper(trim(p_redeem_code)) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid gift card code');
  END IF;

  -- Verify status
  IF v_card.status = 'redeemed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This gift card has already been redeemed');
  END IF;
  IF v_card.status = 'expired' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This gift card has expired');
  END IF;
  IF v_card.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This gift card has been cancelled');
  END IF;
  IF v_card.status NOT IN ('active', 'sold') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This gift card is not available for redemption');
  END IF;

  -- Check expiry
  IF v_card.expires_at < now() THEN
    UPDATE gift_cards SET status = 'expired', updated_at = now() WHERE id = v_card.id;
    RETURN jsonb_build_object('success', false, 'error', 'This gift card has expired');
  END IF;

  -- Credit wallet
  SELECT * INTO v_wallet FROM wallets WHERE user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  v_new_balance := v_wallet.bonus_balance + v_card.wallet_credit;
  UPDATE wallets SET bonus_balance = v_new_balance, updated_at = now() WHERE id = v_wallet.id;

  -- Record wallet transaction
  INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id)
  VALUES (v_wallet.id, 'bonus', v_card.wallet_credit, v_wallet.loaded_balance + v_new_balance,
    'Gift Card Redeemed: ' || v_card.gift_card_id, v_card.id::text);

  -- Mark as redeemed
  UPDATE gift_cards
    SET status = 'redeemed', redeemed_by = v_user_id, redeemed_at = now(), updated_at = now()
    WHERE id = v_card.id;

  -- Audit log
  INSERT INTO gift_card_audit_logs (entity_type, entity_id, admin_id, admin_name, action, new_value)
  VALUES ('gift_card', v_card.id, v_user_id, NULL, 'card_redeemed',
    jsonb_build_object('gift_card_id', v_card.gift_card_id, 'wallet_credit', v_card.wallet_credit));

  RETURN jsonb_build_object(
    'success', true,
    'wallet_credit', v_card.wallet_credit,
    'gift_card_id', v_card.gift_card_id,
    'new_bonus_balance', v_new_balance
  );
END;
$$;


ALTER FUNCTION "public"."redeem_gift_card"("p_redeem_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_loyalty_points"("p_user_id" "uuid", "p_points" integer, "p_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_account loyalty_accounts%rowtype;
  v_point_value numeric;
  v_monetary_value numeric;
  v_new_balance int;
begin
  select coalesce((select value from app_settings where key = 'loyalty_point_value'), '0.25')::numeric into v_point_value;

  -- Lock and fetch account
  select * into v_account from loyalty_accounts where user_id = p_user_id for update;
  if not found then
    raise exception 'Loyalty account not found';
  end if;

  if v_account.current_points < p_points then
    raise exception 'Insufficient loyalty points';
  end if;

  v_monetary_value := p_points * v_point_value;
  v_new_balance := v_account.current_points - p_points;

  -- Deduct points
  update loyalty_accounts
  set current_points = v_new_balance
  where id = v_account.id;

  -- Log to ledger
  insert into loyalty_ledger (user_id, type, points, monetary_value, balance_after, source, order_id, description)
  values (p_user_id, 'redeem', p_points, v_monetary_value, v_new_balance, 'order_redemption', p_order_id, 'Points redeemed for order');

  return jsonb_build_object(
    'success', true,
    'points_redeemed', p_points,
    'monetary_value', v_monetary_value,
    'new_balance', v_new_balance
  );
end;
$$;


ALTER FUNCTION "public"."redeem_loyalty_points"("p_user_id" "uuid", "p_points" integer, "p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_and_refund_order"("p_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_order orders%rowtype;
  v_wallet wallets%rowtype;
  v_loyalty_account loyalty_accounts%rowtype;
  v_new_balance numeric;
  v_new_points_balance int;
  v_wallet_refunded numeric := 0;
  v_loyalty_points_refunded int := 0;
begin
  if not public.can_manage_order(p_order_id) then
    raise exception 'Order management access required';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status != 'rejected' and v_order.status != 'pending' then
    raise exception 'Only pending or rejected orders can be refunded';
  end if;
  if v_order.payment_status = 'refunded' then raise exception 'Order already refunded'; end if;

  update orders set status = 'rejected', payment_status = 'refunded' where id = p_order_id;

  if v_order.wallet_used > 0 then
    select * into v_wallet from wallets where user_id = v_order.user_id for update;
    if found then
      v_new_balance := v_wallet.loaded_balance + v_order.wallet_used;
      v_wallet_refunded := v_order.wallet_used;
      update wallets set loaded_balance = v_new_balance, updated_at = now() where id = v_wallet.id;
      insert into wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id)
      values (v_wallet.id, 'refund', v_order.wallet_used, v_new_balance + v_wallet.bonus_balance, 'Refund for rejected order #' || v_order.order_number, p_order_id::text);
    end if;
  end if;

  if v_order.loyalty_points_used > 0 then
    select * into v_loyalty_account from loyalty_accounts where user_id = v_order.user_id for update;
    if found then
      v_new_points_balance := v_loyalty_account.current_points + v_order.loyalty_points_used;
      v_loyalty_points_refunded := v_order.loyalty_points_used;
      update loyalty_accounts set current_points = v_new_points_balance, updated_at = now() where id = v_loyalty_account.id;
      insert into loyalty_ledger (user_id, type, points, monetary_value, balance_after, source, order_id, description)
      values (v_order.user_id, 'earn', v_order.loyalty_points_used, v_order.loyalty_discount, v_new_points_balance, 'order_refund', p_order_id, 'Loyalty points refunded for rejected order #' || v_order.order_number);
    end if;
  end if;

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', 'rejected',
    'payment_method', v_order.payment_method,
    'wallet_refunded', v_wallet_refunded,
    'loyalty_points_refunded', v_loyalty_points_refunded,
    'online_amount', greatest(0, v_order.total - v_order.wallet_used),
    'payment_status', 'refunded'
  );
end;
$$;


ALTER FUNCTION "public"."reject_and_refund_order"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_order_with_refund"("p_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return public.reject_and_refund_order(p_order_id);
end;
$$;


ALTER FUNCTION "public"."reject_order_with_refund"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."renew_expired_membership_cycles"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_cycle membership_cycles%rowtype;
  v_cycle_months int;
  v_new_starting_tier text;
  v_renewed_count int := 0;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select coalesce((select value from app_settings where key = 'membership_cycle_months'), '6')::int into v_cycle_months;

  for v_cycle in
    select * from membership_cycles
    where is_active = true and cycle_end < now()
  loop
    case v_cycle.current_tier
      when 'pnut_legend' then v_new_starting_tier := 'sprout_hero';
      when 'sprout_hero' then v_new_starting_tier := 'sprout_hero';
      else v_new_starting_tier := 'sprout_star';
    end case;

    update membership_cycles set is_active = false, updated_at = now() where id = v_cycle.id;

    insert into membership_cycles (user_id, cycle_start, cycle_end, starting_tier, current_tier, cycle_order_count)
    values (v_cycle.user_id, now(), now() + (v_cycle_months || ' months')::interval, v_new_starting_tier, v_new_starting_tier, 0);

    v_renewed_count := v_renewed_count + 1;
  end loop;

  return jsonb_build_object('renewed_count', v_renewed_count);
end;
$$;


ALTER FUNCTION "public"."renew_expired_membership_cycles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."self_topup_wallet"("p_user_id" "uuid", "p_amount" numeric, "p_razorpay_payment_id" "text", "p_razorpay_order_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_wallet wallets%rowtype;
  v_existing_tx wallet_transactions%rowtype;
  v_new_loaded numeric;
  v_auth_uid uuid;
begin
  v_auth_uid := auth.uid();
  if v_auth_uid is null then
    raise exception 'Authentication required';
  end if;

  if v_auth_uid <> p_user_id and not public.is_admin() then
    raise exception 'Cannot top up another user wallet';
  end if;

  if p_amount <= 0 then
    raise exception 'Invalid top-up amount';
  end if;

  select wt.* into v_existing_tx
  from wallet_transactions wt
  join wallets w on w.id = wt.wallet_id
  where wt.type = 'topup'
    and wt.reference_id = p_razorpay_payment_id
    and w.user_id = p_user_id;

  if found then
    select * into v_wallet from wallets where user_id = p_user_id;
    return jsonb_build_object(
      'success', true,
      'loaded_balance', coalesce(v_wallet.loaded_balance, 0),
      'bonus_balance', coalesce(v_wallet.bonus_balance, 0),
      'total_balance', coalesce(v_wallet.loaded_balance, 0) + coalesce(v_wallet.bonus_balance, 0),
      'idempotent', true
    );
  end if;

  select * into v_wallet from wallets where user_id = p_user_id for update;

  if not found then
    insert into wallets (user_id, loaded_balance, bonus_balance)
    values (p_user_id, 0, 0)
    returning * into v_wallet;
  end if;

  v_new_loaded := v_wallet.loaded_balance + p_amount;

  update wallets
  set loaded_balance = v_new_loaded,
      updated_at = now()
  where id = v_wallet.id;

  insert into wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id)
  values (v_wallet.id, 'topup', p_amount, v_new_loaded + v_wallet.bonus_balance,
          'Wallet top-up via Razorpay', p_razorpay_payment_id);

  return jsonb_build_object(
    'success', true,
    'loaded_balance', v_new_loaded,
    'bonus_balance', v_wallet.bonus_balance,
    'total_balance', v_new_loaded + v_wallet.bonus_balance
  );
end;
$$;


ALTER FUNCTION "public"."self_topup_wallet"("p_user_id" "uuid", "p_amount" numeric, "p_razorpay_payment_id" "text", "p_razorpay_order_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_pickup_otp_required"("p_required" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.app_settings
  set value = case when p_required then 'true' else 'false' end,
      updated_at = now()
  where key = 'pickup_otp_required';

  if not found then
    insert into public.app_settings (key, value)
    values ('pickup_otp_required', case when p_required then 'true' else 'false' end);
  end if;

  return jsonb_build_object('pickup_otp_required', p_required);
end;
$$;


ALTER FUNCTION "public"."set_pickup_otp_required"("p_required" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_loyalty_ledger_on_earn"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_point_value numeric;
  v_account loyalty_accounts%rowtype;
  v_action_slug text;
begin
  select coalesce((select value from app_settings where key = 'loyalty_point_value'), '0.25')::numeric into v_point_value;
  select * into v_account from loyalty_accounts where user_id = new.user_id;
  select slug into v_action_slug from loyalty_actions where id = new.action_id;

  insert into loyalty_ledger (user_id, type, points, monetary_value, balance_after, source, order_id, description)
  values (
    new.user_id,
    'earn',
    new.points,
    new.points * v_point_value,
    coalesce(v_account.current_points, 0),
    coalesce(new.description, 'Points earned'),
    case
      when v_action_slug = 'order_placed'
        and new.reference_id ~ '^[0-9a-f]{8}-'
      then new.reference_id::uuid
      else null
    end,
    coalesce(new.description, 'Points earned')
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_loyalty_ledger_on_earn"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."topup_wallet"("p_user_id" "uuid", "p_amount" numeric, "p_bonus" numeric DEFAULT 0, "p_reference_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_wallet wallets%rowtype;
  v_new_loaded numeric;
  v_new_bonus numeric;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if p_amount <= 0 or p_bonus < 0 then
    raise exception 'Invalid top-up amount';
  end if;

  select * into v_wallet from wallets where user_id = p_user_id for update;

  if not found then
    raise exception 'Wallet not found for user %', p_user_id;
  end if;

  v_new_loaded := v_wallet.loaded_balance + p_amount;
  v_new_bonus := v_wallet.bonus_balance + p_bonus;

  update wallets
  set loaded_balance = v_new_loaded,
      bonus_balance = v_new_bonus,
      updated_at = now()
  where id = v_wallet.id;

  insert into wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id)
  values (v_wallet.id, 'topup', p_amount, v_new_loaded + v_new_bonus, 'Admin wallet top-up', p_reference_id);

  if p_bonus > 0 then
    insert into wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id)
    values (v_wallet.id, 'bonus', p_bonus, v_new_loaded + v_new_bonus, 'Admin top-up bonus', p_reference_id);
  end if;

  return jsonb_build_object(
    'loaded_balance', v_new_loaded,
    'bonus_balance', v_new_bonus,
    'total_balance', v_new_loaded + v_new_bonus
  );
end;
$$;


ALTER FUNCTION "public"."topup_wallet"("p_user_id" "uuid", "p_amount" numeric, "p_bonus" numeric, "p_reference_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_order_status"("p_order_id" "uuid", "p_status" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_order public.orders%rowtype;
  v_allowed boolean;
begin
  if p_status not in ('confirmed', 'preparing', 'ready') then
    raise exception 'Unsupported order status';
  end if;

  if not public.can_manage_order(p_order_id) then
    raise exception 'Order management access required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.status = p_status then
    return jsonb_build_object(
      'order_id', p_order_id,
      'status', v_order.status,
      'changed', false
    );
  end if;

  v_allowed :=
    (v_order.status = 'pending' and p_status = 'confirmed')
    or (v_order.status = 'confirmed' and p_status = 'preparing')
    or (v_order.status = 'preparing' and p_status = 'ready');

  if not v_allowed then
    raise exception 'Invalid order status transition from % to %', v_order.status, p_status;
  end if;

  if v_order.payment_status <> 'paid' then
    raise exception 'Cannot progress an unpaid order';
  end if;

  update public.orders
  set status = p_status
  where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', p_status,
    'changed', true
  );
end;
$$;


ALTER FUNCTION "public"."update_order_status"("p_order_id" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_outlet_menu_item"("p_outlet_id" "uuid", "p_item_id" "uuid", "p_is_available" boolean, "p_price_override" numeric DEFAULT NULL::numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_admin() and not public.is_outlet_staff_for_outlet(p_outlet_id) then
    raise exception 'Outlet menu access required';
  end if;

  if p_price_override is not null and p_price_override < 0 then
    raise exception 'Price override cannot be negative';
  end if;

  if not exists (select 1 from public.outlets where id = p_outlet_id) then
    raise exception 'Outlet not found';
  end if;

  if not exists (select 1 from public.menu_items where id = p_item_id) then
    raise exception 'Menu item not found';
  end if;

  insert into public.outlet_menu_items (
    outlet_id,
    item_id,
    is_available,
    price_override
  )
  values (
    p_outlet_id,
    p_item_id,
    p_is_available,
    p_price_override
  )
  on conflict (outlet_id, item_id)
  do update set
    is_available = excluded.is_available,
    price_override = excluded.price_override;

  return jsonb_build_object(
    'outlet_id', p_outlet_id,
    'item_id', p_item_id,
    'is_available', p_is_available,
    'price_override', p_price_override
  );
end;
$$;


ALTER FUNCTION "public"."upsert_outlet_menu_item"("p_outlet_id" "uuid", "p_item_id" "uuid", "p_is_available" boolean, "p_price_override" numeric) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaigns_type_check" CHECK (("type" = ANY (ARRAY['wallet_topup_bonus'::"text", 'referral'::"text", 'birthday'::"text", 'first_order'::"text"])))
);


ALTER TABLE "public"."campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coupon_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coupon_id" "uuid",
    "admin_id" "uuid" NOT NULL,
    "admin_name" "text",
    "action" "text" NOT NULL,
    "previous_value" "jsonb",
    "new_value" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coupon_audit_logs_action_check" CHECK (("action" = ANY (ARRAY['created'::"text", 'updated'::"text", 'activated'::"text", 'paused'::"text", 'archived'::"text", 'deleted'::"text", 'duplicated'::"text", 'campaign_changed'::"text", 'outlet_changed'::"text"])))
);


ALTER TABLE "public"."coupon_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coupon_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "banner_url" "text",
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coupon_campaigns_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'paused'::"text", 'ended'::"text"])))
);


ALTER TABLE "public"."coupon_campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coupon_outlet_restrictions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coupon_id" "uuid" NOT NULL,
    "outlet_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."coupon_outlet_restrictions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coupon_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coupon_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "discount_amount" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."coupon_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coupons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "description" "text" NOT NULL,
    "discount_type" "text" NOT NULL,
    "discount_value" numeric(10,2) NOT NULL,
    "min_order" numeric(10,2) DEFAULT 0 NOT NULL,
    "max_discount" numeric(10,2),
    "usage_limit" integer,
    "used_count" integer DEFAULT 0 NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text",
    "discount_type_ext" "text",
    "min_cart_value" numeric(10,2) DEFAULT 0,
    "per_user_limit" integer,
    "daily_limit" integer,
    "priority" integer DEFAULT 0,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "campaign_id" "uuid",
    "customer_eligibility" "text" DEFAULT 'all'::"text",
    "buy_x_qty" integer,
    "get_y_qty" integer,
    "free_product_id" "uuid",
    "applicable_type" "text" DEFAULT 'all'::"text",
    "applicable_product_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "applicable_category_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "coupons_applicable_type_check" CHECK (("applicable_type" = ANY (ARRAY['all'::"text", 'products'::"text", 'categories'::"text"]))),
    CONSTRAINT "coupons_customer_eligibility_check" CHECK (("customer_eligibility" = ANY (ARRAY['all'::"text", 'new'::"text", 'existing'::"text", 'premium'::"text", 'student'::"text"]))),
    CONSTRAINT "coupons_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percentage'::"text", 'flat'::"text"]))),
    CONSTRAINT "coupons_discount_type_ext_check" CHECK (("discount_type_ext" = ANY (ARRAY['percentage'::"text", 'flat'::"text", 'free_delivery'::"text", 'buy_x_get_y'::"text", 'free_product'::"text"]))),
    CONSTRAINT "coupons_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'scheduled'::"text", 'active'::"text", 'paused'::"text", 'expired'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."coupons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_addresses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "label" "text" DEFAULT 'Home'::"text" NOT NULL,
    "recipient_name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "address_line_1" "text" NOT NULL,
    "address_line_2" "text",
    "landmark" "text",
    "city" "text" NOT NULL,
    "state" "text" NOT NULL,
    "pincode" "text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "customer_addresses_address_line_1_check" CHECK ((("char_length"("address_line_1") >= 3) AND ("char_length"("address_line_1") <= 200))),
    CONSTRAINT "customer_addresses_city_check" CHECK ((("char_length"("city") >= 2) AND ("char_length"("city") <= 100))),
    CONSTRAINT "customer_addresses_label_check" CHECK ((("char_length"("label") >= 1) AND ("char_length"("label") <= 30))),
    CONSTRAINT "customer_addresses_phone_check" CHECK (("phone" ~ '^[0-9+ -]{7,20}$'::"text")),
    CONSTRAINT "customer_addresses_pincode_check" CHECK (("pincode" ~ '^[0-9]{6}$'::"text")),
    CONSTRAINT "customer_addresses_recipient_name_check" CHECK ((("char_length"("recipient_name") >= 1) AND ("char_length"("recipient_name") <= 100))),
    CONSTRAINT "customer_addresses_state_check" CHECK ((("char_length"("state") >= 2) AND ("char_length"("state") <= 100)))
);


ALTER TABLE "public"."customer_addresses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customization_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "price" numeric(10,2) DEFAULT 0 NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."customization_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gift_card_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "admin_id" "uuid",
    "admin_name" "text",
    "action" "text" NOT NULL,
    "previous_value" "jsonb",
    "new_value" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gift_card_audit_logs_action_check" CHECK (("action" = ANY (ARRAY['template_created'::"text", 'template_updated'::"text", 'batch_generated'::"text", 'card_activated'::"text", 'card_sold'::"text", 'card_redeemed'::"text", 'card_expired'::"text", 'card_cancelled'::"text", 'status_changed'::"text"]))),
    CONSTRAINT "gift_card_audit_logs_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['template'::"text", 'batch'::"text", 'gift_card'::"text"])))
);


ALTER TABLE "public"."gift_card_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gift_card_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "batch_name" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "code_format" "text" DEFAULT 'alphanumeric_12'::"text" NOT NULL,
    "code_prefix" "text",
    "generated_count" integer DEFAULT 0 NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gift_card_batches_code_format_check" CHECK (("code_format" = ANY (ARRAY['alphanumeric_12'::"text", 'numeric_12'::"text", 'prefix_alphanumeric'::"text", 'prefix_3_numeric'::"text"])))
);


ALTER TABLE "public"."gift_card_batches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gift_card_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "purchase_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "wallet_credit" numeric(10,2) NOT NULL,
    "validity_days" integer DEFAULT 365 NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gift_card_templates_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'inactive'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."gift_card_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gift_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gift_card_id" "text" NOT NULL,
    "redeem_code" "text" NOT NULL,
    "template_id" "uuid" NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "purchase_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "wallet_credit" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'generated'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "redeemed_by" "uuid",
    "redeemed_at" timestamp with time zone,
    "sold_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "cancellation_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gift_cards_status_check" CHECK (("status" = ANY (ARRAY['generated'::"text", 'active'::"text", 'reserved'::"text", 'sold'::"text", 'redeemed'::"text", 'expired'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."gift_cards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."item_customization_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "is_required" boolean DEFAULT false NOT NULL,
    "min_select" integer DEFAULT 0 NOT NULL,
    "max_select" integer DEFAULT 1 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "item_customization_groups_type_check" CHECK (("type" = ANY (ARRAY['base'::"text", 'topping'::"text", 'flavour'::"text", 'extra'::"text"])))
);


ALTER TABLE "public"."item_customization_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tier_id" "uuid" NOT NULL,
    "current_points" integer DEFAULT 0 NOT NULL,
    "lifetime_points" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."loyalty_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text" NOT NULL,
    "points" integer NOT NULL,
    "event_type" "text" NOT NULL,
    "max_per_day" integer,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."loyalty_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "points" integer NOT NULL,
    "monetary_value" numeric(10,2) DEFAULT 0 NOT NULL,
    "balance_after" integer NOT NULL,
    "source" "text" NOT NULL,
    "order_id" "uuid",
    "description" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loyalty_ledger_type_check" CHECK (("type" = ANY (ARRAY['earn'::"text", 'redeem'::"text"])))
);


ALTER TABLE "public"."loyalty_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_points_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action_id" "uuid",
    "mission_id" "uuid",
    "points" integer NOT NULL,
    "description" "text" NOT NULL,
    "reference_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."loyalty_points_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_tiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "min_lifetime_points" integer DEFAULT 0 NOT NULL,
    "multiplier" numeric(3,1) DEFAULT 1.0 NOT NULL,
    "benefits" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."loyalty_tiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."membership_cycles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cycle_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cycle_end" timestamp with time zone NOT NULL,
    "starting_tier" "text" DEFAULT 'sprout_star'::"text" NOT NULL,
    "current_tier" "text" DEFAULT 'sprout_star'::"text" NOT NULL,
    "cycle_order_count" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."membership_cycles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "image_url" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."menu_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subcategory_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "image_url" "text",
    "base_price" numeric(10,2) NOT NULL,
    "is_veg" boolean DEFAULT true NOT NULL,
    "is_bestseller" boolean DEFAULT false NOT NULL,
    "is_new" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."menu_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_subcategories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."menu_subcategories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mission_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "mission_id" "uuid" NOT NULL,
    "current_count" integer DEFAULT 0 NOT NULL,
    "is_completed" boolean DEFAULT false NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."mission_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."missions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "type" "text" NOT NULL,
    "target_event" "text" NOT NULL,
    "target_count" integer DEFAULT 1 NOT NULL,
    "reward_points" integer DEFAULT 0 NOT NULL,
    "reward_type" "text" DEFAULT 'points'::"text" NOT NULL,
    "reward_value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "missions_reward_type_check" CHECK (("reward_type" = ANY (ARRAY['points'::"text", 'coupon'::"text", 'badge'::"text"]))),
    CONSTRAINT "missions_type_check" CHECK (("type" = ANY (ARRAY['one_time'::"text", 'recurring'::"text", 'streak'::"text"])))
);


ALTER TABLE "public"."missions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "type" "text" DEFAULT 'general'::"text" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['order'::"text", 'wallet'::"text", 'loyalty'::"text", 'campaign'::"text", 'general'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "item_name" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "unit_price" numeric(10,2) NOT NULL,
    "total_price" numeric(10,2) NOT NULL,
    "customizations" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "rating" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "order_ratings_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."order_ratings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_number" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "outlet_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "subtotal" numeric(10,2) NOT NULL,
    "tax" numeric(10,2) DEFAULT 0 NOT NULL,
    "packaging_charge" numeric(10,2) DEFAULT 0 NOT NULL,
    "discount" numeric(10,2) DEFAULT 0 NOT NULL,
    "wallet_used" numeric(10,2) DEFAULT 0 NOT NULL,
    "total" numeric(10,2) NOT NULL,
    "payment_method" "text" NOT NULL,
    "payment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "coupon_code" "text",
    "notes" "text",
    "estimated_ready_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "delivery_code" "text",
    "loyalty_points_used" integer DEFAULT 0 NOT NULL,
    "loyalty_discount" numeric(10,2) DEFAULT 0 NOT NULL,
    "razorpay_order_id" "text",
    "razorpay_payment_id" "text",
    CONSTRAINT "orders_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['online'::"text", 'wallet'::"text", 'split'::"text"]))),
    CONSTRAINT "orders_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'refunded'::"text"]))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'preparing'::"text", 'ready'::"text", 'picked_up'::"text", 'cancelled'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."outlet_menu_items" (
    "outlet_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "is_available" boolean DEFAULT true NOT NULL,
    "price_override" numeric(10,2)
);


ALTER TABLE "public"."outlet_menu_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."outlet_settings" (
    "outlet_id" "uuid" NOT NULL,
    "auto_accept_orders" boolean DEFAULT false NOT NULL,
    "estimated_prep_time" integer DEFAULT 20 NOT NULL,
    "max_concurrent_orders" integer DEFAULT 50 NOT NULL,
    "new_order_sound" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."outlet_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."outlet_staff" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "outlet_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "is_manager" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."outlet_staff" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."outlets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "address" "text" NOT NULL,
    "city" "text" NOT NULL,
    "state" "text" NOT NULL,
    "pincode" "text" NOT NULL,
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "phone" "text" NOT NULL,
    "image_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "opens_at" time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
    "closes_at" time without time zone DEFAULT '22:00:00'::time without time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_manually_closed" boolean DEFAULT false NOT NULL,
    "manual_close_reason" "text"
);


ALTER TABLE "public"."outlets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "razorpay_order_id" "text" NOT NULL,
    "razorpay_payment_id" "text",
    "amount_paise" bigint NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "order_payload" "jsonb" NOT NULL,
    "items_payload" "jsonb" NOT NULL,
    "wallet_amount" numeric DEFAULT 0 NOT NULL,
    "loyalty_points" integer DEFAULT 0 NOT NULL,
    "nth_order_discount" numeric DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'created'::"text" NOT NULL,
    "app_order_id" "uuid",
    "failure_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_attempts_amount_paise_check" CHECK (("amount_paise" > 0)),
    CONSTRAINT "payment_attempts_currency_check" CHECK (("currency" = 'INR'::"text")),
    CONSTRAINT "payment_attempts_status_check" CHECK (("status" = ANY (ARRAY['created'::"text", 'captured'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."payment_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "phone" "text",
    "email" "text",
    "full_name" "text",
    "avatar_url" "text",
    "role" "text" DEFAULT 'customer'::"text" NOT NULL,
    "referral_code" "text",
    "referred_by" "uuid",
    "date_of_birth" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['customer'::"text", 'admin'::"text", 'super_admin'::"text", 'outlet_staff'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."support_ticket_number_seq"
    START WITH 1001
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."support_ticket_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_number" "text" DEFAULT ('PM-'::"text" || ("nextval"('"public"."support_ticket_number_seq"'::"regclass"))::"text") NOT NULL,
    "user_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "admin_response" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "support_tickets_category_check" CHECK (("category" = ANY (ARRAY['order'::"text", 'payment'::"text", 'wallet'::"text", 'account'::"text", 'feedback'::"text", 'other'::"text"]))),
    CONSTRAINT "support_tickets_message_check" CHECK ((("char_length"("message") >= 10) AND ("char_length"("message") <= 2000))),
    CONSTRAINT "support_tickets_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'resolved'::"text", 'closed'::"text"]))),
    CONSTRAINT "support_tickets_subject_check" CHECK ((("char_length"("subject") >= 3) AND ("char_length"("subject") <= 120)))
);


ALTER TABLE "public"."support_tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "wallet_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "balance_after" numeric(10,2) NOT NULL,
    "description" "text" NOT NULL,
    "reference_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wallet_transactions_type_check" CHECK (("type" = ANY (ARRAY['topup'::"text", 'bonus'::"text", 'debit'::"text", 'refund'::"text"])))
);


ALTER TABLE "public"."wallet_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "loaded_balance" numeric(10,2) DEFAULT 0 NOT NULL,
    "bonus_balance" numeric(10,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."wallets" OWNER TO "postgres";


ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coupon_audit_logs"
    ADD CONSTRAINT "coupon_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coupon_campaigns"
    ADD CONSTRAINT "coupon_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coupon_outlet_restrictions"
    ADD CONSTRAINT "coupon_outlet_restrictions_coupon_id_outlet_id_key" UNIQUE ("coupon_id", "outlet_id");



ALTER TABLE ONLY "public"."coupon_outlet_restrictions"
    ADD CONSTRAINT "coupon_outlet_restrictions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coupon_usage"
    ADD CONSTRAINT "coupon_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_addresses"
    ADD CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customization_options"
    ADD CONSTRAINT "customization_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gift_card_audit_logs"
    ADD CONSTRAINT "gift_card_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gift_card_batches"
    ADD CONSTRAINT "gift_card_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gift_card_templates"
    ADD CONSTRAINT "gift_card_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gift_cards"
    ADD CONSTRAINT "gift_cards_gift_card_id_key" UNIQUE ("gift_card_id");



ALTER TABLE ONLY "public"."gift_cards"
    ADD CONSTRAINT "gift_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gift_cards"
    ADD CONSTRAINT "gift_cards_redeem_code_key" UNIQUE ("redeem_code");



ALTER TABLE ONLY "public"."item_customization_groups"
    ADD CONSTRAINT "item_customization_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_accounts"
    ADD CONSTRAINT "loyalty_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_accounts"
    ADD CONSTRAINT "loyalty_accounts_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."loyalty_actions"
    ADD CONSTRAINT "loyalty_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_actions"
    ADD CONSTRAINT "loyalty_actions_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."loyalty_ledger"
    ADD CONSTRAINT "loyalty_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_points_log"
    ADD CONSTRAINT "loyalty_points_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_tiers"
    ADD CONSTRAINT "loyalty_tiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_tiers"
    ADD CONSTRAINT "loyalty_tiers_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."membership_cycles"
    ADD CONSTRAINT "membership_cycles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_categories"
    ADD CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_categories"
    ADD CONSTRAINT "menu_categories_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."menu_subcategories"
    ADD CONSTRAINT "menu_subcategories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_subcategories"
    ADD CONSTRAINT "menu_subcategories_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."mission_progress"
    ADD CONSTRAINT "mission_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mission_progress"
    ADD CONSTRAINT "mission_progress_user_id_mission_id_key" UNIQUE ("user_id", "mission_id");



ALTER TABLE ONLY "public"."missions"
    ADD CONSTRAINT "missions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_ratings"
    ADD CONSTRAINT "order_ratings_order_id_user_id_key" UNIQUE ("order_id", "user_id");



ALTER TABLE ONLY "public"."order_ratings"
    ADD CONSTRAINT "order_ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_order_number_key" UNIQUE ("order_number");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."outlet_menu_items"
    ADD CONSTRAINT "outlet_menu_items_pkey" PRIMARY KEY ("outlet_id", "item_id");



ALTER TABLE ONLY "public"."outlet_settings"
    ADD CONSTRAINT "outlet_settings_pkey" PRIMARY KEY ("outlet_id");



ALTER TABLE ONLY "public"."outlet_staff"
    ADD CONSTRAINT "outlet_staff_outlet_id_user_id_key" UNIQUE ("outlet_id", "user_id");



ALTER TABLE ONLY "public"."outlet_staff"
    ADD CONSTRAINT "outlet_staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."outlets"
    ADD CONSTRAINT "outlets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."outlets"
    ADD CONSTRAINT "outlets_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."payment_attempts"
    ADD CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_attempts"
    ADD CONSTRAINT "payment_attempts_razorpay_order_id_key" UNIQUE ("razorpay_order_id");



ALTER TABLE ONLY "public"."payment_attempts"
    ADD CONSTRAINT "payment_attempts_razorpay_payment_id_key" UNIQUE ("razorpay_payment_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_referral_code_key" UNIQUE ("referral_code");



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_ticket_number_key" UNIQUE ("ticket_number");



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_user_id_key" UNIQUE ("user_id");



CREATE UNIQUE INDEX "customer_addresses_one_default" ON "public"."customer_addresses" USING "btree" ("user_id") WHERE "is_default";



CREATE INDEX "customer_addresses_user_id_idx" ON "public"."customer_addresses" USING "btree" ("user_id");



CREATE INDEX "idx_campaigns_active" ON "public"."campaigns" USING "btree" ("is_active", "starts_at", "ends_at");



CREATE INDEX "idx_coupon_audit_coupon" ON "public"."coupon_audit_logs" USING "btree" ("coupon_id");



CREATE INDEX "idx_coupon_audit_created" ON "public"."coupon_audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_coupon_audit_logs_coupon_audit_logs_admin_id" ON "public"."coupon_audit_logs" USING "btree" ("admin_id");



CREATE INDEX "idx_coupon_outlet_coupon" ON "public"."coupon_outlet_restrictions" USING "btree" ("coupon_id");



CREATE INDEX "idx_coupon_outlet_restrictions_coupon_outlet_restrictions_outle" ON "public"."coupon_outlet_restrictions" USING "btree" ("outlet_id");



CREATE INDEX "idx_coupon_usage_coupon_usage_coupon_id" ON "public"."coupon_usage" USING "btree" ("coupon_id");



CREATE INDEX "idx_coupon_usage_coupon_usage_order_id" ON "public"."coupon_usage" USING "btree" ("order_id");



CREATE INDEX "idx_coupon_usage_user" ON "public"."coupon_usage" USING "btree" ("user_id");



CREATE INDEX "idx_coupons_active" ON "public"."coupons" USING "btree" ("is_active", "starts_at", "ends_at");



CREATE INDEX "idx_coupons_code" ON "public"."coupons" USING "btree" ("code");



CREATE INDEX "idx_coupons_coupons_campaign_id" ON "public"."coupons" USING "btree" ("campaign_id");



CREATE INDEX "idx_customization_groups_item" ON "public"."item_customization_groups" USING "btree" ("item_id");



CREATE INDEX "idx_customization_options_group" ON "public"."customization_options" USING "btree" ("group_id");



CREATE INDEX "idx_gift_card_audit_created" ON "public"."gift_card_audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_gift_card_audit_entity" ON "public"."gift_card_audit_logs" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_gift_card_audit_logs_gift_card_audit_logs_admin_id" ON "public"."gift_card_audit_logs" USING "btree" ("admin_id");



CREATE INDEX "idx_gift_card_batches_gift_card_batches_created_by" ON "public"."gift_card_batches" USING "btree" ("created_by");



CREATE INDEX "idx_gift_card_batches_gift_card_batches_template_id" ON "public"."gift_card_batches" USING "btree" ("template_id");



CREATE INDEX "idx_gift_cards_batch" ON "public"."gift_cards" USING "btree" ("batch_id");



CREATE INDEX "idx_gift_cards_gift_card_id" ON "public"."gift_cards" USING "btree" ("gift_card_id");



CREATE INDEX "idx_gift_cards_redeem_code" ON "public"."gift_cards" USING "btree" ("redeem_code");



CREATE INDEX "idx_gift_cards_redeemed_by" ON "public"."gift_cards" USING "btree" ("redeemed_by");



CREATE INDEX "idx_gift_cards_status" ON "public"."gift_cards" USING "btree" ("status");



CREATE INDEX "idx_gift_cards_template" ON "public"."gift_cards" USING "btree" ("template_id");



CREATE INDEX "idx_loyalty_accounts_loyalty_accounts_tier_id" ON "public"."loyalty_accounts" USING "btree" ("tier_id");



CREATE INDEX "idx_loyalty_accounts_user" ON "public"."loyalty_accounts" USING "btree" ("user_id");



CREATE INDEX "idx_loyalty_ledger_created" ON "public"."loyalty_ledger" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_loyalty_ledger_loyalty_ledger_order_id" ON "public"."loyalty_ledger" USING "btree" ("order_id");



CREATE INDEX "idx_loyalty_ledger_type" ON "public"."loyalty_ledger" USING "btree" ("type");



CREATE INDEX "idx_loyalty_ledger_user" ON "public"."loyalty_ledger" USING "btree" ("user_id");



CREATE INDEX "idx_loyalty_points_log_created" ON "public"."loyalty_points_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_loyalty_points_log_loyalty_points_log_action_id" ON "public"."loyalty_points_log" USING "btree" ("action_id");



CREATE INDEX "idx_loyalty_points_log_loyalty_points_log_mission_fk" ON "public"."loyalty_points_log" USING "btree" ("mission_id");



CREATE INDEX "idx_loyalty_points_log_user" ON "public"."loyalty_points_log" USING "btree" ("user_id");



CREATE INDEX "idx_membership_cycles_user_active" ON "public"."membership_cycles" USING "btree" ("user_id", "is_active");



CREATE INDEX "idx_menu_items_active" ON "public"."menu_items" USING "btree" ("is_active");



CREATE INDEX "idx_menu_items_subcategory" ON "public"."menu_items" USING "btree" ("subcategory_id");



CREATE INDEX "idx_menu_subcategories_category" ON "public"."menu_subcategories" USING "btree" ("category_id");



CREATE INDEX "idx_mission_progress_mission" ON "public"."mission_progress" USING "btree" ("mission_id");



CREATE INDEX "idx_mission_progress_user" ON "public"."mission_progress" USING "btree" ("user_id");



CREATE INDEX "idx_missions_active" ON "public"."missions" USING "btree" ("is_active", "starts_at", "ends_at");



CREATE INDEX "idx_notifications_created" ON "public"."notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id", "is_read");



CREATE INDEX "idx_order_items_order" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_order_items_order_items_item_id" ON "public"."order_items" USING "btree" ("item_id");



CREATE INDEX "idx_order_ratings_order_ratings_user_id" ON "public"."order_ratings" USING "btree" ("user_id");



CREATE INDEX "idx_orders_created_at" ON "public"."orders" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_orders_outlet" ON "public"."orders" USING "btree" ("outlet_id");



CREATE UNIQUE INDEX "idx_orders_razorpay_payment_id_unique" ON "public"."orders" USING "btree" ("razorpay_payment_id") WHERE ("razorpay_payment_id" IS NOT NULL);



CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status");



CREATE INDEX "idx_orders_user" ON "public"."orders" USING "btree" ("user_id");



CREATE INDEX "idx_outlet_menu_items_outlet" ON "public"."outlet_menu_items" USING "btree" ("outlet_id");



CREATE INDEX "idx_outlet_menu_items_outlet_menu_items_item_id" ON "public"."outlet_menu_items" USING "btree" ("item_id");



CREATE INDEX "idx_outlet_staff_outlet" ON "public"."outlet_staff" USING "btree" ("outlet_id");



CREATE INDEX "idx_outlet_staff_user" ON "public"."outlet_staff" USING "btree" ("user_id");



CREATE INDEX "idx_outlets_city" ON "public"."outlets" USING "btree" ("city");



CREATE INDEX "idx_outlets_is_active" ON "public"."outlets" USING "btree" ("is_active");



CREATE INDEX "idx_outlets_slug" ON "public"."outlets" USING "btree" ("slug");



CREATE INDEX "idx_payment_attempts_payment_attempts_app_order_id" ON "public"."payment_attempts" USING "btree" ("app_order_id");



CREATE INDEX "idx_payment_attempts_user_created" ON "public"."payment_attempts" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_profiles_phone" ON "public"."profiles" USING "btree" ("phone");



CREATE INDEX "idx_profiles_profiles_referred_by" ON "public"."profiles" USING "btree" ("referred_by");



CREATE INDEX "idx_profiles_referral_code" ON "public"."profiles" USING "btree" ("referral_code");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE UNIQUE INDEX "idx_wallet_topup_reference_unique" ON "public"."wallet_transactions" USING "btree" ("reference_id") WHERE (("type" = 'topup'::"text") AND ("reference_id" IS NOT NULL));



CREATE INDEX "idx_wallet_transactions_created" ON "public"."wallet_transactions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_wallet_transactions_wallet" ON "public"."wallet_transactions" USING "btree" ("wallet_id");



CREATE INDEX "idx_wallets_user" ON "public"."wallets" USING "btree" ("user_id");



CREATE INDEX "support_tickets_user_id_idx" ON "public"."support_tickets" USING "btree" ("user_id", "created_at" DESC);



CREATE OR REPLACE TRIGGER "customer_addresses_default_before_write" BEFORE INSERT OR UPDATE ON "public"."customer_addresses" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_customer_address_default"();



CREATE OR REPLACE TRIGGER "customer_addresses_updated_at" BEFORE UPDATE ON "public"."customer_addresses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "loyalty_accounts_updated_at" BEFORE UPDATE ON "public"."loyalty_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "menu_items_updated_at" BEFORE UPDATE ON "public"."menu_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "mission_progress_updated_at" BEFORE UPDATE ON "public"."mission_progress" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "on_outlet_created_settings" AFTER INSERT ON "public"."outlets" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_outlet_settings"();



CREATE OR REPLACE TRIGGER "on_profile_created_wallet" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_profile_wallet"();



CREATE OR REPLACE TRIGGER "orders_generate_delivery_code" BEFORE INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."generate_delivery_code"();



CREATE OR REPLACE TRIGGER "orders_membership_bonus" AFTER UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."award_membership_bonus"();



CREATE OR REPLACE TRIGGER "orders_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "outlet_settings_updated_at" BEFORE UPDATE ON "public"."outlet_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "outlets_updated_at" BEFORE UPDATE ON "public"."outlets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "support_tickets_updated_at" BEFORE UPDATE ON "public"."support_tickets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_notify_loyalty_ledger" AFTER INSERT ON "public"."loyalty_ledger" FOR EACH ROW EXECUTE FUNCTION "public"."notify_loyalty_ledger"();



CREATE OR REPLACE TRIGGER "trg_notify_order_insert" AFTER INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."notify_order_insert"();



CREATE OR REPLACE TRIGGER "trg_notify_order_status_update" AFTER UPDATE OF "status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."notify_order_status_update"();



CREATE OR REPLACE TRIGGER "trg_notify_wallet_transaction" AFTER INSERT ON "public"."wallet_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."notify_wallet_transaction"();



CREATE OR REPLACE TRIGGER "trg_prevent_profile_privilege_escalation" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_profile_privilege_escalation"();



CREATE OR REPLACE TRIGGER "trg_prevent_unpaid_order_insert" BEFORE INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_unpaid_order_insert"();



CREATE OR REPLACE TRIGGER "trg_sync_loyalty_ledger" AFTER INSERT ON "public"."loyalty_points_log" FOR EACH ROW EXECUTE FUNCTION "public"."sync_loyalty_ledger_on_earn"();



CREATE OR REPLACE TRIGGER "wallets_updated_at" BEFORE UPDATE ON "public"."wallets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



ALTER TABLE ONLY "public"."coupon_audit_logs"
    ADD CONSTRAINT "coupon_audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."coupon_audit_logs"
    ADD CONSTRAINT "coupon_audit_logs_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coupon_outlet_restrictions"
    ADD CONSTRAINT "coupon_outlet_restrictions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coupon_outlet_restrictions"
    ADD CONSTRAINT "coupon_outlet_restrictions_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coupon_usage"
    ADD CONSTRAINT "coupon_usage_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id");



ALTER TABLE ONLY "public"."coupon_usage"
    ADD CONSTRAINT "coupon_usage_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."coupon_usage"
    ADD CONSTRAINT "coupon_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."coupon_campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_addresses"
    ADD CONSTRAINT "customer_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customization_options"
    ADD CONSTRAINT "customization_options_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."item_customization_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gift_card_audit_logs"
    ADD CONSTRAINT "gift_card_audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."gift_card_batches"
    ADD CONSTRAINT "gift_card_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."gift_card_batches"
    ADD CONSTRAINT "gift_card_batches_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."gift_card_templates"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."gift_cards"
    ADD CONSTRAINT "gift_cards_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."gift_card_batches"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."gift_cards"
    ADD CONSTRAINT "gift_cards_redeemed_by_fkey" FOREIGN KEY ("redeemed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."gift_cards"
    ADD CONSTRAINT "gift_cards_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."gift_card_templates"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."item_customization_groups"
    ADD CONSTRAINT "item_customization_groups_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_accounts"
    ADD CONSTRAINT "loyalty_accounts_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "public"."loyalty_tiers"("id");



ALTER TABLE ONLY "public"."loyalty_accounts"
    ADD CONSTRAINT "loyalty_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."loyalty_ledger"
    ADD CONSTRAINT "loyalty_ledger_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."loyalty_ledger"
    ADD CONSTRAINT "loyalty_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."loyalty_points_log"
    ADD CONSTRAINT "loyalty_points_log_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "public"."loyalty_actions"("id");



ALTER TABLE ONLY "public"."loyalty_points_log"
    ADD CONSTRAINT "loyalty_points_log_mission_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id");



ALTER TABLE ONLY "public"."loyalty_points_log"
    ADD CONSTRAINT "loyalty_points_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."membership_cycles"
    ADD CONSTRAINT "membership_cycles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "public"."menu_subcategories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_subcategories"
    ADD CONSTRAINT "menu_subcategories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."menu_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mission_progress"
    ADD CONSTRAINT "mission_progress_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id");



ALTER TABLE ONLY "public"."mission_progress"
    ADD CONSTRAINT "mission_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_ratings"
    ADD CONSTRAINT "order_ratings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_ratings"
    ADD CONSTRAINT "order_ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."outlet_menu_items"
    ADD CONSTRAINT "outlet_menu_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."outlet_menu_items"
    ADD CONSTRAINT "outlet_menu_items_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."outlet_settings"
    ADD CONSTRAINT "outlet_settings_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."outlet_staff"
    ADD CONSTRAINT "outlet_staff_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."outlet_staff"
    ADD CONSTRAINT "outlet_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_attempts"
    ADD CONSTRAINT "payment_attempts_app_order_id_fkey" FOREIGN KEY ("app_order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."payment_attempts"
    ADD CONSTRAINT "payment_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_referred_by_fkey" FOREIGN KEY ("referred_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id");



ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



CREATE POLICY "Admins can insert ledger" ON "public"."loyalty_ledger" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can read all ratings" ON "public"."order_ratings" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Admins can update app_settings" ON "public"."app_settings" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can view all ledger" ON "public"."loyalty_ledger" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Anyone can read app_settings" ON "public"."app_settings" FOR SELECT USING (true);



CREATE POLICY "Users can insert own ratings" ON "public"."order_ratings" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can read own ratings" ON "public"."order_ratings" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view own ledger" ON "public"."loyalty_ledger" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaigns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaigns: admin delete" ON "public"."campaigns" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "campaigns: admin insert" ON "public"."campaigns" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "campaigns: admin select" ON "public"."campaigns" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "campaigns: admin update" ON "public"."campaigns" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "campaigns: public read active" ON "public"."campaigns" FOR SELECT USING ((("is_active" = true) AND ("starts_at" <= "now"()) AND ("ends_at" > "now"())));



ALTER TABLE "public"."coupon_audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coupon_audit_logs: admin insert" ON "public"."coupon_audit_logs" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "coupon_audit_logs: admin select" ON "public"."coupon_audit_logs" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



ALTER TABLE "public"."coupon_campaigns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coupon_campaigns: admin delete" ON "public"."coupon_campaigns" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "coupon_campaigns: admin insert" ON "public"."coupon_campaigns" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "coupon_campaigns: admin select" ON "public"."coupon_campaigns" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "coupon_campaigns: admin update" ON "public"."coupon_campaigns" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."coupon_outlet_restrictions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coupon_outlet_restrictions: admin delete" ON "public"."coupon_outlet_restrictions" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "coupon_outlet_restrictions: admin insert" ON "public"."coupon_outlet_restrictions" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "coupon_outlet_restrictions: admin select" ON "public"."coupon_outlet_restrictions" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "coupon_outlet_restrictions: admin update" ON "public"."coupon_outlet_restrictions" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."coupon_usage" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coupon_usage: admin delete" ON "public"."coupon_usage" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "coupon_usage: admin insert" ON "public"."coupon_usage" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "coupon_usage: admin select" ON "public"."coupon_usage" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "coupon_usage: admin update" ON "public"."coupon_usage" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "coupon_usage: users read own" ON "public"."coupon_usage" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."coupons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coupons: admin delete" ON "public"."coupons" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "coupons: admin insert" ON "public"."coupons" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "coupons: admin select" ON "public"."coupons" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "coupons: admin update" ON "public"."coupons" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "coupons: public read active" ON "public"."coupons" FOR SELECT USING ((("is_active" = true) AND ("starts_at" <= "now"()) AND ("ends_at" > "now"())));



CREATE POLICY "customer addresses: admin all" ON "public"."customer_addresses" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "customer addresses: own delete" ON "public"."customer_addresses" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "customer addresses: own insert" ON "public"."customer_addresses" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "customer addresses: own select" ON "public"."customer_addresses" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "customer addresses: own update" ON "public"."customer_addresses" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."customer_addresses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customization_options" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customization_options: admin delete" ON "public"."customization_options" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "customization_options: admin insert" ON "public"."customization_options" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "customization_options: admin update" ON "public"."customization_options" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "customization_options: public read" ON "public"."customization_options" FOR SELECT USING (true);



ALTER TABLE "public"."gift_card_audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gift_card_audit_logs: admin insert" ON "public"."gift_card_audit_logs" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "gift_card_audit_logs: admin select" ON "public"."gift_card_audit_logs" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



ALTER TABLE "public"."gift_card_batches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gift_card_batches: admin delete" ON "public"."gift_card_batches" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "gift_card_batches: admin insert" ON "public"."gift_card_batches" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "gift_card_batches: admin select" ON "public"."gift_card_batches" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "gift_card_batches: admin update" ON "public"."gift_card_batches" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."gift_card_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gift_card_templates: admin delete" ON "public"."gift_card_templates" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "gift_card_templates: admin insert" ON "public"."gift_card_templates" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "gift_card_templates: admin select" ON "public"."gift_card_templates" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "gift_card_templates: admin update" ON "public"."gift_card_templates" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."gift_cards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gift_cards: admin delete" ON "public"."gift_cards" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "gift_cards: admin insert" ON "public"."gift_cards" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "gift_cards: admin select" ON "public"."gift_cards" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "gift_cards: admin update" ON "public"."gift_cards" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "gift_cards: users read redeemed own" ON "public"."gift_cards" FOR SELECT TO "authenticated" USING (("redeemed_by" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."item_customization_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "item_customization_groups: admin delete" ON "public"."item_customization_groups" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "item_customization_groups: admin insert" ON "public"."item_customization_groups" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "item_customization_groups: admin update" ON "public"."item_customization_groups" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "item_customization_groups: public read" ON "public"."item_customization_groups" FOR SELECT USING (true);



ALTER TABLE "public"."loyalty_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loyalty_accounts: admin delete" ON "public"."loyalty_accounts" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "loyalty_accounts: admin insert" ON "public"."loyalty_accounts" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "loyalty_accounts: admin select" ON "public"."loyalty_accounts" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "loyalty_accounts: admin update" ON "public"."loyalty_accounts" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "loyalty_accounts: users read own" ON "public"."loyalty_accounts" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."loyalty_actions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loyalty_actions: admin delete" ON "public"."loyalty_actions" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "loyalty_actions: admin insert" ON "public"."loyalty_actions" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "loyalty_actions: admin select" ON "public"."loyalty_actions" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "loyalty_actions: admin update" ON "public"."loyalty_actions" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "loyalty_actions: public read active" ON "public"."loyalty_actions" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."loyalty_ledger" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loyalty_points_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loyalty_points_log: admin delete" ON "public"."loyalty_points_log" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "loyalty_points_log: admin insert" ON "public"."loyalty_points_log" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "loyalty_points_log: admin select" ON "public"."loyalty_points_log" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "loyalty_points_log: admin update" ON "public"."loyalty_points_log" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "loyalty_points_log: users read own" ON "public"."loyalty_points_log" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."loyalty_tiers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loyalty_tiers: admin delete" ON "public"."loyalty_tiers" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "loyalty_tiers: admin insert" ON "public"."loyalty_tiers" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "loyalty_tiers: admin update" ON "public"."loyalty_tiers" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "loyalty_tiers: public read" ON "public"."loyalty_tiers" FOR SELECT USING (true);



ALTER TABLE "public"."membership_cycles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "membership_cycles: admin delete" ON "public"."membership_cycles" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "membership_cycles: admin insert" ON "public"."membership_cycles" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "membership_cycles: admin select" ON "public"."membership_cycles" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "membership_cycles: admin update" ON "public"."membership_cycles" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "membership_cycles: users read own" ON "public"."membership_cycles" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."menu_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "menu_categories: admin delete" ON "public"."menu_categories" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "menu_categories: admin insert" ON "public"."menu_categories" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "menu_categories: admin select" ON "public"."menu_categories" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "menu_categories: admin update" ON "public"."menu_categories" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "menu_categories: public read active" ON "public"."menu_categories" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."menu_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "menu_items: admin delete" ON "public"."menu_items" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "menu_items: admin insert" ON "public"."menu_items" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "menu_items: admin select" ON "public"."menu_items" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "menu_items: admin update" ON "public"."menu_items" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "menu_items: public read active" ON "public"."menu_items" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."menu_subcategories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "menu_subcategories: admin delete" ON "public"."menu_subcategories" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "menu_subcategories: admin insert" ON "public"."menu_subcategories" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "menu_subcategories: admin select" ON "public"."menu_subcategories" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "menu_subcategories: admin update" ON "public"."menu_subcategories" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "menu_subcategories: public read active" ON "public"."menu_subcategories" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."mission_progress" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mission_progress: admin delete" ON "public"."mission_progress" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "mission_progress: admin insert" ON "public"."mission_progress" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "mission_progress: admin select" ON "public"."mission_progress" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "mission_progress: admin update" ON "public"."mission_progress" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "mission_progress: users read own" ON "public"."mission_progress" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."missions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "missions: admin delete" ON "public"."missions" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "missions: admin insert" ON "public"."missions" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "missions: admin select" ON "public"."missions" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "missions: admin update" ON "public"."missions" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "missions: public read active" ON "public"."missions" FOR SELECT USING ((("is_active" = true) AND ("starts_at" <= "now"()) AND (("ends_at" IS NULL) OR ("ends_at" > "now"()))));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications: admin delete" ON "public"."notifications" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "notifications: admin insert" ON "public"."notifications" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "notifications: admin select" ON "public"."notifications" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "notifications: admin update" ON "public"."notifications" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "notifications: users read own" ON "public"."notifications" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "notifications: users update own" ON "public"."notifications" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_items: admin delete" ON "public"."order_items" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "order_items: admin insert" ON "public"."order_items" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "order_items: admin select" ON "public"."order_items" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "order_items: admin update" ON "public"."order_items" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "order_items: staff read outlet order items" ON "public"."order_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."orders"
     JOIN "public"."outlet_staff" ON (("outlet_staff"."outlet_id" = "orders"."outlet_id")))
  WHERE (("orders"."id" = "order_items"."order_id") AND ("outlet_staff"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "order_items: users read own" ON "public"."order_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_items"."order_id") AND ("orders"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."order_ratings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders: admin delete" ON "public"."orders" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "orders: admin insert" ON "public"."orders" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "orders: admin select" ON "public"."orders" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "orders: admin update" ON "public"."orders" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "orders: staff read outlet orders" ON "public"."orders" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."outlet_staff"
  WHERE (("outlet_staff"."outlet_id" = "orders"."outlet_id") AND ("outlet_staff"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "orders: users read own" ON "public"."orders" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."outlet_menu_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "outlet_menu_items: admin delete" ON "public"."outlet_menu_items" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "outlet_menu_items: admin insert" ON "public"."outlet_menu_items" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "outlet_menu_items: admin update" ON "public"."outlet_menu_items" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "outlet_menu_items: public read" ON "public"."outlet_menu_items" FOR SELECT USING (true);



ALTER TABLE "public"."outlet_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "outlet_settings: admin write" ON "public"."outlet_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "outlet_settings: staff read" ON "public"."outlet_settings" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."outlet_staff"
  WHERE (("outlet_staff"."outlet_id" = "outlet_settings"."outlet_id") AND ("outlet_staff"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "outlet_settings: staff update" ON "public"."outlet_settings" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."outlet_staff"
  WHERE (("outlet_staff"."outlet_id" = "outlet_settings"."outlet_id") AND ("outlet_staff"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("outlet_staff"."is_manager" = true)))));



ALTER TABLE "public"."outlet_staff" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "outlet_staff: admin all" ON "public"."outlet_staff" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "outlet_staff: own assignments" ON "public"."outlet_staff" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."outlets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "outlets: admin delete" ON "public"."outlets" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "outlets: admin insert" ON "public"."outlets" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "outlets: admin select" ON "public"."outlets" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "outlets: admin update" ON "public"."outlets" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "outlets: public read active" ON "public"."outlets" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."payment_attempts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_attempts: deny client access" ON "public"."payment_attempts" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles: admin delete" ON "public"."profiles" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "profiles: admin insert" ON "public"."profiles" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "profiles: admin select" ON "public"."profiles" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "profiles: admin update" ON "public"."profiles" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "profiles: users read own" ON "public"."profiles" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "profiles: users update own" ON "public"."profiles" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "support tickets: admin all" ON "public"."support_tickets" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "support tickets: own insert" ON "public"."support_tickets" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND ("status" = 'open'::"text") AND ("admin_response" IS NULL)));



CREATE POLICY "support tickets: own select" ON "public"."support_tickets" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."support_tickets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wallet_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_transactions: admin delete" ON "public"."wallet_transactions" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "wallet_transactions: admin insert" ON "public"."wallet_transactions" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "wallet_transactions: admin select" ON "public"."wallet_transactions" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "wallet_transactions: admin update" ON "public"."wallet_transactions" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "wallet_transactions: users read own" ON "public"."wallet_transactions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."wallets"
  WHERE (("wallets"."id" = "wallet_transactions"."wallet_id") AND ("wallets"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."wallets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallets: admin delete" ON "public"."wallets" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "wallets: admin insert" ON "public"."wallets" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "wallets: admin select" ON "public"."wallets" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "wallets: admin update" ON "public"."wallets" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "wallets: users read own" ON "public"."wallets" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_referral_code"("p_referral_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_referral_code"("p_referral_code" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."apply_referral_code"("p_referral_code" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."award_loyalty_points"("p_user_id" "uuid", "p_action_slug" "text", "p_reference_id" "text", "p_custom_points" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."award_loyalty_points"("p_user_id" "uuid", "p_action_slug" "text", "p_reference_id" "text", "p_custom_points" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."award_loyalty_points"("p_user_id" "uuid", "p_action_slug" "text", "p_reference_id" "text", "p_custom_points" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."award_membership_bonus"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."award_membership_bonus"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."award_referral_rewards"("p_referred_user_id" "uuid", "p_reward_trigger" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."award_referral_rewards"("p_referred_user_id" "uuid", "p_reward_trigger" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."award_referral_rewards_on_first_order"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."award_referral_rewards_on_first_order"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."calculate_max_redeemable_points"("p_user_id" "uuid", "p_subtotal" numeric, "p_tax" numeric, "p_packaging" numeric, "p_has_coupon" boolean, "p_has_discounted_items" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."calculate_max_redeemable_points"("p_user_id" "uuid", "p_subtotal" numeric, "p_tax" numeric, "p_packaging" numeric, "p_has_coupon" boolean, "p_has_discounted_items" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."calculate_max_redeemable_points"("p_user_id" "uuid", "p_subtotal" numeric, "p_tax" numeric, "p_packaging" numeric, "p_has_coupon" boolean, "p_has_discounted_items" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."can_manage_order"("p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_order"("p_order_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."can_manage_order"("p_order_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."check_membership_renewals"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_membership_renewals"() TO "service_role";
GRANT ALL ON FUNCTION "public"."check_membership_renewals"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."check_nth_order_discount"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_nth_order_discount"("p_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."check_nth_order_discount"("p_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."claim_referral_reward"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_referral_reward"() TO "service_role";
GRANT ALL ON FUNCTION "public"."claim_referral_reward"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."complete_order_with_pickup_code"("p_order_id" "uuid", "p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_order_with_pickup_code"("p_order_id" "uuid", "p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_order_with_pickup_code"("p_order_id" "uuid", "p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_title" "text", "p_body" "text", "p_type" "text", "p_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_title" "text", "p_body" "text", "p_type" "text", "p_data" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_customer_address_default"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_customer_address_default"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."expire_gift_cards"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expire_gift_cards"() TO "service_role";
GRANT ALL ON FUNCTION "public"."expire_gift_cards"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."finalize_captured_payment_attempt"("p_attempt_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_captured_payment_attempt"("p_attempt_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_delivery_code"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_delivery_code"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_gift_card_batch"("p_template_id" "uuid", "p_batch_name" "text", "p_quantity" integer, "p_code_format" "text", "p_code_prefix" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_gift_card_batch"("p_template_id" "uuid", "p_batch_name" "text", "p_quantity" integer, "p_code_format" "text", "p_code_prefix" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."generate_gift_card_batch"("p_template_id" "uuid", "p_batch_name" "text", "p_quantity" integer, "p_code_format" "text", "p_code_prefix" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_claimable_referral_rewards"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_claimable_referral_rewards"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_claimable_referral_rewards"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_loyalty_analytics"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_loyalty_analytics"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_loyalty_analytics"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_membership_status"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_membership_status"("p_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_membership_status"("p_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."grant_referral_points"("p_user_id" "uuid", "p_points" integer, "p_description" "text", "p_reference_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."grant_referral_points"("p_user_id" "uuid", "p_points" integer, "p_description" "text", "p_reference_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_outlet_settings"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_outlet_settings"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_profile_wallet"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_profile_wallet"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";



REVOKE ALL ON FUNCTION "public"."is_outlet_staff_for_order"("p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_outlet_staff_for_order"("p_order_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_outlet_staff_for_order"("p_order_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_outlet_staff_for_outlet"("p_outlet_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_outlet_staff_for_outlet"("p_outlet_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_outlet_staff_for_outlet"("p_outlet_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."manual_refund_order"("p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."manual_refund_order"("p_order_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."manual_refund_order"("p_order_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."notify_loyalty_ledger"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_loyalty_ledger"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_order_insert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_order_insert"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_order_status_update"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_order_status_update"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_wallet_transaction"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_wallet_transaction"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."place_order_with_wallet"("p_order" "jsonb", "p_items" "jsonb"[], "p_wallet_amount" numeric, "p_loyalty_points" integer, "p_nth_order_discount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."place_order_with_wallet"("p_order" "jsonb", "p_items" "jsonb"[], "p_wallet_amount" numeric, "p_loyalty_points" integer, "p_nth_order_discount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."place_order_with_wallet"("p_order" "jsonb", "p_items" "jsonb"[], "p_wallet_amount" numeric, "p_loyalty_points" integer, "p_nth_order_discount" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."place_order_with_wallet_validated_impl"("p_order" "jsonb", "p_items" "jsonb"[], "p_wallet_amount" numeric, "p_loyalty_points" integer, "p_nth_order_discount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."place_order_with_wallet_validated_impl"("p_order" "jsonb", "p_items" "jsonb"[], "p_wallet_amount" numeric, "p_loyalty_points" integer, "p_nth_order_discount" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_profile_privilege_escalation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_profile_privilege_escalation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_unpaid_order_insert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_unpaid_order_insert"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."redeem_gift_card"("p_redeem_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."redeem_gift_card"("p_redeem_code" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."redeem_gift_card"("p_redeem_code" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."redeem_loyalty_points"("p_user_id" "uuid", "p_points" integer, "p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."redeem_loyalty_points"("p_user_id" "uuid", "p_points" integer, "p_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reject_and_refund_order"("p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_and_refund_order"("p_order_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."reject_and_refund_order"("p_order_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."reject_order_with_refund"("p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_order_with_refund"("p_order_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."reject_order_with_refund"("p_order_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."renew_expired_membership_cycles"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."renew_expired_membership_cycles"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."self_topup_wallet"("p_user_id" "uuid", "p_amount" numeric, "p_razorpay_payment_id" "text", "p_razorpay_order_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."self_topup_wallet"("p_user_id" "uuid", "p_amount" numeric, "p_razorpay_payment_id" "text", "p_razorpay_order_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."self_topup_wallet"("p_user_id" "uuid", "p_amount" numeric, "p_razorpay_payment_id" "text", "p_razorpay_order_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_pickup_otp_required"("p_required" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_pickup_otp_required"("p_required" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_pickup_otp_required"("p_required" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_loyalty_ledger_on_earn"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_loyalty_ledger_on_earn"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."topup_wallet"("p_user_id" "uuid", "p_amount" numeric, "p_bonus" numeric, "p_reference_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."topup_wallet"("p_user_id" "uuid", "p_amount" numeric, "p_bonus" numeric, "p_reference_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_order_status"("p_order_id" "uuid", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_order_status"("p_order_id" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_order_status"("p_order_id" "uuid", "p_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_outlet_menu_item"("p_outlet_id" "uuid", "p_item_id" "uuid", "p_is_available" boolean, "p_price_override" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_outlet_menu_item"("p_outlet_id" "uuid", "p_item_id" "uuid", "p_is_available" boolean, "p_price_override" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_outlet_menu_item"("p_outlet_id" "uuid", "p_item_id" "uuid", "p_is_available" boolean, "p_price_override" numeric) TO "service_role";



GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT ALL ON TABLE "public"."campaigns" TO "anon";
GRANT ALL ON TABLE "public"."campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."coupon_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."coupon_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."coupon_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."coupon_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."coupon_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."coupon_campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."coupon_outlet_restrictions" TO "anon";
GRANT ALL ON TABLE "public"."coupon_outlet_restrictions" TO "authenticated";
GRANT ALL ON TABLE "public"."coupon_outlet_restrictions" TO "service_role";



GRANT ALL ON TABLE "public"."coupon_usage" TO "anon";
GRANT ALL ON TABLE "public"."coupon_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."coupon_usage" TO "service_role";



GRANT ALL ON TABLE "public"."coupons" TO "anon";
GRANT ALL ON TABLE "public"."coupons" TO "authenticated";
GRANT ALL ON TABLE "public"."coupons" TO "service_role";



GRANT ALL ON TABLE "public"."customer_addresses" TO "anon";
GRANT ALL ON TABLE "public"."customer_addresses" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_addresses" TO "service_role";



GRANT ALL ON TABLE "public"."customization_options" TO "anon";
GRANT ALL ON TABLE "public"."customization_options" TO "authenticated";
GRANT ALL ON TABLE "public"."customization_options" TO "service_role";



GRANT ALL ON TABLE "public"."gift_card_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."gift_card_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."gift_card_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."gift_card_batches" TO "anon";
GRANT ALL ON TABLE "public"."gift_card_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."gift_card_batches" TO "service_role";



GRANT ALL ON TABLE "public"."gift_card_templates" TO "anon";
GRANT ALL ON TABLE "public"."gift_card_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."gift_card_templates" TO "service_role";



GRANT ALL ON TABLE "public"."gift_cards" TO "anon";
GRANT ALL ON TABLE "public"."gift_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."gift_cards" TO "service_role";



GRANT ALL ON TABLE "public"."item_customization_groups" TO "anon";
GRANT ALL ON TABLE "public"."item_customization_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."item_customization_groups" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_accounts" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_actions" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_actions" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_ledger" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_points_log" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_points_log" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_points_log" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_tiers" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_tiers" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_tiers" TO "service_role";



GRANT ALL ON TABLE "public"."membership_cycles" TO "anon";
GRANT ALL ON TABLE "public"."membership_cycles" TO "authenticated";
GRANT ALL ON TABLE "public"."membership_cycles" TO "service_role";



GRANT ALL ON TABLE "public"."menu_categories" TO "anon";
GRANT ALL ON TABLE "public"."menu_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_categories" TO "service_role";



GRANT ALL ON TABLE "public"."menu_items" TO "anon";
GRANT ALL ON TABLE "public"."menu_items" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_items" TO "service_role";



GRANT ALL ON TABLE "public"."menu_subcategories" TO "anon";
GRANT ALL ON TABLE "public"."menu_subcategories" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_subcategories" TO "service_role";



GRANT ALL ON TABLE "public"."mission_progress" TO "anon";
GRANT ALL ON TABLE "public"."mission_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."mission_progress" TO "service_role";



GRANT ALL ON TABLE "public"."missions" TO "anon";
GRANT ALL ON TABLE "public"."missions" TO "authenticated";
GRANT ALL ON TABLE "public"."missions" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."order_ratings" TO "anon";
GRANT ALL ON TABLE "public"."order_ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."order_ratings" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."outlet_menu_items" TO "anon";
GRANT ALL ON TABLE "public"."outlet_menu_items" TO "authenticated";
GRANT ALL ON TABLE "public"."outlet_menu_items" TO "service_role";



GRANT ALL ON TABLE "public"."outlet_settings" TO "anon";
GRANT ALL ON TABLE "public"."outlet_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."outlet_settings" TO "service_role";



GRANT ALL ON TABLE "public"."outlet_staff" TO "anon";
GRANT ALL ON TABLE "public"."outlet_staff" TO "authenticated";
GRANT ALL ON TABLE "public"."outlet_staff" TO "service_role";



GRANT ALL ON TABLE "public"."outlets" TO "anon";
GRANT ALL ON TABLE "public"."outlets" TO "authenticated";
GRANT ALL ON TABLE "public"."outlets" TO "service_role";



GRANT ALL ON TABLE "public"."payment_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON SEQUENCE "public"."support_ticket_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."support_ticket_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."support_ticket_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."support_tickets" TO "anon";
GRANT ALL ON TABLE "public"."support_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."support_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_transactions" TO "anon";
GRANT ALL ON TABLE "public"."wallet_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."wallets" TO "anon";
GRANT ALL ON TABLE "public"."wallets" TO "authenticated";
GRANT ALL ON TABLE "public"."wallets" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

