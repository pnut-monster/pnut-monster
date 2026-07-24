-- Fix: Ensure inventory tables have proper grants for authenticated role
grant select, insert, update, delete on public.inventory_items to authenticated;
grant select, insert, update, delete on public.inventory_logs to authenticated;
grant select, insert, update, delete on public.recipe_ingredients to authenticated;

-- Table to track low-stock alerts (prevents duplicate notifications)
create table if not exists public.inventory_alerts (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  item_name text not null,
  quantity_at_alert numeric(12,3) not null,
  min_stock_level numeric(12,3) not null,
  unit text not null,
  resolved boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_inventory_alerts_item on public.inventory_alerts(inventory_item_id);
create index idx_inventory_alerts_unresolved on public.inventory_alerts(resolved, created_at desc);

alter table public.inventory_alerts enable row level security;

create policy "inventory_alerts: admin all" on public.inventory_alerts
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'super_admin'))
  );

grant select, insert, update, delete on public.inventory_alerts to authenticated;

-- Trigger function: fires when inventory quantity is updated and drops below min_stock_level
create or replace function public.check_low_stock_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outlet_name text;
  v_admin record;
  v_existing_alert uuid;
begin
  -- Only check if quantity was actually changed
  if new.quantity is not distinct from old.quantity then
    return new;
  end if;

  -- Only alert if quantity dropped to or below min_stock_level
  if new.min_stock_level <= 0 or new.quantity > new.min_stock_level then
    -- If quantity went back above threshold, resolve any open alert
    if new.quantity > new.min_stock_level then
      update inventory_alerts
      set resolved = true, resolved_at = now()
      where inventory_item_id = new.id and resolved = false;
    end if;
    return new;
  end if;

  -- Check if there's already an unresolved alert for this item
  select id into v_existing_alert
  from inventory_alerts
  where inventory_item_id = new.id and resolved = false
  limit 1;

  if v_existing_alert is not null then
    return new;
  end if;

  -- Get outlet name
  select name into v_outlet_name from outlets where id = new.outlet_id;

  -- Create the alert record
  insert into inventory_alerts (inventory_item_id, outlet_id, item_name, quantity_at_alert, min_stock_level, unit)
  values (new.id, new.outlet_id, new.name, new.quantity, new.min_stock_level, new.unit);

  -- Notify all admin users via in-app notifications
  for v_admin in
    select id from profiles where role in ('admin', 'super_admin')
  loop
    perform create_notification(
      v_admin.id,
      'Low Stock Alert',
      new.name || ' at ' || coalesce(v_outlet_name, 'Unknown outlet') || ' is low: ' ||
        new.quantity || ' ' || new.unit || ' remaining (threshold: ' || new.min_stock_level || ' ' || new.unit || ')',
      'general',
      jsonb_build_object(
        'type', 'low_stock',
        'inventory_item_id', new.id,
        'outlet_id', new.outlet_id,
        'item_name', new.name,
        'quantity', new.quantity,
        'min_stock_level', new.min_stock_level,
        'unit', new.unit,
        'outlet_name', v_outlet_name
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_check_low_stock on public.inventory_items;
create trigger trg_check_low_stock
  after update of quantity on public.inventory_items
  for each row execute function public.check_low_stock_alert();

-- Also check on insert (when initial stock is already below threshold)
create or replace function public.check_low_stock_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outlet_name text;
  v_admin record;
begin
  if new.min_stock_level <= 0 or new.quantity > new.min_stock_level then
    return new;
  end if;

  select name into v_outlet_name from outlets where id = new.outlet_id;

  insert into inventory_alerts (inventory_item_id, outlet_id, item_name, quantity_at_alert, min_stock_level, unit)
  values (new.id, new.outlet_id, new.name, new.quantity, new.min_stock_level, new.unit);

  for v_admin in
    select id from profiles where role in ('admin', 'super_admin')
  loop
    perform create_notification(
      v_admin.id,
      'Low Stock Alert',
      new.name || ' at ' || coalesce(v_outlet_name, 'Unknown outlet') || ' is low: ' ||
        new.quantity || ' ' || new.unit || ' remaining (threshold: ' || new.min_stock_level || ' ' || new.unit || ')',
      'general',
      jsonb_build_object(
        'type', 'low_stock',
        'inventory_item_id', new.id,
        'outlet_id', new.outlet_id,
        'item_name', new.name,
        'quantity', new.quantity,
        'min_stock_level', new.min_stock_level,
        'unit', new.unit,
        'outlet_name', v_outlet_name
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_check_low_stock_insert on public.inventory_items;
create trigger trg_check_low_stock_insert
  after insert on public.inventory_items
  for each row execute function public.check_low_stock_on_insert();
