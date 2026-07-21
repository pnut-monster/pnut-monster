import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const createOrder = read("src/app/api/razorpay/create-order/route.ts");
const forgotPassword = read("src/app/api/auth/forgot-password/route.ts");
const welcome = read("src/app/api/email/welcome/route.ts");
const migration = read("supabase/migrations/20240101000048_checkout_quotes_and_api_limits.sql");
const apiSources = [
  "src/app/api/razorpay/create-order/route.ts",
  "src/app/api/razorpay/verify-payment/route.ts",
  "src/app/api/razorpay/wallet-topup/route.ts",
  "src/app/api/upload/route.ts",
].map(read).join("\n");

assert.match(createOrder, /create_checkout_quote/);
assert.match(createOrder, /amount:\s*quote\.amount_paise/);
assert.doesNotMatch(createOrder, /numericAmount|Math\.round\(numericAmount/);
assert.match(createOrder, /checkout_quote_id:\s*quote\.quote_id/);

assert.doesNotMatch(forgotPassword, /No account is registered|Profile not found/i);
assert.match(forgotPassword, /forgot_password_ip/);
assert.match(forgotPassword, /forgot_password_email/);
assert.match(welcome, /welcome_email_sent_at/);

assert.doesNotMatch(apiSources, /new Map<string, \{ count: number; resetAt: number \}>/);
assert.match(migration, /create table public\.checkout_quotes/);
assert.match(migration, /create or replace function public\.finalize_captured_payment_attempt/);
assert.match(migration, /create function public\.consume_api_rate_limit/);
assert.match(migration, /replace_coupon_outlet_restrictions/);

console.log("Audit regression guards passed.");

