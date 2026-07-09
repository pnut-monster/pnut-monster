-- Security hardening pass.
-- This migration fixes policy/function gaps introduced across earlier migrations.

-- ---------------------------------------------------------------------------
-- Profile self-updates: block privilege-bearing columns.
-- ---------------------------------------------------------------------------
create or replace function public.prevent_profile_privilege_escalation()
returns trigger as $$
begin
  if old.id is distinct from new.id then
    raise exception 'Profile id cannot be changed';
  end if;

  if not public.is_admin() then
    if old.role is distinct from new.role then
      raise exception 'Profile role cannot be changed by this user';
    end if;

    if old.referral_code is distinct from new.referral_code then
      raise exception 'Referral code cannot be changed by this user';
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_prevent_profile_privilege_escalation on public.profiles;
create trigger trg_prevent_profile_privilege_escalation
  before update on public.profiles
  for each row execute function public.prevent_profile_privilege_escalation();

-- Customers should create orders only through the hardened RPC.
drop policy if exists "orders: users insert own" on public.orders;
drop policy if exists "order_items: users insert own" on public.order_items;

-- ---------------------------------------------------------------------------
-- Tighten table policies with incorrect "true" predicates.
-- ---------------------------------------------------------------------------
drop policy if exists "Admins can update app_settings" on public.app_settings;
create policy "Admins can update app_settings"
  on public.app_settings for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can read all ratings" on public.order_ratings;
create policy "Admins can read all ratings"
  on public.order_ratings for select
  using (public.is_admin());

drop policy if exists "System can insert ledger" on public.loyalty_ledger;
create policy "Admins can insert ledger"
  on public.loyalty_ledger for insert
  with check (public.is_admin());

-- Membership cycles had no RLS in the original migration.
alter table public.membership_cycles enable row level security;

drop policy if exists "membership_cycles: users read own" on public.membership_cycles;
drop policy if exists "membership_cycles: admin select" on public.membership_cycles;
drop policy if exists "membership_cycles: admin insert" on public.membership_cycles;
drop policy if exists "membership_cycles: admin update" on public.membership_cycles;
drop policy if exists "membership_cycles: admin delete" on public.membership_cycles;

create policy "membership_cycles: users read own"
  on public.membership_cycles for select
  using (auth.uid() = user_id);

create policy "membership_cycles: admin select"
  on public.membership_cycles for select
  using (public.is_admin());

create policy "membership_cycles: admin insert"
  on public.membership_cycles for insert
  with check (public.is_admin());

create policy "membership_cycles: admin update"
  on public.membership_cycles for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "membership_cycles: admin delete"
  on public.membership_cycles for delete
  using (public.is_admin());

-- Coupon management extension tables: admin only.
drop policy if exists "coupon_campaigns: admin select" on public.coupon_campaigns;
drop policy if exists "coupon_campaigns: admin insert" on public.coupon_campaigns;
drop policy if exists "coupon_campaigns: admin update" on public.coupon_campaigns;
drop policy if exists "coupon_campaigns: admin delete" on public.coupon_campaigns;
drop policy if exists "coupon_outlet_restrictions: admin select" on public.coupon_outlet_restrictions;
drop policy if exists "coupon_outlet_restrictions: admin insert" on public.coupon_outlet_restrictions;
drop policy if exists "coupon_outlet_restrictions: admin update" on public.coupon_outlet_restrictions;
drop policy if exists "coupon_outlet_restrictions: admin delete" on public.coupon_outlet_restrictions;
drop policy if exists "coupon_audit_logs: admin select" on public.coupon_audit_logs;
drop policy if exists "coupon_audit_logs: admin insert" on public.coupon_audit_logs;

create policy "coupon_campaigns: admin select" on public.coupon_campaigns
  for select to authenticated using (public.is_admin());
create policy "coupon_campaigns: admin insert" on public.coupon_campaigns
  for insert to authenticated with check (public.is_admin());
create policy "coupon_campaigns: admin update" on public.coupon_campaigns
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "coupon_campaigns: admin delete" on public.coupon_campaigns
  for delete to authenticated using (public.is_admin());

create policy "coupon_outlet_restrictions: admin select" on public.coupon_outlet_restrictions
  for select to authenticated using (public.is_admin());
create policy "coupon_outlet_restrictions: admin insert" on public.coupon_outlet_restrictions
  for insert to authenticated with check (public.is_admin());
create policy "coupon_outlet_restrictions: admin update" on public.coupon_outlet_restrictions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "coupon_outlet_restrictions: admin delete" on public.coupon_outlet_restrictions
  for delete to authenticated using (public.is_admin());

create policy "coupon_audit_logs: admin select" on public.coupon_audit_logs
  for select to authenticated using (public.is_admin());
create policy "coupon_audit_logs: admin insert" on public.coupon_audit_logs
  for insert to authenticated with check (public.is_admin());

-- Gift-card management: admin-only except customers can read cards they redeemed.
drop policy if exists "gift_card_templates: auth select" on public.gift_card_templates;
drop policy if exists "gift_card_templates: auth insert" on public.gift_card_templates;
drop policy if exists "gift_card_templates: auth update" on public.gift_card_templates;
drop policy if exists "gift_card_templates: auth delete" on public.gift_card_templates;
drop policy if exists "gift_card_batches: auth select" on public.gift_card_batches;
drop policy if exists "gift_card_batches: auth insert" on public.gift_card_batches;
drop policy if exists "gift_card_batches: auth update" on public.gift_card_batches;
drop policy if exists "gift_card_batches: auth delete" on public.gift_card_batches;
drop policy if exists "gift_cards: auth select" on public.gift_cards;
drop policy if exists "gift_cards: auth insert" on public.gift_cards;
drop policy if exists "gift_cards: auth update" on public.gift_cards;
drop policy if exists "gift_cards: auth delete" on public.gift_cards;
drop policy if exists "gift_card_audit_logs: auth select" on public.gift_card_audit_logs;
drop policy if exists "gift_card_audit_logs: auth insert" on public.gift_card_audit_logs;

create policy "gift_card_templates: admin select" on public.gift_card_templates
  for select to authenticated using (public.is_admin());
create policy "gift_card_templates: admin insert" on public.gift_card_templates
  for insert to authenticated with check (public.is_admin());
create policy "gift_card_templates: admin update" on public.gift_card_templates
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "gift_card_templates: admin delete" on public.gift_card_templates
  for delete to authenticated using (public.is_admin());

create policy "gift_card_batches: admin select" on public.gift_card_batches
  for select to authenticated using (public.is_admin());
create policy "gift_card_batches: admin insert" on public.gift_card_batches
  for insert to authenticated with check (public.is_admin());
create policy "gift_card_batches: admin update" on public.gift_card_batches
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "gift_card_batches: admin delete" on public.gift_card_batches
  for delete to authenticated using (public.is_admin());

create policy "gift_cards: admin select" on public.gift_cards
  for select to authenticated using (public.is_admin());
create policy "gift_cards: users read redeemed own" on public.gift_cards
  for select to authenticated using (redeemed_by = auth.uid());
create policy "gift_cards: admin insert" on public.gift_cards
  for insert to authenticated with check (public.is_admin());
create policy "gift_cards: admin update" on public.gift_cards
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "gift_cards: admin delete" on public.gift_cards
  for delete to authenticated using (public.is_admin());

create policy "gift_card_audit_logs: admin select" on public.gift_card_audit_logs
  for select to authenticated using (public.is_admin());
create policy "gift_card_audit_logs: admin insert" on public.gift_card_audit_logs
  for insert to authenticated with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- RPC helpers.
-- ---------------------------------------------------------------------------
create or replace function public.is_outlet_staff_for_order(p_order_id uuid)
returns boolean as $$
  select exists (
    select 1
    from public.orders o
    join public.outlet_staff os on os.outlet_id = o.outlet_id
    where o.id = p_order_id
      and os.user_id = auth.uid()
  );
$$ language sql security definer stable set search_path = public;

create or replace function public.can_manage_order(p_order_id uuid)
returns boolean as $$
  select public.is_admin() or public.is_outlet_staff_for_order(p_order_id);
$$ language sql security definer stable set search_path = public;

-- ---------------------------------------------------------------------------
-- Harden wallet top-up. Real customer top-ups must be created only after a
-- verified payment event. Until then, this RPC is admin adjustment only.
-- ---------------------------------------------------------------------------
create or replace function public.topup_wallet(
  p_user_id uuid,
  p_amount numeric,
  p_bonus numeric default 0,
  p_reference_id text default null
)
returns jsonb as $$
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
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Harden loyalty point awards.
-- ---------------------------------------------------------------------------
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
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Harden order placement: verify caller, recompute prices, discounts, tax,
-- packaging, loyalty, and wallet debit server-side.
-- ---------------------------------------------------------------------------
drop function if exists public.place_order_with_wallet(jsonb, jsonb[], numeric, int, numeric);

create or replace function public.place_order_with_wallet(
  p_order jsonb,
  p_items jsonb[],
  p_wallet_amount numeric default 0,
  p_loyalty_points int default 0,
  p_nth_order_discount numeric default 0
)
returns jsonb as $$
declare
  v_auth_uid uuid;
  v_order_id uuid;
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
  v_payment_status := case when v_wallet_amount >= v_total then 'paid' else 'pending' end;

  v_order_number := 'PM' || upper(substr(md5(gen_random_uuid()::text), 1, 8));

  insert into orders (
    order_number, user_id, outlet_id, status,
    subtotal, tax, packaging_charge, discount, wallet_used, total,
    payment_method, payment_status, coupon_code, notes, loyalty_points_used, loyalty_discount
  ) values (
    v_order_number, v_auth_uid, v_outlet_id, 'pending',
    v_subtotal, v_tax, v_packaging, v_total_discount, v_wallet_amount, v_total,
    v_payment_method, v_payment_status, v_coupon_code, nullif(p_order->>'notes', ''),
    p_loyalty_points, v_loyalty_discount
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
$$ language plpgsql security definer set search_path = public;

-- Read-only calculations must be scoped to the caller.
create or replace function public.calculate_max_redeemable_points(
  p_user_id uuid,
  p_subtotal numeric,
  p_tax numeric,
  p_packaging numeric,
  p_has_coupon boolean default false,
  p_has_discounted_items boolean default false
)
returns jsonb as $$
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
$$ language plpgsql security definer set search_path = public;

create or replace function public.check_nth_order_discount(p_user_id uuid)
returns jsonb as $$
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
$$ language plpgsql security definer set search_path = public;

-- Admin/staff order operations.
create or replace function public.manual_refund_order(p_order_id uuid)
returns jsonb as $$
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
$$ language plpgsql security definer set search_path = public;

create or replace function public.reject_and_refund_order(p_order_id uuid)
returns jsonb as $$
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
$$ language plpgsql security definer set search_path = public;

create or replace function public.reject_order_with_refund(p_order_id uuid)
returns jsonb as $$
begin
  return public.reject_and_refund_order(p_order_id);
end;
$$ language plpgsql security definer set search_path = public;

-- Gift-card admin/customer RPCs.
create or replace function public.generate_gift_card_batch(
  p_template_id uuid,
  p_batch_name text,
  p_quantity int,
  p_code_format text default 'alphanumeric_12',
  p_code_prefix text default null
)
returns jsonb as $$
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
$$ language plpgsql security definer set search_path = public;

create or replace function public.expire_gift_cards()
returns jsonb as $$
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
$$ language plpgsql security definer set search_path = public;

-- Analytics and membership RPCs.
create or replace function public.get_loyalty_analytics()
returns jsonb as $$
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
$$ language plpgsql security definer set search_path = public;

create or replace function public.get_membership_status(p_user_id uuid)
returns jsonb as $$
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
$$ language plpgsql security definer set search_path = public;

create or replace function public.renew_expired_membership_cycles()
returns jsonb as $$
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
$$ language plpgsql security definer set search_path = public;

create or replace function public.check_membership_renewals()
returns jsonb as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return public.renew_expired_membership_cycles();
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Function grants. Revoke the broad default and grant only RPCs the app uses.
-- Role/profile checks still happen inside each function.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from authenticated;

grant execute on function public.apply_referral_code(text) to authenticated;
grant execute on function public.claim_referral_reward() to authenticated;
grant execute on function public.get_claimable_referral_rewards() to authenticated;
grant execute on function public.award_loyalty_points(uuid, text, text, int) to authenticated;
grant execute on function public.calculate_max_redeemable_points(uuid, numeric, numeric, numeric, boolean, boolean) to authenticated;
grant execute on function public.check_nth_order_discount(uuid) to authenticated;
grant execute on function public.place_order_with_wallet(jsonb, jsonb[], numeric, int, numeric) to authenticated;
grant execute on function public.redeem_gift_card(text) to authenticated;
grant execute on function public.get_membership_status(uuid) to authenticated;

grant execute on function public.manual_refund_order(uuid) to authenticated;
grant execute on function public.reject_and_refund_order(uuid) to authenticated;
grant execute on function public.reject_order_with_refund(uuid) to authenticated;
grant execute on function public.generate_gift_card_batch(uuid, text, int, text, text) to authenticated;
grant execute on function public.expire_gift_cards() to authenticated;
grant execute on function public.get_loyalty_analytics() to authenticated;
grant execute on function public.check_membership_renewals() to authenticated;
