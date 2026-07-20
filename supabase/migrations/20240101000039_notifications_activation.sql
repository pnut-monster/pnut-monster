-- Activate customer notifications and admin-manageable notification events.

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
    case when p_type in ('order', 'wallet', 'loyalty', 'campaign', 'general') then p_type else 'general' end,
    coalesce(p_data, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.notify_order_insert()
returns trigger as $$
begin
  perform public.create_notification(
    new.user_id,
    'Order placed',
    'Your order #' || new.order_number || ' has been placed successfully.',
    'order',
    jsonb_build_object('order_id', new.id, 'order_number', new.order_number, 'status', new.status)
  );

  return new;
end;
$$ language plpgsql security definer set search_path = public;

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
    else 'Order updated'
  end;

  v_body := case new.status
    when 'confirmed' then 'Your order #' || new.order_number || ' has been confirmed.'
    when 'preparing' then 'Your order #' || new.order_number || ' is now being prepared.'
    when 'ready' then 'Your order #' || new.order_number || ' is ready for pickup.'
    when 'picked_up' then 'Your order #' || new.order_number || ' has been completed.'
    when 'cancelled' then 'Your order #' || new.order_number || ' has been cancelled.'
    when 'rejected' then 'Your order #' || new.order_number || ' was rejected. Refund details will be updated if applicable.'
    else 'Your order #' || new.order_number || ' status changed to ' || new.status || '.'
  end;

  perform public.create_notification(
    new.user_id,
    v_title,
    v_body,
    'order',
    jsonb_build_object('order_id', new.id, 'order_number', new.order_number, 'status', new.status)
  );

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.notify_wallet_transaction()
returns trigger as $$
declare
  v_user_id uuid;
  v_title text;
  v_body text;
begin
  select user_id into v_user_id
  from public.wallets
  where id = new.wallet_id;

  if v_user_id is null then
    return new;
  end if;

  v_title := case new.type
    when 'topup' then 'Wallet topped up'
    when 'bonus' then 'Wallet bonus added'
    when 'debit' then 'Wallet payment'
    when 'refund' then 'Wallet refund processed'
    else 'Wallet updated'
  end;

  v_body := case new.type
    when 'debit' then 'Rs. ' || new.amount || ' was deducted from your wallet.'
    else 'Rs. ' || new.amount || ' was added to your wallet.'
  end;

  perform public.create_notification(
    v_user_id,
    v_title,
    v_body,
    'wallet',
    jsonb_build_object('wallet_transaction_id', new.id, 'type', new.type, 'amount', new.amount)
  );

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.notify_loyalty_ledger()
returns trigger as $$
declare
  v_title text;
  v_body text;
begin
  v_title := case new.type
    when 'earn' then 'Loyalty points earned'
    when 'redeem' then 'Loyalty points redeemed'
    when 'expire' then 'Loyalty points expired'
    when 'adjust' then 'Loyalty points adjusted'
    else 'Loyalty updated'
  end;

  v_body := coalesce(new.description, abs(new.points)::text || ' loyalty points updated.');

  perform public.create_notification(
    new.user_id,
    v_title,
    v_body,
    'loyalty',
    jsonb_build_object('loyalty_ledger_id', new.id, 'type', new.type, 'points', new.points)
  );

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_notify_order_insert on public.orders;
create trigger trg_notify_order_insert
  after insert on public.orders
  for each row execute function public.notify_order_insert();

drop trigger if exists trg_notify_order_status_update on public.orders;
create trigger trg_notify_order_status_update
  after update of status on public.orders
  for each row execute function public.notify_order_status_update();

drop trigger if exists trg_notify_wallet_transaction on public.wallet_transactions;
create trigger trg_notify_wallet_transaction
  after insert on public.wallet_transactions
  for each row execute function public.notify_wallet_transaction();

do $$
begin
  if to_regclass('public.loyalty_ledger') is not null then
    drop trigger if exists trg_notify_loyalty_ledger on public.loyalty_ledger;
    create trigger trg_notify_loyalty_ledger
      after insert on public.loyalty_ledger
      for each row execute function public.notify_loyalty_ledger();
  end if;
end;
$$;

revoke execute on function public.create_notification(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.notify_order_insert() from public, anon, authenticated;
revoke execute on function public.notify_order_status_update() from public, anon, authenticated;
revoke execute on function public.notify_wallet_transaction() from public, anon, authenticated;
revoke execute on function public.notify_loyalty_ledger() from public, anon, authenticated;
