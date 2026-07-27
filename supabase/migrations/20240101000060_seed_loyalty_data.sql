-- Seed loyalty_tiers and loyalty_actions in production.
-- These tables are required for the loyalty system to function.
-- Previously the data only existed in seed.sql (dev-only).

-- Insert tiers if not already present
INSERT INTO public.loyalty_tiers (name, slug, min_lifetime_points, multiplier, benefits, sort_order)
VALUES
  ('Sprout Star', 'sprout_star', 0, 1.0, '["Basic rewards access"]'::jsonb, 1),
  ('Sprout Hero', 'sprout_hero', 500, 1.5, '["1.5x points multiplier", "Early access to new items", "Birthday bonus"]'::jsonb, 2),
  ('PNUT Legend', 'pnut_legend', 2000, 2.0, '["2x points multiplier", "Free packaging", "Priority orders", "Exclusive rewards"]'::jsonb, 3)
ON CONFLICT (slug) DO NOTHING;

-- Insert actions if not already present
INSERT INTO public.loyalty_actions (name, slug, description, points, event_type, max_per_day)
VALUES
  ('Place an Order', 'order_placed', 'Earn points for every order', 10, 'order_placed', null),
  ('First Order', 'first_order', 'Bonus points for your first order', 50, 'first_order', 1),
  ('Refer a Friend', 'referral', 'Earn when your friend signs up', 100, 'referral', null),
  ('Daily Check-in', 'daily_checkin', 'Open the app daily to earn', 5, 'daily_checkin', 1),
  ('Rate an Order', 'order_rated', 'Share your feedback', 5, 'order_rated', 3),
  ('Wallet Top-up', 'wallet_topup', 'Add money to wallet', 10, 'wallet_topup', 1)
ON CONFLICT (slug) DO NOTHING;

-- Revoke direct access to grant_referral_points from authenticated users.
-- This function awards arbitrary points without auth checks and must only be
-- called internally by other SECURITY DEFINER functions.
REVOKE EXECUTE ON FUNCTION public.grant_referral_points(uuid, int, text, text) FROM authenticated;
