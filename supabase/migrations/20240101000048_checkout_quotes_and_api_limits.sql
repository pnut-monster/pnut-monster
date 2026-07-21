-- Authoritative checkout quotes and shared API abuse controls.

create table public.checkout_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_payload jsonb not null,
  items_payload jsonb not null,
  wallet_amount numeric not null default 0,
  loyalty_points integer not null default 0,
  nth_order_discount numeric not null default 0,
  amount_paise bigint not null check (amount_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_checkout_quotes_user_created
  on public.checkout_quotes(user_id, created_at desc);
create index idx_checkout_quotes_expiry
  on public.checkout_quotes(expires_at) where consumed_at is null;

alter table public.checkout_quotes enable row level security;
create policy "checkout quotes: deny client access"
  on public.checkout_quotes as restrictive for all to anon, authenticated
  using (false) with check (false);

revoke all on table public.checkout_quotes from public, anon, authenticated;
grant all on table public.checkout_quotes to service_role;

alter table public.payment_attempts
  add column checkout_quote_id uuid unique references public.checkout_quotes(id);

create or replace function public.finalize_captured_payment_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt payment_attempts%rowtype;
  v_quote checkout_quotes%rowtype;
  v_result jsonb;
  v_claim_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    current_setting('role', true)
  );
begin
  if v_claim_role <> 'service_role' then raise exception 'Service role required'; end if;

  select * into v_attempt from payment_attempts where id = p_attempt_id for update;
  if not found then raise exception 'Payment attempt not found'; end if;
  if v_attempt.status = 'completed' then
    return jsonb_build_object('order_id', v_attempt.app_order_id, 'idempotent', true);
  end if;
  if v_attempt.status <> 'captured' or v_attempt.razorpay_payment_id is null then
    raise exception 'Payment has not been captured';
  end if;
  if v_attempt.checkout_quote_id is null then
    raise exception 'Payment attempt has no authoritative checkout quote';
  end if;

  select * into v_quote from checkout_quotes
  where id = v_attempt.checkout_quote_id for update;
  if not found or v_quote.user_id <> v_attempt.user_id
     or v_quote.amount_paise <> v_attempt.amount_paise
     or v_quote.currency <> v_attempt.currency then
    raise exception 'Payment attempt does not match checkout quote';
  end if;
  if v_quote.consumed_at is not null then
    raise exception 'Checkout quote has already been consumed';
  end if;

  perform set_config('request.jwt.claim.sub', v_attempt.user_id::text, true);
  v_result := place_order_with_wallet(
    v_quote.order_payload || jsonb_build_object(
      'user_id', v_attempt.user_id,
      'payment_status', 'paid',
      'razorpay_order_id', v_attempt.razorpay_order_id,
      'razorpay_payment_id', v_attempt.razorpay_payment_id,
      'razorpay_amount_paid', v_attempt.amount_paise::numeric / 100
    ),
    array(select value from jsonb_array_elements(v_quote.items_payload)),
    v_quote.wallet_amount,
    v_quote.loyalty_points,
    v_quote.nth_order_discount
  );

  update checkout_quotes set consumed_at = now() where id = v_quote.id;
  update payment_attempts
  set status = 'completed', app_order_id = (v_result->>'order_id')::uuid,
      updated_at = now(), failure_reason = null
  where id = v_attempt.id;
  return v_result;
exception when others then
  update payment_attempts set failure_reason = sqlerrm, updated_at = now()
  where id = p_attempt_id;
  raise;
end;
$$;

revoke execute on function public.finalize_captured_payment_attempt(uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_captured_payment_attempt(uuid) to service_role;

create function public.create_checkout_quote(
  p_user_id uuid,
  p_order jsonb,
  p_items jsonb,
  p_wallet_amount numeric default 0,
  p_loyalty_points integer default 0,
  p_nth_order_discount numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    current_setting('role', true)
  );
  v_quote_id uuid := gen_random_uuid();
  v_result jsonb;
  v_total numeric;
  v_amount_paise bigint;
begin
  if v_claim_role <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_user_id is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Invalid checkout payload';
  end if;

  perform set_config('request.jwt.claim.sub', p_user_id::text, true);

  -- Execute the exact order function in a subtransaction and deliberately roll
  -- it back. This gives the quote the same validation and commercial math as
  -- finalization without leaving an order, wallet debit, coupon use, or notice.
  begin
    v_result := public.place_order_with_wallet(
      p_order || jsonb_build_object(
        'user_id', p_user_id,
        'payment_status', 'paid',
        'razorpay_order_id', 'quote_' || v_quote_id::text,
        'razorpay_payment_id', 'quote_' || v_quote_id::text,
        'razorpay_amount_paid', 1000000000
      ),
      array(select value from jsonb_array_elements(p_items)),
      p_wallet_amount,
      p_loyalty_points,
      p_nth_order_discount
    );
    raise exception using errcode = 'P0002', message = 'ROLLBACK_CHECKOUT_QUOTE';
  exception
    when sqlstate 'P0002' then
      if sqlerrm <> 'ROLLBACK_CHECKOUT_QUOTE' then raise; end if;
  end;

  v_total := coalesce((v_result->>'total')::numeric, 0) - coalesce(p_wallet_amount, 0);
  v_amount_paise := round(v_total * 100);
  if v_amount_paise <= 0 or v_amount_paise > 10000000 then
    raise exception 'Invalid online payment amount';
  end if;

  insert into public.checkout_quotes (
    id, user_id, order_payload, items_payload, wallet_amount,
    loyalty_points, nth_order_discount, amount_paise
  ) values (
    v_quote_id, p_user_id, p_order || jsonb_build_object('user_id', p_user_id),
    p_items, coalesce(p_wallet_amount, 0), coalesce(p_loyalty_points, 0),
    coalesce(p_nth_order_discount, 0), v_amount_paise
  );

  return jsonb_build_object(
    'quote_id', v_quote_id,
    'amount_paise', v_amount_paise,
    'currency', 'INR',
    'expires_at', now() + interval '10 minutes'
  );
end;
$$;

revoke execute on function public.create_checkout_quote(uuid, jsonb, jsonb, numeric, integer, numeric)
  from public, anon, authenticated;
grant execute on function public.create_checkout_quote(uuid, jsonb, jsonb, numeric, integer, numeric)
  to service_role;

create table public.api_rate_limits (
  scope text not null,
  subject_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  primary key (scope, subject_hash)
);

alter table public.api_rate_limits enable row level security;
create policy "api rate limits: deny client access"
  on public.api_rate_limits as restrictive for all to anon, authenticated
  using (false) with check (false);
revoke all on table public.api_rate_limits from public, anon, authenticated;
grant all on table public.api_rate_limits to service_role;

create function public.consume_api_rate_limit(
  p_scope text,
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    current_setting('role', true)
  );
  v_row api_rate_limits%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if v_claim_role <> 'service_role' then raise exception 'Service role required'; end if;
  if nullif(trim(p_scope), '') is null or nullif(trim(p_subject_hash), '') is null
     or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate limit parameters';
  end if;

  insert into api_rate_limits(scope, subject_hash, window_started_at, request_count)
  values (p_scope, p_subject_hash, v_now, 1)
  on conflict (scope, subject_hash) do update
  set window_started_at = case
        when api_rate_limits.window_started_at <= v_now - make_interval(secs => p_window_seconds)
          then v_now else api_rate_limits.window_started_at end,
      request_count = case
        when api_rate_limits.window_started_at <= v_now - make_interval(secs => p_window_seconds)
          then 1 else api_rate_limits.request_count + 1 end
  returning * into v_row;

  if random() < 0.01 then
    delete from api_rate_limits
    where window_started_at < v_now - interval '1 day';
  end if;

  return jsonb_build_object(
    'allowed', v_row.request_count <= p_limit,
    'remaining', greatest(0, p_limit - v_row.request_count),
    'retry_after', greatest(0, p_window_seconds - extract(epoch from (v_now - v_row.window_started_at))::integer)
  );
end;
$$;

revoke execute on function public.consume_api_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer)
  to service_role;

alter table public.profiles add column welcome_email_sent_at timestamptz;

create function public.replace_coupon_outlet_restrictions(
  p_coupon_id uuid,
  p_outlet_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if not exists (select 1 from coupons where id = p_coupon_id) then
    raise exception 'Coupon not found';
  end if;
  delete from coupon_outlet_restrictions where coupon_id = p_coupon_id;
  insert into coupon_outlet_restrictions(coupon_id, outlet_id)
  select p_coupon_id, outlet_id from unnest(coalesce(p_outlet_ids, '{}'::uuid[])) outlet_id;
end;
$$;

revoke execute on function public.replace_coupon_outlet_restrictions(uuid, uuid[])
  from public, anon;
grant execute on function public.replace_coupon_outlet_restrictions(uuid, uuid[])
  to authenticated;
