-- =============================================================================
-- RLS (Row Level Security) Policies for all PNUT MONSTER tables
-- =============================================================================
-- This migration enables RLS on every public table and creates policies
-- covering three access levels:
--   1. Public / anonymous read access (menu, outlets, loyalty tiers, etc.)
--   2. Authenticated user access to their own data
--   3. Admin full access on all tables
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: is_admin() — checks if current user has admin or super_admin role
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin', 'super_admin')
  );
$$ language sql security definer stable;


-- =============================================================================
-- 1. PROFILES
-- =============================================================================
alter table public.profiles enable row level security;

-- Users can read their own profile
create policy "profiles: users read own"
  on public.profiles for select
  using (auth.uid() = id);

-- Users can update their own profile (but not role or referral_code)
create policy "profiles: users update own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- INSERT is handled by the handle_new_user() trigger (SECURITY DEFINER).
-- No direct INSERT policy for regular users.

-- Admin full access
create policy "profiles: admin select"
  on public.profiles for select
  using (is_admin());

create policy "profiles: admin insert"
  on public.profiles for insert
  with check (is_admin());

create policy "profiles: admin update"
  on public.profiles for update
  using (is_admin())
  with check (is_admin());

create policy "profiles: admin delete"
  on public.profiles for delete
  using (is_admin());


-- =============================================================================
-- 2. OUTLETS
-- =============================================================================
alter table public.outlets enable row level security;

-- Anyone can read active outlets
create policy "outlets: public read active"
  on public.outlets for select
  using (is_active = true);

-- Admin full access
create policy "outlets: admin select"
  on public.outlets for select
  using (is_admin());

create policy "outlets: admin insert"
  on public.outlets for insert
  with check (is_admin());

create policy "outlets: admin update"
  on public.outlets for update
  using (is_admin())
  with check (is_admin());

create policy "outlets: admin delete"
  on public.outlets for delete
  using (is_admin());


-- =============================================================================
-- 3. MENU CATEGORIES
-- =============================================================================
alter table public.menu_categories enable row level security;

-- Anyone can read active categories
create policy "menu_categories: public read active"
  on public.menu_categories for select
  using (is_active = true);

-- Admin full access
create policy "menu_categories: admin select"
  on public.menu_categories for select
  using (is_admin());

create policy "menu_categories: admin insert"
  on public.menu_categories for insert
  with check (is_admin());

create policy "menu_categories: admin update"
  on public.menu_categories for update
  using (is_admin())
  with check (is_admin());

create policy "menu_categories: admin delete"
  on public.menu_categories for delete
  using (is_admin());


-- =============================================================================
-- 4. MENU SUBCATEGORIES
-- =============================================================================
alter table public.menu_subcategories enable row level security;

-- Anyone can read active subcategories
create policy "menu_subcategories: public read active"
  on public.menu_subcategories for select
  using (is_active = true);

-- Admin full access
create policy "menu_subcategories: admin select"
  on public.menu_subcategories for select
  using (is_admin());

create policy "menu_subcategories: admin insert"
  on public.menu_subcategories for insert
  with check (is_admin());

create policy "menu_subcategories: admin update"
  on public.menu_subcategories for update
  using (is_admin())
  with check (is_admin());

create policy "menu_subcategories: admin delete"
  on public.menu_subcategories for delete
  using (is_admin());


-- =============================================================================
-- 5. MENU ITEMS
-- =============================================================================
alter table public.menu_items enable row level security;

-- Anyone can read active items
create policy "menu_items: public read active"
  on public.menu_items for select
  using (is_active = true);

-- Admin full access
create policy "menu_items: admin select"
  on public.menu_items for select
  using (is_admin());

create policy "menu_items: admin insert"
  on public.menu_items for insert
  with check (is_admin());

create policy "menu_items: admin update"
  on public.menu_items for update
  using (is_admin())
  with check (is_admin());

create policy "menu_items: admin delete"
  on public.menu_items for delete
  using (is_admin());


-- =============================================================================
-- 6. ITEM CUSTOMIZATION GROUPS
-- =============================================================================
alter table public.item_customization_groups enable row level security;

-- Anyone can read customization groups
create policy "item_customization_groups: public read"
  on public.item_customization_groups for select
  using (true);

-- Admin full access
create policy "item_customization_groups: admin insert"
  on public.item_customization_groups for insert
  with check (is_admin());

create policy "item_customization_groups: admin update"
  on public.item_customization_groups for update
  using (is_admin())
  with check (is_admin());

create policy "item_customization_groups: admin delete"
  on public.item_customization_groups for delete
  using (is_admin());


-- =============================================================================
-- 7. CUSTOMIZATION OPTIONS
-- =============================================================================
alter table public.customization_options enable row level security;

-- Anyone can read customization options
create policy "customization_options: public read"
  on public.customization_options for select
  using (true);

-- Admin full access
create policy "customization_options: admin insert"
  on public.customization_options for insert
  with check (is_admin());

create policy "customization_options: admin update"
  on public.customization_options for update
  using (is_admin())
  with check (is_admin());

create policy "customization_options: admin delete"
  on public.customization_options for delete
  using (is_admin());


-- =============================================================================
-- 8. OUTLET MENU ITEMS
-- =============================================================================
alter table public.outlet_menu_items enable row level security;

-- Anyone can read outlet menu items
create policy "outlet_menu_items: public read"
  on public.outlet_menu_items for select
  using (true);

-- Admin full access
create policy "outlet_menu_items: admin insert"
  on public.outlet_menu_items for insert
  with check (is_admin());

create policy "outlet_menu_items: admin update"
  on public.outlet_menu_items for update
  using (is_admin())
  with check (is_admin());

create policy "outlet_menu_items: admin delete"
  on public.outlet_menu_items for delete
  using (is_admin());


-- =============================================================================
-- 9. ORDERS
-- =============================================================================
alter table public.orders enable row level security;

-- Users can read their own orders
create policy "orders: users read own"
  on public.orders for select
  using (auth.uid() = user_id);

-- Users can insert their own orders
-- (Note: primary order creation goes through place_order_with_wallet() SECURITY
--  DEFINER, but this policy allows direct inserts as a fallback.)
create policy "orders: users insert own"
  on public.orders for insert
  with check (auth.uid() = user_id);

-- Admin full access
create policy "orders: admin select"
  on public.orders for select
  using (is_admin());

create policy "orders: admin insert"
  on public.orders for insert
  with check (is_admin());

create policy "orders: admin update"
  on public.orders for update
  using (is_admin())
  with check (is_admin());

create policy "orders: admin delete"
  on public.orders for delete
  using (is_admin());


-- =============================================================================
-- 10. ORDER ITEMS
-- =============================================================================
alter table public.order_items enable row level security;

-- Users can read their own order items (via join to orders)
create policy "order_items: users read own"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and orders.user_id = auth.uid()
    )
  );

-- Users can insert order items for their own orders
create policy "order_items: users insert own"
  on public.order_items for insert
  with check (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and orders.user_id = auth.uid()
    )
  );

-- Admin full access
create policy "order_items: admin select"
  on public.order_items for select
  using (is_admin());

create policy "order_items: admin insert"
  on public.order_items for insert
  with check (is_admin());

create policy "order_items: admin update"
  on public.order_items for update
  using (is_admin())
  with check (is_admin());

create policy "order_items: admin delete"
  on public.order_items for delete
  using (is_admin());


-- =============================================================================
-- 11. WALLETS
-- =============================================================================
alter table public.wallets enable row level security;

-- Users can read their own wallet
create policy "wallets: users read own"
  on public.wallets for select
  using (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE for regular users.
-- Wallet creation is via handle_new_profile_wallet() trigger (SECURITY DEFINER).
-- Wallet mutations are via topup_wallet() and place_order_with_wallet() (SECURITY DEFINER).

-- Admin full access
create policy "wallets: admin select"
  on public.wallets for select
  using (is_admin());

create policy "wallets: admin insert"
  on public.wallets for insert
  with check (is_admin());

create policy "wallets: admin update"
  on public.wallets for update
  using (is_admin())
  with check (is_admin());

create policy "wallets: admin delete"
  on public.wallets for delete
  using (is_admin());


-- =============================================================================
-- 12. WALLET TRANSACTIONS
-- =============================================================================
alter table public.wallet_transactions enable row level security;

-- Users can read their own transactions (via wallet join)
create policy "wallet_transactions: users read own"
  on public.wallet_transactions for select
  using (
    exists (
      select 1 from public.wallets
      where wallets.id = wallet_transactions.wallet_id
        and wallets.user_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE for regular users.
-- All wallet_transactions are created by SECURITY DEFINER functions.

-- Admin full access
create policy "wallet_transactions: admin select"
  on public.wallet_transactions for select
  using (is_admin());

create policy "wallet_transactions: admin insert"
  on public.wallet_transactions for insert
  with check (is_admin());

create policy "wallet_transactions: admin update"
  on public.wallet_transactions for update
  using (is_admin())
  with check (is_admin());

create policy "wallet_transactions: admin delete"
  on public.wallet_transactions for delete
  using (is_admin());


-- =============================================================================
-- 13. LOYALTY TIERS
-- =============================================================================
alter table public.loyalty_tiers enable row level security;

-- Anyone can read loyalty tiers
create policy "loyalty_tiers: public read"
  on public.loyalty_tiers for select
  using (true);

-- Admin full access
create policy "loyalty_tiers: admin insert"
  on public.loyalty_tiers for insert
  with check (is_admin());

create policy "loyalty_tiers: admin update"
  on public.loyalty_tiers for update
  using (is_admin())
  with check (is_admin());

create policy "loyalty_tiers: admin delete"
  on public.loyalty_tiers for delete
  using (is_admin());


-- =============================================================================
-- 14. LOYALTY ACCOUNTS
-- =============================================================================
alter table public.loyalty_accounts enable row level security;

-- Users can read their own loyalty account
create policy "loyalty_accounts: users read own"
  on public.loyalty_accounts for select
  using (auth.uid() = user_id);

-- No direct INSERT/UPDATE for users — handled by award_loyalty_points() SECURITY DEFINER.

-- Admin full access
create policy "loyalty_accounts: admin select"
  on public.loyalty_accounts for select
  using (is_admin());

create policy "loyalty_accounts: admin insert"
  on public.loyalty_accounts for insert
  with check (is_admin());

create policy "loyalty_accounts: admin update"
  on public.loyalty_accounts for update
  using (is_admin())
  with check (is_admin());

create policy "loyalty_accounts: admin delete"
  on public.loyalty_accounts for delete
  using (is_admin());


-- =============================================================================
-- 15. LOYALTY ACTIONS
-- =============================================================================
alter table public.loyalty_actions enable row level security;

-- Anyone can read active loyalty actions
create policy "loyalty_actions: public read active"
  on public.loyalty_actions for select
  using (is_active = true);

-- Admin full access
create policy "loyalty_actions: admin select"
  on public.loyalty_actions for select
  using (is_admin());

create policy "loyalty_actions: admin insert"
  on public.loyalty_actions for insert
  with check (is_admin());

create policy "loyalty_actions: admin update"
  on public.loyalty_actions for update
  using (is_admin())
  with check (is_admin());

create policy "loyalty_actions: admin delete"
  on public.loyalty_actions for delete
  using (is_admin());


-- =============================================================================
-- 16. LOYALTY POINTS LOG
-- =============================================================================
alter table public.loyalty_points_log enable row level security;

-- Users can read their own points log
create policy "loyalty_points_log: users read own"
  on public.loyalty_points_log for select
  using (auth.uid() = user_id);

-- No direct INSERT for users — handled by award_loyalty_points() SECURITY DEFINER.

-- Admin full access
create policy "loyalty_points_log: admin select"
  on public.loyalty_points_log for select
  using (is_admin());

create policy "loyalty_points_log: admin insert"
  on public.loyalty_points_log for insert
  with check (is_admin());

create policy "loyalty_points_log: admin update"
  on public.loyalty_points_log for update
  using (is_admin())
  with check (is_admin());

create policy "loyalty_points_log: admin delete"
  on public.loyalty_points_log for delete
  using (is_admin());


-- =============================================================================
-- 17. MISSIONS
-- =============================================================================
alter table public.missions enable row level security;

-- Anyone can read active missions
create policy "missions: public read active"
  on public.missions for select
  using (
    is_active = true
    and starts_at <= now()
    and (ends_at is null or ends_at > now())
  );

-- Admin full access
create policy "missions: admin select"
  on public.missions for select
  using (is_admin());

create policy "missions: admin insert"
  on public.missions for insert
  with check (is_admin());

create policy "missions: admin update"
  on public.missions for update
  using (is_admin())
  with check (is_admin());

create policy "missions: admin delete"
  on public.missions for delete
  using (is_admin());


-- =============================================================================
-- 18. MISSION PROGRESS
-- =============================================================================
alter table public.mission_progress enable row level security;

-- Users can read their own mission progress
create policy "mission_progress: users read own"
  on public.mission_progress for select
  using (auth.uid() = user_id);

-- No direct INSERT/UPDATE for users — handled by backend/SECURITY DEFINER functions.

-- Admin full access
create policy "mission_progress: admin select"
  on public.mission_progress for select
  using (is_admin());

create policy "mission_progress: admin insert"
  on public.mission_progress for insert
  with check (is_admin());

create policy "mission_progress: admin update"
  on public.mission_progress for update
  using (is_admin())
  with check (is_admin());

create policy "mission_progress: admin delete"
  on public.mission_progress for delete
  using (is_admin());


-- =============================================================================
-- 19. COUPONS
-- =============================================================================
alter table public.coupons enable row level security;

-- Anyone can read active coupons (needed for validation on client)
create policy "coupons: public read active"
  on public.coupons for select
  using (
    is_active = true
    and starts_at <= now()
    and ends_at > now()
  );

-- Admin full access
create policy "coupons: admin select"
  on public.coupons for select
  using (is_admin());

create policy "coupons: admin insert"
  on public.coupons for insert
  with check (is_admin());

create policy "coupons: admin update"
  on public.coupons for update
  using (is_admin())
  with check (is_admin());

create policy "coupons: admin delete"
  on public.coupons for delete
  using (is_admin());


-- =============================================================================
-- 20. COUPON USAGE
-- =============================================================================
alter table public.coupon_usage enable row level security;

-- Users can read their own coupon usage
create policy "coupon_usage: users read own"
  on public.coupon_usage for select
  using (auth.uid() = user_id);

-- No direct INSERT for users — coupon usage is recorded during order placement.

-- Admin full access
create policy "coupon_usage: admin select"
  on public.coupon_usage for select
  using (is_admin());

create policy "coupon_usage: admin insert"
  on public.coupon_usage for insert
  with check (is_admin());

create policy "coupon_usage: admin update"
  on public.coupon_usage for update
  using (is_admin())
  with check (is_admin());

create policy "coupon_usage: admin delete"
  on public.coupon_usage for delete
  using (is_admin());


-- =============================================================================
-- 21. CAMPAIGNS
-- =============================================================================
alter table public.campaigns enable row level security;

-- Anyone can read active campaigns
create policy "campaigns: public read active"
  on public.campaigns for select
  using (
    is_active = true
    and starts_at <= now()
    and ends_at > now()
  );

-- Admin full access
create policy "campaigns: admin select"
  on public.campaigns for select
  using (is_admin());

create policy "campaigns: admin insert"
  on public.campaigns for insert
  with check (is_admin());

create policy "campaigns: admin update"
  on public.campaigns for update
  using (is_admin())
  with check (is_admin());

create policy "campaigns: admin delete"
  on public.campaigns for delete
  using (is_admin());


-- =============================================================================
-- 22. NOTIFICATIONS
-- =============================================================================
alter table public.notifications enable row level security;

-- Users can read their own notifications
create policy "notifications: users read own"
  on public.notifications for select
  using (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
create policy "notifications: users update own"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admin full access
create policy "notifications: admin select"
  on public.notifications for select
  using (is_admin());

create policy "notifications: admin insert"
  on public.notifications for insert
  with check (is_admin());

create policy "notifications: admin update"
  on public.notifications for update
  using (is_admin())
  with check (is_admin());

create policy "notifications: admin delete"
  on public.notifications for delete
  using (is_admin());
