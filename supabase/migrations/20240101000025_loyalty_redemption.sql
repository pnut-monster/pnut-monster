-- Loyalty Redemption System: settings, ledger, and RPC functions

-- 1. Seed redemption settings into app_settings
insert into public.app_settings (key, value) values
  ('loyalty_point_value', '0.25'),
  ('loyalty_min_balance_to_redeem', '100'),
  ('loyalty_max_order_pct', '50'),
  ('loyalty_max_points_per_order', '500'),
  ('loyalty_allow_with_coupon', 'true'),
  ('loyalty_allow_on_discounted', 'true'),
  ('loyalty_cover_tax', 'false'),
  ('loyalty_cover_packaging', 'false'),
  ('loyalty_redemption_enabled', 'true')
on conflict (key) do update set value = excluded.value;

-- 2. Loyalty redemption ledger (every earn/redeem logged with running balance & monetary value)
create table if not exists public.loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  type text not null check (type in ('earn', 'redeem')),
  points int not null,
  monetary_value numeric(10,2) not null default 0,
  balance_after int not null,
  source text not null,
  order_id uuid references public.orders(id),
  description text not null,
  created_at timestamptz not null default now()
);

create index idx_loyalty_ledger_user on public.loyalty_ledger(user_id);
create index idx_loyalty_ledger_created on public.loyalty_ledger(created_at desc);
create index idx_loyalty_ledger_type on public.loyalty_ledger(type);

-- RLS for loyalty_ledger
alter table public.loyalty_ledger enable row level security;

create policy "Users can view own ledger"
  on public.loyalty_ledger for select
  using (auth.uid() = user_id);

create policy "Admins can view all ledger"
  on public.loyalty_ledger for select
  using (public.is_admin());

create policy "System can insert ledger"
  on public.loyalty_ledger for insert
  with check (true);

-- 3. Function to calculate max redeemable points for a given order
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
  -- Load settings
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

  -- Check coupon/discount restrictions
  if p_has_coupon and not v_allow_with_coupon then
    return jsonb_build_object('eligible', false, 'reason', 'Cannot use points with coupon', 'max_points', 0, 'monetary_value', 0);
  end if;

  if p_has_discounted_items and not v_allow_on_discounted then
    return jsonb_build_object('eligible', false, 'reason', 'Cannot use points on discounted items', 'max_points', 0, 'monetary_value', 0);
  end if;

  -- Get user's loyalty account
  select * into v_account from loyalty_accounts where user_id = p_user_id;
  if not found or v_account.current_points < v_min_balance then
    return jsonb_build_object('eligible', false, 'reason', 'Minimum balance not met (' || v_min_balance || ' points required)', 'max_points', 0, 'monetary_value', 0);
  end if;

  -- Calculate eligible order amount
  v_eligible_amount := p_subtotal;
  if v_cover_tax then v_eligible_amount := v_eligible_amount + p_tax; end if;
  if v_cover_packaging then v_eligible_amount := v_eligible_amount + p_packaging; end if;

  -- Max points by percentage cap
  v_max_points_by_pct := floor((v_eligible_amount * v_max_order_pct / 100) / v_point_value);

  -- Final max = min of (user balance, per-order cap, percentage cap)
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
$$ language plpgsql security definer;

-- 4. Function to redeem loyalty points during order placement
create or replace function public.redeem_loyalty_points(
  p_user_id uuid,
  p_points int,
  p_order_id uuid
)
returns jsonb as $$
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
$$ language plpgsql security definer;

-- 5. Drop old 3-param overload so PostgREST can resolve unambiguously
drop function if exists public.place_order_with_wallet(jsonb, jsonb[], numeric);

-- Updated place_order function that supports loyalty point redemption
create or replace function public.place_order_with_wallet(
  p_order jsonb,
  p_items jsonb[],
  p_wallet_amount numeric default 0,
  p_loyalty_points int default 0
)
returns jsonb as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_wallet wallets%rowtype;
  v_user_id uuid;
  v_item jsonb;
  v_bonus_debit numeric;
  v_loaded_debit numeric;
  v_loyalty_discount numeric := 0;
  v_point_value numeric;
  v_account loyalty_accounts%rowtype;
  v_new_balance int;
begin
  v_user_id := (p_order->>'user_id')::uuid;
  v_order_number := 'PM' || upper(substr(md5(gen_random_uuid()::text), 1, 8));

  -- Calculate loyalty discount if points are being redeemed
  if p_loyalty_points > 0 then
    select coalesce((select value from app_settings where key = 'loyalty_point_value'), '0.25')::numeric into v_point_value;
    v_loyalty_discount := p_loyalty_points * v_point_value;
  end if;

  -- Insert order
  insert into orders (
    order_number, user_id, outlet_id, status,
    subtotal, tax, packaging_charge, discount, wallet_used, total,
    payment_method, payment_status, coupon_code, notes, loyalty_points_used, loyalty_discount
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
    p_order->>'notes',
    p_loyalty_points,
    v_loyalty_discount
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

  -- Debit loyalty points if used
  if p_loyalty_points > 0 then
    select * into v_account from loyalty_accounts where user_id = v_user_id for update;
    if not found or v_account.current_points < p_loyalty_points then
      raise exception 'Insufficient loyalty points';
    end if;

    v_new_balance := v_account.current_points - p_loyalty_points;

    update loyalty_accounts
    set current_points = v_new_balance
    where id = v_account.id;

    -- Ledger entry
    insert into loyalty_ledger (user_id, type, points, monetary_value, balance_after, source, order_id, description)
    values (v_user_id, 'redeem', p_loyalty_points, v_loyalty_discount, v_new_balance, 'order_redemption', v_order_id, 'Points redeemed for order #' || v_order_number);
  end if;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'status', 'pending',
    'loyalty_discount', v_loyalty_discount
  );
end;
$$ language plpgsql security definer;

-- 6. Add loyalty columns to orders table (if not exist)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'orders' and column_name = 'loyalty_points_used') then
    alter table public.orders add column loyalty_points_used int not null default 0;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'orders' and column_name = 'loyalty_discount') then
    alter table public.orders add column loyalty_discount numeric(10,2) not null default 0;
  end if;
end $$;

-- 7. Also log point earnings to the ledger (trigger on loyalty_points_log insert)
create or replace function public.sync_loyalty_ledger_on_earn()
returns trigger as $$
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
$$ language plpgsql security definer;

drop trigger if exists trg_sync_loyalty_ledger on public.loyalty_points_log;
create trigger trg_sync_loyalty_ledger
  after insert on public.loyalty_points_log
  for each row execute function public.sync_loyalty_ledger_on_earn();

-- 8. Admin aggregate view for analytics
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
  select coalesce((select value from app_settings where key = 'loyalty_point_value'), '0.25')::numeric into v_point_value;

  select coalesce(sum(case when type = 'earn' then points else 0 end), 0),
         coalesce(sum(case when type = 'redeem' then points else 0 end), 0)
  into v_total_issued, v_total_redeemed
  from loyalty_ledger;

  -- If no ledger entries yet, fall back to loyalty_points_log for issued
  if v_total_issued = 0 then
    select coalesce(sum(points), 0) into v_total_issued from loyalty_points_log where points > 0;
  end if;

  -- Outstanding liability = all current_points across accounts * point value
  select coalesce(sum(current_points), 0) * v_point_value into v_outstanding_liability from loyalty_accounts;

  -- Redemption rate
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
    'outstanding_liability', (v_total_issued - v_total_redeemed) * v_point_value,
    'point_value', v_point_value,
    'total_accounts', v_total_accounts,
    'accounts_with_redemptions', v_accounts_with_redemptions,
    'redemption_rate', v_avg_redemption_rate
  );
end;
$$ language plpgsql security definer;
