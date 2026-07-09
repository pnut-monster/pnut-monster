# Post-Fix Deep Audit Report - 2026-07-08

## Scope

This re-audit covered the current Next.js app, Supabase schema/RLS/RPCs, route inventory, admin/customer/restaurant workflows, upload API, dependency audit, build/type/lint status, and tracked data/export hygiene.

Not covered: browser E2E testing, load testing, payment-provider sandbox testing, S3 upload against real AWS credentials, or external penetration testing. The database checks were run against the local Supabase container `supabase_db_newpnut`.

## Executive Summary

The app is in a much better technical state than before: the production build passes, TypeScript passes, lint exits successfully with warnings only, and `npm audit --omit=dev` reports zero production dependency vulnerabilities.

Route middleware is present and active at `src/middleware.ts`. It calls `src/lib/supabase/middleware.ts`, protects admin/restaurant/customer routes, and appears in the Next production build as `Middleware 82.5 kB`. A previous "missing middleware" concern was a false negative caused by a Windows path-separator search.

The database hardening migration improved the original critical RPC/RLS posture: every public table has RLS enabled, no `PUBLIC` or `anon` execute grants remain on public functions, and high-risk RPCs such as wallet top-up/refund/order placement now contain server-side authorization checks.

The codebase is not production-ready yet. The most important remaining issues are tracked auth database exports containing sensitive auth data, over-broad order update capability for outlet staff, broken admin user creation, restaurant outlet assignment/menu-management drift, and multiple admin screens that still update local UI state after failed database writes.

## Verification Matrix

| Check | Result | Notes |
| --- | --- | --- |
| `npx tsc --noEmit` | PASS | No TypeScript errors. |
| `npm run lint` | PASS with warnings | 49 warnings, 0 errors. Main classes: `set-state-in-effect`, `no-img-element`, unused imports, hook dependencies. |
| `npm audit --omit=dev` | PASS | 0 vulnerabilities after rerunning with network access. |
| `npm run build` | PASS | Next.js 15.5.20, production build exits 0. Warnings remain. Build output confirms middleware. |
| Public table RLS check | PASS | All public tables report `rowsecurity=true`. |
| Function grants check | PASS | No `PUBLIC` or `anon` execute grants on public functions. |
| Authenticated RPC grants | REVIEWED | Authenticated can execute a limited RPC set; sensitive ones were inspected. |
| Secret/data scan | FAIL | Tracked `db-export/auth_schema.sql` includes auth users, password hashes, recovery tokens, emails, and user IDs. |

## Confirmed Improvements

- Active route middleware exists at `src/middleware.ts` and protects `/admin`, `/restaurant`, `/orders`, `/wallet`, `/loyalty`, `/profile`, `/notifications`, `/referral`, and `/checkout`.
- `/api/upload` is admin/super-admin gated, validates image type/folder/size, limits Sharp input pixels, uses generated WebP keys, and validates delete keys.
- Wallet mock top-up was removed from the customer wallet page.
- Reset password route exists and builds.
- `topup_wallet(uuid,numeric,numeric,text)` now requires `is_admin()`.
- `manual_refund_order` requires `is_admin()`.
- `reject_and_refund_order` requires `can_manage_order(p_order_id)`.
- `place_order_with_wallet` recomputes prices/options/coupons/tax/packaging/loyalty/wallet totals server-side and does not mark non-wallet orders paid.
- `prevent_profile_privilege_escalation` blocks non-admin profile role/referral/id changes.
- No public/anonymous RPC execution remains.

## Route Inventory and Status

| Route | Status | Notes |
| --- | --- | --- |
| `/` | Working | Public dynamic home route. Reads public menu/campaign data and optional authenticated wallet/loyalty data. |
| `/outlets` | Working | Public outlet browsing route. |
| `/menu` | Working | Public menu listing. |
| `/menu/[slug]` | Working | Public item detail/customization route. |
| `/search` | Working | Public search route; lint warns about synchronous state updates in effects. |
| `/cart` | Working | Public cart route; lint warns about missing hook dependency. |
| `/checkout` | Partially working | Auth-protected. Server RPC recomputes totals, but online/split payment capture is not implemented. |
| `/login` | Working baseline | Customer login route. |
| `/register` | Working baseline | Registration route stores verification email in session storage. |
| `/verify` | Working baseline | Verification page; lint warning for state set in effect. |
| `/forgot-password` | Working baseline | Password reset initiation route. |
| `/reset-password` | Working baseline | Reset completion route now exists. |
| `/auth/callback` | Working baseline | Supabase auth callback route. |
| `/profile-setup` | Working baseline | Auth/profile completion route. |
| `/profile` | Working | Protected. Own-profile RLS plus trigger prevents role escalation. |
| `/orders` | Working | Protected. RLS restricts customers to own orders. |
| `/orders/[id]` | Working | Protected detail route. |
| `/orders/[id]/confirmation` | Working | Protected confirmation route. |
| `/wallet` | Working | Protected wallet and gift-card redemption. Mock top-up removed. |
| `/loyalty` | Working | Protected. Uses secured loyalty/referral RPCs. |
| `/referral` | Working | Protected referral route. |
| `/notifications` | Working baseline | Protected notifications route. |
| `/admin/login` | Working baseline | Public admin login route. |
| `/admin` | Working | Admin-protected dashboard. |
| `/admin/orders` | Partially working | Loads and uses secured refund/reject RPCs, but status updates and OTP setting updates ignore write errors. |
| `/admin/menu` | Partially working | Loads, but many CRUD paths still fake local success on failed Supabase mutations. |
| `/admin/outlets` | Partially working | Loads, but CRUD/toggle/manual-close paths can fake local success; staff assignment UI is placeholder. |
| `/admin/customers` | Partially working | Listing/export/role change are baseline working; create user is broken because it inserts a fake non-UUID profile id and does not create Supabase Auth users. |
| `/admin/loyalty` | Working baseline | Admin protected; several writes do not consistently check errors. |
| `/admin/campaigns` | Working baseline | Admin protected; lint warning for state set in effect. |
| `/admin/coupons` | Working baseline | Admin protected; several direct writes lack robust error handling. |
| `/admin/gift-cards` | Working baseline | Admin protected; gift-card RPC is admin-gated, but some direct updates lack error checks. |
| `/admin/reports` | Working baseline | Admin protected reports route; lint warning for state set in effect. |
| `/admin/settings` | Working baseline | Admin settings route; checks update errors. |
| `/restaurant/login` | Working baseline | Public restaurant login route. |
| `/restaurant` | Partially working | Protected restaurant dashboard. Outlet context comes from localStorage and all active outlets are listed in shell. |
| `/restaurant/orders` | Partially working | Staff can manage assigned outlet orders, but direct table update policy is too broad and UI uses direct updates. |
| `/restaurant/menu` | Non-working for normal outlet staff | UI upserts `outlet_menu_items`, but DB policy allows only admin updates. Outlet staff will see failures. |
| `/restaurant/settings` | Partially working | Settings persist to `outlet_settings`; manager-only DB update policy may block non-manager staff. |
| `/api/upload` | Working with residual risk | Admin-only image upload/delete. Needs rate limiting and CSRF strategy for production. |
| `/sw.js` | Build-generated | Serwist service worker generated during build and ignored/excluded from lint. |
| `/_not-found` | Working | Static not-found route. |

## Security Findings

### Critical - Tracked auth database export contains sensitive auth data

`db-export/auth_schema.sql` is tracked by Git and contains Supabase auth data, including auth users, emails, user IDs, encrypted password hashes, recovery tokens, and audit log entries. Evidence includes `db-export/auth_schema.sql:1024`, `db-export/auth_schema.sql:1025`, and `db-export/auth_schema.sql:1189` through the auth users COPY data.

Impact: anyone with repository access can obtain password hashes and recovery-token artifacts from the export. If these came from real users or reusable dev/admin accounts, credentials and accounts should be treated as exposed.

Recommendation: remove auth data exports from the repository, rotate affected credentials, invalidate recovery tokens/sessions, purge the data from Git history if it has been pushed, and replace `auth_schema.sql` with schema-only or sanitized seed data.

### High - Outlet staff can directly mutate sensitive order columns

`supabase/migrations/20240101000015_staff_order_policies.sql:15` adds `orders: staff update outlet orders`. Current table/column grants give `authenticated` users UPDATE on every `orders` column, and the RLS policy only checks outlet assignment. A malicious or compromised outlet staff session can call the Supabase REST API directly and attempt updates beyond status, such as `total`, `payment_status`, `wallet_used`, `user_id`, `outlet_id`, `discount`, or timestamps, as long as the row passes the staff outlet policy.

Impact: order financial integrity and audit integrity are not protected at the database column level.

Recommendation: revoke direct broad `orders` UPDATE for `authenticated`, expose status transitions through security-definer RPCs that validate allowed transitions/columns, or use column-level grants plus triggers to block sensitive column changes by non-admins.

### High - Admin "Create User" is not functional

`src/app/(admin)/admin/customers/page.tsx:331` inserts directly into `profiles` with `id: `${userForm.role}-${Date.now()}``. The profile id column is UUID-backed and this does not create a Supabase Auth user. The UI now fails visibly instead of pretending success, but the feature itself is still broken.

Impact: admins cannot create actual customer/staff accounts from the UI.

Recommendation: create a server route or action using `createAdminClient()` and `supabase.auth.admin.createUser()` / invite flow, then create/update the profile with the real auth user id.

### High - Restaurant outlet assignment and menu management are inconsistent

`src/app/(restaurant)/restaurant/restaurant-shell.tsx:76` fetches all active outlets for staff and stores the selected outlet in localStorage. The comment says this should be filtered by staff assignment. Separately, restaurant menu writes call `outlet_menu_items.upsert(...)` at `src/app/(restaurant)/restaurant/menu/page.tsx:119`, `:160`, and `:208`, but `supabase/migrations/20240101000011_rls_policies.sql:243` permits only admin updates to `outlet_menu_items`.

Impact: outlet staff can select outlets they are not assigned to, then see empty/failed screens due RLS. The restaurant menu page is effectively non-working for normal outlet staff.

Recommendation: filter shell outlet choices through `outlet_staff`, add manager/staff policies or RPCs for allowed `outlet_menu_items` changes, and remove localStorage as the source of authorization.

### Medium - Admin menu/outlet screens still fake success after failed writes

`src/app/(admin)/admin/menu/page.tsx` contains multiple catch blocks that log "failed, updating local state" and generate local ids such as `local-${Date.now()}`. `src/app/(admin)/admin/outlets/page.tsx:188` and `:215` do the same for outlet save/delete failures. Toggles and manual close also update local state even when the database update fails.

Impact: admins can believe records were created, edited, deleted, opened, or closed when the database rejected the operation.

Recommendation: fail closed, show a toast/error, do not mutate local state on write failure, and refetch after successful writes only.

### Medium - Payment flow is still incomplete

The server-side order RPC now avoids marking non-wallet orders as paid, which is good. However, online and split payment paths still create pending orders without a real payment provider authorization/capture workflow.

Impact: product and operations workflow remains incomplete for non-wallet payments.

Recommendation: integrate a payment provider, create payment intents/orders server-side, verify webhooks before marking payment as paid, and define cancellation/refund handling for pending payment orders.

### Medium - Pickup OTP is predictable and can be skipped in admin flow

`src/components/restaurant/delivery-code.tsx` derives a 4-digit code from `order_number` using a simple hash. Admin orders also include a "Skip OTP" action in `src/app/(admin)/admin/orders/orders-client.tsx`. This is acceptable only as a convenience check, not as proof of customer possession.

Impact: anyone who knows or guesses the order number can derive the pickup code. Admins can bypass the check.

Recommendation: generate cryptographically random pickup codes server-side, store only a hashed or scoped verification value, rate-limit attempts, and audit bypasses.

### Medium - Some security-definer functions still lack explicit search_path

The hardening migration sets `search_path` on many high-risk functions, but not all security-definer functions. `redeem_gift_card(text)` is callable by authenticated users and still uses unqualified table names without a function-level `search_path`. `anon` and `authenticated` do not have `CREATE` on `public`, which reduces risk, but security-definer functions should be consistently hardened.

Recommendation: add `SET search_path TO public` or schema-qualify all objects for every security-definer function, especially authenticated-callable RPCs and triggers.

### Medium - Upload API needs production abuse controls

`src/app/api/upload/route.ts` is admin-only and validates content, which is good. It does not implement request rate limiting, CSRF/origin checks, or per-admin quotas.

Impact: a compromised admin browser/session can be used for repeated uploads/deletes. Cross-site POST risk depends on cookie SameSite behavior and deployment settings.

Recommendation: add rate limiting, verify origin/referer for browser cookie requests, add audit logs for upload/delete, and set size/quota policy per role.

### Low - Middleware path matching is broad-prefix based

Middleware is active. Public paths and protected paths use `pathname.startsWith(...)`. This is functional for current routes, but exact or segment-aware matching is safer for future paths such as `/login-extra` or `/admin/login-preview`.

Recommendation: switch route checks to exact match or `pathname === p || pathname.startsWith(p + "/")`.

## Database/RPC Status

Confirmed current DB state:

- Every table in `public` has RLS enabled.
- No public functions have `PUBLIC` or `anon` execute grants.
- Authenticated RPC grants are limited to:
  `apply_referral_code`, `award_loyalty_points`, `calculate_max_redeemable_points`, `check_membership_renewals`, `check_nth_order_discount`, `claim_referral_reward`, `expire_gift_cards`, `generate_gift_card_batch`, `get_claimable_referral_rewards`, `get_loyalty_analytics`, `get_membership_status`, `manual_refund_order`, `place_order_with_wallet`, `redeem_gift_card`, `reject_and_refund_order`, `reject_order_with_refund`.
- `topup_wallet(uuid,numeric,numeric,text)` exists and requires `is_admin()`.
- `manual_refund_order` requires admin.
- `reject_and_refund_order` requires admin or assigned outlet staff through `can_manage_order`.
- `place_order_with_wallet` recomputes order totals server-side.
- `profiles` self-update is guarded by `prevent_profile_privilege_escalation`.

Remaining DB concern: table-level grants to `anon`/`authenticated` are broad, which is common in Supabase but makes RLS and triggers the only protection layer. For sensitive tables, prefer explicit RPCs and narrower grants.

## Functional / Non-Functional Findings

### Working

- Production build, typecheck, and dependency audit are clean.
- Customer shopping routes build and are backed by server-side order pricing logic.
- Wallet gift-card redemption is authenticated.
- Admin upload path is restricted to admin/super-admin.
- Admin/refund/reject order RPCs are server-authorized.
- Route middleware protects major private route groups.

### Not Working

- Admin customer/staff creation does not create Auth users and uses invalid profile ids.
- Restaurant menu availability/price updates fail for normal outlet staff under current RLS.
- Admin outlet staff assignment UI is a placeholder; it displays all staff and the Assign button has no persistence.
- No real online/split payment capture exists.

### Partially Working / Risky

- Admin menu/outlets CRUD can fake local success on failed writes.
- Admin orders status and OTP-setting updates ignore errors.
- Restaurant selected outlet is localStorage-driven and not filtered by assignment in the shell.
- Pickup code verification is deterministic and bypassable.
- Lint warnings remain; they are not build blockers but indicate code health debt.

## Route Protection Summary

`src/middleware.ts` calls `updateSession(request)` for most app routes. It excludes Next static/image assets, icons, manifest, service worker, and common image extensions.

Public routes:

- `/`
- `/login`
- `/register`
- `/verify`
- `/forgot-password`
- `/reset-password`
- `/auth/callback`
- `/restaurant/login`
- `/admin/login`
- `/outlets`
- `/menu`
- `/search`
- `/cart`

Protected customer routes:

- `/orders`
- `/wallet`
- `/loyalty`
- `/profile`
- `/notifications`
- `/referral`
- `/checkout`

Role-protected routes:

- `/admin/*`: requires `admin` or `super_admin`.
- `/restaurant/*`: requires `outlet_staff`, `admin`, or `super_admin`.

## Lint Warning Summary

`npm run lint` reports 49 warnings and 0 errors. Main categories:

- React `set-state-in-effect` warnings in admin campaigns, admin loyalty, admin reports, checkout, customer order detail, search, verify, splash screen, offline indicator.
- `@next/next/no-img-element` warnings in shells and auth/menu pages.
- Unused imports in admin coupons, gift cards, customer loyalty/profile, restaurant dashboard.
- Hook dependency warnings in cart, checkout, notifications, profile, restaurant orders.

## Remediation Priority

1. Remove/sanitize tracked auth database exports and rotate affected credentials/tokens. If pushed, purge from Git history.
2. Replace direct `orders` table updates for outlet staff with validated RPC status transitions or column-restricted grants.
3. Fix restaurant outlet assignment filtering and add safe manager/staff policies or RPCs for outlet menu updates.
4. Implement real admin user creation through Supabase Auth admin APIs.
5. Remove all fake local-success paths from admin menu/outlets/orders and enforce error-first UI behavior.
6. Implement real payment provider capture/webhook flow before accepting online/split payments in production.
7. Make pickup codes random/server-side and audit any bypass.
8. Set explicit `search_path` on all security-definer functions.
9. Add upload rate limiting/origin checks/audit logs.
10. Burn down lint warnings and add focused E2E tests for auth, checkout, wallet redemption, admin order status, restaurant order status, and menu availability.

## Production Readiness Verdict

Not production-ready yet.

The compile/dependency baseline is now healthy, and the earlier critical unauthenticated RPC exposure has been addressed. However, the tracked auth export, over-broad staff order mutation path, broken user creation, restaurant staff/menu mismatch, and incomplete payment flow are enough to block production use until remediated.
