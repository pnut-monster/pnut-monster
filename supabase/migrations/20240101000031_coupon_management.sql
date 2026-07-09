-- Extended Coupon Management System
-- Adds new columns to coupons (all nullable for backward compatibility)
-- Adds supporting tables for campaigns, outlet restrictions, audit logs

-- ─── Coupon Campaigns table (must come before ALTER on coupons) ───
CREATE TABLE IF NOT EXISTS public.coupon_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  banner_url text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'ended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Extend coupons table with new nullable columns ───
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS discount_type_ext text CHECK (discount_type_ext IN ('percentage', 'flat', 'free_delivery', 'buy_x_get_y', 'free_product')),
  ADD COLUMN IF NOT EXISTS min_cart_value numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS per_user_limit int,
  ADD COLUMN IF NOT EXISTS daily_limit int,
  ADD COLUMN IF NOT EXISTS priority int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'expired', 'archived')),
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.coupon_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_eligibility text DEFAULT 'all' CHECK (customer_eligibility IN ('all', 'new', 'existing', 'premium', 'student')),
  ADD COLUMN IF NOT EXISTS buy_x_qty int,
  ADD COLUMN IF NOT EXISTS get_y_qty int,
  ADD COLUMN IF NOT EXISTS free_product_id uuid,
  ADD COLUMN IF NOT EXISTS applicable_type text DEFAULT 'all' CHECK (applicable_type IN ('all', 'products', 'categories')),
  ADD COLUMN IF NOT EXISTS applicable_product_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS applicable_category_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ─── Coupon Outlet Restrictions ───
CREATE TABLE IF NOT EXISTS public.coupon_outlet_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(coupon_id, outlet_id)
);

CREATE INDEX IF NOT EXISTS idx_coupon_outlet_coupon ON public.coupon_outlet_restrictions(coupon_id);

-- ─── Coupon Audit Logs ───
CREATE TABLE IF NOT EXISTS public.coupon_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL,
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  admin_name text,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'activated', 'paused', 'archived', 'deleted', 'duplicated', 'campaign_changed', 'outlet_changed')),
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupon_audit_coupon ON public.coupon_audit_logs(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_audit_created ON public.coupon_audit_logs(created_at DESC);

-- ─── RLS Policies ───
ALTER TABLE public.coupon_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_outlet_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coupon_campaigns: admin select" ON public.coupon_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "coupon_campaigns: admin insert" ON public.coupon_campaigns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "coupon_campaigns: admin update" ON public.coupon_campaigns FOR UPDATE TO authenticated USING (true);
CREATE POLICY "coupon_campaigns: admin delete" ON public.coupon_campaigns FOR DELETE TO authenticated USING (true);

CREATE POLICY "coupon_outlet_restrictions: admin select" ON public.coupon_outlet_restrictions FOR SELECT TO authenticated USING (true);
CREATE POLICY "coupon_outlet_restrictions: admin insert" ON public.coupon_outlet_restrictions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "coupon_outlet_restrictions: admin update" ON public.coupon_outlet_restrictions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "coupon_outlet_restrictions: admin delete" ON public.coupon_outlet_restrictions FOR DELETE TO authenticated USING (true);

CREATE POLICY "coupon_audit_logs: admin select" ON public.coupon_audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "coupon_audit_logs: admin insert" ON public.coupon_audit_logs FOR INSERT TO authenticated WITH CHECK (true);
