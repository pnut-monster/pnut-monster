-- Allow admin/super_admin users to see and manage orders in the restaurant panel
-- even without being in outlet_staff table and without AAL2.
-- The restaurant panel runs at AAL1, so the existing is_admin() check (which
-- requires AAL2 when 2FA is enabled) won't work for restaurant panel access.

-- Helper: returns true if the user is admin/super_admin regardless of AAL level
create or replace function public.is_admin_role()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('admin', 'super_admin')
  );
$$;

revoke all on function public.is_admin_role() from public;
grant execute on function public.is_admin_role() to authenticated;

-- Update staff order policies to also allow admin-role users
drop policy if exists "orders: staff read outlet orders" on public.orders;
create policy "orders: staff read outlet orders"
  on public.orders for select
  using (
    public.is_admin_role()
    or exists (
      select 1 from public.outlet_staff
      where outlet_staff.outlet_id = orders.outlet_id
        and outlet_staff.user_id = (select auth.uid())
    )
  );

drop policy if exists "orders: staff update outlet orders" on public.orders;
create policy "orders: staff update outlet orders"
  on public.orders for update
  using (
    public.is_admin_role()
    or exists (
      select 1 from public.outlet_staff
      where outlet_staff.outlet_id = orders.outlet_id
        and outlet_staff.user_id = (select auth.uid())
    )
  );

drop policy if exists "order_items: staff read outlet order items" on public.order_items;
create policy "order_items: staff read outlet order items"
  on public.order_items for select
  using (
    public.is_admin_role()
    or exists (
      select 1 from public.orders
      join public.outlet_staff on outlet_staff.outlet_id = orders.outlet_id
      where orders.id = order_items.order_id
        and outlet_staff.user_id = (select auth.uid())
    )
  );
