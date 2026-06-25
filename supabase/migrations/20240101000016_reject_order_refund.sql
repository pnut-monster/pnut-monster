-- Reject order and refund wallet atomically
create or replace function public.reject_order_with_refund(p_order_id uuid)
returns jsonb as $$
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
$$ language plpgsql security definer;
