-- Auto-deduct inventory when order moves to 'preparing' and auto-block items/options when stock hits zero

-- Table to link customization options to inventory items (for option-level blocking)
create table public.recipe_option_ingredients (
  id uuid primary key default gen_random_uuid(),
  customization_option_id uuid not null references public.customization_options(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  quantity_required numeric(12,3) not null,
  created_at timestamptz not null default now(),
  unique(customization_option_id, inventory_item_id)
);

create index idx_recipe_option_ingredients_option on public.recipe_option_ingredients(customization_option_id);
create index idx_recipe_option_ingredients_inventory on public.recipe_option_ingredients(inventory_item_id);

-- Per-outlet unavailable customization options (set when stock hits zero)
create table public.outlet_unavailable_options (
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  option_id uuid not null references public.customization_options(id) on delete cascade,
  blocked_at timestamptz not null default now(),
  blocked_by text not null default 'system',
  primary key (outlet_id, option_id)
);

create index idx_outlet_unavailable_options_outlet on public.outlet_unavailable_options(outlet_id);

-- Notifications table for inventory stock-out alerts to managers
create table public.inventory_stock_alerts (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  alert_type text not null check (alert_type in ('out_of_stock', 'low_stock', 'item_blocked', 'option_blocked')),
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_inventory_stock_alerts_outlet on public.inventory_stock_alerts(outlet_id);
create index idx_inventory_stock_alerts_unread on public.inventory_stock_alerts(outlet_id, is_read) where is_read = false;

-- Function: auto-deduct inventory for all items in an order
create or replace function public.auto_deduct_order_inventory(
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_item record;
  v_customization jsonb;
  v_option jsonb;
  v_option_id uuid;
begin
  select id, outlet_id into v_order
  from orders where id = p_order_id;

  if not found then return; end if;

  -- Deduct for each order item's base recipe
  for v_item in
    select item_id, quantity, customizations
    from order_items
    where order_id = p_order_id
  loop
    -- Deduct base menu item ingredients
    perform deduct_inventory_for_recipe(
      v_item.item_id,
      v_order.outlet_id,
      v_item.quantity,
      null
    );

    -- Deduct customization option ingredients
    if v_item.customizations is not null and jsonb_array_length(v_item.customizations) > 0 then
      for v_customization in select * from jsonb_array_elements(v_item.customizations)
      loop
        if v_customization->'options' is not null then
          for v_option in select * from jsonb_array_elements(v_customization->'options')
          loop
            v_option_id := (v_option->>'id')::uuid;
            if v_option_id is not null then
              perform deduct_option_inventory(
                v_option_id,
                v_order.outlet_id,
                v_item.quantity
              );
            end if;
          end loop;
        end if;
      end loop;
    end if;
  end loop;

  -- After all deductions, check for stock-outs and auto-block
  perform check_and_block_stockouts(v_order.outlet_id);
end;
$$;

-- Function: deduct inventory for a customization option
create or replace function public.deduct_option_inventory(
  p_option_id uuid,
  p_outlet_id uuid,
  p_quantity int default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ingredient record;
  v_inventory record;
  v_new_quantity numeric(12,3);
begin
  for v_ingredient in
    select roi.inventory_item_id, roi.quantity_required
    from recipe_option_ingredients roi
    join inventory_items ii on ii.id = roi.inventory_item_id
    where roi.customization_option_id = p_option_id
      and ii.outlet_id = p_outlet_id
      and ii.is_active = true
  loop
    select * into v_inventory from inventory_items
    where id = v_ingredient.inventory_item_id
    for update;

    if not found then continue; end if;

    v_new_quantity := v_inventory.quantity - (v_ingredient.quantity_required * p_quantity);
    if v_new_quantity < 0 then v_new_quantity := 0; end if;

    update inventory_items
    set quantity = v_new_quantity
    where id = v_ingredient.inventory_item_id;

    insert into inventory_logs (inventory_item_id, change_type, quantity_change, quantity_after, reference_id, notes)
    values (
      v_ingredient.inventory_item_id,
      'recipe_usage',
      -(v_ingredient.quantity_required * p_quantity),
      v_new_quantity,
      p_option_id,
      'Option deduction for ' || p_quantity || ' unit(s)'
    );
  end loop;
end;
$$;

-- Function: check stock-outs and auto-block menu items and customization options
create or replace function public.check_and_block_stockouts(
  p_outlet_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_menu_item_id uuid;
  v_option_id uuid;
  v_all_ingredients_available boolean;
  v_outlet_name text;
begin
  select name into v_outlet_name from outlets where id = p_outlet_id;

  -- Check menu items: if ANY required ingredient is at 0, block the item
  for v_menu_item_id in
    select distinct ri.menu_item_id
    from recipe_ingredients ri
    join inventory_items ii on ii.id = ri.inventory_item_id
    where ii.outlet_id = p_outlet_id
      and ii.is_active = true
      and ii.quantity <= 0
  loop
    -- Only block if not already blocked
    insert into outlet_menu_items (outlet_id, item_id, is_available)
    values (p_outlet_id, v_menu_item_id, false)
    on conflict (outlet_id, item_id)
    do update set is_available = false
    where outlet_menu_items.is_available = true;

    if found then
      insert into inventory_stock_alerts (outlet_id, inventory_item_id, alert_type, message)
      select p_outlet_id, ii.id, 'item_blocked',
        'Menu item auto-blocked due to ' || ii.name || ' running out of stock'
      from recipe_ingredients ri
      join inventory_items ii on ii.id = ri.inventory_item_id
      where ri.menu_item_id = v_menu_item_id
        and ii.outlet_id = p_outlet_id
        and ii.quantity <= 0
      limit 1;
    end if;
  end loop;

  -- Check customization options: if ANY required ingredient is at 0, block the option
  for v_option_id in
    select distinct roi.customization_option_id
    from recipe_option_ingredients roi
    join inventory_items ii on ii.id = roi.inventory_item_id
    where ii.outlet_id = p_outlet_id
      and ii.is_active = true
      and ii.quantity <= 0
  loop
    insert into outlet_unavailable_options (outlet_id, option_id, blocked_by)
    values (p_outlet_id, v_option_id, 'system')
    on conflict (outlet_id, option_id) do nothing;

    if found then
      insert into inventory_stock_alerts (outlet_id, inventory_item_id, alert_type, message)
      select p_outlet_id, ii.id, 'option_blocked',
        'Customization option auto-blocked due to ' || ii.name || ' running out of stock'
      from recipe_option_ingredients roi
      join inventory_items ii on ii.id = roi.inventory_item_id
      where roi.customization_option_id = v_option_id
        and ii.outlet_id = p_outlet_id
        and ii.quantity <= 0
      limit 1;
    end if;
  end loop;
end;
$$;

-- Trigger function: fires when order status changes to 'preparing'
create or replace function public.trigger_inventory_deduction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.status = 'preparing' and OLD.status <> 'preparing' then
    perform auto_deduct_order_inventory(NEW.id);
  end if;
  return NEW;
end;
$$;

create trigger orders_inventory_deduction
  after update of status on public.orders
  for each row
  when (NEW.status = 'preparing' and OLD.status <> 'preparing')
  execute function public.trigger_inventory_deduction();

-- RLS for new tables
alter table public.recipe_option_ingredients enable row level security;
alter table public.outlet_unavailable_options enable row level security;
alter table public.inventory_stock_alerts enable row level security;

-- recipe_option_ingredients: admin full, staff read
create policy "recipe_option_ingredients: admin all" on public.recipe_option_ingredients
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'super_admin'))
  );

create policy "recipe_option_ingredients: staff read" on public.recipe_option_ingredients
  for select using (
    exists (
      select 1 from outlet_staff os
      join inventory_items ii on ii.outlet_id = os.outlet_id
      where ii.id = recipe_option_ingredients.inventory_item_id
        and os.user_id = auth.uid()
    )
  );

-- outlet_unavailable_options: admin full, staff read own outlet, public read for customer blocking
create policy "outlet_unavailable_options: admin all" on public.outlet_unavailable_options
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'super_admin'))
  );

create policy "outlet_unavailable_options: staff read" on public.outlet_unavailable_options
  for select using (
    exists (
      select 1 from outlet_staff
      where outlet_id = outlet_unavailable_options.outlet_id
        and user_id = auth.uid()
    )
  );

create policy "outlet_unavailable_options: public read" on public.outlet_unavailable_options
  for select using (true);

-- inventory_stock_alerts: admin full, manager read/update own outlet
create policy "inventory_stock_alerts: admin all" on public.inventory_stock_alerts
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'super_admin'))
  );

create policy "inventory_stock_alerts: manager read" on public.inventory_stock_alerts
  for select using (
    exists (
      select 1 from outlet_staff
      where outlet_id = inventory_stock_alerts.outlet_id
        and user_id = auth.uid()
        and is_manager = true
    )
  );

create policy "inventory_stock_alerts: manager update" on public.inventory_stock_alerts
  for update using (
    exists (
      select 1 from outlet_staff
      where outlet_id = inventory_stock_alerts.outlet_id
        and user_id = auth.uid()
        and is_manager = true
    )
  );

-- Grant execute on new functions
grant execute on function public.auto_deduct_order_inventory(uuid) to authenticated;
grant execute on function public.deduct_option_inventory(uuid, uuid, int) to authenticated;
grant execute on function public.check_and_block_stockouts(uuid) to authenticated;
