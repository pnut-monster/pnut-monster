create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  razorpay_order_id text not null unique,
  razorpay_payment_id text unique,
  amount_paise bigint not null check (amount_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  order_payload jsonb not null,
  items_payload jsonb not null,
  wallet_amount numeric not null default 0,
  loyalty_points integer not null default 0,
  nth_order_discount numeric not null default 0,
  status text not null default 'created' check (status in ('created', 'captured', 'completed', 'failed')),
  app_order_id uuid references public.orders(id),
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_payment_attempts_user_created
  on public.payment_attempts(user_id, created_at desc);

alter table public.payment_attempts enable row level security;

create function public.finalize_captured_payment_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt payment_attempts%rowtype;
  v_result jsonb;
  v_claim_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    current_setting('role', true)
  );
begin
  if v_claim_role <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select * into v_attempt from payment_attempts
  where id = p_attempt_id for update;

  if not found then raise exception 'Payment attempt not found'; end if;
  if v_attempt.status = 'completed' then
    return jsonb_build_object('order_id', v_attempt.app_order_id, 'idempotent', true);
  end if;
  if v_attempt.status <> 'captured' or v_attempt.razorpay_payment_id is null then
    raise exception 'Payment has not been captured';
  end if;

  perform set_config('request.jwt.claim.sub', v_attempt.user_id::text, true);

  v_result := place_order_with_wallet(
    v_attempt.order_payload || jsonb_build_object(
      'user_id', v_attempt.user_id,
      'payment_status', 'paid',
      'razorpay_order_id', v_attempt.razorpay_order_id,
      'razorpay_payment_id', v_attempt.razorpay_payment_id,
      'razorpay_amount_paid', v_attempt.amount_paise::numeric / 100
    ),
    array(select value from jsonb_array_elements(v_attempt.items_payload)),
    v_attempt.wallet_amount,
    v_attempt.loyalty_points,
    v_attempt.nth_order_discount
  );

  update payment_attempts
  set status = 'completed',
      app_order_id = (v_result->>'order_id')::uuid,
      updated_at = now()
  where id = v_attempt.id;

  return v_result;
exception when others then
  update payment_attempts
  set failure_reason = sqlerrm, updated_at = now()
  where id = p_attempt_id;
  raise;
end;
$$;

revoke all on table public.payment_attempts from public, anon, authenticated;
grant all on table public.payment_attempts to service_role;
revoke execute on function public.finalize_captured_payment_attempt(uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_captured_payment_attempt(uuid)
  to service_role;
