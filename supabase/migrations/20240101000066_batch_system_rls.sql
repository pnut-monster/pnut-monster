-- Batch System — RLS Policies
-- Follows existing project patterns: is_admin() for admin access,
-- is_outlet_staff_for_outlet() for outlet staff, auth.uid() for user-specific data.

-- Helper: check if current user is a representative
create or replace function public.is_representative()
returns boolean as $$
  select exists (
    select 1 from public.representatives
    where user_id = auth.uid()
      and is_active = true
  );
$$ language sql security definer stable set search_path = public;

-- Helper: check if current user is outlet staff (manager) for a given outlet
create or replace function public.is_outlet_manager_for_outlet(p_outlet_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.outlet_staff
    where outlet_id = p_outlet_id
      and user_id = auth.uid()
      and is_manager = true
  );
$$ language sql security definer stable set search_path = public;

-- =============================================================================
-- 1. DELIVERY HUBS
-- =============================================================================
alter table public.delivery_hubs enable row level security;

-- Anyone can read active hubs (needed for customer checkout)
create policy "delivery_hubs: public read active"
  on public.delivery_hubs for select
  using (is_active = true);

-- Admin full access
create policy "delivery_hubs: admin select"
  on public.delivery_hubs for select
  using (is_admin());

create policy "delivery_hubs: admin insert"
  on public.delivery_hubs for insert
  with check (is_admin());

create policy "delivery_hubs: admin update"
  on public.delivery_hubs for update
  using (is_admin())
  with check (is_admin());

create policy "delivery_hubs: admin delete"
  on public.delivery_hubs for delete
  using (is_admin());

-- =============================================================================
-- 2. DELIVERY BLOCKS
-- =============================================================================
alter table public.delivery_blocks enable row level security;

-- Anyone can read active blocks (needed for customer checkout dropdown)
create policy "delivery_blocks: public read active"
  on public.delivery_blocks for select
  using (is_active = true);

-- Admin full access
create policy "delivery_blocks: admin select"
  on public.delivery_blocks for select
  using (is_admin());

create policy "delivery_blocks: admin insert"
  on public.delivery_blocks for insert
  with check (is_admin());

create policy "delivery_blocks: admin update"
  on public.delivery_blocks for update
  using (is_admin())
  with check (is_admin());

create policy "delivery_blocks: admin delete"
  on public.delivery_blocks for delete
  using (is_admin());

-- Outlet managers can manage blocks within their outlet's linked hub
create policy "delivery_blocks: manager insert"
  on public.delivery_blocks for insert
  with check (
    exists (
      select 1 from public.outlet_hub_links ohl
      join public.outlet_staff os on os.outlet_id = ohl.outlet_id
      where ohl.hub_id = delivery_blocks.hub_id
        and os.user_id = auth.uid()
        and os.is_manager = true
    )
  );

create policy "delivery_blocks: manager update"
  on public.delivery_blocks for update
  using (
    exists (
      select 1 from public.outlet_hub_links ohl
      join public.outlet_staff os on os.outlet_id = ohl.outlet_id
      where ohl.hub_id = delivery_blocks.hub_id
        and os.user_id = auth.uid()
        and os.is_manager = true
    )
  );

create policy "delivery_blocks: manager delete"
  on public.delivery_blocks for delete
  using (
    exists (
      select 1 from public.outlet_hub_links ohl
      join public.outlet_staff os on os.outlet_id = ohl.outlet_id
      where ohl.hub_id = delivery_blocks.hub_id
        and os.user_id = auth.uid()
        and os.is_manager = true
    )
  );

-- =============================================================================
-- 3. DELIVERY SUB-LOCATIONS
-- =============================================================================
alter table public.delivery_sub_locations enable row level security;

-- Anyone can read active sub-locations (customer checkout)
create policy "delivery_sub_locations: public read active"
  on public.delivery_sub_locations for select
  using (is_active = true);

-- Admin full access
create policy "delivery_sub_locations: admin select"
  on public.delivery_sub_locations for select
  using (is_admin());

create policy "delivery_sub_locations: admin insert"
  on public.delivery_sub_locations for insert
  with check (is_admin());

create policy "delivery_sub_locations: admin update"
  on public.delivery_sub_locations for update
  using (is_admin())
  with check (is_admin());

create policy "delivery_sub_locations: admin delete"
  on public.delivery_sub_locations for delete
  using (is_admin());

-- Outlet managers can manage sub-locations in their hub's blocks
create policy "delivery_sub_locations: manager insert"
  on public.delivery_sub_locations for insert
  with check (
    exists (
      select 1 from public.delivery_blocks db
      join public.outlet_hub_links ohl on ohl.hub_id = db.hub_id
      join public.outlet_staff os on os.outlet_id = ohl.outlet_id
      where db.id = delivery_sub_locations.block_id
        and os.user_id = auth.uid()
        and os.is_manager = true
    )
  );

create policy "delivery_sub_locations: manager update"
  on public.delivery_sub_locations for update
  using (
    exists (
      select 1 from public.delivery_blocks db
      join public.outlet_hub_links ohl on ohl.hub_id = db.hub_id
      join public.outlet_staff os on os.outlet_id = ohl.outlet_id
      where db.id = delivery_sub_locations.block_id
        and os.user_id = auth.uid()
        and os.is_manager = true
    )
  );

create policy "delivery_sub_locations: manager delete"
  on public.delivery_sub_locations for delete
  using (
    exists (
      select 1 from public.delivery_blocks db
      join public.outlet_hub_links ohl on ohl.hub_id = db.hub_id
      join public.outlet_staff os on os.outlet_id = ohl.outlet_id
      where db.id = delivery_sub_locations.block_id
        and os.user_id = auth.uid()
        and os.is_manager = true
    )
  );

-- =============================================================================
-- 4. OUTLET HUB LINKS
-- =============================================================================
alter table public.outlet_hub_links enable row level security;

-- Anyone can read (needed to know which outlet serves which hub)
create policy "outlet_hub_links: public read"
  on public.outlet_hub_links for select
  using (true);

-- Admin full access
create policy "outlet_hub_links: admin insert"
  on public.outlet_hub_links for insert
  with check (is_admin());

create policy "outlet_hub_links: admin update"
  on public.outlet_hub_links for update
  using (is_admin())
  with check (is_admin());

create policy "outlet_hub_links: admin delete"
  on public.outlet_hub_links for delete
  using (is_admin());

-- =============================================================================
-- 5. BATCH WINDOWS
-- =============================================================================
alter table public.batch_windows enable row level security;

-- Anyone can read non-cancelled windows (customers see active/scheduled windows)
create policy "batch_windows: public read"
  on public.batch_windows for select
  using (status != 'cancelled');

-- Admin full access
create policy "batch_windows: admin select"
  on public.batch_windows for select
  using (is_admin());

create policy "batch_windows: admin insert"
  on public.batch_windows for insert
  with check (is_admin());

create policy "batch_windows: admin update"
  on public.batch_windows for update
  using (is_admin())
  with check (is_admin());

create policy "batch_windows: admin delete"
  on public.batch_windows for delete
  using (is_admin());

-- Outlet managers can create windows for their outlet
create policy "batch_windows: manager insert"
  on public.batch_windows for insert
  with check (is_outlet_manager_for_outlet(outlet_id));

-- Outlet managers can update their outlet's windows
create policy "batch_windows: manager update"
  on public.batch_windows for update
  using (is_outlet_manager_for_outlet(outlet_id))
  with check (is_outlet_manager_for_outlet(outlet_id));

-- =============================================================================
-- 6. BATCH SLOT RESERVATIONS
-- =============================================================================
alter table public.batch_slot_reservations enable row level security;

-- Users can read their own reservations
create policy "batch_slot_reservations: users read own"
  on public.batch_slot_reservations for select
  using (auth.uid() = user_id);

-- Admin full access
create policy "batch_slot_reservations: admin select"
  on public.batch_slot_reservations for select
  using (is_admin());

create policy "batch_slot_reservations: admin update"
  on public.batch_slot_reservations for update
  using (is_admin())
  with check (is_admin());

-- No direct user INSERT/UPDATE — handled by security definer RPCs

-- =============================================================================
-- 7. BATCH ORDERS
-- =============================================================================
alter table public.batch_orders enable row level security;

-- Customers can read their own batch orders (via order ownership)
create policy "batch_orders: users read own"
  on public.batch_orders for select
  using (
    exists (
      select 1 from public.orders
      where orders.id = batch_orders.order_id
        and orders.user_id = auth.uid()
    )
  );

-- Admin full access
create policy "batch_orders: admin select"
  on public.batch_orders for select
  using (is_admin());

create policy "batch_orders: admin insert"
  on public.batch_orders for insert
  with check (is_admin());

create policy "batch_orders: admin update"
  on public.batch_orders for update
  using (is_admin())
  with check (is_admin());

create policy "batch_orders: admin delete"
  on public.batch_orders for delete
  using (is_admin());

-- Outlet staff can read batch orders for their outlet
create policy "batch_orders: staff read outlet"
  on public.batch_orders for select
  using (
    exists (
      select 1 from public.batch_windows bw
      join public.outlet_staff os on os.outlet_id = bw.outlet_id
      where bw.id = batch_orders.batch_window_id
        and os.user_id = auth.uid()
    )
  );

-- Outlet managers can update batch orders for their outlet (e.g., assign reps)
create policy "batch_orders: manager update"
  on public.batch_orders for update
  using (
    exists (
      select 1 from public.batch_windows bw
      join public.outlet_staff os on os.outlet_id = bw.outlet_id
      where bw.id = batch_orders.batch_window_id
        and os.user_id = auth.uid()
        and os.is_manager = true
    )
  );

-- Representatives can read their assigned orders
create policy "batch_orders: rep read assigned"
  on public.batch_orders for select
  using (
    exists (
      select 1 from public.representatives r
      where r.id = batch_orders.rep_id
        and r.user_id = auth.uid()
        and r.is_active = true
    )
  );

-- Representatives can update delivery_status on their assigned orders (cannot reassign rep_id)
create policy "batch_orders: rep update assigned"
  on public.batch_orders for update
  using (
    exists (
      select 1 from public.representatives r
      where r.id = batch_orders.rep_id
        and r.user_id = auth.uid()
        and r.is_active = true
    )
  )
  with check (
    rep_id = (
      select r.id from public.representatives r
      where r.user_id = auth.uid() and r.is_active = true
      limit 1
    )
  );

-- =============================================================================
-- 8. REPRESENTATIVES
-- =============================================================================
alter table public.representatives enable row level security;

-- Reps can read their own record
create policy "representatives: rep read own"
  on public.representatives for select
  using (user_id = auth.uid());

-- Admin full access
create policy "representatives: admin select"
  on public.representatives for select
  using (is_admin());

create policy "representatives: admin insert"
  on public.representatives for insert
  with check (is_admin());

create policy "representatives: admin update"
  on public.representatives for update
  using (is_admin())
  with check (is_admin());

create policy "representatives: admin delete"
  on public.representatives for delete
  using (is_admin());

-- Outlet managers can read reps for their outlet
create policy "representatives: manager read"
  on public.representatives for select
  using (is_outlet_manager_for_outlet(outlet_id));

-- Outlet managers can create/update reps for their outlet
create policy "representatives: manager insert"
  on public.representatives for insert
  with check (is_outlet_manager_for_outlet(outlet_id));

create policy "representatives: manager update"
  on public.representatives for update
  using (is_outlet_manager_for_outlet(outlet_id))
  with check (is_outlet_manager_for_outlet(outlet_id));

-- =============================================================================
-- 9. REP COMMISSION LEDGER
-- =============================================================================
alter table public.rep_commission_ledger enable row level security;

-- Reps can read their own ledger
create policy "rep_commission_ledger: rep read own"
  on public.rep_commission_ledger for select
  using (
    exists (
      select 1 from public.representatives r
      where r.id = rep_commission_ledger.rep_id
        and r.user_id = auth.uid()
    )
  );

-- Admin full access (including settled toggle)
create policy "rep_commission_ledger: admin select"
  on public.rep_commission_ledger for select
  using (is_admin());

create policy "rep_commission_ledger: admin insert"
  on public.rep_commission_ledger for insert
  with check (is_admin());

create policy "rep_commission_ledger: admin update"
  on public.rep_commission_ledger for update
  using (is_admin())
  with check (is_admin());

create policy "rep_commission_ledger: admin delete"
  on public.rep_commission_ledger for delete
  using (is_admin());

-- Outlet managers can read ledger for their outlet's reps
create policy "rep_commission_ledger: manager read"
  on public.rep_commission_ledger for select
  using (
    exists (
      select 1 from public.representatives r
      join public.outlet_staff os on os.outlet_id = r.outlet_id
      where r.id = rep_commission_ledger.rep_id
        and os.user_id = auth.uid()
        and os.is_manager = true
    )
  );

-- =============================================================================
-- 10. ITEM COMPONENTS
-- =============================================================================
alter table public.item_components enable row level security;

-- Anyone can read (needed for prep sheet generation by staff)
create policy "item_components: public read"
  on public.item_components for select
  using (true);

-- Admin full access
create policy "item_components: admin insert"
  on public.item_components for insert
  with check (is_admin());

create policy "item_components: admin update"
  on public.item_components for update
  using (is_admin())
  with check (is_admin());

create policy "item_components: admin delete"
  on public.item_components for delete
  using (is_admin());

-- Outlet managers can manage components (for prep sheet setup)
create policy "item_components: manager insert"
  on public.item_components for insert
  with check (
    exists (
      select 1 from public.outlet_staff os
      where os.user_id = auth.uid()
        and os.is_manager = true
    )
  );

create policy "item_components: manager update"
  on public.item_components for update
  using (
    exists (
      select 1 from public.outlet_staff os
      where os.user_id = auth.uid()
        and os.is_manager = true
    )
  );

create policy "item_components: manager delete"
  on public.item_components for delete
  using (
    exists (
      select 1 from public.outlet_staff os
      where os.user_id = auth.uid()
        and os.is_manager = true
    )
  );

-- =============================================================================
-- 11. GRANTS for helper functions
-- =============================================================================
revoke execute on function public.is_representative() from public, anon;
grant execute on function public.is_representative() to authenticated;

revoke execute on function public.is_outlet_manager_for_outlet(uuid) from public, anon;
grant execute on function public.is_outlet_manager_for_outlet(uuid) to authenticated;
