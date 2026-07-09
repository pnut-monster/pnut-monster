-- Add 'rejected' to order status options
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending', 'confirmed', 'preparing', 'ready', 'picked_up', 'cancelled', 'rejected'));
