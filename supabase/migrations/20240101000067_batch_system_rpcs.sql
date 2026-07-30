-- Batch System — RPCs (Security Definer Functions)
-- All sensitive batch operations go through these functions.

-- =============================================================================
-- 1. maybe_open_batch_window — Lazy open: transitions scheduled → open
-- Called when customer loads home/menu. Idempotent.
-- =============================================================================
create or replace function public.maybe_open_batch_window(p_window_id uuid)
returns void as $$
begin
  update public.batch_windows
  set status = 'open'
  where id = p_window_id
    and status = 'scheduled'
    and now() >= start_time;
end;
$$ language plpgsql security definer set search_path = public;

-- =============================================================================
-- 2. reserve_batch_slot — IRCTC-style slot lock
-- Called when customer proceeds to checkout for a batch order.
-- Returns the reservation ID and expiry time.
-- =============================================================================
create or replace function public.reserve_batch_slot(
  p_window_id uuid
)
returns jsonb as $$
declare
  v_window record;
  v_timer_seconds int;
  v_reservation_id uuid;
  v_expires_at timestamptz;
  v_available int;
begin
  -- Get window details with lock
  select * into v_window
  from public.batch_windows
  where id = p_window_id
  for update;

  if v_window is null then
    raise exception 'Batch window not found';
  end if;

  if v_window.status != 'open' then
    raise exception 'Batch window is not open for orders';
  end if;

  -- Check for existing active reservation by this user for this window
  if exists (
    select 1 from public.batch_slot_reservations
    where batch_window_id = p_window_id
      and user_id = auth.uid()
      and status = 'held'
      and expires_at > now()
  ) then
    -- Return existing reservation
    select id, expires_at into v_reservation_id, v_expires_at
    from public.batch_slot_reservations
    where batch_window_id = p_window_id
      and user_id = auth.uid()
      and status = 'held'
      and expires_at > now()
    limit 1;

    return jsonb_build_object(
      'reservation_id', v_reservation_id,
      'expires_at', v_expires_at
    );
  end if;

  -- Calculate available slots (max - confirmed - held)
  v_available := v_window.max_orders - v_window.current_order_count - (
    select count(*) from public.batch_slot_reservations
    where batch_window_id = p_window_id
      and status = 'held'
      and expires_at > now()
  );

  if v_available <= 0 then
    raise exception 'No slots available in this batch window';
  end if;

  -- Get timer duration from app settings
  select coalesce(value::int, 180) into v_timer_seconds
  from public.app_settings
  where key = 'batch_slot_timer_seconds';

  if v_timer_seconds is null then
    v_timer_seconds := 180;
  end if;

  v_expires_at := now() + (v_timer_seconds || ' seconds')::interval;

  -- Expire any old held reservations by this user for this window
  update public.batch_slot_reservations
  set status = 'expired'
  where batch_window_id = p_window_id
    and user_id = auth.uid()
    and status = 'held';

  -- Create reservation
  insert into public.batch_slot_reservations (batch_window_id, user_id, expires_at)
  values (p_window_id, auth.uid(), v_expires_at)
  returning id into v_reservation_id;

  return jsonb_build_object(
    'reservation_id', v_reservation_id,
    'expires_at', v_expires_at
  );
end;
$$ language plpgsql security definer set search_path = public;

-- =============================================================================
-- 3. confirm_batch_slot — Confirms reservation after payment
-- Called after successful payment. Creates the batch_order record.
-- =============================================================================
create or replace function public.confirm_batch_slot(
  p_reservation_id uuid,
  p_order_id uuid,
  p_block_id uuid,
  p_sub_location_id uuid default null,
  p_sub_location_text text default null
)
returns jsonb as $$
declare
  v_reservation record;
  v_window record;
begin
  -- Get and lock reservation
  select * into v_reservation
  from public.batch_slot_reservations
  where id = p_reservation_id
    and user_id = auth.uid()
  for update;

  if v_reservation is null then
    raise exception 'Reservation not found';
  end if;

  if v_reservation.status != 'held' then
    raise exception 'Reservation is no longer active';
  end if;

  if v_reservation.expires_at < now() then
    -- Mark as expired
    update public.batch_slot_reservations
    set status = 'expired'
    where id = p_reservation_id;

    raise exception 'Reservation has expired';
  end if;

  -- Lock the window and increment count
  select * into v_window
  from public.batch_windows
  where id = v_reservation.batch_window_id
  for update;

  if v_window.status != 'open' then
    update public.batch_slot_reservations
    set status = 'expired'
    where id = p_reservation_id;

    raise exception 'Batch window is no longer open';
  end if;

  -- Increment confirmed order count
  update public.batch_windows
  set current_order_count = current_order_count + 1
  where id = v_window.id;

  -- Mark reservation confirmed
  update public.batch_slot_reservations
  set status = 'confirmed'
  where id = p_reservation_id;

  -- Link order to batch window
  update public.orders
  set batch_window_id = v_window.id,
      status = 'batch_pending'
  where id = p_order_id
    and user_id = auth.uid();

  -- Create batch order record
  insert into public.batch_orders (
    batch_window_id, order_id, block_id, sub_location_id, sub_location_text
  ) values (
    v_window.id, p_order_id, p_block_id, p_sub_location_id, p_sub_location_text
  );

  return jsonb_build_object(
    'success', true,
    'batch_window_id', v_window.id,
    'order_id', p_order_id
  );
end;
$$ language plpgsql security definer set search_path = public;

-- =============================================================================
-- 4. release_batch_slot — Manually release a held slot (user navigates away)
-- =============================================================================
create or replace function public.release_batch_slot(p_reservation_id uuid)
returns void as $$
begin
  update public.batch_slot_reservations
  set status = 'expired'
  where id = p_reservation_id
    and user_id = auth.uid()
    and status = 'held';
end;
$$ language plpgsql security definer set search_path = public;

-- =============================================================================
-- 5. close_batch_window — Transitions window to closed
-- Called by cron Edge Function or manually by manager/admin.
-- =============================================================================
create or replace function public.close_batch_window(p_window_id uuid)
returns void as $$
declare
  v_window record;
begin
  -- Authorization: service_role (cron), admin, or outlet manager
  if auth.uid() is not null then
    if not is_admin() then
      if not exists (
        select 1 from public.outlet_staff os
        join public.batch_windows bw on bw.outlet_id = os.outlet_id
        where bw.id = p_window_id
          and os.user_id = auth.uid()
          and os.is_manager = true
      ) then
        raise exception 'Not authorized to close this batch window';
      end if;
    end if;
  end if;

  select * into v_window
  from public.batch_windows
  where id = p_window_id
  for update;

  if v_window is null then
    raise exception 'Batch window not found';
  end if;

  if v_window.status != 'open' then
    raise exception 'Window is not in open status';
  end if;

  -- Expire all pending reservations
  update public.batch_slot_reservations
  set status = 'expired'
  where batch_window_id = p_window_id
    and status = 'held';

  -- Close the window
  update public.batch_windows
  set status = 'closed',
      closed_at = now()
  where id = p_window_id;

  -- Move all batch orders to 'preparing' status
  update public.orders
  set status = 'preparing'
  where batch_window_id = p_window_id
    and status = 'batch_pending';
end;
$$ language plpgsql security definer set search_path = public;

-- =============================================================================
-- 6. distribute_batch_orders — Auto-assign orders to reps per block
-- Called after window closes. Idempotent (skips already-assigned orders).
-- =============================================================================
create or replace function public.distribute_batch_orders(p_window_id uuid)
returns jsonb as $$
declare
  v_block record;
  v_reps uuid[];
  v_orders uuid[];
  v_rep_count int;
  v_i int;
begin
  -- Authorization: admin or outlet manager only
  if not is_admin() then
    if not exists (
      select 1 from public.outlet_staff os
      join public.batch_windows bw on bw.outlet_id = os.outlet_id
      where bw.id = p_window_id
        and os.user_id = auth.uid()
        and os.is_manager = true
    ) then
      raise exception 'Not authorized to distribute orders for this window';
    end if;
  end if;

  -- Verify window is closed or processing
  if not exists (
    select 1 from public.batch_windows
    where id = p_window_id
      and status in ('closed', 'processing')
  ) then
    raise exception 'Window must be in closed or processing status';
  end if;

  -- Process each block that has orders in this window
  for v_block in
    select distinct block_id
    from public.batch_orders
    where batch_window_id = p_window_id
      and rep_id is null
  loop
    -- Get active reps for this block that belong to the window's outlet
    select array_agg(r.id order by r.id)
    into v_reps
    from public.representatives r
    join public.batch_windows bw on bw.outlet_id = r.outlet_id
    where bw.id = p_window_id
      and r.block_id = v_block.block_id
      and r.is_active = true;

    if v_reps is null or array_length(v_reps, 1) is null then
      continue;
    end if;

    v_rep_count := array_length(v_reps, 1);

    -- Get unassigned orders for this block, ordered by sub_location for clustering
    select array_agg(bo.id order by bo.sub_location_id nulls last, bo.created_at)
    into v_orders
    from public.batch_orders bo
    where bo.batch_window_id = p_window_id
      and bo.block_id = v_block.block_id
      and bo.rep_id is null;

    if v_orders is null then
      continue;
    end if;

    -- Round-robin assign
    for v_i in 1..array_length(v_orders, 1) loop
      update public.batch_orders
      set rep_id = v_reps[((v_i - 1) % v_rep_count) + 1]
      where id = v_orders[v_i];
    end loop;
  end loop;

  -- Move window to processing
  update public.batch_windows
  set status = 'processing'
  where id = p_window_id
    and status = 'closed';

  return jsonb_build_object(
    'success', true,
    'window_id', p_window_id
  );
end;
$$ language plpgsql security definer set search_path = public;

-- =============================================================================
-- 7. confirm_batch_delivery — Rep scans QR, marks order delivered
-- =============================================================================
create or replace function public.confirm_batch_delivery(p_order_id uuid)
returns jsonb as $$
declare
  v_batch_order record;
  v_rep record;
  v_commission numeric(10,2);
  v_order_total numeric(10,2);
begin
  -- Get rep record for current user
  select * into v_rep
  from public.representatives
  where user_id = auth.uid()
    and is_active = true;

  if v_rep is null then
    raise exception 'Not an active representative';
  end if;

  -- Get batch order assigned to this rep
  select * into v_batch_order
  from public.batch_orders
  where order_id = p_order_id
    and rep_id = v_rep.id
  for update;

  if v_batch_order is null then
    raise exception 'Order not assigned to you';
  end if;

  if v_batch_order.delivery_status = 'delivered' then
    raise exception 'Order already delivered';
  end if;

  if v_batch_order.delivery_status = 'undeliverable' then
    raise exception 'Order is marked as undeliverable';
  end if;

  -- Mark as delivered
  update public.batch_orders
  set delivery_status = 'delivered',
      delivered_at = now()
  where id = v_batch_order.id;

  -- Update order status
  update public.orders
  set status = 'delivered'
  where id = p_order_id;

  -- Calculate and credit commission
  if v_rep.commission_type = 'flat_per_order' then
    v_commission := v_rep.commission_value;
  elsif v_rep.commission_type = 'percentage' then
    select total into v_order_total
    from public.orders where id = p_order_id;
    v_commission := round((v_order_total * v_rep.commission_value / 100), 2);
  elsif v_rep.commission_type = 'flat_per_batch' then
    -- Flat per batch is calculated at batch level, not per delivery
    v_commission := 0;
  end if;

  -- Upsert commission ledger for this rep + window
  insert into public.rep_commission_ledger (rep_id, batch_window_id, orders_delivered, amount_earned)
  values (v_rep.id, v_batch_order.batch_window_id, 1, v_commission)
  on conflict (rep_id, batch_window_id)
    do update set
      orders_delivered = rep_commission_ledger.orders_delivered + 1,
      amount_earned = rep_commission_ledger.amount_earned + v_commission;

  -- Check if all orders in this window are delivered/undeliverable
  if not exists (
    select 1 from public.batch_orders
    where batch_window_id = v_batch_order.batch_window_id
      and delivery_status not in ('delivered', 'undeliverable')
  ) then
    update public.batch_windows
    set status = 'fulfilled'
    where id = v_batch_order.batch_window_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'commission_earned', v_commission
  );
end;
$$ language plpgsql security definer set search_path = public;

-- =============================================================================
-- 8. flag_undeliverable — Rep flags order as undeliverable
-- =============================================================================
create or replace function public.flag_undeliverable(
  p_order_id uuid,
  p_reason text,
  p_note text default null
)
returns void as $$
declare
  v_rep record;
  v_batch_order record;
begin
  select * into v_rep
  from public.representatives
  where user_id = auth.uid()
    and is_active = true;

  if v_rep is null then
    raise exception 'Not an active representative';
  end if;

  select * into v_batch_order
  from public.batch_orders
  where order_id = p_order_id
    and rep_id = v_rep.id
  for update;

  if v_batch_order is null then
    raise exception 'Order not assigned to you';
  end if;

  if v_batch_order.delivery_status != 'pending' and v_batch_order.delivery_status != 'out_for_delivery' then
    raise exception 'Order cannot be flagged in current status';
  end if;

  update public.batch_orders
  set delivery_status = 'undeliverable',
      undeliverable_reason = p_reason,
      undeliverable_note = p_note
  where id = v_batch_order.id;

  -- Check if all orders in this window are now terminal
  if not exists (
    select 1 from public.batch_orders
    where batch_window_id = v_batch_order.batch_window_id
      and delivery_status not in ('delivered', 'undeliverable')
  ) then
    update public.batch_windows
    set status = 'fulfilled'
    where id = v_batch_order.batch_window_id;
  end if;
end;
$$ language plpgsql security definer set search_path = public;

-- =============================================================================
-- 9. cancel_batch_window — Cancel window and refund all orders
-- =============================================================================
create or replace function public.cancel_batch_window(p_window_id uuid)
returns void as $$
declare
  v_window record;
  v_order record;
  v_wallet_id uuid;
begin
  -- Authorization: admin only (cancel has financial impact)
  if not is_admin() then
    raise exception 'Not authorized to cancel batch windows';
  end if;

  select * into v_window
  from public.batch_windows
  where id = p_window_id
  for update;

  if v_window is null then
    raise exception 'Batch window not found';
  end if;

  if v_window.status in ('fulfilled', 'cancelled') then
    raise exception 'Window is already in terminal state';
  end if;

  -- Expire all pending reservations
  update public.batch_slot_reservations
  set status = 'expired'
  where batch_window_id = p_window_id
    and status = 'held';

  -- Refund all orders to customer wallets
  for v_order in
    select o.* from public.orders o
    where o.batch_window_id = p_window_id
      and o.status != 'cancelled'
  loop
    -- Get customer wallet
    select id into v_wallet_id
    from public.wallets
    where user_id = v_order.user_id;

    if v_wallet_id is not null then
      -- Credit refund to wallet (loaded_balance)
      update public.wallets
      set loaded_balance = loaded_balance + v_order.total
      where id = v_wallet_id;

      -- Record transaction
      insert into public.wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id)
      values (
        v_wallet_id,
        'refund',
        v_order.total,
        (select loaded_balance + bonus_balance from public.wallets where id = v_wallet_id),
        'Batch order cancelled — full refund',
        v_order.id::text
      );
    end if;

    -- Cancel the order
    update public.orders
    set status = 'cancelled',
        payment_status = 'refunded'
    where id = v_order.id;
  end loop;

  -- Cancel the window
  update public.batch_windows
  set status = 'cancelled',
      closed_at = now()
  where id = p_window_id;
end;
$$ language plpgsql security definer set search_path = public;

-- =============================================================================
-- 10. mark_batch_out_for_delivery — Manager marks orders handed to reps
-- =============================================================================
create or replace function public.mark_batch_out_for_delivery(p_window_id uuid)
returns void as $$
begin
  -- Verify caller is admin or outlet manager
  if not is_admin() then
    if not exists (
      select 1 from public.batch_windows bw
      join public.outlet_staff os on os.outlet_id = bw.outlet_id
      where bw.id = p_window_id
        and os.user_id = auth.uid()
        and os.is_manager = true
    ) then
      raise exception 'Not authorized';
    end if;
  end if;

  -- Update all assigned orders to out_for_delivery
  update public.batch_orders
  set delivery_status = 'out_for_delivery'
  where batch_window_id = p_window_id
    and rep_id is not null
    and delivery_status = 'pending';

  -- Update order statuses
  update public.orders
  set status = 'out_for_delivery'
  where batch_window_id = p_window_id
    and status = 'preparing';
end;
$$ language plpgsql security definer set search_path = public;

-- =============================================================================
-- 11. get_batch_window_availability — Get available slots for a window
-- Used by customer home page for monster counter.
-- =============================================================================
create or replace function public.get_batch_window_availability(p_window_id uuid)
returns jsonb as $$
declare
  v_window record;
  v_held_count int;
  v_available int;
begin
  select * into v_window
  from public.batch_windows
  where id = p_window_id;

  if v_window is null then
    return null;
  end if;

  -- Count active held reservations
  select count(*) into v_held_count
  from public.batch_slot_reservations
  where batch_window_id = p_window_id
    and status = 'held'
    and expires_at > now();

  v_available := greatest(0, v_window.max_orders - v_window.current_order_count - v_held_count);

  return jsonb_build_object(
    'window_id', v_window.id,
    'outlet_id', v_window.outlet_id,
    'status', v_window.status,
    'start_time', v_window.start_time,
    'end_time', v_window.end_time,
    'max_orders', v_window.max_orders,
    'confirmed_count', v_window.current_order_count,
    'held_count', v_held_count,
    'available', v_available,
    'delivery_fee', v_window.delivery_fee,
    'counter_display_mode', v_window.counter_display_mode,
    'counter_visual_style', v_window.counter_visual_style
  );
end;
$$ language plpgsql security definer stable set search_path = public;

-- =============================================================================
-- 12. expire_batch_reservations — Cleanup expired held slots
-- Called by the cron Edge Function.
-- =============================================================================
create or replace function public.expire_batch_reservations()
returns int as $$
declare
  v_count int;
begin
  update public.batch_slot_reservations
  set status = 'expired'
  where status = 'held'
    and expires_at < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$ language plpgsql security definer set search_path = public;

-- =============================================================================
-- 13. credit_flat_per_batch_commission — Credit flat-per-batch reps after fulfillment
-- Called when batch moves to fulfilled or by admin manually.
-- =============================================================================
create or replace function public.credit_flat_per_batch_commission(p_window_id uuid)
returns void as $$
declare
  v_rep record;
  v_delivered_count int;
begin
  -- Authorization: admin only
  if not is_admin() then
    raise exception 'Not authorized to credit batch commissions';
  end if;

  for v_rep in
    select r.* from public.representatives r
    join public.batch_windows bw on bw.outlet_id = r.outlet_id
    where bw.id = p_window_id
      and r.commission_type = 'flat_per_batch'
      and r.is_active = true
      and exists (
        select 1 from public.batch_orders bo
        where bo.batch_window_id = p_window_id
          and bo.rep_id = r.id
          and bo.delivery_status = 'delivered'
      )
  loop
    select count(*) into v_delivered_count
    from public.batch_orders
    where batch_window_id = p_window_id
      and rep_id = v_rep.id
      and delivery_status = 'delivered';

    insert into public.rep_commission_ledger (rep_id, batch_window_id, orders_delivered, amount_earned)
    values (v_rep.id, p_window_id, v_delivered_count, v_rep.commission_value)
    on conflict (rep_id, batch_window_id)
      do update set
        orders_delivered = v_delivered_count,
        amount_earned = v_rep.commission_value;
  end loop;
end;
$$ language plpgsql security definer set search_path = public;

-- =============================================================================
-- Unique constraint needed for commission ledger upsert
-- =============================================================================
alter table public.rep_commission_ledger
  add constraint rep_commission_ledger_rep_window_unique
  unique (rep_id, batch_window_id);

-- =============================================================================
-- Grants — restrict RPC execution
-- =============================================================================
revoke execute on function public.maybe_open_batch_window(uuid) from public, anon;
grant execute on function public.maybe_open_batch_window(uuid) to authenticated;

revoke execute on function public.reserve_batch_slot(uuid) from public, anon;
grant execute on function public.reserve_batch_slot(uuid) to authenticated;

revoke execute on function public.confirm_batch_slot(uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.confirm_batch_slot(uuid, uuid, uuid, uuid, text) to authenticated;

revoke execute on function public.release_batch_slot(uuid) from public, anon;
grant execute on function public.release_batch_slot(uuid) to authenticated;

revoke execute on function public.close_batch_window(uuid) from public, anon;
grant execute on function public.close_batch_window(uuid) to authenticated;

revoke execute on function public.distribute_batch_orders(uuid) from public, anon;
grant execute on function public.distribute_batch_orders(uuid) to authenticated;

revoke execute on function public.confirm_batch_delivery(uuid) from public, anon;
grant execute on function public.confirm_batch_delivery(uuid) to authenticated;

revoke execute on function public.flag_undeliverable(uuid, text, text) from public, anon;
grant execute on function public.flag_undeliverable(uuid, text, text) to authenticated;

revoke execute on function public.cancel_batch_window(uuid) from public, anon;
grant execute on function public.cancel_batch_window(uuid) to authenticated;

revoke execute on function public.mark_batch_out_for_delivery(uuid) from public, anon;
grant execute on function public.mark_batch_out_for_delivery(uuid) to authenticated;

revoke execute on function public.get_batch_window_availability(uuid) from public, anon;
grant execute on function public.get_batch_window_availability(uuid) to authenticated, anon;

revoke execute on function public.expire_batch_reservations() from public, anon, authenticated;
grant execute on function public.expire_batch_reservations() to service_role;

revoke execute on function public.credit_flat_per_batch_commission(uuid) from public, anon;
grant execute on function public.credit_flat_per_batch_commission(uuid) to authenticated;

