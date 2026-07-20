


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


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."award_loyalty_points"("p_user_id" "uuid", "p_action_slug" "text", "p_reference_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."award_loyalty_points"("p_user_id" "uuid", "p_action_slug" "text", "p_reference_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_delivery_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.delivery_code := lpad(floor(random() * 10000)::text, 4, '0');
  return new;
end;
$$;


ALTER FUNCTION "public"."generate_delivery_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_outlet_settings"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.outlet_settings (outlet_id) values (new.id);
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_outlet_settings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_profile_wallet"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.wallets (user_id) values (new.id);
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_profile_wallet"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
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
    AS $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin', 'super_admin')
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."manual_refund_order"("p_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_order orders%rowtype;
  v_wallet wallets%rowtype;
  v_new_balance numeric;
begin
  select * into v_order from orders where id = p_order_id for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.status != 'cancelled' then
    raise exception 'Only cancelled orders can be refunded';
  end if;

  if v_order.payment_status = 'refunded' then
    raise exception 'Order already refunded';
  end if;

  if v_order.wallet_used <= 0 then
    raise exception 'No wallet amount to refund on this order';
  end if;

  -- Mark as refunded
  update orders set payment_status = 'refunded' where id = p_order_id;

  -- Refund to wallet
  select * into v_wallet from wallets where user_id = v_order.user_id for update;

  if found then
    v_new_balance := v_wallet.loaded_balance + v_order.wallet_used;

    update wallets set loaded_balance = v_new_balance where id = v_wallet.id;

    insert into wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id)
    values (
      v_wallet.id,
      'refund',
      v_order.wallet_used,
      v_new_balance + v_wallet.bonus_balance,
      'Manual refund for order #' || v_order.order_number,
      p_order_id::text
    );
  end if;

  return jsonb_build_object(
    'order_id', p_order_id,
    'refunded', v_order.wallet_used,
    'payment_status', 'refunded'
  );
end;
$$;


ALTER FUNCTION "public"."manual_refund_order"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."place_order_with_wallet"("p_order" "jsonb", "p_items" "jsonb"[], "p_wallet_amount" numeric DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_order_id uuid;
  v_order_number text;
  v_wallet wallets%rowtype;
  v_user_id uuid;
  v_item jsonb;
  v_bonus_debit numeric;
  v_loaded_debit numeric;
begin
  v_user_id := (p_order->>'user_id')::uuid;
  v_order_number := 'PM' || upper(substr(md5(gen_random_uuid()::text), 1, 8));

  -- Insert order
  insert into orders (
    order_number, user_id, outlet_id, status,
    subtotal, tax, packaging_charge, discount, wallet_used, total,
    payment_method, payment_status, coupon_code, notes
  ) values (
    v_order_number,
    v_user_id,
    (p_order->>'outlet_id')::uuid,
    'pending',
    (p_order->>'subtotal')::numeric,
    (p_order->>'tax')::numeric,
    (p_order->>'packaging_charge')::numeric,
    coalesce((p_order->>'discount')::numeric, 0),
    p_wallet_amount,
    (p_order->>'total')::numeric,
    p_order->>'payment_method',
    'paid',
    p_order->>'coupon_code',
    p_order->>'notes'
  ) returning id into v_order_id;

  -- Insert order items
  foreach v_item in array p_items loop
    insert into order_items (order_id, item_id, item_name, quantity, unit_price, total_price, customizations)
    values (
      v_order_id,
      (v_item->>'item_id')::uuid,
      v_item->>'item_name',
      (v_item->>'quantity')::int,
      (v_item->>'unit_price')::numeric,
      (v_item->>'total_price')::numeric,
      coalesce(v_item->'customizations', '[]'::jsonb)
    );
  end loop;

  -- Debit wallet if used
  if p_wallet_amount > 0 then
    select * into v_wallet from wallets where user_id = v_user_id for update;

    -- Debit bonus first, then loaded
    v_bonus_debit := least(v_wallet.bonus_balance, p_wallet_amount);
    v_loaded_debit := p_wallet_amount - v_bonus_debit;

    update wallets
    set bonus_balance = bonus_balance - v_bonus_debit,
        loaded_balance = loaded_balance - v_loaded_debit
    where id = v_wallet.id;

    insert into wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id)
    values (
      v_wallet.id, 'debit', p_wallet_amount,
      (v_wallet.loaded_balance - v_loaded_debit) + (v_wallet.bonus_balance - v_bonus_debit),
      'Order payment', v_order_id::text
    );
  end if;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'status', 'pending'
  );
end;
$$;


ALTER FUNCTION "public"."place_order_with_wallet"("p_order" "jsonb", "p_items" "jsonb"[], "p_wallet_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_order_with_refund"("p_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_order orders%rowtype;
  v_wallet wallets%rowtype;
  v_new_balance numeric;
begin
  -- Lock and fetch the order
  select * into v_order from orders where id = p_order_id for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.status != 'pending' then
    raise exception 'Only pending orders can be rejected';
  end if;

  -- Cancel the order and mark refunded
  update orders
  set status = 'cancelled',
      payment_status = case when v_order.wallet_used > 0 then 'refunded' else payment_status end
  where id = p_order_id;

  -- Refund wallet if wallet was used
  if v_order.wallet_used > 0 then
    select * into v_wallet from wallets where user_id = v_order.user_id for update;

    if found then
      v_new_balance := v_wallet.loaded_balance + v_order.wallet_used;

      update wallets
      set loaded_balance = v_new_balance
      where id = v_wallet.id;

      insert into wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id)
      values (
        v_wallet.id,
        'refund',
        v_order.wallet_used,
        v_new_balance + v_wallet.bonus_balance,
        'Refund for rejected order #' || v_order.order_number,
        p_order_id::text
      );
    end if;
  end if;

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', 'cancelled',
    'refunded', v_order.wallet_used
  );
end;
$$;


ALTER FUNCTION "public"."reject_order_with_refund"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."topup_wallet"("p_user_id" "uuid", "p_amount" numeric, "p_bonus" numeric DEFAULT 0, "p_reference_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_wallet wallets%rowtype;
  v_new_loaded numeric;
  v_new_bonus numeric;
begin
  select * into v_wallet from wallets where user_id = p_user_id for update;

  if not found then
    raise exception 'Wallet not found for user %', p_user_id;
  end if;

  v_new_loaded := v_wallet.loaded_balance + p_amount;
  v_new_bonus := v_wallet.bonus_balance + p_bonus;

  update wallets set loaded_balance = v_new_loaded, bonus_balance = v_new_bonus where id = v_wallet.id;

  -- Log topup transaction
  insert into wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id)
  values (v_wallet.id, 'topup', p_amount, v_new_loaded + v_new_bonus, 'Wallet top-up', p_reference_id);

  -- Log bonus if any
  if p_bonus > 0 then
    insert into wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id)
    values (v_wallet.id, 'bonus', p_bonus, v_new_loaded + v_new_bonus, 'Top-up bonus', p_reference_id);
  end if;

  return jsonb_build_object(
    'loaded_balance', v_new_loaded,
    'bonus_balance', v_new_bonus,
    'total_balance', v_new_loaded + v_new_bonus
  );
end;
$$;


ALTER FUNCTION "public"."topup_wallet"("p_user_id" "uuid", "p_amount" numeric, "p_bonus" numeric, "p_reference_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


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
    CONSTRAINT "coupons_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percentage'::"text", 'flat'::"text"])))
);


ALTER TABLE "public"."coupons" OWNER TO "postgres";


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
    CONSTRAINT "orders_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['online'::"text", 'wallet'::"text", 'split'::"text"]))),
    CONSTRAINT "orders_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'refunded'::"text"]))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'preparing'::"text", 'ready'::"text", 'picked_up'::"text", 'cancelled'::"text"])))
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
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."outlets" OWNER TO "postgres";


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


ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coupon_usage"
    ADD CONSTRAINT "coupon_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customization_options"
    ADD CONSTRAINT "customization_options_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."loyalty_points_log"
    ADD CONSTRAINT "loyalty_points_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_tiers"
    ADD CONSTRAINT "loyalty_tiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_tiers"
    ADD CONSTRAINT "loyalty_tiers_slug_key" UNIQUE ("slug");



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



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_referral_code_key" UNIQUE ("referral_code");



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_user_id_key" UNIQUE ("user_id");



CREATE INDEX "idx_campaigns_active" ON "public"."campaigns" USING "btree" ("is_active", "starts_at", "ends_at");



CREATE INDEX "idx_coupon_usage_user" ON "public"."coupon_usage" USING "btree" ("user_id");



CREATE INDEX "idx_coupons_active" ON "public"."coupons" USING "btree" ("is_active", "starts_at", "ends_at");



CREATE INDEX "idx_coupons_code" ON "public"."coupons" USING "btree" ("code");



CREATE INDEX "idx_customization_groups_item" ON "public"."item_customization_groups" USING "btree" ("item_id");



CREATE INDEX "idx_customization_options_group" ON "public"."customization_options" USING "btree" ("group_id");



CREATE INDEX "idx_loyalty_accounts_user" ON "public"."loyalty_accounts" USING "btree" ("user_id");



CREATE INDEX "idx_loyalty_points_log_created" ON "public"."loyalty_points_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_loyalty_points_log_user" ON "public"."loyalty_points_log" USING "btree" ("user_id");



CREATE INDEX "idx_menu_items_active" ON "public"."menu_items" USING "btree" ("is_active");



CREATE INDEX "idx_menu_items_subcategory" ON "public"."menu_items" USING "btree" ("subcategory_id");



CREATE INDEX "idx_menu_subcategories_category" ON "public"."menu_subcategories" USING "btree" ("category_id");



CREATE INDEX "idx_mission_progress_mission" ON "public"."mission_progress" USING "btree" ("mission_id");



CREATE INDEX "idx_mission_progress_user" ON "public"."mission_progress" USING "btree" ("user_id");



CREATE INDEX "idx_missions_active" ON "public"."missions" USING "btree" ("is_active", "starts_at", "ends_at");



CREATE INDEX "idx_notifications_created" ON "public"."notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id", "is_read");



CREATE INDEX "idx_order_items_order" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_orders_created_at" ON "public"."orders" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_orders_outlet" ON "public"."orders" USING "btree" ("outlet_id");



CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status");



CREATE INDEX "idx_orders_user" ON "public"."orders" USING "btree" ("user_id");



CREATE INDEX "idx_outlet_menu_items_outlet" ON "public"."outlet_menu_items" USING "btree" ("outlet_id");



CREATE INDEX "idx_outlet_staff_outlet" ON "public"."outlet_staff" USING "btree" ("outlet_id");



CREATE INDEX "idx_outlet_staff_user" ON "public"."outlet_staff" USING "btree" ("user_id");



CREATE INDEX "idx_outlets_city" ON "public"."outlets" USING "btree" ("city");



CREATE INDEX "idx_outlets_is_active" ON "public"."outlets" USING "btree" ("is_active");



CREATE INDEX "idx_outlets_slug" ON "public"."outlets" USING "btree" ("slug");



CREATE INDEX "idx_profiles_phone" ON "public"."profiles" USING "btree" ("phone");



CREATE INDEX "idx_profiles_referral_code" ON "public"."profiles" USING "btree" ("referral_code");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_wallet_transactions_created" ON "public"."wallet_transactions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_wallet_transactions_wallet" ON "public"."wallet_transactions" USING "btree" ("wallet_id");



CREATE INDEX "idx_wallets_user" ON "public"."wallets" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "loyalty_accounts_updated_at" BEFORE UPDATE ON "public"."loyalty_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "menu_items_updated_at" BEFORE UPDATE ON "public"."menu_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "mission_progress_updated_at" BEFORE UPDATE ON "public"."mission_progress" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "on_outlet_created_settings" AFTER INSERT ON "public"."outlets" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_outlet_settings"();



CREATE OR REPLACE TRIGGER "on_profile_created_wallet" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_profile_wallet"();



CREATE OR REPLACE TRIGGER "orders_generate_delivery_code" BEFORE INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."generate_delivery_code"();



CREATE OR REPLACE TRIGGER "orders_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "outlet_settings_updated_at" BEFORE UPDATE ON "public"."outlet_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "outlets_updated_at" BEFORE UPDATE ON "public"."outlets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "wallets_updated_at" BEFORE UPDATE ON "public"."wallets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



ALTER TABLE ONLY "public"."coupon_usage"
    ADD CONSTRAINT "coupon_usage_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id");



ALTER TABLE ONLY "public"."coupon_usage"
    ADD CONSTRAINT "coupon_usage_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."coupon_usage"
    ADD CONSTRAINT "coupon_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."customization_options"
    ADD CONSTRAINT "customization_options_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."item_customization_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."item_customization_groups"
    ADD CONSTRAINT "item_customization_groups_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_accounts"
    ADD CONSTRAINT "loyalty_accounts_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "public"."loyalty_tiers"("id");



ALTER TABLE ONLY "public"."loyalty_accounts"
    ADD CONSTRAINT "loyalty_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."loyalty_points_log"
    ADD CONSTRAINT "loyalty_points_log_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "public"."loyalty_actions"("id");



ALTER TABLE ONLY "public"."loyalty_points_log"
    ADD CONSTRAINT "loyalty_points_log_mission_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id");



ALTER TABLE ONLY "public"."loyalty_points_log"
    ADD CONSTRAINT "loyalty_points_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



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



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_referred_by_fkey" FOREIGN KEY ("referred_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id");



ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE "public"."campaigns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaigns: admin delete" ON "public"."campaigns" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "campaigns: admin insert" ON "public"."campaigns" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "campaigns: admin select" ON "public"."campaigns" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "campaigns: admin update" ON "public"."campaigns" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "campaigns: public read active" ON "public"."campaigns" FOR SELECT USING ((("is_active" = true) AND ("starts_at" <= "now"()) AND ("ends_at" > "now"())));



ALTER TABLE "public"."coupon_usage" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coupon_usage: admin delete" ON "public"."coupon_usage" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "coupon_usage: admin insert" ON "public"."coupon_usage" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "coupon_usage: admin select" ON "public"."coupon_usage" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "coupon_usage: admin update" ON "public"."coupon_usage" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "coupon_usage: users read own" ON "public"."coupon_usage" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."coupons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coupons: admin delete" ON "public"."coupons" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "coupons: admin insert" ON "public"."coupons" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "coupons: admin select" ON "public"."coupons" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "coupons: admin update" ON "public"."coupons" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "coupons: public read active" ON "public"."coupons" FOR SELECT USING ((("is_active" = true) AND ("starts_at" <= "now"()) AND ("ends_at" > "now"())));



ALTER TABLE "public"."customization_options" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customization_options: admin delete" ON "public"."customization_options" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "customization_options: admin insert" ON "public"."customization_options" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "customization_options: admin update" ON "public"."customization_options" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "customization_options: public read" ON "public"."customization_options" FOR SELECT USING (true);



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



CREATE POLICY "loyalty_accounts: users read own" ON "public"."loyalty_accounts" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."loyalty_actions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loyalty_actions: admin delete" ON "public"."loyalty_actions" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "loyalty_actions: admin insert" ON "public"."loyalty_actions" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "loyalty_actions: admin select" ON "public"."loyalty_actions" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "loyalty_actions: admin update" ON "public"."loyalty_actions" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "loyalty_actions: public read active" ON "public"."loyalty_actions" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."loyalty_points_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loyalty_points_log: admin delete" ON "public"."loyalty_points_log" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "loyalty_points_log: admin insert" ON "public"."loyalty_points_log" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "loyalty_points_log: admin select" ON "public"."loyalty_points_log" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "loyalty_points_log: admin update" ON "public"."loyalty_points_log" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "loyalty_points_log: users read own" ON "public"."loyalty_points_log" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."loyalty_tiers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loyalty_tiers: admin delete" ON "public"."loyalty_tiers" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "loyalty_tiers: admin insert" ON "public"."loyalty_tiers" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "loyalty_tiers: admin update" ON "public"."loyalty_tiers" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "loyalty_tiers: public read" ON "public"."loyalty_tiers" FOR SELECT USING (true);



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



CREATE POLICY "mission_progress: users read own" ON "public"."mission_progress" FOR SELECT USING (("auth"."uid"() = "user_id"));



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



CREATE POLICY "notifications: users read own" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "notifications: users update own" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_items: admin delete" ON "public"."order_items" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "order_items: admin insert" ON "public"."order_items" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "order_items: admin select" ON "public"."order_items" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "order_items: admin update" ON "public"."order_items" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "order_items: staff read outlet order items" ON "public"."order_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."orders"
     JOIN "public"."outlet_staff" ON (("outlet_staff"."outlet_id" = "orders"."outlet_id")))
  WHERE (("orders"."id" = "order_items"."order_id") AND ("outlet_staff"."user_id" = "auth"."uid"())))));



CREATE POLICY "order_items: users insert own" ON "public"."order_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_items"."order_id") AND ("orders"."user_id" = "auth"."uid"())))));



CREATE POLICY "order_items: users read own" ON "public"."order_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_items"."order_id") AND ("orders"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders: admin delete" ON "public"."orders" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "orders: admin insert" ON "public"."orders" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "orders: admin select" ON "public"."orders" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "orders: admin update" ON "public"."orders" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "orders: staff read outlet orders" ON "public"."orders" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."outlet_staff"
  WHERE (("outlet_staff"."outlet_id" = "orders"."outlet_id") AND ("outlet_staff"."user_id" = "auth"."uid"())))));



CREATE POLICY "orders: staff update outlet orders" ON "public"."orders" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."outlet_staff"
  WHERE (("outlet_staff"."outlet_id" = "orders"."outlet_id") AND ("outlet_staff"."user_id" = "auth"."uid"())))));



CREATE POLICY "orders: users insert own" ON "public"."orders" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "orders: users read own" ON "public"."orders" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."outlet_menu_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "outlet_menu_items: admin delete" ON "public"."outlet_menu_items" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "outlet_menu_items: admin insert" ON "public"."outlet_menu_items" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "outlet_menu_items: admin update" ON "public"."outlet_menu_items" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "outlet_menu_items: public read" ON "public"."outlet_menu_items" FOR SELECT USING (true);



ALTER TABLE "public"."outlet_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "outlet_settings: admin write" ON "public"."outlet_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "outlet_settings: staff read" ON "public"."outlet_settings" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."outlet_staff"
  WHERE (("outlet_staff"."outlet_id" = "outlet_settings"."outlet_id") AND ("outlet_staff"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "outlet_settings: staff update" ON "public"."outlet_settings" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."outlet_staff"
  WHERE (("outlet_staff"."outlet_id" = "outlet_settings"."outlet_id") AND ("outlet_staff"."user_id" = "auth"."uid"()) AND ("outlet_staff"."is_manager" = true)))));



ALTER TABLE "public"."outlet_staff" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "outlet_staff: admin all" ON "public"."outlet_staff" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "outlet_staff: own assignments" ON "public"."outlet_staff" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."outlets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "outlets: admin delete" ON "public"."outlets" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "outlets: admin insert" ON "public"."outlets" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "outlets: admin select" ON "public"."outlets" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "outlets: admin update" ON "public"."outlets" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "outlets: public read active" ON "public"."outlets" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles: admin delete" ON "public"."profiles" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "profiles: admin insert" ON "public"."profiles" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "profiles: admin select" ON "public"."profiles" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "profiles: admin update" ON "public"."profiles" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "profiles: users read own" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles: users update own" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."wallet_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_transactions: admin delete" ON "public"."wallet_transactions" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "wallet_transactions: admin insert" ON "public"."wallet_transactions" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "wallet_transactions: admin select" ON "public"."wallet_transactions" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "wallet_transactions: admin update" ON "public"."wallet_transactions" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "wallet_transactions: users read own" ON "public"."wallet_transactions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."wallets"
  WHERE (("wallets"."id" = "wallet_transactions"."wallet_id") AND ("wallets"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."wallets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallets: admin delete" ON "public"."wallets" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "wallets: admin insert" ON "public"."wallets" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "wallets: admin select" ON "public"."wallets" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "wallets: admin update" ON "public"."wallets" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "wallets: users read own" ON "public"."wallets" FOR SELECT USING (("auth"."uid"() = "user_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."order_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."orders";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."wallet_transactions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."wallets";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."award_loyalty_points"("p_user_id" "uuid", "p_action_slug" "text", "p_reference_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."award_loyalty_points"("p_user_id" "uuid", "p_action_slug" "text", "p_reference_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."award_loyalty_points"("p_user_id" "uuid", "p_action_slug" "text", "p_reference_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_delivery_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_delivery_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_delivery_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_outlet_settings"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_outlet_settings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_outlet_settings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_profile_wallet"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_profile_wallet"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_profile_wallet"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."manual_refund_order"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."manual_refund_order"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."manual_refund_order"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."place_order_with_wallet"("p_order" "jsonb", "p_items" "jsonb"[], "p_wallet_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."place_order_with_wallet"("p_order" "jsonb", "p_items" "jsonb"[], "p_wallet_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."place_order_with_wallet"("p_order" "jsonb", "p_items" "jsonb"[], "p_wallet_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_order_with_refund"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_order_with_refund"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_order_with_refund"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."topup_wallet"("p_user_id" "uuid", "p_amount" numeric, "p_bonus" numeric, "p_reference_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."topup_wallet"("p_user_id" "uuid", "p_amount" numeric, "p_bonus" numeric, "p_reference_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."topup_wallet"("p_user_id" "uuid", "p_amount" numeric, "p_bonus" numeric, "p_reference_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."campaigns" TO "anon";
GRANT ALL ON TABLE "public"."campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."coupon_usage" TO "anon";
GRANT ALL ON TABLE "public"."coupon_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."coupon_usage" TO "service_role";



GRANT ALL ON TABLE "public"."coupons" TO "anon";
GRANT ALL ON TABLE "public"."coupons" TO "authenticated";
GRANT ALL ON TABLE "public"."coupons" TO "service_role";



GRANT ALL ON TABLE "public"."customization_options" TO "anon";
GRANT ALL ON TABLE "public"."customization_options" TO "authenticated";
GRANT ALL ON TABLE "public"."customization_options" TO "service_role";



GRANT ALL ON TABLE "public"."item_customization_groups" TO "anon";
GRANT ALL ON TABLE "public"."item_customization_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."item_customization_groups" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_accounts" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_actions" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_actions" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_points_log" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_points_log" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_points_log" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_tiers" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_tiers" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_tiers" TO "service_role";



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



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



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































