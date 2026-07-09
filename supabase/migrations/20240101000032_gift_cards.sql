-- Gift Card Management System
-- Completely independent from the Coupon system

-- ─── Gift Card Templates ───
CREATE TABLE IF NOT EXISTS public.gift_card_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  purchase_price numeric(10,2) NOT NULL DEFAULT 0,
  wallet_credit numeric(10,2) NOT NULL,
  validity_days int NOT NULL DEFAULT 365,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Gift Card Batches ───
CREATE TABLE IF NOT EXISTS public.gift_card_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.gift_card_templates(id) ON DELETE RESTRICT,
  batch_name text NOT NULL,
  quantity int NOT NULL,
  code_format text NOT NULL DEFAULT 'alphanumeric_12' CHECK (code_format IN ('alphanumeric_12', 'numeric_12', 'prefix_alphanumeric', 'prefix_3_numeric')),
  code_prefix text,
  generated_count int NOT NULL DEFAULT 0,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Gift Cards ───
CREATE TABLE IF NOT EXISTS public.gift_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_card_id text NOT NULL UNIQUE,
  redeem_code text NOT NULL UNIQUE,
  template_id uuid NOT NULL REFERENCES public.gift_card_templates(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES public.gift_card_batches(id) ON DELETE RESTRICT,
  purchase_price numeric(10,2) NOT NULL DEFAULT 0,
  wallet_credit numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'active', 'reserved', 'sold', 'redeemed', 'expired', 'cancelled')),
  expires_at timestamptz NOT NULL,
  redeemed_by uuid REFERENCES auth.users(id),
  redeemed_at timestamptz,
  sold_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gift_cards_redeem_code ON public.gift_cards(redeem_code);
CREATE INDEX IF NOT EXISTS idx_gift_cards_gift_card_id ON public.gift_cards(gift_card_id);
CREATE INDEX IF NOT EXISTS idx_gift_cards_status ON public.gift_cards(status);
CREATE INDEX IF NOT EXISTS idx_gift_cards_batch ON public.gift_cards(batch_id);
CREATE INDEX IF NOT EXISTS idx_gift_cards_template ON public.gift_cards(template_id);
CREATE INDEX IF NOT EXISTS idx_gift_cards_redeemed_by ON public.gift_cards(redeemed_by);

-- ─── Gift Card Audit Logs ───
CREATE TABLE IF NOT EXISTS public.gift_card_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('template', 'batch', 'gift_card')),
  entity_id uuid NOT NULL,
  admin_id uuid REFERENCES auth.users(id),
  admin_name text,
  action text NOT NULL CHECK (action IN ('template_created', 'template_updated', 'batch_generated', 'card_activated', 'card_sold', 'card_redeemed', 'card_expired', 'card_cancelled', 'status_changed')),
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gift_card_audit_entity ON public.gift_card_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_gift_card_audit_created ON public.gift_card_audit_logs(created_at DESC);

-- ─── RLS Policies ───
ALTER TABLE public.gift_card_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_card_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_card_audit_logs ENABLE ROW LEVEL SECURITY;

-- Templates: admin full access
CREATE POLICY "gift_card_templates: auth select" ON public.gift_card_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "gift_card_templates: auth insert" ON public.gift_card_templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "gift_card_templates: auth update" ON public.gift_card_templates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "gift_card_templates: auth delete" ON public.gift_card_templates FOR DELETE TO authenticated USING (true);

-- Batches: admin full access
CREATE POLICY "gift_card_batches: auth select" ON public.gift_card_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "gift_card_batches: auth insert" ON public.gift_card_batches FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "gift_card_batches: auth update" ON public.gift_card_batches FOR UPDATE TO authenticated USING (true);
CREATE POLICY "gift_card_batches: auth delete" ON public.gift_card_batches FOR DELETE TO authenticated USING (true);

-- Gift cards: admin full access, users can read their own redeemed cards
CREATE POLICY "gift_cards: auth select" ON public.gift_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "gift_cards: auth insert" ON public.gift_cards FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "gift_cards: auth update" ON public.gift_cards FOR UPDATE TO authenticated USING (true);
CREATE POLICY "gift_cards: auth delete" ON public.gift_cards FOR DELETE TO authenticated USING (true);

-- Audit logs: admin read and insert
CREATE POLICY "gift_card_audit_logs: auth select" ON public.gift_card_audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "gift_card_audit_logs: auth insert" ON public.gift_card_audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- ─── RPC: Generate a batch of gift cards ───
CREATE OR REPLACE FUNCTION public.generate_gift_card_batch(
  p_template_id uuid,
  p_batch_name text,
  p_quantity int,
  p_code_format text DEFAULT 'alphanumeric_12',
  p_code_prefix text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_template gift_card_templates%rowtype;
  v_batch_id uuid;
  v_year text;
  v_seq int;
  v_gift_card_id text;
  v_redeem_code text;
  v_expires_at timestamptz;
  v_generated int := 0;
  v_user_id uuid;
BEGIN
  -- Validate template
  SELECT * INTO v_template FROM gift_card_templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;
  IF v_template.status <> 'active' THEN
    RAISE EXCEPTION 'Template is not active';
  END IF;

  -- Get current user
  SELECT auth.uid() INTO v_user_id;

  -- Create batch
  INSERT INTO gift_card_batches (template_id, batch_name, quantity, code_format, code_prefix, generated_count, created_by)
  VALUES (p_template_id, p_batch_name, p_quantity, p_code_format, p_code_prefix, 0, v_user_id)
  RETURNING id INTO v_batch_id;

  -- Get year and current max sequence
  v_year := to_char(now(), 'YYYY');
  SELECT COALESCE(MAX(
    CASE WHEN gift_card_id LIKE 'GC-' || v_year || '-%'
    THEN (substring(gift_card_id from 9))::int
    ELSE 0 END
  ), 0) INTO v_seq FROM gift_cards;

  -- Calculate expiry
  v_expires_at := now() + (v_template.validity_days || ' days')::interval;

  -- Generate cards
  FOR i IN 1..p_quantity LOOP
    v_seq := v_seq + 1;
    v_gift_card_id := 'GC-' || v_year || '-' || lpad(v_seq::text, 6, '0');

    -- Generate redeem code based on format
    CASE p_code_format
      WHEN 'alphanumeric_12' THEN
        v_redeem_code := upper(substr(md5(gen_random_uuid()::text), 1, 12));
      WHEN 'numeric_12' THEN
        v_redeem_code := lpad((floor(random() * 999999999999)::bigint)::text, 12, '0');
      WHEN 'prefix_alphanumeric' THEN
        v_redeem_code := COALESCE(p_code_prefix, 'GC') || upper(substr(md5(gen_random_uuid()::text), 1, 12 - length(COALESCE(p_code_prefix, 'GC'))));
      WHEN 'prefix_3_numeric' THEN
        v_redeem_code := COALESCE(left(p_code_prefix, 3), 'GCR') || lpad((floor(random() * 999999999)::bigint)::text, 9, '0');
      ELSE
        v_redeem_code := upper(substr(md5(gen_random_uuid()::text), 1, 12));
    END CASE;

    -- Ensure uniqueness (retry once on collision)
    IF EXISTS (SELECT 1 FROM gift_cards WHERE redeem_code = v_redeem_code) THEN
      v_redeem_code := upper(substr(md5(gen_random_uuid()::text || i::text), 1, 12));
    END IF;

    INSERT INTO gift_cards (gift_card_id, redeem_code, template_id, batch_id, purchase_price, wallet_credit, status, expires_at)
    VALUES (v_gift_card_id, v_redeem_code, p_template_id, v_batch_id, v_template.purchase_price, v_template.wallet_credit, 'active', v_expires_at);

    v_generated := v_generated + 1;
  END LOOP;

  -- Update batch generated count
  UPDATE gift_card_batches SET generated_count = v_generated WHERE id = v_batch_id;

  -- Audit log
  INSERT INTO gift_card_audit_logs (entity_type, entity_id, admin_id, admin_name, action, new_value)
  VALUES ('batch', v_batch_id, v_user_id, NULL, 'batch_generated',
    jsonb_build_object('batch_name', p_batch_name, 'quantity', v_generated, 'template', v_template.name));

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'generated_count', v_generated,
    'template_name', v_template.name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── RPC: Redeem a gift card ───
CREATE OR REPLACE FUNCTION public.redeem_gift_card(
  p_redeem_code text
)
RETURNS jsonb AS $$
DECLARE
  v_card gift_cards%rowtype;
  v_user_id uuid;
  v_wallet wallets%rowtype;
  v_new_balance numeric;
BEGIN
  -- Get current user
  SELECT auth.uid() INTO v_user_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Find the gift card
  SELECT * INTO v_card FROM gift_cards WHERE redeem_code = upper(trim(p_redeem_code)) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid gift card code');
  END IF;

  -- Verify status
  IF v_card.status = 'redeemed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This gift card has already been redeemed');
  END IF;
  IF v_card.status = 'expired' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This gift card has expired');
  END IF;
  IF v_card.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This gift card has been cancelled');
  END IF;
  IF v_card.status NOT IN ('active', 'sold') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This gift card is not available for redemption');
  END IF;

  -- Check expiry
  IF v_card.expires_at < now() THEN
    UPDATE gift_cards SET status = 'expired', updated_at = now() WHERE id = v_card.id;
    RETURN jsonb_build_object('success', false, 'error', 'This gift card has expired');
  END IF;

  -- Credit wallet
  SELECT * INTO v_wallet FROM wallets WHERE user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  v_new_balance := v_wallet.bonus_balance + v_card.wallet_credit;
  UPDATE wallets SET bonus_balance = v_new_balance, updated_at = now() WHERE id = v_wallet.id;

  -- Record wallet transaction
  INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id)
  VALUES (v_wallet.id, 'bonus', v_card.wallet_credit, v_wallet.loaded_balance + v_new_balance,
    'Gift Card Redeemed: ' || v_card.gift_card_id, v_card.id::text);

  -- Mark as redeemed
  UPDATE gift_cards
    SET status = 'redeemed', redeemed_by = v_user_id, redeemed_at = now(), updated_at = now()
    WHERE id = v_card.id;

  -- Audit log
  INSERT INTO gift_card_audit_logs (entity_type, entity_id, admin_id, admin_name, action, new_value)
  VALUES ('gift_card', v_card.id, v_user_id, NULL, 'card_redeemed',
    jsonb_build_object('gift_card_id', v_card.gift_card_id, 'wallet_credit', v_card.wallet_credit));

  RETURN jsonb_build_object(
    'success', true,
    'wallet_credit', v_card.wallet_credit,
    'gift_card_id', v_card.gift_card_id,
    'new_bonus_balance', v_new_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── RPC: Expire overdue gift cards (for daily scheduled job) ───
CREATE OR REPLACE FUNCTION public.expire_gift_cards()
RETURNS jsonb AS $$
DECLARE
  v_expired_count int;
BEGIN
  UPDATE gift_cards
    SET status = 'expired', updated_at = now()
    WHERE status IN ('active', 'sold', 'generated')
      AND expires_at < now();

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;

  RETURN jsonb_build_object('expired_count', v_expired_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
