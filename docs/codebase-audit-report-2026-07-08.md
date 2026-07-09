# Codebase Audit Report - 2026-07-08

Repository: `pnut-monster` / `C:\Users\azureadmin\newpnut`

## Executive Summary

The application is not production-ready in its current state. The production build, lint, and TypeScript checks all fail. More importantly, the Supabase authorization model has critical gaps: public RPC execution is broadly granted, several SECURITY DEFINER functions perform financial or admin actions without checking `auth.uid()` or role, users can update their own `profiles.role`, and some newer RLS policies allow any authenticated user to manage admin-only coupon and gift-card tables.

The highest priority is to lock down database policies/functions before shipping any UI fixes. Middleware and client-side role checks do not protect direct Supabase REST/RPC calls.

## Scope Reviewed

- Next.js App Router pages and API routes under `src/app`.
- Supabase client/server helpers and middleware under `src/lib/supabase`.
- S3 upload path under `src/app/api/upload` and `src/lib/s3`.
- Database migrations under `supabase/migrations`.
- Local applied Supabase catalog for RLS, grants, and function privileges.
- Package scripts, dependency audit, build, lint, and TypeScript checks.

## Automated Check Results

| Check | Result | Notes |
| --- | --- | --- |
| `npm run build` | Fails | Compilation succeeds, then lint/type validation fails. |
| `npm run lint` | Fails | 3 errors and 62 warnings. |
| `npx tsc --noEmit` | Fails | Framer Motion `Variants` type errors and stale Supabase type errors. |
| `npm audit --omit=dev` | Fails | 7 vulnerabilities: 4 high, 3 moderate. |
| `npm audit` | Fails | 13 vulnerabilities: 8 high, 4 moderate, 1 low. |
| Test suite | Not available | No test script is defined in `package.json`. |

## Route Matrix

| Route | File | Intended Access | Status |
| --- | --- | --- | --- |
| `/` | `src/app/(customer)/page.tsx` | Public | Non-working in production build due lint/type errors. |
| `/auth/callback` | `src/app/(customer)/auth/callback/page.tsx` | Public | Functional path present. |
| `/cart` | `src/app/(customer)/cart/page.tsx` | Public | Functional, but trusts client cart/coupon data. |
| `/checkout` | `src/app/(customer)/checkout/page.tsx` | Authenticated customer | Calls unsafe order RPC; no server-side price validation. |
| `/forgot-password` | `src/app/(customer)/forgot-password/page.tsx` | Public | Uses `/reset-password`, but no matching reset route exists. |
| `/login` | `src/app/(customer)/login/page.tsx` | Public | Functional path present. |
| `/loyalty` | `src/app/(customer)/loyalty/page.tsx` | Authenticated customer | Calls unsafe loyalty RPCs. |
| `/menu` | `src/app/(customer)/menu/page.tsx` | Public | Functional path present. |
| `/menu/[slug]` | `src/app/(customer)/menu/[slug]/page.tsx` | Public | Functional path present. |
| `/notifications` | `src/app/(customer)/notifications/page.tsx` | Authenticated customer | RLS-protected per user. |
| `/orders` | `src/app/(customer)/orders/page.tsx` | Authenticated customer | RLS-protected per user. |
| `/orders/[id]` | `src/app/(customer)/orders/[id]/page.tsx` | Authenticated customer | Functional path present; build has hook warning. |
| `/orders/[id]/confirmation` | `src/app/(customer)/orders/[id]/confirmation/page.tsx` | Authenticated customer | Functional path present. |
| `/outlets` | `src/app/(customer)/outlets/page.tsx` | Public | Functional path present. |
| `/profile` | `src/app/(customer)/profile/page.tsx` | Authenticated customer | RLS allows role escalation through direct API. |
| `/profile-setup` | `src/app/(customer)/profile-setup/page.tsx` | Authenticated customer | Type error and debug logging. |
| `/referral` | `src/app/(customer)/referral/page.tsx` | Authenticated customer | Type errors; uses status `completed` while app statuses use `picked_up`. |
| `/register` | `src/app/(customer)/register/page.tsx` | Public | Functional path present. |
| `/search` | `src/app/(customer)/search/page.tsx` | Public | Functional path present; hook warning. |
| `/verify` | `src/app/(customer)/verify/page.tsx` | Public | Functional path present; hook warning. |
| `/wallet` | `src/app/(customer)/wallet/page.tsx` | Authenticated customer | Calls unsafe top-up/gift-card RPCs. |
| `/admin` | `src/app/(admin)/admin/page.tsx` | Admin/super_admin | Middleware-gated, but database role escalation breaks trust boundary. |
| `/admin/campaigns` | `src/app/(admin)/admin/campaigns/page.tsx` | Admin/super_admin | Functional path present; lint warning. |
| `/admin/coupons` | `src/app/(admin)/admin/coupons/page.tsx` | Admin/super_admin | Database policies allow any authenticated user to manage new coupon tables. |
| `/admin/customers` | `src/app/(admin)/admin/customers/page.tsx` | Admin/super_admin | Uses mock/local fallback on failure; direct role updates. |
| `/admin/gift-cards` | `src/app/(admin)/admin/gift-cards/page.tsx` | Admin/super_admin | Database policies/RPC allow broad authenticated/public access. |
| `/admin/login` | `src/app/(admin)/admin/login/page.tsx` | Public | Client checks role after login. |
| `/admin/loyalty` | `src/app/(admin)/admin/loyalty/page.tsx` | Admin/super_admin | Uses stale types and unsafe analytics/settings access. |
| `/admin/menu` | `src/app/(admin)/admin/menu/page.tsx` | Admin/super_admin | Functional path present; many `as never` casts. |
| `/admin/orders` | `src/app/(admin)/admin/orders/page.tsx` | Admin/super_admin | Calls unsafe refund/reject RPCs. |
| `/admin/outlets` | `src/app/(admin)/admin/outlets/page.tsx` | Admin/super_admin | Functional path present. |
| `/admin/reports` | `src/app/(admin)/admin/reports/page.tsx` | Admin/super_admin | Functional path present; lint warning. |
| `/admin/settings` | `src/app/(admin)/admin/settings/page.tsx` | Admin/super_admin | Database policy allows public settings updates. |
| `/restaurant` | `src/app/(restaurant)/restaurant/page.tsx` | outlet_staff/admin/super_admin | Middleware-gated; relies on mutable profile role. |
| `/restaurant/login` | `src/app/(restaurant)/restaurant/login/page.tsx` | Public | Fetches first active outlet instead of assigned outlet. |
| `/restaurant/menu` | `src/app/(restaurant)/restaurant/menu/page.tsx` | outlet_staff/admin/super_admin | Optimistic writes do not roll back on error. |
| `/restaurant/orders` | `src/app/(restaurant)/restaurant/orders/page.tsx` | outlet_staff/admin/super_admin | Calls unsafe reject/refund RPC; optimistic status updates. |
| `/restaurant/settings` | `src/app/(restaurant)/restaurant/settings/page.tsx` | outlet_staff/admin/super_admin | LocalStorage-only settings; does not persist to `outlet_settings`. |
| `/api/upload` | `src/app/api/upload/route.ts` | Should be admin/staff only | Critical: unauthenticated upload and delete. |

## Critical Security Findings

### 1. Users Can Promote Themselves to Admin

`supabase/migrations/20240101000011_rls_policies.sql` allows users to update their own `profiles` row with only `auth.uid() = id` as the check. The comment says role/referral fields are protected, but the policy does not enforce that. `src/lib/supabase/types.ts` also exposes `role` in `profiles.Update`.

Impact: any authenticated user can directly call Supabase REST to set `role = 'admin'` or `super_admin`, then pass middleware/client role checks.

Evidence:
- `supabase/migrations/20240101000011_rls_policies.sql:35-38`
- `src/lib/supabase/types.ts:26-37`

### 2. Public RPC Execution on SECURITY DEFINER Functions

Local catalog verification shows every public function has `EXECUTE` granted to `PUBLIC`, `anon`, and `authenticated`. Several functions are SECURITY DEFINER and do not check caller identity or role.

High-risk examples:
- `topup_wallet(p_user_id, p_amount, p_bonus, ...)` credits arbitrary wallets and does not validate caller or positive amount.
- `place_order_with_wallet(...)` trusts `p_order.user_id`, totals, item prices, discounts, wallet amount, and loyalty points from the client.
- `award_loyalty_points(...)` accepts arbitrary user ID and custom points.
- `manual_refund_order(...)` and `reject_and_refund_order(...)` can refund/reject orders without admin/staff checks.
- `generate_gift_card_batch(...)`, `expire_gift_cards()`, and membership renewal functions are executable publicly.

Evidence:
- `supabase/migrations/20240101000005_wallet.sql:44-83`
- `supabase/migrations/20240101000024_award_points_custom_override.sql:5-83`
- `supabase/migrations/20240101000029_nth_order_discount.sql:55-174`
- `supabase/migrations/20240101000013_manual_refund.sql:2-55`
- `supabase/migrations/20240101000020_reject_refund.sql:2-96`
- `supabase/migrations/20240101000032_gift_cards.sql:104-271`

### 3. Unauthenticated File Upload and Delete

`/api/upload` accepts POST and DELETE without checking a Supabase session or role. Middleware does not protect `/api/upload`. The route can write S3 objects, return data URLs when S3 is not configured, and delete arbitrary S3 keys passed as query parameters.

Impact: unauthenticated storage abuse, CDN/S3 cost exposure, asset deletion, and potential memory/CPU pressure through Sharp processing.

Evidence:
- `src/app/api/upload/route.ts:31-95`
- `src/app/api/upload/route.ts:103-121`
- `src/lib/supabase/middleware.ts:30-48`

### 4. Admin Settings Are Publicly Updateable

`app_settings` has a policy named "Admins can update app_settings", but its expression is `using (true)` and applies to `{public}` in the local catalog. The table is also broadly granted to anon/authenticated roles, with RLS allowing update.

Impact: any caller can alter tax rate, packaging charges, loyalty settings, pickup OTP settings, membership thresholds, and other app behavior.

Evidence:
- `supabase/migrations/20240101000018_app_settings.sql:17-23`
- `src/app/(admin)/admin/settings/page.tsx:53-66`
- `src/app/(admin)/admin/orders/page.tsx:271-277`

### 5. Coupon and Gift Card "Admin" Policies Allow Any Authenticated User

New coupon management tables and gift-card tables use policies with `TO authenticated USING (true)` / `WITH CHECK (true)`, despite being labeled admin-only. Any authenticated user can read, create, update, and delete sensitive gift-card/coupon data.

Impact: coupon tampering, gift-card generation/tampering, redeem-code disclosure, audit-log forgery.

Evidence:
- `supabase/migrations/20240101000031_coupon_management.sql:68-79`
- `supabase/migrations/20240101000032_gift_cards.sql:82-101`

### 6. `membership_cycles` Has RLS Disabled

The applied local catalog shows `membership_cycles|false|false` for row security. The migration creates the table and functions but does not enable RLS.

Impact: with broad table grants, membership cycle data can be read/written outside intended user/admin boundaries.

Evidence:
- `supabase/migrations/20240101000030_membership_journey.sql:14-25`

## High Functional Findings

### 1. Production Build Is Currently Broken

Build and lint fail on:
- `src/app/(customer)/page.tsx:412` unescaped apostrophe.
- `src/components/ui/animated-gradient-bg.tsx:64-65` calls `Math.random()` during render.

TypeScript also fails on Framer Motion `Variants` easing arrays in `src/app/(customer)/page.tsx` and `src/app/(customer)/referral/page.tsx`, plus stale Supabase types in profile/referral paths.

### 2. Supabase Types Are Stale

`src/lib/supabase/types.ts` does not include newer schema objects: `app_settings`, `order_ratings`, `loyalty_ledger`, `membership_cycles`, gift-card tables, coupon campaign tables, and updated RPC signatures. The app compensates with many `as never` casts, which disables useful type checking and masks integration failures.

Evidence:
- `src/lib/supabase/types.ts:349-364`
- widespread `as never` in customer/admin/restaurant pages.

### 3. Checkout Trusts Client-Side Money Fields

Cart items, item prices, coupon discounts, wallet amount, loyalty points, and total are all computed client-side and sent to `place_order_with_wallet`. The database function inserts those values directly.

Impact: forged orders, arbitrary discounts, negative/incorrect totals, wallet overdraw, unvalidated coupon usage.

Evidence:
- `src/app/(customer)/checkout/page.tsx:257-289`
- `supabase/migrations/20240101000029_nth_order_discount.sql:77-145`

### 4. Wallet Top-Up Is Mocked as Real Money

Customer wallet top-up calls `topup_wallet` directly with `p_reference_id: "mock_" + Date.now()` and no payment provider verification.

Impact: free wallet balance credit through UI or direct RPC.

Evidence:
- `src/app/(customer)/wallet/page.tsx:168-177`
- `supabase/migrations/20240101000005_wallet.sql:44-83`

### 5. Password Reset Redirects to a Missing Route

Forgot-password uses `window.location.origin + "/reset-password"`, but no `/reset-password` page exists under `src/app`.

Evidence:
- `src/app/(customer)/forgot-password/page.tsx`
- route inventory has no `src/app/**/reset-password/page.tsx`.

### 6. Restaurant Settings Are Not Persisted to Database

`/restaurant/settings` reads and writes only localStorage, despite `outlet_settings` existing in the database.

Evidence:
- `src/app/(restaurant)/restaurant/settings/page.tsx:43-90`
- `supabase/migrations/20240101000012_outlet_staff.sql:15-23`

### 7. Optimistic UI Can Lie About Persistence

Several admin/restaurant screens update local state even when database writes fail:
- restaurant order status updates update local rows regardless of error.
- restaurant menu availability/price updates update local state before writes and do not roll back.
- admin customers fall back to mock/local state on failed role/user mutations.

Evidence:
- `src/app/(restaurant)/restaurant/orders/page.tsx:201-223`
- `src/app/(restaurant)/restaurant/menu/page.tsx:112-135`
- `src/app/(restaurant)/restaurant/menu/page.tsx:147-173`
- `src/app/(admin)/admin/customers/page.tsx:332-410`

## Dependency Vulnerabilities

Production audit (`npm audit --omit=dev`) reports:

- High: `next` advisories including middleware bypass, cache poisoning, SSRF, XSS, DoS, request smuggling.
- High: `ws` memory disclosure/DoS.
- High: `fast-xml-parser` and `fast-xml-builder`.
- Moderate: `brace-expansion`, `postcss`.

Full audit adds dev/tooling issues:

- High: `@babel/core`, `flatted`, `picomatch`, `tar` via `supabase`.
- Moderate: `js-yaml`.

Recommendation: update Next.js and lockfile with `npm audit fix`/targeted upgrades, then rebuild and retest. Because Next advisories include middleware bypasses, do not rely on route middleware as the primary authorization boundary.

## Non-Functional Findings

- No automated tests are defined.
- No CI configuration was found.
- Generated `public/sw.js` is untracked and contains a previous precache manifest; production service worker behavior needs a clean build/deploy process.
- `node_modules`, `.next`, and local Supabase are present locally; repo is in a dirty state with many uncommitted route and migration changes.
- The code has many `console.error`, `alert`, and `confirm` usages in production-facing flows.
- Image upload lacks rate limiting, content magic-byte validation, role checks, and key normalization.
- Many pages use `<img>` instead of Next Image; this is not a correctness blocker but shows performance debt.
- `useAuth` creates a Supabase client at render time; because `createClient()` returns a browser singleton this is mostly contained, but effect dependencies still cause lint noise.

## Remediation Priorities

1. Revoke public/anon/authenticated execute from all sensitive RPCs and grant only required roles.
2. Add identity/role checks inside SECURITY DEFINER functions, not just in UI/middleware.
3. Replace profile self-update policy with column-safe writes; prevent user-controlled `role`, `referral_code`, and admin fields.
4. Lock down `app_settings`, gift-card tables, coupon campaign tables, `loyalty_ledger`, `order_ratings`, and `membership_cycles` RLS.
5. Protect `/api/upload` with session + role checks, normalize keys/folders, and add rate/size/content validation.
6. Move checkout pricing, coupon validation, wallet debit, loyalty redemption, and order creation into a server/database path that recomputes totals from trusted database rows.
7. Regenerate Supabase TypeScript types and remove `as never` casts.
8. Fix build/lint/type errors and add at least smoke tests for auth, checkout, wallet, admin settings, upload, and key RPCs.
9. Update vulnerable dependencies and re-run `npm audit`, build, lint, and typecheck.
10. Replace local/mock fallbacks in admin/staff screens with explicit error states.

## Current Working / Non-Working Summary

Working or partially working:

- Route tree is complete for customer, admin, restaurant, and upload API.
- Local Supabase is running.
- Next bundling compiles before validation fails.
- Middleware has intended route grouping for public/customer/admin/restaurant areas.

Non-working or unsafe:

- Production build is blocked.
- Lint and TypeScript are blocked.
- No tests are available.
- Dependency audit fails.
- Financial/admin database actions are unsafe through direct RPC/table access.
- Upload API is unauthenticated.
- Password reset route is missing.
- Restaurant settings do not persist.
- Several UI flows can show success after failed writes.
