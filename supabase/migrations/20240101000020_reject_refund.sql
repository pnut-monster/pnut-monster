-- Reject order, refund wallet immediately, mark payment status
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
  select * into v_order from orders where id = p_order_id for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.status != 'rejected' and v_order.status != 'pending' then
    raise exception 'Only pending or rejected orders can be refunded';
  end if;

  if v_order.payment_status = 'refunded' then
    raise exception 'Order already refunded';
  end if;

  -- Set status to rejected and mark refunded
  update orders
  set status = 'rejected',
      payment_status = 'refunded'
  where id = p_order_id;

  -- Refund wallet amount if wallet was used
  if v_order.wallet_used > 0 then
    select * into v_wallet from wallets where user_id = v_order.user_id for update;

    if found then
      v_new_balance := v_wallet.loaded_balance + v_order.wallet_used;
      v_wallet_refunded := v_order.wallet_used;

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

  -- Refund loyalty points if points were redeemed
  if v_order.loyalty_points_used > 0 then
    select * into v_loyalty_account
    from loyalty_accounts
    where user_id = v_order.user_id
    for update;

    if found then
      v_new_points_balance := v_loyalty_account.current_points + v_order.loyalty_points_used;
      v_loyalty_points_refunded := v_order.loyalty_points_used;

      update loyalty_accounts
      set current_points = v_new_points_balance
      where id = v_loyalty_account.id;

      insert into loyalty_ledger (user_id, type, points, monetary_value, balance_after, source, order_id, description)
      values (
        v_order.user_id,
        'earn',
        v_order.loyalty_points_used,
        v_order.loyalty_discount,
        v_new_points_balance,
        'order_refund',
        p_order_id,
        'Loyalty points refunded for rejected order #' || v_order.order_number
      );
    end if;
  end if;

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', 'rejected',
    'payment_method', v_order.payment_method,
    'wallet_refunded', v_wallet_refunded,
    'loyalty_points_refunded', v_loyalty_points_refunded,
    'online_amount', v_order.total - v_order.wallet_used,
    'payment_status', 'refunded'
  );
end;
$$ language plpgsql security definer;
