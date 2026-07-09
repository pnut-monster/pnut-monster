-- Post-audit hardening pass.
-- Keeps staff-facing operations behind narrow RPCs instead of broad table
-- updates, and blocks unpaid orders until a payment provider/webhook flow exists.

-- Outlet staff should not be able to update arbitrary order columns directly.
drop policy if exists "orders: staff update outlet orders" on public.orders;

create or replace function public.is_outlet_staff_for_outlet(p_outlet_id uuid)
returns boolean as $$
  select exists (
    select 1
    from public.outlet_staff os
    where os.outlet_id = p_outlet_id
      and os.user_id = auth.uid()
  );
$$ language sql security definer stable set search_path = public;

create or replace function public.update_order_status(
  p_order_id uuid,
  p_status text
)
returns jsonb as $$
declare
  v_order public.orders%rowtype;
  v_allowed boolean;
begin
  if p_status not in ('confirmed', 'preparing', 'ready') then
    raise exception 'Unsupported order status';
  end if;

  if not public.can_manage_order(p_order_id) then
    raise exception 'Order management access required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.status = p_status then
    return jsonb_build_object(
      'order_id', p_order_id,
      'status', v_order.status,
      'changed', false
    );
  end if;

  v_allowed :=
    (v_order.status = 'pending' and p_status = 'confirmed')
    or (v_order.status = 'confirmed' and p_status = 'preparing')
    or (v_order.status = 'preparing' and p_status = 'ready');

  if not v_allowed then
    raise exception 'Invalid order status transition from % to %', v_order.status, p_status;
  end if;

  if v_order.payment_status <> 'paid' then
    raise exception 'Cannot progress an unpaid order';
  end if;

  update public.orders
  set status = p_status
  where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', p_status,
    'changed', true
  );
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.complete_order_with_pickup_code(
  p_order_id uuid,
  p_code text
)
returns jsonb as $$
declare
  v_order public.orders%rowtype;
begin
  if not public.can_manage_order(p_order_id) then
    raise exception 'Order management access required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.status <> 'ready' then
    raise exception 'Only ready orders can be completed';
  end if;

  if v_order.payment_status <> 'paid' then
    raise exception 'Cannot complete an unpaid order';
  end if;

  if v_order.delivery_code is null or p_code <> v_order.delivery_code then
    raise exception 'Invalid pickup code';
  end if;

  update public.orders
  set status = 'picked_up'
  where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', 'picked_up',
    'changed', true
  );
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.upsert_outlet_menu_item(
  p_outlet_id uuid,
  p_item_id uuid,
  p_is_available boolean,
  p_price_override numeric default null
)
returns jsonb as $$
begin
  if not public.is_admin() and not public.is_outlet_staff_for_outlet(p_outlet_id) then
    raise exception 'Outlet menu access required';
  end if;

  if p_price_override is not null and p_price_override < 0 then
    raise exception 'Price override cannot be negative';
  end if;

  if not exists (select 1 from public.outlets where id = p_outlet_id) then
    raise exception 'Outlet not found';
  end if;

  if not exists (select 1 from public.menu_items where id = p_item_id) then
    raise exception 'Menu item not found';
  end if;

  insert into public.outlet_menu_items (
    outlet_id,
    item_id,
    is_available,
    price_override
  )
  values (
    p_outlet_id,
    p_item_id,
    p_is_available,
    p_price_override
  )
  on conflict (outlet_id, item_id)
  do update set
    is_available = excluded.is_available,
    price_override = excluded.price_override;

  return jsonb_build_object(
    'outlet_id', p_outlet_id,
    'item_id', p_item_id,
    'is_available', p_is_available,
    'price_override', p_price_override
  );
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.set_pickup_otp_required(p_required boolean)
returns jsonb as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.app_settings
  set value = case when p_required then 'true' else 'false' end,
      updated_at = now()
  where key = 'pickup_otp_required';

  if not found then
    insert into public.app_settings (key, value)
    values ('pickup_otp_required', case when p_required then 'true' else 'false' end);
  end if;

  return jsonb_build_object('pickup_otp_required', p_required);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.prevent_unpaid_order_insert()
returns trigger as $$
begin
  if new.payment_status <> 'paid' then
    raise exception 'Online payments are not configured; unpaid orders cannot be created';
  end if;

  return new;
end;
$$ language plpgsql set search_path = public;

drop trigger if exists trg_prevent_unpaid_order_insert on public.orders;
create trigger trg_prevent_unpaid_order_insert
  before insert on public.orders
  for each row execute function public.prevent_unpaid_order_insert();

-- Normalize search_path on existing security-definer functions.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format('alter function %s set search_path = public', r.signature);
  end loop;
end;
$$;

alter function public.generate_delivery_code() set search_path = public;
alter function public.update_updated_at() set search_path = public;

revoke execute on function public.is_outlet_staff_for_outlet(uuid) from public, anon, authenticated;
revoke execute on function public.prevent_unpaid_order_insert() from public, anon, authenticated;
revoke execute on function public.update_order_status(uuid, text) from public, anon;
revoke execute on function public.complete_order_with_pickup_code(uuid, text) from public, anon;
revoke execute on function public.upsert_outlet_menu_item(uuid, uuid, boolean, numeric) from public, anon;
revoke execute on function public.set_pickup_otp_required(boolean) from public, anon;

grant execute on function public.update_order_status(uuid, text) to authenticated;
grant execute on function public.complete_order_with_pickup_code(uuid, text) to authenticated;
grant execute on function public.upsert_outlet_menu_item(uuid, uuid, boolean, numeric) to authenticated;
grant execute on function public.set_pickup_otp_required(boolean) to authenticated;
