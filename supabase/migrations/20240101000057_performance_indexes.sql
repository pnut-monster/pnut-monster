-- Performance indexes for high-growth tables
-- Addresses audit findings: missing composite indexes on frequently queried paths

-- Orders: user filtered by status (customer order history)
CREATE INDEX IF NOT EXISTS idx_orders_user_status_created
ON orders(user_id, status, created_at DESC);

-- Orders: outlet filtered by status (admin/restaurant order queues)
CREATE INDEX IF NOT EXISTS idx_orders_outlet_status_created
ON orders(outlet_id, status, created_at DESC);

-- Orders: payment status for refund workflows
CREATE INDEX IF NOT EXISTS idx_orders_payment_status
ON orders(payment_status);

-- Wallet transactions: composite for paginated user history
CREATE INDEX IF NOT EXISTS idx_wallet_txn_wallet_created
ON wallet_transactions(wallet_id, created_at DESC);

-- Coupon usage: per-user limit checks during checkout
CREATE INDEX IF NOT EXISTS idx_coupon_usage_coupon_user
ON coupon_usage(coupon_id, user_id);

-- Coupon usage: daily limit checks during checkout
CREATE INDEX IF NOT EXISTS idx_coupon_usage_coupon_created
ON coupon_usage(coupon_id, created_at);

-- Loyalty points log: user history with date ordering
CREATE INDEX IF NOT EXISTS idx_loyalty_log_user_created
ON loyalty_points_log(user_id, created_at DESC);

-- Loyalty ledger: filtered by type for earn/redeem views
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_user_type
ON loyalty_ledger(user_id, type, created_at DESC);

-- Notifications: partial index for unread only (most common query)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
ON notifications(user_id, created_at DESC) WHERE is_read = false;

-- Order ratings: lookup by order
CREATE INDEX IF NOT EXISTS idx_order_ratings_order
ON order_ratings(order_id);

-- Payment attempts: user payment history
CREATE INDEX IF NOT EXISTS idx_payment_attempts_user_created
ON payment_attempts(user_id, created_at DESC);
