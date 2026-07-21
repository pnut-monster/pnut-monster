-- RLS policies allowing outlet staff to read and update orders for their assigned outlets

-- Production may already contain these policies from an earlier manual rollout.
drop policy if exists "orders: staff read outlet orders" on public.orders;
drop policy if exists "orders: staff update outlet orders" on public.orders;
drop policy if exists "order_items: staff read outlet order items" on public.order_items;

-- Staff can read orders for their assigned outlets
CREATE POLICY "orders: staff read outlet orders"
  ON public.orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.outlet_staff
      WHERE outlet_staff.outlet_id = orders.outlet_id
        AND outlet_staff.user_id = auth.uid()
    )
  );

-- Staff can update orders for their assigned outlets (accept, prepare, ready, etc.)
CREATE POLICY "orders: staff update outlet orders"
  ON public.orders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.outlet_staff
      WHERE outlet_staff.outlet_id = orders.outlet_id
        AND outlet_staff.user_id = auth.uid()
    )
  );

-- Staff can read order items for their assigned outlets
CREATE POLICY "order_items: staff read outlet order items"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      JOIN public.outlet_staff ON outlet_staff.outlet_id = orders.outlet_id
      WHERE orders.id = order_items.order_id
        AND outlet_staff.user_id = auth.uid()
    )
  );
