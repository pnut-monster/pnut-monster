# PNUT MONSTER Deep Codebase Audit — 2026-07-20

## Scope and method

Reviewed the complete current repository (193 files) across Next.js routes and
components, Supabase clients/middleware, all API handlers, all 41 database
migrations, RLS/RPC authorization, payments, wallet/loyalty/coupons, uploads,
PWA/deployment configuration, dependency health, and operational tooling.

Validation performed:

- `npm run lint`: passes with 4 warnings.
- `npm run build`: passes; all 48 pages/routes build.
- `npm audit --omit=dev`: 0 known production dependency vulnerabilities.
- Tracked-file secret scan: no real tracked credentials found.
- No automated unit, integration, or E2E tests are present.

The worktree contained pre-existing auth/Supabase edits and a database backup;
they were inspected but not modified.

## Executive assessment

The application has a solid security baseline: protected route groups, RLS on
business tables, constrained security-definer RPCs, server-side menu price
recalculation, Razorpay signature plus provider verification, payment
idempotency indexes, upload validation, and reasonable security headers.

It is not production-safe yet because one critical authorization bypass lets an
ordinary admin promote itself to super-admin. Checkout also has several
server/client rule mismatches that permit authenticated clients to bypass
customization, coupon, outlet-closure, and loyalty policies. Payment completion
has no webhook/reconciliation path and treats merely authorized payments as
settled.

## Findings

### Critical

#### C1. An admin can directly self-promote to `super_admin` — Fixed

Evidence:

- `supabase/migrations/20240101000011_rls_policies.sql:52` allows any caller for
  whom `is_admin()` is true to update any profile.
- `supabase/migrations/20240101000033_security_hardening.sql:14` exempts all
  admins from the trigger that prevents role changes.
- `src/app/api/admin/users/route.ts:154` enforces super-admin-only role grants,
  but authenticated clients can bypass this route and update `profiles`
  directly through PostgREST.

Impact: an ordinary admin can grant itself or another account `super_admin`,
then create/modify elevated users. API authorization is therefore ineffective
for this boundary.

Recommendation: prohibit direct role changes for every authenticated role,
including admins. Move role changes into a security-definer RPC that explicitly
requires the caller's current role to be `super_admin`; narrow or remove the
general admin profile-update policy.

Resolution: migration `20240101000042_super_admin_role_boundary.sql` now
enforces the elevated-role boundary in the profile trigger. Any transition into
or out of `admin`/`super_admin` requires the authenticated caller to currently
be `super_admin`; ordinary admins retain only customer/outlet-staff role
management. Trusted service-role provisioning remains supported.

### High

#### H1. Server checkout does not enforce customization selection rules

Evidence: the UI enforces required/minimum selections in
`src/app/(customer)/menu/[slug]/page.tsx:236`, while
`place_order_with_wallet` only verifies that supplied group/option IDs belong to
the item (`supabase/migrations/20240101000033_security_hardening.sql:491`). It
does not require mandatory groups, enforce `min_select`/`max_select`, or reject
duplicate groups/options.

Impact: a client can submit items without mandatory paid choices or outside the
catalog's configured selection rules.

Recommendation: validate every active group server-side, count distinct active
options, enforce required/min/max constraints, and reject duplicate IDs.

#### H2. Extended coupon rules are enforced only by a UI-facing API

Evidence: `/api/coupons/eligible` checks per-user/daily limits, outlet
restrictions, customer segment, product/category applicability, and newer
discount types (`src/app/api/coupons/eligible/route.ts:217`). The order RPC only
checks active dates, legacy minimum order, global usage, and legacy
percentage/fixed calculation
(`supabase/migrations/20240101000033_security_hardening.sql:530`).

Impact: an authenticated client can call the RPC directly with a coupon code
and bypass the extended eligibility rules. `buy_x_get_y` and `free_product`
semantics are also not priced by the authoritative checkout function.

Recommendation: make one database function authoritative for coupon
eligibility and discount calculation; call it from both preview and checkout.

#### H3. Checkout ignores manual outlet closure

Evidence: customer UI excludes manually closed outlets
(`src/app/(customer)/menu/page.tsx:260`), but the order RPC checks only
`outlets.is_active` (`supabase/migrations/20240101000033_security_hardening.sql:466`).

Impact: customers can place orders at an outlet operations explicitly closed.

Recommendation: reject `is_manually_closed = true` in the transaction, and
optionally enforce operating hours with a clearly defined timezone policy.

#### H4. Loyalty redemption limits are preview-only

Evidence: `calculate_max_redeemable_points` applies enabled/min-balance,
max-order-percent, and max-points limits
(`supabase/migrations/20240101000033_security_hardening.sql:746`). The order RPC
only checks that the account balance covers the requested points
(`supabase/migrations/20240101000033_security_hardening.sql:582`).

Impact: a direct RPC caller can redeem points when redemption is disabled,
below the minimum balance, or beyond configured per-order caps.

Recommendation: calculate and enforce the maximum again inside the locked order
transaction; never trust the preview result.

#### H5. Authorized, not-yet-captured Razorpay payments are treated as paid

Evidence: order and wallet verification accept either `captured` or
`authorized` (`src/app/api/razorpay/verify-payment/route.ts:146` and
`src/app/api/razorpay/wallet-topup/route.ts:148`) and immediately create a paid
order or credit the wallet.

Impact: authorization can later be voided or fail capture while value has
already been delivered.

Recommendation: require `captured`, or explicitly capture server-side and
confirm the capture before credit/order creation. Add webhook reconciliation.

#### H6. Captured payments have no durable recovery/reconciliation path

Evidence: payment verification creates the business record synchronously after
payment, but there is no Razorpay webhook route or durable payment-attempt
table. Errors after capture return 500 (`src/app/api/razorpay/verify-payment/route.ts:194`).

Impact: transient database/API failures can leave paid customers without an
order; client retry is the only recovery mechanism.

Recommendation: persist payment attempts, add signature-verified Razorpay
webhooks, and make finalization retryable and idempotent by provider payment ID.

### Medium

#### M1. Wallet order creation has weak input/auth validation

`src/app/api/razorpay/wallet-topup/route.ts:101` only checks that an access-token
string exists before creating an order, does not authenticate it until verify,
and has no maximum top-up. The in-memory limiter is per process and ineffective
across serverless/Workers instances.

Recommendation: authenticate before provider calls, validate finite numeric
amounts with a business maximum, and use platform/distributed rate limiting.

#### M2. Many admin mutations ignore Supabase errors

Examples include loyalty actions/settings
(`src/app/(admin)/admin/loyalty/page.tsx:482`), coupon restrictions/campaigns
(`src/app/(admin)/admin/coupons/page.tsx:470`), gift-card status changes
(`src/app/(admin)/admin/gift-cards/page.tsx:353`), and campaign creation
(`src/app/(admin)/admin/campaigns/page.tsx:124`).

Impact: the UI can report or display success after a failed or partially
completed mutation. Multi-step coupon/catalog changes are non-transactional.

Recommendation: check every result, show actionable failure states, and move
multi-table operations into transactional RPCs.

#### M3. Generated Supabase types lag the schema

New tables/RPCs such as gift cards, membership cycles, outlet settings, coupon
extensions, and payment IDs are absent from `src/lib/supabase/types.ts`, causing
widespread `as never` casts.

Impact: schema drift and invalid payloads escape compile-time detection.

Recommendation: regenerate types from the fully migrated database and remove
casts in risk-sensitive paths first.

#### M4. Cloudflare deployment is incompatible with the upload route

`src/app/api/upload/route.ts:2` imports native Node `sharp`, while the documented
target is OpenNext Cloudflare Workers. The route also buffers the full upload
and returns large base64 data URLs when S3 is absent.

Recommendation: move image processing to a Node service/direct S3 workflow or
use a Workers-compatible image service; disable local data-URL fallback outside
development.

#### M5. Rate limiting is local-memory only

Payment and upload routes use module-level `Map` instances. Limits reset on
restart and are not shared across replicas; maps also retain attacker-selected
keys until process termination.

Recommendation: use Cloudflare rate-limiting/Durable Objects or another shared
store with bounded expiry.

#### M6. Database migration patching is fragile

Migrations 38, 40, and 41 rewrite `place_order_with_wallet` by string-replacing
`pg_get_functiondef` output. Formatting or earlier drift can make patches fail
or partially apply, and migration 40 does not validate every replacement.

Recommendation: define the complete final function explicitly in a new
migration and add schema-level smoke tests for its behavior.

#### M7. No automated regression coverage for financial/authorization flows

There is no unit/integration/E2E framework. Checkout, refunds, role changes,
RLS, gift-card redemption, and idempotency depend on manual verification.

Recommendation: start with database integration tests for C1/H1-H5, then add
Playwright coverage for auth and core role workflows.

### Low / quality

#### L1. CSP remains permissive

`next.config.ts:17` allows both `'unsafe-inline'` and `'unsafe-eval'` for scripts,
and `connect-src` allows all HTTPS/WSS destinations. This reduces CSP's value
against XSS and data exfiltration.

#### L2. Admin verification endpoint accepts arbitrary user IDs

`src/app/api/admin/verify-role/route.ts:6` lets an admin retrieve role/name for
another profile. This is unnecessary for its shell verification purpose; bind
the response to the authenticated user.

#### L3. Static analysis warnings remain

Lint reports synchronous state updates initiated in effects in admin campaigns,
loyalty, and reports, plus one raw `<img>` in `src/components/ui/avatar.tsx`.

#### L4. Operational jobs are not scheduled

Gift-card expiry and membership renewal functions exist but no cron/queue invokes
them. Their state will drift unless an operator calls them.

## Positive controls confirmed

- Middleware uses `auth.getUser()` and role checks for protected surfaces.
- Admin and customer sessions use separate cookie storage keys.
- Sensitive prices, tax, packaging, wallet debits, and item identity are
  recomputed in a locked database transaction.
- Razorpay signatures are timing-safe compared and provider payment/order data
  are fetched server-side.
- Payment and wallet references have idempotency-oriented unique indexes.
- RLS hardening replaces the earlier permissive coupon/gift-card policies.
- Uploads require authentication/role, whitelist folders/formats, cap bytes and
  pixels, randomize keys, and constrain deletion keys.
- Security headers include HSTS, frame denial, MIME sniff protection, and a CSP.
- Production dependency audit currently reports no known vulnerabilities.

## Recommended remediation order

1. Fix C1 and add a database test proving admins cannot grant elevated roles.
2. Replace the checkout RPC with one explicit final definition enforcing H1-H4.
3. Require captured payments and add durable webhook reconciliation (H5-H6).
4. Regenerate Supabase types and add database integration tests.
5. Make admin writes transactional/error-aware and replace local rate limits.
6. Resolve the Cloudflare upload architecture and operational scheduling.
