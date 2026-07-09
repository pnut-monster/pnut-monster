-- Membership Journey Backend (Reward System 2)
-- Tier system based on order count within 6-month cycles

-- ─── App Settings for admin configurability ───
INSERT INTO public.app_settings (key, value) VALUES
  ('membership_enabled', 'true'),
  ('membership_tier1_threshold', '15'),
  ('membership_tier2_threshold', '25'),
  ('membership_bonus_pct', '5'),
  ('membership_cycle_months', '6')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ─── Membership Cycles table ───
CREATE TABLE IF NOT EXISTS public.membership_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cycle_start timestamptz NOT NULL DEFAULT now(),
  cycle_end timestamptz NOT NULL,
  starting_tier text NOT NULL DEFAULT 'sprout_star',
  current_tier text NOT NULL DEFAULT 'sprout_star',
  cycle_order_count int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_membership_cycles_user_active
  ON public.membership_cycles (user_id, is_active);

-- ─── RPC: Get user's current membership status ───
CREATE OR REPLACE FUNCTION public.get_membership_status(p_user_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_enabled boolean;
  v_tier1_threshold int;
  v_tier2_threshold int;
  v_bonus_pct numeric;
  v_cycle_months int;
  v_cycle membership_cycles%rowtype;
  v_current_tier text;
  v_cycle_order_count int;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
BEGIN
  -- Check if membership system is enabled
  SELECT coalesce((SELECT value FROM app_settings WHERE key = 'membership_enabled'), 'true')::boolean INTO v_enabled;
  IF NOT v_enabled THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;

  -- Load settings
  SELECT coalesce((SELECT value FROM app_settings WHERE key = 'membership_tier1_threshold'), '15')::int INTO v_tier1_threshold;
  SELECT coalesce((SELECT value FROM app_settings WHERE key = 'membership_tier2_threshold'), '25')::int INTO v_tier2_threshold;
  SELECT coalesce((SELECT value FROM app_settings WHERE key = 'membership_bonus_pct'), '5')::numeric INTO v_bonus_pct;
  SELECT coalesce((SELECT value FROM app_settings WHERE key = 'membership_cycle_months'), '6')::int INTO v_cycle_months;

  -- Find active cycle
  SELECT * INTO v_cycle FROM membership_cycles
    WHERE user_id = p_user_id AND is_active = true
    ORDER BY cycle_start DESC LIMIT 1;

  -- If no active cycle, create one
  IF NOT FOUND THEN
    INSERT INTO membership_cycles (user_id, cycle_start, cycle_end, starting_tier, current_tier, cycle_order_count)
    VALUES (
      p_user_id,
      now(),
      now() + (v_cycle_months || ' months')::interval,
      'sprout_star',
      'sprout_star',
      0
    )
    RETURNING * INTO v_cycle;
  END IF;

  v_current_tier := v_cycle.current_tier;
  v_cycle_order_count := v_cycle.cycle_order_count;
  v_cycle_start := v_cycle.cycle_start;
  v_cycle_end := v_cycle.cycle_end;

  RETURN jsonb_build_object(
    'enabled', true,
    'current_tier', v_current_tier,
    'cycle_order_count', v_cycle_order_count,
    'cycle_start', v_cycle_start,
    'cycle_end', v_cycle_end,
    'tier1_threshold', v_tier1_threshold,
    'tier2_threshold', v_tier2_threshold,
    'bonus_pct', v_bonus_pct,
    'cycle_months', v_cycle_months,
    'has_bonus', v_current_tier IN ('sprout_hero', 'pnut_legend'),
    'goodie_eligible', v_current_tier = 'pnut_legend'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Function: Award tier bonus points on order pickup ───
CREATE OR REPLACE FUNCTION public.award_membership_bonus()
RETURNS trigger AS $$
DECLARE
  v_enabled boolean;
  v_tier1_threshold int;
  v_tier2_threshold int;
  v_bonus_pct numeric;
  v_cycle_months int;
  v_cycle membership_cycles%rowtype;
  v_bonus_points int;
  v_order_total numeric;
  v_account loyalty_accounts%rowtype;
  v_new_balance int;
BEGIN
  -- Only fire when status changes to 'picked_up'
  IF NEW.status <> 'picked_up' OR OLD.status = 'picked_up' THEN
    RETURN NEW;
  END IF;

  -- Check if membership system is enabled
  SELECT coalesce((SELECT value FROM app_settings WHERE key = 'membership_enabled'), 'true')::boolean INTO v_enabled;
  IF NOT v_enabled THEN
    RETURN NEW;
  END IF;

  -- Load settings
  SELECT coalesce((SELECT value FROM app_settings WHERE key = 'membership_tier1_threshold'), '15')::int INTO v_tier1_threshold;
  SELECT coalesce((SELECT value FROM app_settings WHERE key = 'membership_tier2_threshold'), '25')::int INTO v_tier2_threshold;
  SELECT coalesce((SELECT value FROM app_settings WHERE key = 'membership_bonus_pct'), '5')::numeric INTO v_bonus_pct;
  SELECT coalesce((SELECT value FROM app_settings WHERE key = 'membership_cycle_months'), '6')::int INTO v_cycle_months;

  -- Find or create active cycle
  SELECT * INTO v_cycle FROM membership_cycles
    WHERE user_id = NEW.user_id AND is_active = true
    ORDER BY cycle_start DESC LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO membership_cycles (user_id, cycle_start, cycle_end, starting_tier, current_tier, cycle_order_count)
    VALUES (
      NEW.user_id,
      now(),
      now() + (v_cycle_months || ' months')::interval,
      'sprout_star',
      'sprout_star',
      0
    )
    RETURNING * INTO v_cycle;
  END IF;

  -- Increment order count in cycle
  UPDATE membership_cycles
    SET cycle_order_count = cycle_order_count + 1,
        updated_at = now()
    WHERE id = v_cycle.id;

  v_cycle.cycle_order_count := v_cycle.cycle_order_count + 1;

  -- Determine new tier based on updated order count
  IF v_cycle.cycle_order_count >= v_tier2_threshold THEN
    UPDATE membership_cycles SET current_tier = 'pnut_legend', updated_at = now() WHERE id = v_cycle.id;
    v_cycle.current_tier := 'pnut_legend';
  ELSIF v_cycle.cycle_order_count >= v_tier1_threshold THEN
    UPDATE membership_cycles SET current_tier = 'sprout_hero', updated_at = now() WHERE id = v_cycle.id;
    v_cycle.current_tier := 'sprout_hero';
  END IF;

  -- Award bonus points if user is Sprout Hero or PNUT Legend
  IF v_cycle.current_tier IN ('sprout_hero', 'pnut_legend') THEN
    v_order_total := NEW.subtotal;
    v_bonus_points := GREATEST(1, round(v_order_total * v_bonus_pct / 100));

    -- Credit to loyalty_accounts
    SELECT * INTO v_account FROM loyalty_accounts WHERE user_id = NEW.user_id;
    IF FOUND THEN
      v_new_balance := v_account.current_points + v_bonus_points;

      UPDATE loyalty_accounts
        SET current_points = v_new_balance,
            lifetime_points = lifetime_points + v_bonus_points,
            updated_at = now()
        WHERE id = v_account.id;

      -- Log in loyalty_ledger
      INSERT INTO loyalty_ledger (user_id, type, points, monetary_value, balance_after, source, order_id, description)
      VALUES (
        NEW.user_id,
        'earn',
        v_bonus_points,
        0,
        v_new_balance,
        'membership_bonus',
        NEW.id,
        'Membership bonus (' || v_bonus_pct || '%) - ' || initcap(replace(v_cycle.current_tier, '_', ' '))
      );

      -- Also log in loyalty_points_log for user history
      INSERT INTO loyalty_points_log (user_id, points, description, reference_id)
      VALUES (
        NEW.user_id,
        v_bonus_points,
        'Membership bonus (' || v_bonus_pct || '%) - ' || initcap(replace(v_cycle.current_tier, '_', ' ')),
        NEW.id::text
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Trigger: fire on order status update ───
CREATE TRIGGER orders_membership_bonus
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.award_membership_bonus();

-- ─── Function: Renew membership cycles (for daily scheduled job) ───
CREATE OR REPLACE FUNCTION public.renew_expired_membership_cycles()
RETURNS jsonb AS $$
DECLARE
  v_cycle membership_cycles%rowtype;
  v_cycle_months int;
  v_new_starting_tier text;
  v_renewed_count int := 0;
BEGIN
  SELECT coalesce((SELECT value FROM app_settings WHERE key = 'membership_cycle_months'), '6')::int INTO v_cycle_months;

  FOR v_cycle IN
    SELECT * FROM membership_cycles
    WHERE is_active = true AND cycle_end < now()
  LOOP
    -- Determine starting tier for next cycle based on rules:
    -- Sprout Star -> Sprout Star
    -- Sprout Hero -> Sprout Hero (carries forward)
    -- PNUT Legend -> Sprout Hero (must re-earn Legend)
    CASE v_cycle.current_tier
      WHEN 'pnut_legend' THEN v_new_starting_tier := 'sprout_hero';
      WHEN 'sprout_hero' THEN v_new_starting_tier := 'sprout_hero';
      ELSE v_new_starting_tier := 'sprout_star';
    END CASE;

    -- Deactivate old cycle
    UPDATE membership_cycles
      SET is_active = false, updated_at = now()
      WHERE id = v_cycle.id;

    -- Create new cycle
    INSERT INTO membership_cycles (user_id, cycle_start, cycle_end, starting_tier, current_tier, cycle_order_count)
    VALUES (
      v_cycle.user_id,
      now(),
      now() + (v_cycle_months || ' months')::interval,
      v_new_starting_tier,
      v_new_starting_tier,
      0
    );

    v_renewed_count := v_renewed_count + 1;
  END LOOP;

  RETURN jsonb_build_object('renewed_count', v_renewed_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── RPC: Admin can manually trigger renewal check ───
CREATE OR REPLACE FUNCTION public.check_membership_renewals()
RETURNS jsonb AS $$
BEGIN
  RETURN public.renew_expired_membership_cycles();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
