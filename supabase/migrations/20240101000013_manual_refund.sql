-- Manual refund for already-cancelled orders (admin use)
create or replace function public.manual_refund_order(p_order_id uuid)
returns jsonb as $$
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
$$ language plpgsql security definer;
