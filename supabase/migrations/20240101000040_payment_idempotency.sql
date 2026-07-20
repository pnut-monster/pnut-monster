-- Harden Razorpay-backed payments with server-side amount checks and
-- idempotency. API routes verify Razorpay first; these database checks are the
-- final guardrail.

alter table public.orders
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text;

create unique index if not exists idx_orders_razorpay_payment_id_unique
  on public.orders (razorpay_payment_id)
  where razorpay_payment_id is not null;

create unique index if not exists idx_wallet_topup_reference_unique
  on public.wallet_transactions (reference_id)
  where type = 'topup' and reference_id is not null;

do $migration$
declare
  v_definition text;
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

  v_definition := replace(
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

  v_definition := replace(
    v_definition,
    $old$payment_method, payment_status, coupon_code, notes, loyalty_points_used, loyalty_discount$old$,
    $new$payment_method, payment_status, coupon_code, notes, loyalty_points_used, loyalty_discount, razorpay_order_id, razorpay_payment_id$new$
  );

  v_definition := replace(
    v_definition,
    $old$v_payment_method, v_payment_status, v_coupon_code, nullif(p_order->>'notes', ''),
    p_loyalty_points, v_loyalty_discount$old$,
    $new$v_payment_method, v_payment_status, v_coupon_code, nullif(p_order->>'notes', ''),
    p_loyalty_points, v_loyalty_discount,
    nullif(p_order->>'razorpay_order_id', ''),
    nullif(p_order->>'razorpay_payment_id', '')$new$
  );

  execute v_definition;
end;
$migration$;

create or replace function public.self_topup_wallet(
  p_user_id uuid,
  p_amount numeric,
  p_razorpay_payment_id text,
  p_razorpay_order_id text
)
returns jsonb as $$
declare
  v_wallet wallets%rowtype;
  v_existing_tx wallet_transactions%rowtype;
  v_new_loaded numeric;
  v_auth_uid uuid;
begin
  v_auth_uid := auth.uid();
  if v_auth_uid is null then
    raise exception 'Authentication required';
  end if;

  if v_auth_uid <> p_user_id and not public.is_admin() then
    raise exception 'Cannot top up another user wallet';
  end if;

  if p_amount <= 0 then
    raise exception 'Invalid top-up amount';
  end if;

  select wt.* into v_existing_tx
  from wallet_transactions wt
  join wallets w on w.id = wt.wallet_id
  where wt.type = 'topup'
    and wt.reference_id = p_razorpay_payment_id
    and w.user_id = p_user_id;

  if found then
    select * into v_wallet from wallets where user_id = p_user_id;
    return jsonb_build_object(
      'success', true,
      'loaded_balance', coalesce(v_wallet.loaded_balance, 0),
      'bonus_balance', coalesce(v_wallet.bonus_balance, 0),
      'total_balance', coalesce(v_wallet.loaded_balance, 0) + coalesce(v_wallet.bonus_balance, 0),
      'idempotent', true
    );
  end if;

  select * into v_wallet from wallets where user_id = p_user_id for update;

  if not found then
    insert into wallets (user_id, loaded_balance, bonus_balance)
    values (p_user_id, 0, 0)
    returning * into v_wallet;
  end if;

  v_new_loaded := v_wallet.loaded_balance + p_amount;

  update wallets
  set loaded_balance = v_new_loaded,
      updated_at = now()
  where id = v_wallet.id;

  insert into wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id)
  values (v_wallet.id, 'topup', p_amount, v_new_loaded + v_wallet.bonus_balance,
          'Wallet top-up via Razorpay', p_razorpay_payment_id);

  return jsonb_build_object(
    'success', true,
    'loaded_balance', v_new_loaded,
    'bonus_balance', v_wallet.bonus_balance,
    'total_balance', v_new_loaded + v_wallet.bonus_balance
  );
end;
$$ language plpgsql security definer;

grant execute on function public.self_topup_wallet(uuid, numeric, text, text) to authenticated;
