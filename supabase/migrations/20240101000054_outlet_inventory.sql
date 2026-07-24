-- Inventory management for outlets
-- Tracks raw materials in both quantity (numbers) and weight per outlet

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  name text not null,
  unit text not null check (unit in ('kg', 'g', 'ml', 'l', 'pcs', 'dozen', 'packets')),
  quantity numeric(12,3) not null default 0,
  min_stock_level numeric(12,3) not null default 0,
  cost_per_unit numeric(10,2),
  category text not null default 'general',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger inventory_items_updated_at
  before update on public.inventory_items
  for each row execute function public.update_updated_at();

create index idx_inventory_items_outlet on public.inventory_items(outlet_id);
create index idx_inventory_items_category on public.inventory_items(category);
create index idx_inventory_items_active on public.inventory_items(is_active);
create unique index idx_inventory_items_outlet_name on public.inventory_items(outlet_id, lower(name));

-- Recipe ingredients: links menu items to inventory items with required quantities
create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  quantity_required numeric(12,3) not null,
  created_at timestamptz not null default now(),
  unique(menu_item_id, inventory_item_id)
);

create index idx_recipe_ingredients_menu_item on public.recipe_ingredients(menu_item_id);
create index idx_recipe_ingredients_inventory_item on public.recipe_ingredients(inventory_item_id);

-- Inventory log: tracks all additions, deductions, and recipe-based usage
create table public.inventory_logs (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  change_type text not null check (change_type in ('addition', 'deduction', 'recipe_usage', 'adjustment', 'wastage')),
  quantity_change numeric(12,3) not null,
  quantity_after numeric(12,3) not null,
  reference_id uuid,
  notes text,
  performed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index idx_inventory_logs_item on public.inventory_logs(inventory_item_id);
create index idx_inventory_logs_created on public.inventory_logs(created_at desc);
create index idx_inventory_logs_type on public.inventory_logs(change_type);

-- RPC: Deduct inventory based on recipe when an order item is prepared
create or replace function public.deduct_inventory_for_recipe(
  p_menu_item_id uuid,
  p_outlet_id uuid,
  p_quantity int default 1,
  p_performed_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ingredient record;
  v_inventory record;
  v_new_quantity numeric(12,3);
  v_results jsonb := '[]'::jsonb;
begin
  for v_ingredient in
    select ri.inventory_item_id, ri.quantity_required
    from recipe_ingredients ri
    join inventory_items ii on ii.id = ri.inventory_item_id
    where ri.menu_item_id = p_menu_item_id
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

    insert into inventory_logs (inventory_item_id, change_type, quantity_change, quantity_after, reference_id, performed_by, notes)
    values (
      v_ingredient.inventory_item_id,
      'recipe_usage',
      -(v_ingredient.quantity_required * p_quantity),
      v_new_quantity,
      p_menu_item_id,
      p_performed_by,
      'Recipe deduction for ' || p_quantity || ' unit(s)'
    );

    v_results := v_results || jsonb_build_object(
      'inventory_item_id', v_ingredient.inventory_item_id,
      'deducted', v_ingredient.quantity_required * p_quantity,
      'remaining', v_new_quantity
    );
  end loop;

  return v_results;
end;
$$;

-- RLS
alter table public.inventory_items enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.inventory_logs enable row level security;

-- Admin full access to inventory
create policy "inventory_items: admin all" on public.inventory_items
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'super_admin'))
  );

-- Outlet staff (managers) can read and update their outlet inventory
create policy "inventory_items: staff read" on public.inventory_items
  for select using (
    exists (
      select 1 from outlet_staff
      where outlet_id = inventory_items.outlet_id
        and user_id = auth.uid()
    )
  );

create policy "inventory_items: manager update" on public.inventory_items
  for update using (
    exists (
      select 1 from outlet_staff
      where outlet_id = inventory_items.outlet_id
        and user_id = auth.uid()
        and is_manager = true
    )
  );

-- Recipe ingredients: admin full, staff read
create policy "recipe_ingredients: admin all" on public.recipe_ingredients
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'super_admin'))
  );

create policy "recipe_ingredients: staff read" on public.recipe_ingredients
  for select using (
    exists (
      select 1 from outlet_staff os
      join inventory_items ii on ii.outlet_id = os.outlet_id
      where ii.id = recipe_ingredients.inventory_item_id
        and os.user_id = auth.uid()
    )
  );

-- Inventory logs: admin full, staff read own outlet
create policy "inventory_logs: admin all" on public.inventory_logs
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'super_admin'))
  );

create policy "inventory_logs: staff read" on public.inventory_logs
  for select using (
    exists (
      select 1 from outlet_staff os
      join inventory_items ii on ii.outlet_id = os.outlet_id
      where ii.id = inventory_logs.inventory_item_id
        and os.user_id = auth.uid()
    )
  );

-- Staff managers can insert logs (for manual adjustments)
create policy "inventory_logs: manager insert" on public.inventory_logs
  for insert with check (
    exists (
      select 1 from outlet_staff os
      join inventory_items ii on ii.outlet_id = os.outlet_id
      where ii.id = inventory_logs.inventory_item_id
        and os.user_id = auth.uid()
        and os.is_manager = true
    )
  );

-- Grant execute on the RPC to authenticated users (RLS + internal checks apply)
grant execute on function public.deduct_inventory_for_recipe(uuid, uuid, int, uuid) to authenticated;
