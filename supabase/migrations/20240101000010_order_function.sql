-- Place order with wallet (atomic)
create or replace function public.place_order_with_wallet(
  p_order jsonb,
  p_items jsonb[],
  p_wallet_amount numeric default 0
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
$$ language plpgsql security definer;
