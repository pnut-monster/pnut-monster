-- Add 'batch' notification type and integrate batch events with notifications

-- 1. Expand the type check constraint on notifications table
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('order', 'wallet', 'loyalty', 'campaign', 'general', 'batch'));

-- 2. Update create_notification to accept 'batch' type
create or replace function public.create_notification(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_type text default 'general',
  p_data jsonb default '{}'::jsonb
)
returns uuid as $$
declare
  v_id uuid;
begin
  insert into public.notifications (user_id, title, body, type, data)
  values (
    p_user_id,
    p_title,
    p_body,
    case when p_type in ('order', 'wallet', 'loyalty', 'campaign', 'general', 'batch') then p_type else 'general' end,
    coalesce(p_data, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function public.create_notification(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- 3. Batch notification helper: notify customer about their batch order status
create or replace function public.notify_batch_order_status()
returns trigger as $$
declare
  v_user_id uuid;
  v_order_number text;
  v_title text;
  v_body text;
begin
  if old.delivery_status is not distinct from new.delivery_status then
    return new;
  end if;

  -- Get customer info from the order
  select o.user_id, o.order_number
  into v_user_id, v_order_number
  from public.orders o
  where o.id = new.order_id;

  if v_user_id is null then
    return new;
  end if;

  v_title := case new.delivery_status
    when 'out_for_delivery' then 'Order out for delivery'
    when 'delivered' then 'Order delivered'
    when 'undeliverable' then 'Delivery issue with your order'
    else null
  end;

  v_body := case new.delivery_status
    when 'out_for_delivery' then 'Your batch order #' || v_order_number || ' is on its way! Your rep will deliver it shortly.'
    when 'delivered' then 'Your batch order #' || v_order_number || ' has been delivered. Enjoy!'
    when 'undeliverable' then 'Your batch order #' || v_order_number || ' could not be delivered. Please contact support.'
    else null
  end;

  if v_title is not null then
    perform public.create_notification(
      v_user_id,
      v_title,
      v_body,
      'batch',
      jsonb_build_object('order_id', new.order_id, 'batch_window_id', new.batch_window_id, 'delivery_status', new.delivery_status)
    );
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 4. Trigger on batch_orders delivery_status changes
drop trigger if exists trg_notify_batch_order_status on public.batch_orders;
create trigger trg_notify_batch_order_status
  after update of delivery_status on public.batch_orders
  for each row execute function public.notify_batch_order_status();

-- 5. Notify customer when slot reservation is confirmed (order placed into batch)
create or replace function public.notify_batch_slot_confirmed()
returns trigger as $$
declare
  v_user_id uuid;
  v_order_number text;
  v_window_start timestamptz;
  v_outlet_name text;
begin
  if new.status <> 'confirmed' or old.status = 'confirmed' then
    return new;
  end if;

  -- Get the user from the reservation
  v_user_id := new.user_id;

  -- Get window info for a helpful message
  select bw.start_time, o.name
  into v_window_start, v_outlet_name
  from public.batch_windows bw
  join public.outlets o on o.id = bw.outlet_id
  where bw.id = new.batch_window_id;

  perform public.create_notification(
    v_user_id,
    'Batch order confirmed',
    'Your order from ' || coalesce(v_outlet_name, 'the outlet') || ' has been added to the batch. It will be prepared and delivered together.',
    'batch',
    jsonb_build_object('batch_window_id', new.batch_window_id)
  );

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_notify_batch_slot_confirmed on public.batch_slot_reservations;
create trigger trg_notify_batch_slot_confirmed
  after update of status on public.batch_slot_reservations
  for each row execute function public.notify_batch_slot_confirmed();

-- 6. Also update the existing order status notification to handle batch-specific statuses
create or replace function public.notify_order_status_update()
returns trigger as $$
declare
  v_title text;
  v_body text;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  v_title := case new.status
    when 'confirmed' then 'Order confirmed'
    when 'preparing' then 'Order is being prepared'
    when 'ready' then 'Order ready for pickup'
    when 'picked_up' then 'Order completed'
    when 'cancelled' then 'Order cancelled'
    when 'rejected' then 'Order rejected'
    when 'batch_pending' then 'Batch order received'
    when 'out_for_delivery' then 'Order out for delivery'
    when 'delivered' then 'Order delivered'
    else 'Order updated'
  end;

  v_body := case new.status
    when 'confirmed' then 'Your order #' || new.order_number || ' has been confirmed.'
    when 'preparing' then 'Your order #' || new.order_number || ' is now being prepared.'
    when 'ready' then 'Your order #' || new.order_number || ' is ready for pickup.'
    when 'picked_up' then 'Your order #' || new.order_number || ' has been completed.'
    when 'cancelled' then 'Your order #' || new.order_number || ' has been cancelled.'
    when 'rejected' then 'Your order #' || new.order_number || ' was rejected. Refund details will be updated if applicable.'
    when 'batch_pending' then 'Your batch order #' || new.order_number || ' has been received and is waiting for the batch window to close.'
    when 'out_for_delivery' then 'Your order #' || new.order_number || ' is out for delivery.'
    when 'delivered' then 'Your order #' || new.order_number || ' has been delivered successfully!'
    else 'Your order #' || new.order_number || ' status changed to ' || new.status || '.'
  end;

  perform public.create_notification(
    new.user_id,
    v_title,
    v_body,
    case when new.status in ('batch_pending', 'out_for_delivery', 'delivered') then 'batch' else 'order' end,
    jsonb_build_object('order_id', new.id, 'order_number', new.order_number, 'status', new.status)
  );

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Revoke direct execution
revoke execute on function public.notify_batch_order_status() from public, anon, authenticated;
revoke execute on function public.notify_batch_slot_confirmed() from public, anon, authenticated;
