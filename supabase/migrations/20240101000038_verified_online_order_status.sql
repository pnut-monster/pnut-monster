-- Allow verified Razorpay checkout orders to pass the unpaid-order guard.
-- The API only sends these Razorpay fields after signature verification.
do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.place_order_with_wallet(jsonb,jsonb[],numeric,integer,numeric)'::regprocedure)
  into v_definition;

  v_definition := replace(
    v_definition,
    $old$v_payment_status := case when v_wallet_amount >= v_total then 'paid' else 'pending' end;$old$,
    $new$v_payment_status := case
    when coalesce(p_order->>'payment_status', '') = 'paid'
      and coalesce(p_order->>'razorpay_order_id', '') <> ''
      and coalesce(p_order->>'razorpay_payment_id', '') <> '' then 'paid'
    when v_wallet_amount >= v_total then 'paid'
    else 'pending'
  end;$new$
  );

  execute v_definition;
end;
$migration$;
