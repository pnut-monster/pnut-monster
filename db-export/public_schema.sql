--
-- PostgreSQL database dump
--

-- Dumped from database version 15.8
-- Dumped by pg_dump version 15.8

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

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: award_loyalty_points(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_loyalty_points(p_user_id uuid, p_action_slug text, p_reference_id text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: generate_delivery_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_delivery_code() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.delivery_code := lpad(floor(random() * 10000)::text, 4, '0');
  return new;
end;
$$;


--
-- Name: handle_new_outlet_settings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_outlet_settings() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  insert into public.outlet_settings (outlet_id) values (new.id);
  return new;
end;
$$;


--
-- Name: handle_new_profile_wallet(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_profile_wallet() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  insert into public.wallets (user_id) values (new.id);
  return new;
end;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin', 'super_admin')
  );
$$;


--
-- Name: manual_refund_order(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.manual_refund_order(p_order_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: place_order_with_wallet(jsonb, jsonb[], numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.place_order_with_wallet(p_order jsonb, p_items jsonb[], p_wallet_amount numeric DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: reject_order_with_refund(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_order_with_refund(p_order_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: topup_wallet(uuid, numeric, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.topup_wallet(p_user_id uuid, p_amount numeric, p_bonus numeric DEFAULT 0, p_reference_id text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT campaigns_type_check CHECK ((type = ANY (ARRAY['wallet_topup_bonus'::text, 'referral'::text, 'birthday'::text, 'first_order'::text])))
);


--
-- Name: coupon_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupon_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coupon_id uuid NOT NULL,
    user_id uuid NOT NULL,
    order_id uuid NOT NULL,
    discount_amount numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    description text NOT NULL,
    discount_type text NOT NULL,
    discount_value numeric(10,2) NOT NULL,
    min_order numeric(10,2) DEFAULT 0 NOT NULL,
    max_discount numeric(10,2),
    usage_limit integer,
    used_count integer DEFAULT 0 NOT NULL,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT coupons_discount_type_check CHECK ((discount_type = ANY (ARRAY['percentage'::text, 'flat'::text])))
);


--
-- Name: customization_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customization_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    name text NOT NULL,
    price numeric(10,2) DEFAULT 0 NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: item_customization_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_customization_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id uuid NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    is_required boolean DEFAULT false NOT NULL,
    min_select integer DEFAULT 0 NOT NULL,
    max_select integer DEFAULT 1 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT item_customization_groups_type_check CHECK ((type = ANY (ARRAY['base'::text, 'topping'::text, 'flavour'::text, 'extra'::text])))
);


--
-- Name: loyalty_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loyalty_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tier_id uuid NOT NULL,
    current_points integer DEFAULT 0 NOT NULL,
    lifetime_points integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: loyalty_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loyalty_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text NOT NULL,
    points integer NOT NULL,
    event_type text NOT NULL,
    max_per_day integer,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: loyalty_points_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loyalty_points_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    action_id uuid,
    mission_id uuid,
    points integer NOT NULL,
    description text NOT NULL,
    reference_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: loyalty_tiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loyalty_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    min_lifetime_points integer DEFAULT 0 NOT NULL,
    multiplier numeric(3,1) DEFAULT 1.0 NOT NULL,
    benefits jsonb DEFAULT '[]'::jsonb NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: menu_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    image_url text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: menu_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subcategory_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    image_url text,
    base_price numeric(10,2) NOT NULL,
    is_veg boolean DEFAULT true NOT NULL,
    is_bestseller boolean DEFAULT false NOT NULL,
    is_new boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: menu_subcategories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_subcategories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mission_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mission_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    mission_id uuid NOT NULL,
    current_count integer DEFAULT 0 NOT NULL,
    is_completed boolean DEFAULT false NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: missions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.missions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    type text NOT NULL,
    target_event text NOT NULL,
    target_count integer DEFAULT 1 NOT NULL,
    reward_points integer DEFAULT 0 NOT NULL,
    reward_type text DEFAULT 'points'::text NOT NULL,
    reward_value jsonb DEFAULT '{}'::jsonb NOT NULL,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    ends_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT missions_reward_type_check CHECK ((reward_type = ANY (ARRAY['points'::text, 'coupon'::text, 'badge'::text]))),
    CONSTRAINT missions_type_check CHECK ((type = ANY (ARRAY['one_time'::text, 'recurring'::text, 'streak'::text])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    type text DEFAULT 'general'::text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['order'::text, 'wallet'::text, 'loyalty'::text, 'campaign'::text, 'general'::text])))
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    item_id uuid NOT NULL,
    item_name text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    total_price numeric(10,2) NOT NULL,
    customizations jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_number text NOT NULL,
    user_id uuid NOT NULL,
    outlet_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    subtotal numeric(10,2) NOT NULL,
    tax numeric(10,2) DEFAULT 0 NOT NULL,
    packaging_charge numeric(10,2) DEFAULT 0 NOT NULL,
    discount numeric(10,2) DEFAULT 0 NOT NULL,
    wallet_used numeric(10,2) DEFAULT 0 NOT NULL,
    total numeric(10,2) NOT NULL,
    payment_method text NOT NULL,
    payment_status text DEFAULT 'pending'::text NOT NULL,
    coupon_code text,
    notes text,
    estimated_ready_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    delivery_code text,
    CONSTRAINT orders_payment_method_check CHECK ((payment_method = ANY (ARRAY['online'::text, 'wallet'::text, 'split'::text]))),
    CONSTRAINT orders_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'refunded'::text]))),
    CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'preparing'::text, 'ready'::text, 'picked_up'::text, 'cancelled'::text])))
);


--
-- Name: outlet_menu_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outlet_menu_items (
    outlet_id uuid NOT NULL,
    item_id uuid NOT NULL,
    is_available boolean DEFAULT true NOT NULL,
    price_override numeric(10,2)
);


--
-- Name: outlet_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outlet_settings (
    outlet_id uuid NOT NULL,
    auto_accept_orders boolean DEFAULT false NOT NULL,
    estimated_prep_time integer DEFAULT 20 NOT NULL,
    max_concurrent_orders integer DEFAULT 50 NOT NULL,
    new_order_sound boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: outlet_staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outlet_staff (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    outlet_id uuid NOT NULL,
    user_id uuid NOT NULL,
    is_manager boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: outlets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outlets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    address text NOT NULL,
    city text NOT NULL,
    state text NOT NULL,
    pincode text NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    phone text NOT NULL,
    image_url text,
    is_active boolean DEFAULT true NOT NULL,
    opens_at time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
    closes_at time without time zone DEFAULT '22:00:00'::time without time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    phone text,
    email text,
    full_name text,
    avatar_url text,
    role text DEFAULT 'customer'::text NOT NULL,
    referral_code text,
    referred_by uuid,
    date_of_birth date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['customer'::text, 'admin'::text, 'super_admin'::text, 'outlet_staff'::text])))
);


--
-- Name: wallet_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wallet_id uuid NOT NULL,
    type text NOT NULL,
    amount numeric(10,2) NOT NULL,
    balance_after numeric(10,2) NOT NULL,
    description text NOT NULL,
    reference_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wallet_transactions_type_check CHECK ((type = ANY (ARRAY['topup'::text, 'bonus'::text, 'debit'::text, 'refund'::text])))
);


--
-- Name: wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    loaded_balance numeric(10,2) DEFAULT 0 NOT NULL,
    bonus_balance numeric(10,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Data for Name: campaigns; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.campaigns (id, name, type, config, starts_at, ends_at, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: coupon_usage; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.coupon_usage (id, coupon_id, user_id, order_id, discount_amount, created_at) FROM stdin;
\.


--
-- Data for Name: coupons; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.coupons (id, code, description, discount_type, discount_value, min_order, max_discount, usage_limit, used_count, starts_at, ends_at, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: customization_options; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customization_options (id, group_id, name, price, is_default, is_active, sort_order) FROM stdin;
be4e9cb1-1559-4c7b-980e-998413b3fb2e	4af024d6-6d8c-413e-ab37-5db0d94cf198	Moong-Raw	0.00	f	t	0
ffba31cc-3dd3-4725-9d9c-af4d7e52e4a8	4af024d6-6d8c-413e-ab37-5db0d94cf198	Moong-Boiled	0.00	f	t	0
1096006e-6d45-4890-89de-4452e02cdbb1	fdd2e6e1-5ba3-480e-ac8a-84f3ee8926e7	Onion	0.00	f	t	0
29ea33eb-f3c8-4b18-8385-58687f63e5b9	fdd2e6e1-5ba3-480e-ac8a-84f3ee8926e7	Tomato	0.00	f	t	0
14ded0b6-650b-4e74-903d-8a061801823a	fdd2e6e1-5ba3-480e-ac8a-84f3ee8926e7	Green Chilli	0.00	f	t	0
88814658-cda3-4f18-abea-083235b1110d	fdd2e6e1-5ba3-480e-ac8a-84f3ee8926e7	Cucumbers	0.00	f	t	0
f650f84d-a0a6-4a2a-9c5f-483f8d7f15df	fdd2e6e1-5ba3-480e-ac8a-84f3ee8926e7	Bell Peppers	0.00	f	t	0
c732d522-c321-4f09-9ded-a53a3d8aa3c2	fdd2e6e1-5ba3-480e-ac8a-84f3ee8926e7	Coriander	0.00	f	t	0
292a019a-4ffe-4b24-b384-53818e3726b3	8bc9b3ce-96b1-433d-954b-14365facefad	Chaat Masala	0.00	f	t	0
0375692c-8ab1-4bf7-8b27-5a8bce7ad2e4	8bc9b3ce-96b1-433d-954b-14365facefad	Tangy Lemon	0.00	f	t	0
53d8b0b5-596c-49db-954c-b5a9ffeaefc7	8bc9b3ce-96b1-433d-954b-14365facefad	Pnut Special 	0.00	f	t	0
cb57ed84-5e42-4100-8ae1-49702802ccfe	8bc9b3ce-96b1-433d-954b-14365facefad	Red Chilli	0.00	f	t	0
60c9b9af-8a07-4339-96d8-c3dd767cc8f4	8bc9b3ce-96b1-433d-954b-14365facefad	Peri Peri	0.00	f	t	0
7e422813-6b42-4ac7-a306-5cad9b51ac01	93bf6afc-f781-4b1b-a820-61d96d988315	No Lemon	0.00	f	t	0
965322fc-5d24-4455-adea-640aba816b48	93bf6afc-f781-4b1b-a820-61d96d988315	Mild	0.00	f	t	0
5418d099-0434-4f2b-b0a1-7b49f6237340	93bf6afc-f781-4b1b-a820-61d96d988315	Medium 	2.00	f	t	0
d22325b4-65c8-4885-9c09-245bc1db1f81	93bf6afc-f781-4b1b-a820-61d96d988315	Extreme	5.00	f	t	0
\.


--
-- Data for Name: item_customization_groups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.item_customization_groups (id, item_id, name, type, is_required, min_select, max_select, sort_order) FROM stdin;
4af024d6-6d8c-413e-ab37-5db0d94cf198	58bb712b-be54-4ade-b1d2-9dd2757c1c1a	Moong-Type	base	t	1	1	0
fdd2e6e1-5ba3-480e-ac8a-84f3ee8926e7	58bb712b-be54-4ade-b1d2-9dd2757c1c1a	Veggies	topping	t	1	5	0
8bc9b3ce-96b1-433d-954b-14365facefad	58bb712b-be54-4ade-b1d2-9dd2757c1c1a	Flavour	flavour	t	1	1	0
93bf6afc-f781-4b1b-a820-61d96d988315	58bb712b-be54-4ade-b1d2-9dd2757c1c1a	Lemon Intensity	extra	t	1	1	0
\.


--
-- Data for Name: loyalty_accounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.loyalty_accounts (id, user_id, tier_id, current_points, lifetime_points, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: loyalty_actions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.loyalty_actions (id, name, slug, description, points, event_type, max_per_day, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: loyalty_points_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.loyalty_points_log (id, user_id, action_id, mission_id, points, description, reference_id, created_at) FROM stdin;
\.


--
-- Data for Name: loyalty_tiers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.loyalty_tiers (id, name, slug, min_lifetime_points, multiplier, benefits, sort_order) FROM stdin;
\.


--
-- Data for Name: menu_categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.menu_categories (id, name, slug, description, image_url, sort_order, is_active, created_at) FROM stdin;
5a5e1534-f7a1-4e00-93b8-1f1a817f699a	Food	food	\N	\N	0	t	2026-03-12 06:34:56.816347+00
54126a35-95ff-4eff-9648-2dfba4854321	Beverages 	beverages	\N	\N	0	t	2026-03-12 06:35:02.996729+00
47f8a7ff-b7ea-4e33-8cc4-d5f8e5714330	Combos	combos	\N	\N	0	t	2026-03-12 06:35:09.026298+00
\.


--
-- Data for Name: menu_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.menu_items (id, subcategory_id, name, slug, description, image_url, base_price, is_veg, is_bestseller, is_new, is_active, sort_order, created_at, updated_at) FROM stdin;
58bb712b-be54-4ade-b1d2-9dd2757c1c1a	0de073ec-9516-4248-baca-5f644b2d9d9a	Moong	moong	Moong Sprouts	\N	39.00	t	t	t	t	0	2026-03-12 06:36:55.152457+00	2026-03-12 06:36:55.152457+00
\.


--
-- Data for Name: menu_subcategories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.menu_subcategories (id, category_id, name, slug, sort_order, is_active, created_at) FROM stdin;
0de073ec-9516-4248-baca-5f644b2d9d9a	5a5e1534-f7a1-4e00-93b8-1f1a817f699a	Sprouts	sprouts	0	t	2026-03-12 06:35:32.59803+00
4873f59e-bc92-4a9a-96cc-e71bd484c200	5a5e1534-f7a1-4e00-93b8-1f1a817f699a	Rolls	rolls	0	t	2026-03-12 06:35:39.142759+00
bab03016-2782-4306-9527-cd6b2462d4d9	5a5e1534-f7a1-4e00-93b8-1f1a817f699a	Bhel	bhel	0	t	2026-03-12 06:35:49.892342+00
a0d44024-3042-40d1-94d8-369ea1421dbc	5a5e1534-f7a1-4e00-93b8-1f1a817f699a	Oats	oats	0	t	2026-03-12 06:35:56.000012+00
6de41ff5-e67e-4ccd-9465-9b3fbc4ddd6b	54126a35-95ff-4eff-9648-2dfba4854321	Juice	juice	0	t	2026-03-12 06:36:02.992778+00
8cc6933a-82f9-46f2-836a-e20a5d96da6e	54126a35-95ff-4eff-9648-2dfba4854321	Classic Mocktails	classic-mocktails	0	t	2026-03-12 06:36:14.213248+00
d0fde03f-9979-443f-adcf-60a2087aa4f5	54126a35-95ff-4eff-9648-2dfba4854321	Smoothies	smoothies	0	t	2026-03-12 06:36:21.378495+00
\.


--
-- Data for Name: mission_progress; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mission_progress (id, user_id, mission_id, current_count, is_completed, completed_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: missions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.missions (id, name, description, type, target_event, target_count, reward_points, reward_type, reward_value, starts_at, ends_at, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notifications (id, user_id, title, body, type, data, is_read, created_at) FROM stdin;
\.


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.order_items (id, order_id, item_id, item_name, quantity, unit_price, total_price, customizations) FROM stdin;
c53457c4-7d6f-4135-8a12-6292f2916d92	4c2905be-2cca-430c-97b1-9a0a231d370d	58bb712b-be54-4ade-b1d2-9dd2757c1c1a	Moong	1	39.00	44.00	[{"options": [{"id": "ffba31cc-3dd3-4725-9d9c-af4d7e52e4a8", "name": "Moong-Boiled", "price": 0}], "group_id": "4af024d6-6d8c-413e-ab37-5db0d94cf198", "group_name": "Moong-Type"}, {"options": [{"id": "1096006e-6d45-4890-89de-4452e02cdbb1", "name": "Onion", "price": 0}, {"id": "29ea33eb-f3c8-4b18-8385-58687f63e5b9", "name": "Tomato", "price": 0}, {"id": "88814658-cda3-4f18-abea-083235b1110d", "name": "Cucumbers", "price": 0}], "group_id": "fdd2e6e1-5ba3-480e-ac8a-84f3ee8926e7", "group_name": "Veggies"}, {"options": [{"id": "53d8b0b5-596c-49db-954c-b5a9ffeaefc7", "name": "Pnut Special ", "price": 0}], "group_id": "8bc9b3ce-96b1-433d-954b-14365facefad", "group_name": "Flavour"}, {"options": [{"id": "d22325b4-65c8-4885-9c09-245bc1db1f81", "name": "Extreme", "price": 5}], "group_id": "93bf6afc-f781-4b1b-a820-61d96d988315", "group_name": "Lemon Intensity"}]
723b447c-2d22-46ec-910a-1aff97767adb	f815a8b8-6f01-43e8-8fcc-27b492ad48e8	58bb712b-be54-4ade-b1d2-9dd2757c1c1a	Moong	1	39.00	39.00	[{"options": [{"id": "ffba31cc-3dd3-4725-9d9c-af4d7e52e4a8", "name": "Moong-Boiled", "price": 0}], "group_id": "4af024d6-6d8c-413e-ab37-5db0d94cf198", "group_name": "Moong-Type"}, {"options": [{"id": "29ea33eb-f3c8-4b18-8385-58687f63e5b9", "name": "Tomato", "price": 0}, {"id": "88814658-cda3-4f18-abea-083235b1110d", "name": "Cucumbers", "price": 0}], "group_id": "fdd2e6e1-5ba3-480e-ac8a-84f3ee8926e7", "group_name": "Veggies"}, {"options": [{"id": "0375692c-8ab1-4bf7-8b27-5a8bce7ad2e4", "name": "Tangy Lemon", "price": 0}], "group_id": "8bc9b3ce-96b1-433d-954b-14365facefad", "group_name": "Flavour"}, {"options": [{"id": "965322fc-5d24-4455-adea-640aba816b48", "name": "Mild", "price": 0}], "group_id": "93bf6afc-f781-4b1b-a820-61d96d988315", "group_name": "Lemon Intensity"}]
afbb251b-9988-46ce-affc-0e6b7b80bf40	522c900b-da43-4753-80b3-a8d12d81cd7d	58bb712b-be54-4ade-b1d2-9dd2757c1c1a	Moong	1	39.00	39.00	[]
d3376e83-e5e8-4160-b824-156965fea983	e8cc03bb-7e7e-4cc5-b515-91eafff88a50	58bb712b-be54-4ade-b1d2-9dd2757c1c1a	Moong	1	39.00	39.00	[]
d20d7f08-6383-4d95-92fa-3dd402347ab8	2764dc91-e940-4f7a-b7bd-fa994cc8a575	58bb712b-be54-4ade-b1d2-9dd2757c1c1a	Moong	1	39.00	39.00	[]
add62a74-bc9a-43c9-9a06-f6b15aae4daf	e6b24d8c-b026-4311-a738-0974cdf7aa85	58bb712b-be54-4ade-b1d2-9dd2757c1c1a	Moong	1	39.00	44.00	[{"options": [{"id": "ffba31cc-3dd3-4725-9d9c-af4d7e52e4a8", "name": "Moong-Boiled", "price": 0}], "group_id": "4af024d6-6d8c-413e-ab37-5db0d94cf198", "group_name": "Moong-Type"}, {"options": [{"id": "1096006e-6d45-4890-89de-4452e02cdbb1", "name": "Onion", "price": 0}, {"id": "14ded0b6-650b-4e74-903d-8a061801823a", "name": "Green Chilli", "price": 0}, {"id": "88814658-cda3-4f18-abea-083235b1110d", "name": "Cucumbers", "price": 0}, {"id": "c732d522-c321-4f09-9ded-a53a3d8aa3c2", "name": "Coriander", "price": 0}], "group_id": "fdd2e6e1-5ba3-480e-ac8a-84f3ee8926e7", "group_name": "Veggies"}, {"options": [{"id": "53d8b0b5-596c-49db-954c-b5a9ffeaefc7", "name": "Pnut Special ", "price": 0}], "group_id": "8bc9b3ce-96b1-433d-954b-14365facefad", "group_name": "Flavour"}, {"options": [{"id": "d22325b4-65c8-4885-9c09-245bc1db1f81", "name": "Extreme", "price": 5}], "group_id": "93bf6afc-f781-4b1b-a820-61d96d988315", "group_name": "Lemon Intensity"}]
88a534d9-bf8b-477c-9933-990d45c7b781	030d9ff4-7489-43d2-b809-8481312a4d86	58bb712b-be54-4ade-b1d2-9dd2757c1c1a	Moong	1	39.00	39.00	[{"options": [{"id": "be4e9cb1-1559-4c7b-980e-998413b3fb2e", "name": "Moong-Raw", "price": 0}], "group_id": "4af024d6-6d8c-413e-ab37-5db0d94cf198", "group_name": "Moong-Type"}, {"options": [{"id": "1096006e-6d45-4890-89de-4452e02cdbb1", "name": "Onion", "price": 0}, {"id": "29ea33eb-f3c8-4b18-8385-58687f63e5b9", "name": "Tomato", "price": 0}, {"id": "14ded0b6-650b-4e74-903d-8a061801823a", "name": "Green Chilli", "price": 0}, {"id": "c732d522-c321-4f09-9ded-a53a3d8aa3c2", "name": "Coriander", "price": 0}], "group_id": "fdd2e6e1-5ba3-480e-ac8a-84f3ee8926e7", "group_name": "Veggies"}, {"options": [{"id": "0375692c-8ab1-4bf7-8b27-5a8bce7ad2e4", "name": "Tangy Lemon", "price": 0}], "group_id": "8bc9b3ce-96b1-433d-954b-14365facefad", "group_name": "Flavour"}, {"options": [{"id": "965322fc-5d24-4455-adea-640aba816b48", "name": "Mild", "price": 0}], "group_id": "93bf6afc-f781-4b1b-a820-61d96d988315", "group_name": "Lemon Intensity"}]
bdd37d5e-9194-481a-846b-b65ddc6c778b	03412b87-e076-4b4c-ab69-93606d09a135	58bb712b-be54-4ade-b1d2-9dd2757c1c1a	Moong	9	39.00	396.00	[{"options": [{"id": "ffba31cc-3dd3-4725-9d9c-af4d7e52e4a8", "name": "Moong-Boiled", "price": 0}], "group_id": "4af024d6-6d8c-413e-ab37-5db0d94cf198", "group_name": "Moong-Type"}, {"options": [{"id": "1096006e-6d45-4890-89de-4452e02cdbb1", "name": "Onion", "price": 0}, {"id": "14ded0b6-650b-4e74-903d-8a061801823a", "name": "Green Chilli", "price": 0}, {"id": "88814658-cda3-4f18-abea-083235b1110d", "name": "Cucumbers", "price": 0}, {"id": "f650f84d-a0a6-4a2a-9c5f-483f8d7f15df", "name": "Bell Peppers", "price": 0}, {"id": "c732d522-c321-4f09-9ded-a53a3d8aa3c2", "name": "Coriander", "price": 0}], "group_id": "fdd2e6e1-5ba3-480e-ac8a-84f3ee8926e7", "group_name": "Veggies"}, {"options": [{"id": "53d8b0b5-596c-49db-954c-b5a9ffeaefc7", "name": "Pnut Special ", "price": 0}], "group_id": "8bc9b3ce-96b1-433d-954b-14365facefad", "group_name": "Flavour"}, {"options": [{"id": "d22325b4-65c8-4885-9c09-245bc1db1f81", "name": "Extreme", "price": 5}], "group_id": "93bf6afc-f781-4b1b-a820-61d96d988315", "group_name": "Lemon Intensity"}]
be80508b-f747-4081-ab02-037e67c58640	3fa9e8f0-15ab-4ccf-93c8-6d76228228d2	58bb712b-be54-4ade-b1d2-9dd2757c1c1a	Moong	1	39.00	44.00	[{"options": [{"id": "be4e9cb1-1559-4c7b-980e-998413b3fb2e", "name": "Moong-Raw", "price": 0}], "group_id": "4af024d6-6d8c-413e-ab37-5db0d94cf198", "group_name": "Moong-Type"}, {"options": [{"id": "1096006e-6d45-4890-89de-4452e02cdbb1", "name": "Onion", "price": 0}, {"id": "c732d522-c321-4f09-9ded-a53a3d8aa3c2", "name": "Coriander", "price": 0}], "group_id": "fdd2e6e1-5ba3-480e-ac8a-84f3ee8926e7", "group_name": "Veggies"}, {"options": [{"id": "0375692c-8ab1-4bf7-8b27-5a8bce7ad2e4", "name": "Tangy Lemon", "price": 0}], "group_id": "8bc9b3ce-96b1-433d-954b-14365facefad", "group_name": "Flavour"}, {"options": [{"id": "d22325b4-65c8-4885-9c09-245bc1db1f81", "name": "Extreme", "price": 5}], "group_id": "93bf6afc-f781-4b1b-a820-61d96d988315", "group_name": "Lemon Intensity"}]
fedc055f-633e-4468-bff2-174b5216a87c	3ac001e3-9544-4b93-9b27-8bc1c34a93cd	58bb712b-be54-4ade-b1d2-9dd2757c1c1a	Moong	16	39.00	704.00	[{"options": [{"id": "be4e9cb1-1559-4c7b-980e-998413b3fb2e", "name": "Moong-Raw", "price": 0}], "group_id": "4af024d6-6d8c-413e-ab37-5db0d94cf198", "group_name": "Moong-Type"}, {"options": [{"id": "1096006e-6d45-4890-89de-4452e02cdbb1", "name": "Onion", "price": 0}, {"id": "29ea33eb-f3c8-4b18-8385-58687f63e5b9", "name": "Tomato", "price": 0}, {"id": "14ded0b6-650b-4e74-903d-8a061801823a", "name": "Green Chilli", "price": 0}, {"id": "f650f84d-a0a6-4a2a-9c5f-483f8d7f15df", "name": "Bell Peppers", "price": 0}, {"id": "c732d522-c321-4f09-9ded-a53a3d8aa3c2", "name": "Coriander", "price": 0}], "group_id": "fdd2e6e1-5ba3-480e-ac8a-84f3ee8926e7", "group_name": "Veggies"}, {"options": [{"id": "0375692c-8ab1-4bf7-8b27-5a8bce7ad2e4", "name": "Tangy Lemon", "price": 0}], "group_id": "8bc9b3ce-96b1-433d-954b-14365facefad", "group_name": "Flavour"}, {"options": [{"id": "d22325b4-65c8-4885-9c09-245bc1db1f81", "name": "Extreme", "price": 5}], "group_id": "93bf6afc-f781-4b1b-a820-61d96d988315", "group_name": "Lemon Intensity"}]
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.orders (id, order_number, user_id, outlet_id, status, subtotal, tax, packaging_charge, discount, wallet_used, total, payment_method, payment_status, coupon_code, notes, estimated_ready_at, created_at, updated_at, delivery_code) FROM stdin;
f815a8b8-6f01-43e8-8fcc-27b492ad48e8	PMEE1434BD	ed2c107b-ffeb-4225-8b7d-cf59f3c6d998	2e0d67b7-5e67-4406-addb-4a43e0e742f4	picked_up	39.00	1.95	10.00	0.00	50.95	50.95	wallet	paid	\N	\N	\N	2026-03-12 07:05:11.677291+00	2026-03-12 07:11:47.271513+00	8110
522c900b-da43-4753-80b3-a8d12d81cd7d	PM3334AA04	ed2c107b-ffeb-4225-8b7d-cf59f3c6d998	2e0d67b7-5e67-4406-addb-4a43e0e742f4	picked_up	39.00	1.95	10.00	0.00	0.00	50.95	online	paid	\N	\N	\N	2026-03-12 07:18:31.963306+00	2026-03-12 07:19:12.97497+00	7057
e6b24d8c-b026-4311-a738-0974cdf7aa85	PMD0CA9486	9774858f-6e0c-4fd6-adc6-16a60b95ed23	2e0d67b7-5e67-4406-addb-4a43e0e742f4	picked_up	44.00	2.20	10.00	0.00	56.20	56.20	wallet	paid	\N	\N	\N	2026-03-12 07:25:12.580696+00	2026-03-12 07:25:50.841708+00	2328
2764dc91-e940-4f7a-b7bd-fa994cc8a575	PMF99814FD	ed2c107b-ffeb-4225-8b7d-cf59f3c6d998	2e0d67b7-5e67-4406-addb-4a43e0e742f4	picked_up	39.00	1.95	10.00	0.00	41.90	50.95	split	paid	\N	\N	\N	2026-03-12 07:23:02.416159+00	2026-03-12 07:26:06.1657+00	2363
e8cc03bb-7e7e-4cc5-b515-91eafff88a50	PM2D09DB24	ed2c107b-ffeb-4225-8b7d-cf59f3c6d998	2e0d67b7-5e67-4406-addb-4a43e0e742f4	picked_up	39.00	1.95	10.00	0.00	50.95	50.95	wallet	paid	\N	\N	\N	2026-03-12 07:22:31.450209+00	2026-03-12 07:26:12.137371+00	1344
4c2905be-2cca-430c-97b1-9a0a231d370d	PM62E6926F	ed2c107b-ffeb-4225-8b7d-cf59f3c6d998	2e0d67b7-5e67-4406-addb-4a43e0e742f4	cancelled	44.00	2.20	10.00	0.00	56.20	56.20	wallet	refunded	\N	\N	\N	2026-03-12 06:58:21.70332+00	2026-04-10 06:30:13.052249+00	7224
030d9ff4-7489-43d2-b809-8481312a4d86	PM0A9F0D82	9774858f-6e0c-4fd6-adc6-16a60b95ed23	2e0d67b7-5e67-4406-addb-4a43e0e742f4	picked_up	39.00	1.95	10.00	0.00	50.95	50.95	wallet	paid	\N	\N	\N	2026-04-10 06:44:13.111873+00	2026-04-10 06:47:04.949141+00	1074
03412b87-e076-4b4c-ab69-93606d09a135	PM766ECC8E	9774858f-6e0c-4fd6-adc6-16a60b95ed23	2e0d67b7-5e67-4406-addb-4a43e0e742f4	picked_up	396.00	19.80	10.00	0.00	425.80	425.80	wallet	paid	\N	\N	\N	2026-04-10 06:49:23.963732+00	2026-04-10 06:49:44.406319+00	7009
3fa9e8f0-15ab-4ccf-93c8-6d76228228d2	PM74E8E625	9774858f-6e0c-4fd6-adc6-16a60b95ed23	2e0d67b7-5e67-4406-addb-4a43e0e742f4	picked_up	44.00	2.20	10.00	0.00	0.00	56.20	online	paid	\N	\N	\N	2026-04-10 06:50:34.618496+00	2026-04-10 06:50:58.768939+00	7827
3ac001e3-9544-4b93-9b27-8bc1c34a93cd	PM0D38A968	9774858f-6e0c-4fd6-adc6-16a60b95ed23	2e0d67b7-5e67-4406-addb-4a43e0e742f4	picked_up	704.00	35.20	10.00	0.00	749.20	749.20	wallet	paid	\N	\N	\N	2026-04-10 06:52:29.203594+00	2026-04-10 06:52:59.286795+00	4809
\.


--
-- Data for Name: outlet_menu_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.outlet_menu_items (outlet_id, item_id, is_available, price_override) FROM stdin;
\.


--
-- Data for Name: outlet_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.outlet_settings (outlet_id, auto_accept_orders, estimated_prep_time, max_concurrent_orders, new_order_sound, updated_at) FROM stdin;
2e0d67b7-5e67-4406-addb-4a43e0e742f4	f	20	50	t	2026-03-12 06:31:09.608174+00
\.


--
-- Data for Name: outlet_staff; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.outlet_staff (id, outlet_id, user_id, is_manager, created_at) FROM stdin;
87293e8a-5911-4fb0-b9fd-c49aac2297c3	2e0d67b7-5e67-4406-addb-4a43e0e742f4	e78a1d4b-4351-4f07-8034-26e28d7026ed	t	2026-04-10 06:45:59.855013+00
\.


--
-- Data for Name: outlets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.outlets (id, name, slug, address, city, state, pincode, latitude, longitude, phone, image_url, is_active, opens_at, closes_at, created_at, updated_at) FROM stdin;
2e0d67b7-5e67-4406-addb-4a43e0e742f4	Haryana School Of Business Outlet	haryana-school-of-business-outlet	HSB, GJUST, Hisar	Hisar	Haryana	125001	0	0	09541912555	\N	t	09:00:00	22:00:00	2026-03-12 06:31:09.608174+00	2026-03-12 06:31:09.608174+00
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.profiles (id, phone, email, full_name, avatar_url, role, referral_code, referred_by, date_of_birth, created_at, updated_at) FROM stdin;
75d4766d-5355-4b0b-8243-330760501584	\N	admin@pnut.monster	Admin User	\N	super_admin	AE5B1A0D	\N	\N	2026-03-05 06:00:29.536061+00	2026-03-05 06:00:29.965321+00
9774858f-6e0c-4fd6-adc6-16a60b95ed23	\N	rahul@pnut.monster	Rahul	\N	customer	\N	\N	\N	2026-03-06 17:43:08.59032+00	2026-03-06 17:43:08.561+00
ed2c107b-ffeb-4225-8b7d-cf59f3c6d998	+919255105101	rudrakakkar26@gmail.com	Rudra kakkar	\N	customer	5E3A21DE	\N	2004-04-25	2026-03-12 06:15:15.352708+00	2026-03-12 06:17:12.520242+00
9c9fb404-da5d-44b3-949f-1187d9f9b4b2	\N	customer@pnutmonster.com	Test Customer	\N	customer	D0D0E633	\N	\N	2026-04-10 06:22:40.3086+00	2026-04-10 06:22:40.3086+00
fd7f5bcd-cea8-460c-b096-78b9fab8e9ac	\N	admin@pnutmonster.com	Admin	\N	admin	6D62438A	\N	\N	2026-03-12 06:25:37.460758+00	2026-04-10 06:23:32.562596+00
e78a1d4b-4351-4f07-8034-26e28d7026ed	\N	staff@pnutmonster.com	Staff User	\N	outlet_staff	77BD9684	\N	\N	2026-04-10 06:23:14.111319+00	2026-04-10 06:23:32.562596+00
\.


--
-- Data for Name: wallet_transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.wallet_transactions (id, wallet_id, type, amount, balance_after, description, reference_id, created_at) FROM stdin;
21d093eb-6b3a-4902-99a3-6c5c7a2f9ec0	919017de-698f-455b-9412-bae09d1eee80	topup	1000.00	1000.00	Wallet top-up	mock_1772818999106	2026-03-06 17:43:19.141675+00
f165b61b-6088-449a-a578-d5649e1eb795	789be5a0-e908-4985-a43f-7d567e6482f1	topup	100.00	100.00	Wallet top-up	mock_1773296231287	2026-03-12 06:17:31.914242+00
67b5c6fe-4084-49fc-a59a-94fc868a4e82	919017de-698f-455b-9412-bae09d1eee80	topup	1000.00	2000.00	Wallet top-up	mock_1773296876111	2026-03-12 06:27:56.146725+00
d34470af-cf79-4a68-989e-e7f807b73f27	919017de-698f-455b-9412-bae09d1eee80	topup	1000000.00	1002000.00	Wallet top-up	mock_1773296887081	2026-03-12 06:28:07.067171+00
53d2009d-dc28-4f3d-85b1-d8faf3ec864e	919017de-698f-455b-9412-bae09d1eee80	topup	1000000.00	2002000.00	Wallet top-up	mock_1773296903920	2026-03-12 06:28:23.932503+00
f180edc6-c622-4a02-a484-9f9bf8b706f5	919017de-698f-455b-9412-bae09d1eee80	topup	1000.00	2003000.00	Wallet top-up	mock_1773296922242	2026-03-12 06:28:42.253623+00
69dc2cfe-2e82-45df-96f9-424752943446	789be5a0-e908-4985-a43f-7d567e6482f1	debit	56.20	43.80	Order payment	4c2905be-2cca-430c-97b1-9a0a231d370d	2026-03-12 06:58:21.70332+00
68dd94f5-e699-4bf0-ae8e-053fa9ad219c	789be5a0-e908-4985-a43f-7d567e6482f1	topup	100.00	143.80	Wallet top-up	mock_1773299060140	2026-03-12 07:04:40.83566+00
42d0f53a-1bec-4ddd-aa84-fadb1318d6c1	789be5a0-e908-4985-a43f-7d567e6482f1	debit	50.95	92.85	Order payment	f815a8b8-6f01-43e8-8fcc-27b492ad48e8	2026-03-12 07:05:11.677291+00
448659db-9366-48f8-8150-f877e4568a95	789be5a0-e908-4985-a43f-7d567e6482f1	debit	50.95	41.90	Order payment	e8cc03bb-7e7e-4cc5-b515-91eafff88a50	2026-03-12 07:22:31.450209+00
1fff2a9a-5fab-4cbe-9e35-be23c00697c4	789be5a0-e908-4985-a43f-7d567e6482f1	debit	41.90	0.00	Order payment	2764dc91-e940-4f7a-b7bd-fa994cc8a575	2026-03-12 07:23:02.416159+00
bdfb0648-c973-4623-866b-52d1eb8fd2b5	919017de-698f-455b-9412-bae09d1eee80	debit	56.20	2002943.80	Order payment	e6b24d8c-b026-4311-a738-0974cdf7aa85	2026-03-12 07:25:12.580696+00
663e663e-81dd-4f46-a892-59d8c0a354c9	789be5a0-e908-4985-a43f-7d567e6482f1	refund	56.20	56.20	Manual refund for order #PM62E6926F	4c2905be-2cca-430c-97b1-9a0a231d370d	2026-04-10 06:30:13.052249+00
a99733fb-e1ec-422b-87b6-36969978a2ce	919017de-698f-455b-9412-bae09d1eee80	debit	50.95	2002892.85	Order payment	030d9ff4-7489-43d2-b809-8481312a4d86	2026-04-10 06:44:13.111873+00
0e2c801b-515b-4664-9eee-2865583d3a53	919017de-698f-455b-9412-bae09d1eee80	topup	10000000.00	12002892.85	Wallet top-up	mock_1775803653492	2026-04-10 06:47:33.371106+00
4c74bb7a-f0e2-490e-8cd3-bcd1214619a1	919017de-698f-455b-9412-bae09d1eee80	topup	1000000.00	13002892.85	Wallet top-up	mock_1775803674992	2026-04-10 06:47:54.663358+00
228bc6e0-c4e8-4370-9324-f7bb065d4654	919017de-698f-455b-9412-bae09d1eee80	topup	84000000.00	97002892.85	Wallet top-up	mock_1775803689977	2026-04-10 06:48:09.647181+00
7b81cb29-b059-4533-978a-c82d490526df	919017de-698f-455b-9412-bae09d1eee80	topup	2700000.00	99702892.85	Wallet top-up	mock_1775803699343	2026-04-10 06:48:19.14094+00
cf62344e-37a1-4c77-8d1d-e3960c59c607	919017de-698f-455b-9412-bae09d1eee80	debit	425.80	99702467.05	Order payment	03412b87-e076-4b4c-ab69-93606d09a135	2026-04-10 06:49:23.963732+00
e2a194cf-a8ab-4cdc-98c9-e8db7a0ed39b	919017de-698f-455b-9412-bae09d1eee80	debit	749.20	99701717.85	Order payment	3ac001e3-9544-4b93-9b27-8bc1c34a93cd	2026-04-10 06:52:29.203594+00
\.


--
-- Data for Name: wallets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.wallets (id, user_id, loaded_balance, bonus_balance, created_at, updated_at) FROM stdin;
313722a0-f43a-477a-a10e-e422dcf3bde3	75d4766d-5355-4b0b-8243-330760501584	0.00	0.00	2026-03-05 06:00:29.536061+00	2026-03-05 06:00:29.536061+00
e2cb1c2c-e696-4326-ab90-5b33b018e869	fd7f5bcd-cea8-460c-b096-78b9fab8e9ac	0.00	0.00	2026-03-12 06:25:37.460758+00	2026-03-12 06:25:37.460758+00
a1a87431-9e5d-4df9-9695-33fbdc5b51bf	9c9fb404-da5d-44b3-949f-1187d9f9b4b2	0.00	0.00	2026-04-10 06:22:40.3086+00	2026-04-10 06:22:40.3086+00
07f9d1f1-e510-4cb6-953f-abfb9270cd22	e78a1d4b-4351-4f07-8034-26e28d7026ed	0.00	0.00	2026-04-10 06:23:14.111319+00	2026-04-10 06:23:14.111319+00
789be5a0-e908-4985-a43f-7d567e6482f1	ed2c107b-ffeb-4225-8b7d-cf59f3c6d998	56.20	0.00	2026-03-12 06:15:15.352708+00	2026-04-10 06:30:13.052249+00
919017de-698f-455b-9412-bae09d1eee80	9774858f-6e0c-4fd6-adc6-16a60b95ed23	99701717.85	0.00	2026-03-06 17:43:08.59032+00	2026-04-10 06:52:29.203594+00
\.


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: coupon_usage coupon_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_usage
    ADD CONSTRAINT coupon_usage_pkey PRIMARY KEY (id);


--
-- Name: coupons coupons_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_code_key UNIQUE (code);


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);


--
-- Name: customization_options customization_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customization_options
    ADD CONSTRAINT customization_options_pkey PRIMARY KEY (id);


--
-- Name: item_customization_groups item_customization_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_customization_groups
    ADD CONSTRAINT item_customization_groups_pkey PRIMARY KEY (id);


--
-- Name: loyalty_accounts loyalty_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_accounts
    ADD CONSTRAINT loyalty_accounts_pkey PRIMARY KEY (id);


--
-- Name: loyalty_accounts loyalty_accounts_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_accounts
    ADD CONSTRAINT loyalty_accounts_user_id_key UNIQUE (user_id);


--
-- Name: loyalty_actions loyalty_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_actions
    ADD CONSTRAINT loyalty_actions_pkey PRIMARY KEY (id);


--
-- Name: loyalty_actions loyalty_actions_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_actions
    ADD CONSTRAINT loyalty_actions_slug_key UNIQUE (slug);


--
-- Name: loyalty_points_log loyalty_points_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_points_log
    ADD CONSTRAINT loyalty_points_log_pkey PRIMARY KEY (id);


--
-- Name: loyalty_tiers loyalty_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_tiers
    ADD CONSTRAINT loyalty_tiers_pkey PRIMARY KEY (id);


--
-- Name: loyalty_tiers loyalty_tiers_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_tiers
    ADD CONSTRAINT loyalty_tiers_slug_key UNIQUE (slug);


--
-- Name: menu_categories menu_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_pkey PRIMARY KEY (id);


--
-- Name: menu_categories menu_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_slug_key UNIQUE (slug);


--
-- Name: menu_items menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_pkey PRIMARY KEY (id);


--
-- Name: menu_items menu_items_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_slug_key UNIQUE (slug);


--
-- Name: menu_subcategories menu_subcategories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_subcategories
    ADD CONSTRAINT menu_subcategories_pkey PRIMARY KEY (id);


--
-- Name: menu_subcategories menu_subcategories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_subcategories
    ADD CONSTRAINT menu_subcategories_slug_key UNIQUE (slug);


--
-- Name: mission_progress mission_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_progress
    ADD CONSTRAINT mission_progress_pkey PRIMARY KEY (id);


--
-- Name: mission_progress mission_progress_user_id_mission_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_progress
    ADD CONSTRAINT mission_progress_user_id_mission_id_key UNIQUE (user_id, mission_id);


--
-- Name: missions missions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.missions
    ADD CONSTRAINT missions_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: outlet_menu_items outlet_menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outlet_menu_items
    ADD CONSTRAINT outlet_menu_items_pkey PRIMARY KEY (outlet_id, item_id);


--
-- Name: outlet_settings outlet_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outlet_settings
    ADD CONSTRAINT outlet_settings_pkey PRIMARY KEY (outlet_id);


--
-- Name: outlet_staff outlet_staff_outlet_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outlet_staff
    ADD CONSTRAINT outlet_staff_outlet_id_user_id_key UNIQUE (outlet_id, user_id);


--
-- Name: outlet_staff outlet_staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outlet_staff
    ADD CONSTRAINT outlet_staff_pkey PRIMARY KEY (id);


--
-- Name: outlets outlets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outlets
    ADD CONSTRAINT outlets_pkey PRIMARY KEY (id);


--
-- Name: outlets outlets_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outlets
    ADD CONSTRAINT outlets_slug_key UNIQUE (slug);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_referral_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_referral_code_key UNIQUE (referral_code);


--
-- Name: wallet_transactions wallet_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id);


--
-- Name: wallets wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);


--
-- Name: wallets wallets_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_user_id_key UNIQUE (user_id);


--
-- Name: idx_campaigns_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_active ON public.campaigns USING btree (is_active, starts_at, ends_at);


--
-- Name: idx_coupon_usage_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupon_usage_user ON public.coupon_usage USING btree (user_id);


--
-- Name: idx_coupons_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupons_active ON public.coupons USING btree (is_active, starts_at, ends_at);


--
-- Name: idx_coupons_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupons_code ON public.coupons USING btree (code);


--
-- Name: idx_customization_groups_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customization_groups_item ON public.item_customization_groups USING btree (item_id);


--
-- Name: idx_customization_options_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customization_options_group ON public.customization_options USING btree (group_id);


--
-- Name: idx_loyalty_accounts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loyalty_accounts_user ON public.loyalty_accounts USING btree (user_id);


--
-- Name: idx_loyalty_points_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loyalty_points_log_created ON public.loyalty_points_log USING btree (created_at DESC);


--
-- Name: idx_loyalty_points_log_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loyalty_points_log_user ON public.loyalty_points_log USING btree (user_id);


--
-- Name: idx_menu_items_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_items_active ON public.menu_items USING btree (is_active);


--
-- Name: idx_menu_items_subcategory; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_items_subcategory ON public.menu_items USING btree (subcategory_id);


--
-- Name: idx_menu_subcategories_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_subcategories_category ON public.menu_subcategories USING btree (category_id);


--
-- Name: idx_mission_progress_mission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mission_progress_mission ON public.mission_progress USING btree (mission_id);


--
-- Name: idx_mission_progress_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mission_progress_user ON public.mission_progress USING btree (user_id);


--
-- Name: idx_missions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_missions_active ON public.missions USING btree (is_active, starts_at, ends_at);


--
-- Name: idx_notifications_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created ON public.notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id, is_read);


--
-- Name: idx_order_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);


--
-- Name: idx_orders_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_created_at ON public.orders USING btree (created_at DESC);


--
-- Name: idx_orders_outlet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_outlet ON public.orders USING btree (outlet_id);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_orders_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_user ON public.orders USING btree (user_id);


--
-- Name: idx_outlet_menu_items_outlet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outlet_menu_items_outlet ON public.outlet_menu_items USING btree (outlet_id);


--
-- Name: idx_outlet_staff_outlet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outlet_staff_outlet ON public.outlet_staff USING btree (outlet_id);


--
-- Name: idx_outlet_staff_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outlet_staff_user ON public.outlet_staff USING btree (user_id);


--
-- Name: idx_outlets_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outlets_city ON public.outlets USING btree (city);


--
-- Name: idx_outlets_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outlets_is_active ON public.outlets USING btree (is_active);


--
-- Name: idx_outlets_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outlets_slug ON public.outlets USING btree (slug);


--
-- Name: idx_profiles_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_phone ON public.profiles USING btree (phone);


--
-- Name: idx_profiles_referral_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_referral_code ON public.profiles USING btree (referral_code);


--
-- Name: idx_profiles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);


--
-- Name: idx_wallet_transactions_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wallet_transactions_created ON public.wallet_transactions USING btree (created_at DESC);


--
-- Name: idx_wallet_transactions_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wallet_transactions_wallet ON public.wallet_transactions USING btree (wallet_id);


--
-- Name: idx_wallets_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wallets_user ON public.wallets USING btree (user_id);


--
-- Name: loyalty_accounts loyalty_accounts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER loyalty_accounts_updated_at BEFORE UPDATE ON public.loyalty_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: menu_items menu_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER menu_items_updated_at BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: mission_progress mission_progress_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mission_progress_updated_at BEFORE UPDATE ON public.mission_progress FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: outlets on_outlet_created_settings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_outlet_created_settings AFTER INSERT ON public.outlets FOR EACH ROW EXECUTE FUNCTION public.handle_new_outlet_settings();


--
-- Name: profiles on_profile_created_wallet; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_profile_created_wallet AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile_wallet();


--
-- Name: orders orders_generate_delivery_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_generate_delivery_code BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.generate_delivery_code();


--
-- Name: orders orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: outlet_settings outlet_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER outlet_settings_updated_at BEFORE UPDATE ON public.outlet_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: outlets outlets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER outlets_updated_at BEFORE UPDATE ON public.outlets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: profiles profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: wallets wallets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wallets_updated_at BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: coupon_usage coupon_usage_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_usage
    ADD CONSTRAINT coupon_usage_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.coupons(id);


--
-- Name: coupon_usage coupon_usage_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_usage
    ADD CONSTRAINT coupon_usage_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: coupon_usage coupon_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_usage
    ADD CONSTRAINT coupon_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: customization_options customization_options_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customization_options
    ADD CONSTRAINT customization_options_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.item_customization_groups(id) ON DELETE CASCADE;


--
-- Name: item_customization_groups item_customization_groups_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_customization_groups
    ADD CONSTRAINT item_customization_groups_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: loyalty_accounts loyalty_accounts_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_accounts
    ADD CONSTRAINT loyalty_accounts_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.loyalty_tiers(id);


--
-- Name: loyalty_accounts loyalty_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_accounts
    ADD CONSTRAINT loyalty_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: loyalty_points_log loyalty_points_log_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_points_log
    ADD CONSTRAINT loyalty_points_log_action_id_fkey FOREIGN KEY (action_id) REFERENCES public.loyalty_actions(id);


--
-- Name: loyalty_points_log loyalty_points_log_mission_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_points_log
    ADD CONSTRAINT loyalty_points_log_mission_fk FOREIGN KEY (mission_id) REFERENCES public.missions(id);


--
-- Name: loyalty_points_log loyalty_points_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_points_log
    ADD CONSTRAINT loyalty_points_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: menu_items menu_items_subcategory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_subcategory_id_fkey FOREIGN KEY (subcategory_id) REFERENCES public.menu_subcategories(id) ON DELETE CASCADE;


--
-- Name: menu_subcategories menu_subcategories_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_subcategories
    ADD CONSTRAINT menu_subcategories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.menu_categories(id) ON DELETE CASCADE;


--
-- Name: mission_progress mission_progress_mission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_progress
    ADD CONSTRAINT mission_progress_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES public.missions(id);


--
-- Name: mission_progress mission_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_progress
    ADD CONSTRAINT mission_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: order_items order_items_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.menu_items(id);


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: orders orders_outlet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_outlet_id_fkey FOREIGN KEY (outlet_id) REFERENCES public.outlets(id);


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: outlet_menu_items outlet_menu_items_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outlet_menu_items
    ADD CONSTRAINT outlet_menu_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: outlet_menu_items outlet_menu_items_outlet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outlet_menu_items
    ADD CONSTRAINT outlet_menu_items_outlet_id_fkey FOREIGN KEY (outlet_id) REFERENCES public.outlets(id) ON DELETE CASCADE;


--
-- Name: outlet_settings outlet_settings_outlet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outlet_settings
    ADD CONSTRAINT outlet_settings_outlet_id_fkey FOREIGN KEY (outlet_id) REFERENCES public.outlets(id) ON DELETE CASCADE;


--
-- Name: outlet_staff outlet_staff_outlet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outlet_staff
    ADD CONSTRAINT outlet_staff_outlet_id_fkey FOREIGN KEY (outlet_id) REFERENCES public.outlets(id) ON DELETE CASCADE;


--
-- Name: outlet_staff outlet_staff_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outlet_staff
    ADD CONSTRAINT outlet_staff_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_referred_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES public.profiles(id);


--
-- Name: wallet_transactions wallet_transactions_wallet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES public.wallets(id);


--
-- Name: wallets wallets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: campaigns campaigns: admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campaigns: admin delete" ON public.campaigns FOR DELETE USING (public.is_admin());


--
-- Name: campaigns campaigns: admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campaigns: admin insert" ON public.campaigns FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: campaigns campaigns: admin select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campaigns: admin select" ON public.campaigns FOR SELECT USING (public.is_admin());


--
-- Name: campaigns campaigns: admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campaigns: admin update" ON public.campaigns FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: campaigns campaigns: public read active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campaigns: public read active" ON public.campaigns FOR SELECT USING (((is_active = true) AND (starts_at <= now()) AND (ends_at > now())));


--
-- Name: coupon_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coupon_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: coupon_usage coupon_usage: admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "coupon_usage: admin delete" ON public.coupon_usage FOR DELETE USING (public.is_admin());


--
-- Name: coupon_usage coupon_usage: admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "coupon_usage: admin insert" ON public.coupon_usage FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: coupon_usage coupon_usage: admin select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "coupon_usage: admin select" ON public.coupon_usage FOR SELECT USING (public.is_admin());


--
-- Name: coupon_usage coupon_usage: admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "coupon_usage: admin update" ON public.coupon_usage FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: coupon_usage coupon_usage: users read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "coupon_usage: users read own" ON public.coupon_usage FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: coupons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

--
-- Name: coupons coupons: admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "coupons: admin delete" ON public.coupons FOR DELETE USING (public.is_admin());


--
-- Name: coupons coupons: admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "coupons: admin insert" ON public.coupons FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: coupons coupons: admin select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "coupons: admin select" ON public.coupons FOR SELECT USING (public.is_admin());


--
-- Name: coupons coupons: admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "coupons: admin update" ON public.coupons FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: coupons coupons: public read active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "coupons: public read active" ON public.coupons FOR SELECT USING (((is_active = true) AND (starts_at <= now()) AND (ends_at > now())));


--
-- Name: customization_options; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customization_options ENABLE ROW LEVEL SECURITY;

--
-- Name: customization_options customization_options: admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customization_options: admin delete" ON public.customization_options FOR DELETE USING (public.is_admin());


--
-- Name: customization_options customization_options: admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customization_options: admin insert" ON public.customization_options FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: customization_options customization_options: admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customization_options: admin update" ON public.customization_options FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: customization_options customization_options: public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customization_options: public read" ON public.customization_options FOR SELECT USING (true);


--
-- Name: item_customization_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.item_customization_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: item_customization_groups item_customization_groups: admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "item_customization_groups: admin delete" ON public.item_customization_groups FOR DELETE USING (public.is_admin());


--
-- Name: item_customization_groups item_customization_groups: admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "item_customization_groups: admin insert" ON public.item_customization_groups FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: item_customization_groups item_customization_groups: admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "item_customization_groups: admin update" ON public.item_customization_groups FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: item_customization_groups item_customization_groups: public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "item_customization_groups: public read" ON public.item_customization_groups FOR SELECT USING (true);


--
-- Name: loyalty_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: loyalty_accounts loyalty_accounts: admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "loyalty_accounts: admin delete" ON public.loyalty_accounts FOR DELETE USING (public.is_admin());


--
-- Name: loyalty_accounts loyalty_accounts: admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "loyalty_accounts: admin insert" ON public.loyalty_accounts FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: loyalty_accounts loyalty_accounts: admin select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "loyalty_accounts: admin select" ON public.loyalty_accounts FOR SELECT USING (public.is_admin());


--
-- Name: loyalty_accounts loyalty_accounts: admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "loyalty_accounts: admin update" ON public.loyalty_accounts FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: loyalty_accounts loyalty_accounts: users read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "loyalty_accounts: users read own" ON public.loyalty_accounts FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: loyalty_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.loyalty_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: loyalty_actions loyalty_actions: admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "loyalty_actions: admin delete" ON public.loyalty_actions FOR DELETE USING (public.is_admin());


--
-- Name: loyalty_actions loyalty_actions: admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "loyalty_actions: admin insert" ON public.loyalty_actions FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: loyalty_actions loyalty_actions: admin select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "loyalty_actions: admin select" ON public.loyalty_actions FOR SELECT USING (public.is_admin());


--
-- Name: loyalty_actions loyalty_actions: admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "loyalty_actions: admin update" ON public.loyalty_actions FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: loyalty_actions loyalty_actions: public read active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "loyalty_actions: public read active" ON public.loyalty_actions FOR SELECT USING ((is_active = true));


--
-- Name: loyalty_points_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.loyalty_points_log ENABLE ROW LEVEL SECURITY;

--
-- Name: loyalty_points_log loyalty_points_log: admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "loyalty_points_log: admin delete" ON public.loyalty_points_log FOR DELETE USING (public.is_admin());


--
-- Name: loyalty_points_log loyalty_points_log: admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "loyalty_points_log: admin insert" ON public.loyalty_points_log FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: loyalty_points_log loyalty_points_log: admin select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "loyalty_points_log: admin select" ON public.loyalty_points_log FOR SELECT USING (public.is_admin());


--
-- Name: loyalty_points_log loyalty_points_log: admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "loyalty_points_log: admin update" ON public.loyalty_points_log FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: loyalty_points_log loyalty_points_log: users read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "loyalty_points_log: users read own" ON public.loyalty_points_log FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: loyalty_tiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.loyalty_tiers ENABLE ROW LEVEL SECURITY;

--
-- Name: loyalty_tiers loyalty_tiers: admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "loyalty_tiers: admin delete" ON public.loyalty_tiers FOR DELETE USING (public.is_admin());


--
-- Name: loyalty_tiers loyalty_tiers: admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "loyalty_tiers: admin insert" ON public.loyalty_tiers FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: loyalty_tiers loyalty_tiers: admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "loyalty_tiers: admin update" ON public.loyalty_tiers FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: loyalty_tiers loyalty_tiers: public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "loyalty_tiers: public read" ON public.loyalty_tiers FOR SELECT USING (true);


--
-- Name: menu_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_categories menu_categories: admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "menu_categories: admin delete" ON public.menu_categories FOR DELETE USING (public.is_admin());


--
-- Name: menu_categories menu_categories: admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "menu_categories: admin insert" ON public.menu_categories FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: menu_categories menu_categories: admin select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "menu_categories: admin select" ON public.menu_categories FOR SELECT USING (public.is_admin());


--
-- Name: menu_categories menu_categories: admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "menu_categories: admin update" ON public.menu_categories FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: menu_categories menu_categories: public read active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "menu_categories: public read active" ON public.menu_categories FOR SELECT USING ((is_active = true));


--
-- Name: menu_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_items menu_items: admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "menu_items: admin delete" ON public.menu_items FOR DELETE USING (public.is_admin());


--
-- Name: menu_items menu_items: admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "menu_items: admin insert" ON public.menu_items FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: menu_items menu_items: admin select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "menu_items: admin select" ON public.menu_items FOR SELECT USING (public.is_admin());


--
-- Name: menu_items menu_items: admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "menu_items: admin update" ON public.menu_items FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: menu_items menu_items: public read active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "menu_items: public read active" ON public.menu_items FOR SELECT USING ((is_active = true));


--
-- Name: menu_subcategories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_subcategories ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_subcategories menu_subcategories: admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "menu_subcategories: admin delete" ON public.menu_subcategories FOR DELETE USING (public.is_admin());


--
-- Name: menu_subcategories menu_subcategories: admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "menu_subcategories: admin insert" ON public.menu_subcategories FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: menu_subcategories menu_subcategories: admin select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "menu_subcategories: admin select" ON public.menu_subcategories FOR SELECT USING (public.is_admin());


--
-- Name: menu_subcategories menu_subcategories: admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "menu_subcategories: admin update" ON public.menu_subcategories FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: menu_subcategories menu_subcategories: public read active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "menu_subcategories: public read active" ON public.menu_subcategories FOR SELECT USING ((is_active = true));


--
-- Name: mission_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mission_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: mission_progress mission_progress: admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mission_progress: admin delete" ON public.mission_progress FOR DELETE USING (public.is_admin());


--
-- Name: mission_progress mission_progress: admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mission_progress: admin insert" ON public.mission_progress FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: mission_progress mission_progress: admin select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mission_progress: admin select" ON public.mission_progress FOR SELECT USING (public.is_admin());


--
-- Name: mission_progress mission_progress: admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mission_progress: admin update" ON public.mission_progress FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: mission_progress mission_progress: users read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mission_progress: users read own" ON public.mission_progress FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: missions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

--
-- Name: missions missions: admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "missions: admin delete" ON public.missions FOR DELETE USING (public.is_admin());


--
-- Name: missions missions: admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "missions: admin insert" ON public.missions FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: missions missions: admin select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "missions: admin select" ON public.missions FOR SELECT USING (public.is_admin());


--
-- Name: missions missions: admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "missions: admin update" ON public.missions FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: missions missions: public read active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "missions: public read active" ON public.missions FOR SELECT USING (((is_active = true) AND (starts_at <= now()) AND ((ends_at IS NULL) OR (ends_at > now()))));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications: admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications: admin delete" ON public.notifications FOR DELETE USING (public.is_admin());


--
-- Name: notifications notifications: admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications: admin insert" ON public.notifications FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: notifications notifications: admin select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications: admin select" ON public.notifications FOR SELECT USING (public.is_admin());


--
-- Name: notifications notifications: admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications: admin update" ON public.notifications FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: notifications notifications: users read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications: users read own" ON public.notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: notifications notifications: users update own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications: users update own" ON public.notifications FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items order_items: admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "order_items: admin delete" ON public.order_items FOR DELETE USING (public.is_admin());


--
-- Name: order_items order_items: admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "order_items: admin insert" ON public.order_items FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: order_items order_items: admin select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "order_items: admin select" ON public.order_items FOR SELECT USING (public.is_admin());


--
-- Name: order_items order_items: admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "order_items: admin update" ON public.order_items FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: order_items order_items: staff read outlet order items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "order_items: staff read outlet order items" ON public.order_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.orders
     JOIN public.outlet_staff ON ((outlet_staff.outlet_id = orders.outlet_id)))
  WHERE ((orders.id = order_items.order_id) AND (outlet_staff.user_id = auth.uid())))));


--
-- Name: order_items order_items: users insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "order_items: users insert own" ON public.order_items FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.orders
  WHERE ((orders.id = order_items.order_id) AND (orders.user_id = auth.uid())))));


--
-- Name: order_items order_items: users read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "order_items: users read own" ON public.order_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.orders
  WHERE ((orders.id = order_items.order_id) AND (orders.user_id = auth.uid())))));


--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: orders orders: admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "orders: admin delete" ON public.orders FOR DELETE USING (public.is_admin());


--
-- Name: orders orders: admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "orders: admin insert" ON public.orders FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: orders orders: admin select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "orders: admin select" ON public.orders FOR SELECT USING (public.is_admin());


--
-- Name: orders orders: admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "orders: admin update" ON public.orders FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: orders orders: staff read outlet orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "orders: staff read outlet orders" ON public.orders FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.outlet_staff
  WHERE ((outlet_staff.outlet_id = orders.outlet_id) AND (outlet_staff.user_id = auth.uid())))));


--
-- Name: orders orders: staff update outlet orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "orders: staff update outlet orders" ON public.orders FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.outlet_staff
  WHERE ((outlet_staff.outlet_id = orders.outlet_id) AND (outlet_staff.user_id = auth.uid())))));


--
-- Name: orders orders: users insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "orders: users insert own" ON public.orders FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: orders orders: users read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "orders: users read own" ON public.orders FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: outlet_menu_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outlet_menu_items ENABLE ROW LEVEL SECURITY;

--
-- Name: outlet_menu_items outlet_menu_items: admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "outlet_menu_items: admin delete" ON public.outlet_menu_items FOR DELETE USING (public.is_admin());


--
-- Name: outlet_menu_items outlet_menu_items: admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "outlet_menu_items: admin insert" ON public.outlet_menu_items FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: outlet_menu_items outlet_menu_items: admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "outlet_menu_items: admin update" ON public.outlet_menu_items FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: outlet_menu_items outlet_menu_items: public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "outlet_menu_items: public read" ON public.outlet_menu_items FOR SELECT USING (true);


--
-- Name: outlet_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outlet_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: outlet_settings outlet_settings: admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "outlet_settings: admin write" ON public.outlet_settings USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));


--
-- Name: outlet_settings outlet_settings: staff read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "outlet_settings: staff read" ON public.outlet_settings FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.outlet_staff
  WHERE ((outlet_staff.outlet_id = outlet_settings.outlet_id) AND (outlet_staff.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))));


--
-- Name: outlet_settings outlet_settings: staff update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "outlet_settings: staff update" ON public.outlet_settings FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.outlet_staff
  WHERE ((outlet_staff.outlet_id = outlet_settings.outlet_id) AND (outlet_staff.user_id = auth.uid()) AND (outlet_staff.is_manager = true)))));


--
-- Name: outlet_staff; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outlet_staff ENABLE ROW LEVEL SECURITY;

--
-- Name: outlet_staff outlet_staff: admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "outlet_staff: admin all" ON public.outlet_staff USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));


--
-- Name: outlet_staff outlet_staff: own assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "outlet_staff: own assignments" ON public.outlet_staff FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: outlets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outlets ENABLE ROW LEVEL SECURITY;

--
-- Name: outlets outlets: admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "outlets: admin delete" ON public.outlets FOR DELETE USING (public.is_admin());


--
-- Name: outlets outlets: admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "outlets: admin insert" ON public.outlets FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: outlets outlets: admin select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "outlets: admin select" ON public.outlets FOR SELECT USING (public.is_admin());


--
-- Name: outlets outlets: admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "outlets: admin update" ON public.outlets FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: outlets outlets: public read active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "outlets: public read active" ON public.outlets FOR SELECT USING ((is_active = true));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles: admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles: admin delete" ON public.profiles FOR DELETE USING (public.is_admin());


--
-- Name: profiles profiles: admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles: admin insert" ON public.profiles FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: profiles profiles: admin select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles: admin select" ON public.profiles FOR SELECT USING (public.is_admin());


--
-- Name: profiles profiles: admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles: admin update" ON public.profiles FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: profiles profiles: users insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles: users insert own" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: profiles profiles: users read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles: users read own" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: profiles profiles: users update own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles: users update own" ON public.profiles FOR UPDATE USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: wallet_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: wallet_transactions wallet_transactions: admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "wallet_transactions: admin delete" ON public.wallet_transactions FOR DELETE USING (public.is_admin());


--
-- Name: wallet_transactions wallet_transactions: admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "wallet_transactions: admin insert" ON public.wallet_transactions FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: wallet_transactions wallet_transactions: admin select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "wallet_transactions: admin select" ON public.wallet_transactions FOR SELECT USING (public.is_admin());


--
-- Name: wallet_transactions wallet_transactions: admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "wallet_transactions: admin update" ON public.wallet_transactions FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: wallet_transactions wallet_transactions: users read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "wallet_transactions: users read own" ON public.wallet_transactions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.wallets
  WHERE ((wallets.id = wallet_transactions.wallet_id) AND (wallets.user_id = auth.uid())))));


--
-- Name: wallets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

--
-- Name: wallets wallets: admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "wallets: admin delete" ON public.wallets FOR DELETE USING (public.is_admin());


--
-- Name: wallets wallets: admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "wallets: admin insert" ON public.wallets FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: wallets wallets: admin select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "wallets: admin select" ON public.wallets FOR SELECT USING (public.is_admin());


--
-- Name: wallets wallets: admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "wallets: admin update" ON public.wallets FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: wallets wallets: users read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "wallets: users read own" ON public.wallets FOR SELECT USING ((auth.uid() = user_id));


--
-- PostgreSQL database dump complete
--

