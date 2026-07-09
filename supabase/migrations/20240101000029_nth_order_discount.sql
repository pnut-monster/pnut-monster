-- Nth Order Discount System (e.g., 10% every 5th order)

-- Settings
insert into public.app_settings (key, value) values
  ('nth_order_discount_enabled', 'true'),
  ('nth_order_interval', '5'),
  ('nth_order_discount_pct', '10'),
  ('nth_order_stack_with_loyalty', 'true')
on conflict (key) do update set value = excluded.value;

-- RPC to check if the user's next order qualifies for the nth-order discount
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
  select coalesce((select value from app_settings where key = 'nth_order_discount_enabled'), 'true')::boolean into v_enabled;
  if not v_enabled then
    return jsonb_build_object('eligible', false, 'reason', 'Discount is disabled');
  end if;

  select coalesce((select value from app_settings where key = 'nth_order_interval'), '5')::int into v_interval;
  select coalesce((select value from app_settings where key = 'nth_order_discount_pct'), '10')::numeric into v_discount_pct;
  select coalesce((select value from app_settings where key = 'nth_order_stack_with_loyalty'), 'true')::boolean into v_stack_with_loyalty;

  -- Count completed (picked_up) orders for this user
  select count(*) into v_completed_orders
  from orders
  where user_id = p_user_id and status = 'picked_up';

  -- The next order the user places will be their (v_completed_orders + 1)th order
  v_next_order_number := v_completed_orders + 1;
  v_qualifies := (v_next_order_number % v_interval = 0);

  return jsonb_build_object(
    'eligible', v_qualifies,
    'discount_pct', v_discount_pct,
    'next_order_number', v_next_order_number,
    'interval', v_interval,
    'stack_with_loyalty', v_stack_with_loyalty,
    'completed_orders', v_completed_orders
  );
end;
$$ language plpgsql security definer;

-- Update place_order_with_wallet to accept nth-order discount parameter
drop function if exists public.place_order_with_wallet(jsonb, jsonb[], numeric, int);

create or replace function public.place_order_with_wallet(
  p_order jsonb,
  p_items jsonb[],
  p_wallet_amount numeric default 0,
  p_loyalty_points int default 0,
  p_nth_order_discount numeric default 0
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
  v_total_discount numeric;
begin
  v_user_id := (p_order->>'user_id')::uuid;
  v_order_number := 'PM' || upper(substr(md5(gen_random_uuid()::text), 1, 8));

  -- Calculate loyalty discount if points are being redeemed
  if p_loyalty_points > 0 then
    select coalesce((select value from app_settings where key = 'loyalty_point_value'), '0.25')::numeric into v_point_value;
    v_loyalty_discount := p_loyalty_points * v_point_value;
  end if;

  -- Total discount = coupon discount (already in p_order->discount) + nth_order_discount
  -- The coupon discount is passed in p_order->>'discount', nth_order_discount is separate
  v_total_discount := coalesce((p_order->>'discount')::numeric, 0) + p_nth_order_discount;

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
    v_total_discount,
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
    'loyalty_discount', v_loyalty_discount,
    'nth_order_discount', p_nth_order_discount
  );
end;
$$ language plpgsql security definer;
