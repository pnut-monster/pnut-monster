-- Add cancellation_reason column to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancellation_reason text;

-- Create the cancel_accepted_order function
CREATE OR REPLACE FUNCTION public.cancel_accepted_order(
  p_order_id uuid,
  p_reason text
)
RETURNS jsonb AS $$
DECLARE
  v_order orders%rowtype;
  v_wallet wallets%rowtype;
  v_loyalty_account loyalty_accounts%rowtype;
  v_new_balance numeric;
  v_new_points_balance int;
  v_wallet_refunded numeric := 0;
  v_loyalty_points_refunded int := 0;
BEGIN
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Cancellation reason is required';
  END IF;

  IF NOT public.can_manage_order(p_order_id) THEN
    RAISE EXCEPTION 'Order management access required';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status NOT IN ('confirmed', 'preparing') THEN
    RAISE EXCEPTION 'Only confirmed or preparing orders can be cancelled with a reason';
  END IF;

  IF v_order.payment_status = 'refunded' THEN
    RAISE EXCEPTION 'Order already refunded';
  END IF;

  UPDATE orders
  SET status = 'cancelled',
      cancellation_reason = trim(p_reason),
      payment_status = 'refunded'
  WHERE id = p_order_id;

  IF v_order.wallet_used > 0 THEN
    SELECT * INTO v_wallet FROM wallets WHERE user_id = v_order.user_id FOR UPDATE;

    IF FOUND THEN
      v_new_balance := v_wallet.loaded_balance + v_order.wallet_used;
      v_wallet_refunded := v_order.wallet_used;

      UPDATE wallets
      SET loaded_balance = v_new_balance, updated_at = now()
      WHERE id = v_wallet.id;

      INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id)
      VALUES (
        v_wallet.id,
        'refund',
        v_order.wallet_used,
        v_new_balance + v_wallet.bonus_balance,
        'Refund for cancelled order #' || v_order.order_number,
        p_order_id::text
      );
    END IF;
  END IF;

  IF v_order.loyalty_points_used > 0 THEN
    SELECT * INTO v_loyalty_account
    FROM loyalty_accounts
    WHERE user_id = v_order.user_id
    FOR UPDATE;

    IF FOUND THEN
      v_new_points_balance := v_loyalty_account.current_points + v_order.loyalty_points_used;
      v_loyalty_points_refunded := v_order.loyalty_points_used;

      UPDATE loyalty_accounts
      SET current_points = v_new_points_balance, updated_at = now()
      WHERE id = v_loyalty_account.id;

      INSERT INTO loyalty_ledger (user_id, type, points, monetary_value, balance_after, source, order_id, description)
      VALUES (
        v_order.user_id,
        'earn',
        v_order.loyalty_points_used,
        v_order.loyalty_discount,
        v_new_points_balance,
        'order_refund',
        p_order_id,
        'Loyalty points refunded for cancelled order #' || v_order.order_number
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'status', 'cancelled',
    'cancellation_reason', trim(p_reason),
    'payment_method', v_order.payment_method,
    'wallet_refunded', v_wallet_refunded,
    'loyalty_points_refunded', v_loyalty_points_refunded,
    'online_amount', greatest(0, v_order.total - v_order.wallet_used),
    'payment_status', 'refunded'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.cancel_accepted_order(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cancel_accepted_order(uuid, text) TO authenticated;
