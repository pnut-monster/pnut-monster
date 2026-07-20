-- Ensure Razorpay-paid orders are accepted only when the verified paid amount
-- covers the non-wallet portion of the order. This fixes databases where the
-- previous function patch encountered a compact one-line payment-status block.

do $migration$
declare
  v_definition text;
  v_next_definition text;
begin
  select pg_get_functiondef('public.place_order_with_wallet(jsonb,jsonb[],numeric,integer,numeric)'::regprocedure)
  into v_definition;

  if v_definition not like '%v_existing_order_id uuid;%' then
    v_definition := replace(
      v_definition,
      'v_order_id uuid;',
      'v_order_id uuid;
  v_existing_order_id uuid;'
    );
  end if;

  if v_definition not like '%razorpay_amount_paid%' then
    v_next_definition := replace(
      v_definition,
      $old$v_payment_status := case
    when coalesce(p_order->>'payment_status', '') = 'paid'
      and coalesce(p_order->>'razorpay_order_id', '') <> ''
      and coalesce(p_order->>'razorpay_payment_id', '') <> '' then 'paid'
    when v_wallet_amount >= v_total then 'paid'
    else 'pending'
  end;$old$,
      $new$if coalesce(p_order->>'payment_status', '') = 'paid'
    and coalesce(p_order->>'razorpay_order_id', '') <> ''
    and coalesce(p_order->>'razorpay_payment_id', '') <> '' then
    if coalesce(nullif(p_order->>'razorpay_amount_paid', '')::numeric, -1)
      < round(greatest(0, v_total - v_wallet_amount), 2) then
      raise exception 'Razorpay payment amount does not match order total';
    end if;

    select id into v_existing_order_id
    from orders
    where razorpay_payment_id = p_order->>'razorpay_payment_id'
      and user_id = v_auth_uid;

    if found then
      return jsonb_build_object(
        'order_id', v_existing_order_id,
        'payment_status', 'paid',
        'idempotent', true
      );
    end if;

    v_payment_status := 'paid';
  elsif v_wallet_amount >= v_total then
    v_payment_status := 'paid';
  else
    v_payment_status := 'pending';
  end if;$new$
    );

    if v_next_definition = v_definition then
      v_next_definition := replace(
        v_definition,
        $old$v_payment_status := case when coalesce(p_order->>'payment_status', '') = 'paid' and coalesce(p_order->>'razorpay_order_id', '') <> '' and coalesce(p_order->>'razorpay_payment_id', '') <> '' then 'paid' when v_wallet_amount >= v_total then 'paid' else 'pending' end;$old$,
        $new$if coalesce(p_order->>'payment_status', '') = 'paid'
    and coalesce(p_order->>'razorpay_order_id', '') <> ''
    and coalesce(p_order->>'razorpay_payment_id', '') <> '' then
    if coalesce(nullif(p_order->>'razorpay_amount_paid', '')::numeric, -1)
      < round(greatest(0, v_total - v_wallet_amount), 2) then
      raise exception 'Razorpay payment amount does not match order total';
    end if;

    select id into v_existing_order_id
    from orders
    where razorpay_payment_id = p_order->>'razorpay_payment_id'
      and user_id = v_auth_uid;

    if found then
      return jsonb_build_object(
        'order_id', v_existing_order_id,
        'payment_status', 'paid',
        'idempotent', true
      );
    end if;

    v_payment_status := 'paid';
  elsif v_wallet_amount >= v_total then
    v_payment_status := 'paid';
  else
    v_payment_status := 'pending';
  end if;$new$
      );
    end if;

    if v_next_definition = v_definition then
      raise exception 'Could not patch place_order_with_wallet payment status guard';
    end if;

    execute v_next_definition;
  end if;
end;
$migration$;
