# PROJECT_CONTEXT.md

Persistent project memory for the PNUT MONSTER codebase. Future sessions must read this file before starting work and update it immediately after any code, schema, route, UI, integration, or architecture change.

## Project Context

PNUT MONSTER is a food ordering, loyalty, wallet, and operations platform for a healthy food brand. It has three primary surfaces:

- Customer app for outlet discovery, menu browsing, cart, checkout, wallet, loyalty, referrals, orders, profile, and notifications.
- Admin app for operations, catalog, outlets, staff/customers, orders, reports, loyalty, coupons, gift cards, campaigns, and settings.
- Restaurant/staff app for outlet order queue, outlet-scoped menu availability/pricing, and outlet settings.

The application is built as a Next.js App Router project backed by Supabase Postgres/Auth/Realtime. Business logic is split between client/server React pages, Next API routes, Supabase RLS policies, and security-definer RPC functions.

## Operating Rules for Future Sessions

1. Read this file before every task.
2. Treat this file as the primary project memory, then inspect only the files relevant to the task.
3. Do not perform another full codebase audit unless explicitly requested.
4. After any modification, update this file and add a dated changelog entry.
5. Keep this file concise, architectural, and accurate.

## Project Overview

### Business Domain

Quick-service healthy food ordering with wallet payments, loyalty rewards, referrals, coupons, gift cards, and outlet operations.

### Core Objectives

- Let customers find outlets, choose menu items, customize items, pay, and track orders.
- Let admins operate catalog, outlets, users, rewards, promotions, and order workflows.
- Let outlet staff manage incoming orders and item availability for assigned outlets.
- Keep sensitive order/payment/wallet operations enforced server-side through Supabase RPCs and RLS.

### User Types and Roles

- `customer`: normal buyer; can manage own profile, wallet, orders, loyalty, referrals, notifications.
- `outlet_staff`: restaurant user; can access `/restaurant` routes and assigned outlet workflows.
- `admin`: company operator; can access `/admin` and broad admin workflows.
- `super_admin`: elevated admin; can create/grant admin roles through `/api/admin/users`.

### High-Level Architecture

- Next.js 15 App Router route groups: `(customer)`, `(admin)`, `(restaurant)`.
- Supabase SSR/browser clients with separate cookie storage keys for admin and customer sessions.
- Middleware refreshes Supabase sessions and protects role-gated route groups.
- Client pages call Supabase directly for many CRUD reads/writes under RLS.
- Security-sensitive operations use API routes and/or Supabase RPCs.
- Zustand persists cart and selected outlet state in browser storage.
- AWS S3/CDN stores optimized uploaded images when configured.
- Razorpay handles online wallet top-ups and order payments, verified server-side.
- AWS SES sends transactional emails when configured.

## Tech Stack

- Frontend: Next.js 15 App Router, React 18, TypeScript.
- Styling/design: Tailwind CSS v4 via `@theme` in `src/app/globals.css`; custom UI components in `src/components/ui`.
- Icons: `lucide-react`.
- Animation/UI feedback: `framer-motion`, `react-hot-toast`.
- Backend/API: Next.js route handlers under `src/app/api`.
- Database: Supabase Postgres 15.
- Auth: Supabase Auth, including email/password, email OTP/magic link, Google OAuth config, password reset.
- ORM: none. Uses `@supabase/supabase-js` and PostgREST/RPC directly.
- State management: Zustand with persistence for cart/outlet; React local state for page workflows.
- Validation: `zod` in admin user API.
- Storage/media: AWS S3 through AWS SDK; optional CloudFront/custom CDN; local data URL fallback for uploads when S3 is not configured.
- Email: AWS SES via AWS SDK; no-op skip when SES env is incomplete.
- Payments: Razorpay orders/signature verification.
- PWA/offline: Serwist service worker, web manifest, offline indicator, dev service-worker reset.
- Build tools: npm scripts, Next.js, TypeScript, ESLint 9, Tailwind PostCSS.
- Testing/tools: no unit/E2E test framework found; `scripts/stress-test.mjs` uses `autocannon`.
- Deployment/runbooks: `docs/vm-development-deployment.md`, `docs/s3-setup.md`; local Supabase through `supabase/config.toml`.

## Folder Structure

- `src/app`: Next.js App Router routes, layouts, loading/error pages, service worker source.
- `src/app/(customer)`: public and authenticated customer experience.
- `src/app/(admin)/admin`: admin panel and admin layout shell.
- `src/app/(restaurant)/restaurant`: restaurant/staff panel and restaurant layout shell.
- `src/app/api`: Next route handlers for upload, email, Razorpay, and admin user/role APIs.
- `src/components/ui`: reusable UI primitives such as button, card, modal, input, tabs, image upload, skeleton, spinner, offline indicator.
- `src/components/customer`: customer interaction helpers such as cart badge, transitions, splash, pull-to-refresh, animated add button.
- `src/components/restaurant`: restaurant-specific delivery/pickup code UI.
- `src/components/dev`: development-only service worker reset helper.
- `src/lib/supabase`: typed Supabase clients for browser, server, middleware, and service-role admin access.
- `src/lib/stores`: Zustand stores for cart, selected outlet, and transient UI bottom sheet.
- `src/lib/hooks`: shared client hooks, currently `useAuth`.
- `src/lib/utils`: formatting, constants, image helper, slug/order utilities.
- `src/lib/email`: SES client and transactional email templates.
- `src/lib/s3`: S3 upload/delete client.
- `supabase/migrations`: source of truth for database schema, RLS, triggers, RPCs, and hardening.
- `supabase/seed.sql`: development seed data.
- `supabase/templates`: Supabase email template overrides, currently magic link.
- `db-export`: schema/data dump artifacts and restore guidance. Current `auth_schema.sql` appears schema-only for auth user data.
- `scripts/db`: dump/restore automation.
- `scripts`: dev cleanup and stress testing scripts.
- `docs`: VM deployment, S3 setup, environment templates, and historical audit reports.
- `public`: app icons, logo, manifest, dev reset page, generated service-worker target.

## Frontend System

### Routing Structure

Customer routes:

- `/`: home dashboard with profile-aware sections, categories, bestsellers, campaigns, wallet/loyalty snippets.
- `/outlets`: public outlet browsing and outlet selection.
- `/menu`: category/subcategory menu for selected outlet.
- `/menu/[slug]`: item details and customizations, adds to cart.
- `/search`: public menu item search with local recent searches.
- `/cart`: public cart, coupon validation, notes.
- `/checkout`: protected checkout, wallet/loyalty/coupon/nth-order/Razorpay payment flow.
- `/orders`, `/orders/[id]`, `/orders/[id]/confirmation`: protected order history/detail/confirmation.
- `/wallet`: protected wallet balance, Razorpay top-up, transaction history, gift-card redemption.
- `/loyalty`: protected points, missions, membership, referral rewards, rating rewards.
- `/referral`: protected referral code/campaign view.
- `/notifications`: protected notification list and mark-read actions.
- `/profile`, `/profile-setup`: protected profile view/edit/setup.
- `/login`, `/register`, `/verify`, `/forgot-password`, `/reset-password`, `/auth/callback`: customer auth flows.

Admin routes:

- `/admin/login`: public admin login.
- `/admin`: dashboard metrics, recent orders, popular items, revenue table.
- `/admin/orders`: order operations, status progression, refund/reject, pickup OTP settings.
- `/admin/menu`: catalog categories, subcategories, items, customizations.
- `/admin/outlets`: outlet CRUD, manual close/reopen, staff assignment and manager toggle.
- `/admin/customers`: customer/staff/admin listing, role changes, user creation, export.
- `/admin/loyalty`: points actions, missions, referral campaigns, membership/nth-order settings, loyalty analytics/ledger.
- `/admin/campaigns`: campaign CRUD.
- `/admin/coupons`: extended coupon and coupon campaign management.
- `/admin/gift-cards`: templates, batches, card status, audit log.
- `/admin/reports`: revenue/order reports from orders and order_items.
- `/admin/settings`: tax, packaging, app/payment/storage status settings.

Restaurant routes:

- `/restaurant/login`: public restaurant login.
- `/restaurant`: outlet dashboard.
- `/restaurant/orders`: live order queue, auto-accept, status transitions, pickup-code completion, reject/refund.
- `/restaurant/menu`: outlet item availability and price overrides.
- `/restaurant/settings`: outlet settings persisted to `outlet_settings` and local compatibility keys.

### Layout Hierarchy

- Root layout loads Fredoka and Nunito Google fonts, global CSS, Toaster, offline indicator, and development service-worker reset.
- Customer layout wraps pages in `CustomerShell`, with desktop sidebar, mobile header/bottom nav, hidden shell on auth/fullscreen/cart/checkout/item-detail flows.
- Admin layout wraps pages in `AdminShell`, with protected sidebar/topbar, role verification via `/api/admin/verify-role`, and sign-out.
- Restaurant layout wraps pages in `RestaurantShell`, with staff profile/outlet selector, sidebar/topbar, local selected outlet, and shell hidden on login.

### Design System

- Brand tokens live in `src/app/globals.css`: yellow, green, cream, black, red/orange, gray scale, radius, shadows, responsive containers.
- Typography: Fredoka for headings, Nunito for body.
- Components favor rounded card/mobile app styling, heavy brand colors, and toast feedback.
- Admin/restaurant surfaces use denser dashboard/sidebar layouts.
- UI primitives are local components rather than a third-party component library.

### State and Data Flow

- `useCartStore`: persisted cart items, outlet, coupon, discount, notes, subtotal and count helpers.
- `useOutletStore`: persisted selected customer outlet.
- `useUIStore`: transient bottom sheet content/open state.
- `useAuth`: browser Supabase auth/profile hook.
- Most pages fetch in `useEffect` from Supabase browser client.
- Restaurant selected outlet is stored in `localStorage` as `pnut_selected_outlet`.
- Restaurant auto-accept/sound/settings use localStorage compatibility keys plus `outlet_settings`.
- Realtime is used in restaurant orders and customer loyalty, with polling fallback in restaurant orders.

### Forms and Integrations

- Auth forms use Supabase auth APIs.
- Admin create/role update uses `/api/admin/users`.
- Image fields use `ImageUpload`, which calls `/api/upload`.
- Checkout and wallet dynamically load Razorpay checkout script.
- Customer profile setup can upload avatar through `/api/upload` folder `avatars`.

### Protected Pages

Middleware protects:

- `/admin/*`: `admin` or `super_admin`.
- `/restaurant/*`: `outlet_staff`, `admin`, or `super_admin`.
- Customer protected paths: `/orders`, `/wallet`, `/loyalty`, `/profile`, `/notifications`, `/referral`, `/checkout`.

Public customer paths include `/`, `/outlets`, `/menu`, `/search`, `/cart`, and auth pages.

## Backend System

### API Routes

- `POST /api/upload`: same-origin checked image upload. Authenticated users can upload `avatars`; `admin`/`super_admin` required for menu/categories/outlets/banners/campaigns/brand. Converts images to WebP with Sharp, enforces folder whitelist, 10 MB input limit, 25 MP pixel limit, and in-process rate limit. Uses S3 when configured; otherwise returns local data URL.
- `DELETE /api/upload?key=...`: admin/super-admin delete for generated S3 keys only.
- `POST /api/razorpay/create-order`: authenticated customer creates a Razorpay order for a positive amount.
- `POST /api/razorpay/verify-payment`: verifies Razorpay signature, then calls `place_order_with_wallet` with the user's access token and sends order/payment emails fire-and-forget.
- `POST /api/razorpay/wallet-topup`: action `create-order` creates top-up order; action `verify` verifies signature, calls `self_topup_wallet`, and sends wallet top-up email.
- `POST /api/email/welcome`: sends welcome email to authenticated customer.
- `POST /api/admin/verify-role`: validates admin cookie session and returns profile role/full name.
- `POST /api/admin/users`: admin creates Supabase Auth user via service role; only `super_admin` can create admin/super_admin users.
- `PATCH /api/admin/users`: admin role update; only `super_admin` can grant or modify elevated admin roles.

### Middleware and Auth Flow

- `src/middleware.ts` delegates to `updateSession`.
- `src/lib/supabase/middleware.ts` chooses `sb-admin-auth-token` for admin routes, otherwise `sb-customer-auth-token`.
- Public paths still call `supabase.auth.getUser()` to refresh cookies.
- Admin and restaurant route guards query `profiles.role`.
- Server and browser Supabase clients use the same cookie key split.
- Service-role operations are isolated in `createAdminClient()`.

### Authorization Logic

- App-level route protection is in middleware and shell checks.
- Database-level authorization relies on RLS and helper functions such as `is_admin`, `is_outlet_staff_for_order`, `can_manage_order`, and `is_outlet_staff_for_outlet`.
- Sensitive mutations are mostly RPC based: order placement, order status transitions, pickup-code completion, refunds/rejection, wallet top-up, loyalty redemption, gift-card generation/redemption.
- Profile self-updates are guarded by a trigger that prevents privilege escalation.

### Error Handling Pattern

- API routes return JSON `{ error }` with appropriate HTTP status and log server errors.
- UI pages commonly use `react-hot-toast`; some older flows still use `alert`.
- Several Supabase writes check errors explicitly, but some admin gift-card/coupon/loyalty updates still do not consistently inspect results after every call.

### Background Jobs and Queues

- No external queue worker found.
- Periodic tasks are implemented as callable RPCs, not scheduled jobs in repo: `expire_gift_cards`, `renew_expired_membership_cycles`, `check_membership_renewals`.

### Webhooks

- No Razorpay webhook route found. Payment success is based on client-returned Razorpay signature verified by API routes.

### File Uploads

- Server-side multipart upload processing through Sharp and S3.
- Allowed upload folders: `menu`, `categories`, `outlets`, `avatars`, `banners`, `campaigns`, `brand`.
- Next image remote patterns allow S3, CloudFront, configured PNUT asset domains, and Supabase public storage.

## Database Schema

Source of truth is `supabase/migrations`. `db-export/public_schema.sql` is an older/latest dump snapshot and may lag recent migrations; rely on migrations first.

### Core Tables

- Identity: `profiles`.
- Outlets/staff: `outlets`, `outlet_staff`, `outlet_settings`.
- Menu: `menu_categories`, `menu_subcategories`, `menu_items`, `item_customization_groups`, `customization_options`, `outlet_menu_items`.
- Orders: `orders`, `order_items`, `order_ratings`.
- Wallet: `wallets`, `wallet_transactions`.
- Loyalty: `loyalty_tiers`, `loyalty_accounts`, `loyalty_actions`, `loyalty_points_log`, `loyalty_ledger`, `missions`, `mission_progress`, `membership_cycles`.
- Promotions: `coupons`, `coupon_usage`, `coupon_campaigns`, `coupon_outlet_restrictions`, `coupon_audit_logs`, `campaigns`, `notifications`.
- Gift cards: `gift_card_templates`, `gift_card_batches`, `gift_cards`, `gift_card_audit_logs`.
- Settings: `app_settings`.

### Important Relationships

- `profiles.id` references `auth.users.id`.
- `profiles.referred_by` self-references profiles.
- `wallets.user_id` and `loyalty_accounts.user_id` are one-to-one with profiles/users.
- `outlet_staff` links profiles to outlets and has manager flag.
- `menu_subcategories.category_id` links to categories.
- `menu_items.subcategory_id` links to subcategories.
- Customization groups/options cascade from menu items.
- `outlet_menu_items` links outlets and menu items with availability/price override.
- `orders.user_id` links customer profile; `orders.outlet_id` links outlet.
- `order_items.order_id` cascades from orders; `order_items.item_id` references menu items.
- Coupon usage links coupons, users, and orders.
- Gift cards link templates and batches; redemption links to `auth.users`.
- Membership and loyalty ledgers link to users and often orders.

### Key Constraints and Rules

- Roles: `customer`, `admin`, `super_admin`, `outlet_staff`.
- Order statuses currently used in code include `pending`, `confirmed`, `preparing`, `ready`, `picked_up`, `cancelled`, `rejected`.
- Payment methods: `online`, `wallet`, `split`; payment statuses: `pending`, `paid`, `refunded`.
- Order status progression RPC permits `pending -> confirmed -> preparing -> ready`; pickup completion moves ready orders to `picked_up` after code verification.
- `prevent_unpaid_order_insert` blocks inserting orders whose `payment_status` is not `paid`.
- `place_order_with_wallet` recomputes menu prices, customizations, discounts, tax, packaging, wallet use, loyalty redemption, and nth-order discounts server-side.
- Wallet self top-up is separate from admin `topup_wallet`.
- Referral rewards are claimable and first-order timed through RPC/trigger logic.
- Membership cycles are based on order count in configurable cycle windows.
- App settings control tax, packaging, loyalty redemption, points percentages, pickup OTP, nth-order discount, and membership settings.

### Indexes

Migrations define indexes for common lookup paths: profile phone/referral/role, outlet city/active/slug, menu hierarchy, customization group/options, outlet menu outlet id, orders by user/outlet/status/created date, wallet transactions by wallet/date, loyalty accounts/logs, missions/progress, coupons/code/active, notifications by user/read/date, gift card code/status/template/batch/redeemer, coupon audit/restrictions, and membership active cycle lookup.

## Authentication and Authorization

- Customer and restaurant login use Supabase auth with `sb-customer-auth-token`.
- Admin login uses Supabase auth with `sb-admin-auth-token`.
- Customer login supports email/password, OTP verification, and Google OAuth.
- Register creates a Supabase Auth user and stores verification email in session storage.
- Password reset flows use Supabase reset/exchange/update APIs.
- Admin/restaurant shells perform additional browser-side checks but middleware is the primary route gate.
- Admin user creation uses service role in `/api/admin/users`, creates Auth user with temporary random password, upserts matching profile, and requires super-admin for elevated roles.

## API Routes Summary

| Route | Methods | Purpose | Auth |
| --- | --- | --- | --- |
| `/api/upload` | `POST`, `DELETE` | Optimized image upload/delete | avatar: any auth user; other folders: admin/super_admin |
| `/api/razorpay/create-order` | `POST` | Create Razorpay order for checkout | customer auth |
| `/api/razorpay/verify-payment` | `POST` | Verify order payment and create order | customer access token |
| `/api/razorpay/wallet-topup` | `POST` | Create/verify wallet top-up | customer access token |
| `/api/email/welcome` | `POST` | Send welcome email | customer auth |
| `/api/admin/verify-role` | `POST` | Verify admin role | admin cookie session |
| `/api/admin/users` | `POST`, `PATCH` | Create Auth users and update roles | admin/super_admin |

## Features and Functionalities

### Customer Outlet Selection

- Purpose: choose active nearby/available outlet for cart/menu context.
- Flow: `/outlets` lists active, not manually closed outlets; selecting outlet updates `useOutletStore` and cart outlet.
- Related models: `outlets`, `outlet_menu_items`.
- Technical notes: cart clears when selected outlet changes.

### Menu Browsing and Customization

- Purpose: browse categories/subcategories/items and customize items.
- Flow: `/menu` loads active categories/subcategories and outlet menu availability; `/menu/[slug]` loads item and customization groups/options; add to cart via Zustand.
- Related models: `menu_categories`, `menu_subcategories`, `menu_items`, `item_customization_groups`, `customization_options`, `outlet_menu_items`.

### Cart and Coupons

- Purpose: review items, notes, coupon validation.
- Flow: `/cart` displays persisted cart, validates active coupon and app settings, stores coupon/discount in cart store.
- Related models: `coupons`, `app_settings`.

### Checkout and Payments

- Purpose: create paid orders with wallet, Razorpay online, split wallet+Razorpay, coupon, loyalty redemption, nth-order discount.
- Flow: `/checkout` computes display totals, fetches wallet/settings, calls Razorpay when amount due remains, verifies payment through API, then RPC creates order.
- Related models/RPCs: `orders`, `order_items`, `wallets`, `wallet_transactions`, `loyalty_accounts`, `loyalty_ledger`, `coupon_usage`, `place_order_with_wallet`, `calculate_max_redeemable_points`, `check_nth_order_discount`.
- Dependencies: Razorpay, Supabase, email templates/SES.

### Order Tracking

- Purpose: customers view order list, details, confirmation, refund status.
- Flow: `/orders` loads own orders and items; details/confirmation load order, items, outlet.
- Related models: `orders`, `order_items`, `outlets`.

### Wallet and Gift Card Redemption

- Purpose: wallet balance, top-up, transaction history, redeem gift cards.
- Flow: `/wallet` loads wallet/transactions, creates Razorpay top-up order, verifies and calls `self_topup_wallet`, redeems gift card with `redeem_gift_card`.
- Related models/RPCs: `wallets`, `wallet_transactions`, `gift_cards`, `self_topup_wallet`, `redeem_gift_card`.
- Dependencies: Razorpay, SES.

### Loyalty, Missions, Membership, Referrals

- Purpose: points, reward actions, missions, redemption, referral rewards, membership tiers.
- Flow: `/loyalty` loads account/tier/actions/missions/progress/logs/ledger/membership; can claim referral reward, award rating/social points, submit order ratings.
- Related models/RPCs: `loyalty_tiers`, `loyalty_accounts`, `loyalty_actions`, `loyalty_points_log`, `loyalty_ledger`, `missions`, `mission_progress`, `membership_cycles`, `order_ratings`, `award_loyalty_points`, `claim_referral_reward`, `get_membership_status`.

### Profile and Notifications

- Purpose: profile display/edit, avatar upload, notification list/read state.
- Flow: `/profile` loads profile/wallet/loyalty/order counts and updates own profile; `/profile-setup` completes required profile info; `/notifications` marks notifications read.
- Related models: `profiles`, `wallets`, `loyalty_accounts`, `notifications`.

### Admin Dashboard and Reports

- Purpose: operational metrics, revenue, recent orders, popular items, reports.
- Flow: admin pages query orders/profiles/outlets/order_items and aggregate client-side.
- Related models: `orders`, `order_items`, `profiles`, `outlets`.

### Admin Catalog Management

- Purpose: manage menu categories, subcategories, items, flags, customization groups/options, images.
- Flow: `/admin/menu` performs direct Supabase CRUD and image uploads.
- Related models: menu tables and customization tables.
- Dependencies: `/api/upload`.

### Admin Outlet and Staff Management

- Purpose: manage outlet records, manual close/reopen, assign outlet staff, grant manager flag.
- Flow: `/admin/outlets` CRUDs `outlets`, edits manual close fields, lists outlet_staff profiles, inserts/deletes/toggles `outlet_staff`.
- Related models: `outlets`, `outlet_staff`, `outlet_settings`, `orders`, `outlet_menu_items`.

### Admin Customer and User Management

- Purpose: list customers/staff/admins, inspect recent orders, update roles, create users, export CSV.
- Flow: `/admin/customers` reads profiles, wallets, loyalty, orders; POST/PATCH `/api/admin/users` for account creation and role update.
- Related models/API: `profiles`, `wallets`, `loyalty_accounts`, `orders`, `/api/admin/users`.

### Admin Orders

- Purpose: manage order queue/status, refunds/rejections, pickup code completion, pickup OTP setting.
- Flow: `/admin/orders` uses `update_order_status`, `manual_refund_order`, `reject_and_refund_order`, `complete_order_with_pickup_code`, `set_pickup_otp_required`.
- Related models/RPCs: `orders`, `order_items`, `app_settings`, wallet/loyalty refund functions.

### Admin Promotions

- Purpose: coupons, coupon campaigns, campaign banners/config, gift cards.
- Flow: `/admin/coupons`, `/admin/campaigns`, `/admin/gift-cards` provide CRUD and audit views.
- Related models/RPCs: `coupons`, `coupon_usage`, `coupon_campaigns`, `coupon_outlet_restrictions`, `coupon_audit_logs`, `campaigns`, `gift_card_templates`, `gift_card_batches`, `gift_cards`, `gift_card_audit_logs`, `generate_gift_card_batch`.

### Restaurant Order Operations

- Purpose: outlet staff manage live orders.
- Flow: restaurant shell loads allowed outlets; orders page subscribes to outlet orders, polls every 15 seconds, auto-accepts if configured, moves orders by RPC, completes with pickup code, rejects/refunds.
- Related models/RPCs: `orders`, `order_items`, `outlet_staff`, `update_order_status`, `complete_order_with_pickup_code`, `reject_and_refund_order`.

### Restaurant Menu and Settings

- Purpose: outlet-scoped availability, price overrides, prep settings, auto-accept/sound.
- Flow: `/restaurant/menu` loads menu and outlet overrides, writes through `upsert_outlet_menu_item`; `/restaurant/settings` updates `outlet_settings` and local compatibility keys.
- Related models/RPCs: `outlet_menu_items`, `outlet_settings`, `upsert_outlet_menu_item`.

## External Integrations

- Supabase: Postgres, Auth, Realtime, local development stack.
- Razorpay: checkout orders, payment signature verification, wallet top-up.
- AWS S3: image object storage.
- CloudFront/custom CDN: optional asset delivery via `NEXT_PUBLIC_CDN_URL`.
- AWS SES: transactional emails for welcome, order confirmation, payment receipt, wallet top-up.
- Google OAuth: configured through Supabase auth config.
- Serwist: PWA/service-worker generation.

## Current System State

### Existing Capabilities

- Major customer shopping, wallet, loyalty, referral, profile, notifications, and order flows are implemented.
- Razorpay-backed wallet top-up and order payment verification exist.
- Admin user creation has a server route using Supabase Auth admin APIs.
- Admin outlet staff assignment is implemented in the current code.
- Restaurant staff outlet loading filters non-admin users through `outlet_staff`.
- Restaurant order and menu mutations use constrained RPCs.
- Upload API includes same-origin checks, role checks, image validation, WebP processing, S3 support, and local fallback.
- `db-export/auth_schema.sql` currently omits auth user data rather than committing auth user COPY rows.
- As of 2026-07-16, `npm run lint` passes with 24 warnings and `npm run build` passes; warnings are mainly raw `<img>` usage and synchronous state updates in effects.

### Pending Work and Limitations

- No payment webhooks are present; payment finalization depends on client-returned Razorpay response plus server-side signature verification.
- No automated unit/integration/E2E test framework is configured.
- No background worker or scheduler is configured for gift-card expiry or membership renewal RPCs.
- Supabase generated TypeScript types are behind the latest migrations; many newer tables/RPCs are accessed with `as never`.
- `db-export/public_schema.sql` appears older than later migrations; migrations are the true schema source.
- Several admin/promo/loyalty pages rely on direct Supabase writes and do not consistently check every mutation result.
- Some UI flows still use `alert`/`confirm` instead of consistent toast/modal patterns.
- Service worker is generated for production but `predev` writes a dev reset service worker to `public/sw.js`.
- App uses two lockfiles (`package-lock.json` and `yarn.lock`); npm appears canonical from scripts/docs.
- Historical audit docs in `docs/codebase-*.md` contain findings that are partly outdated after later changes.

### Known Technical Debt

- Regenerate `src/lib/supabase/types.ts` from the latest migrated schema and remove broad `as never` casts.
- Add E2E coverage for auth, checkout, wallet top-up/redemption, admin user creation/role changes, order status transitions, and restaurant menu overrides.
- Add Razorpay webhook route and idempotent payment state handling.
- Add audit logging for uploads/deletes and high-risk admin writes.
- Add scheduler/cron path for `expire_gift_cards` and membership renewal checks.
- Review RLS and function grants after every migration; prefer RPCs for sensitive writes.
- Improve error handling consistency in admin coupons, gift cards, loyalty, menu, and outlet workflows.
- Replace deterministic/predictable pickup code generation with stronger server-generated random code if pickup code is used as proof of possession.
- Burn down lint warnings and replace raw `<img>` where Next Image is appropriate.
- Consolidate package manager lockfile policy.

### TODOs / Temporary Implementations Found

- No explicit `TODO`/`FIXME` markers were found in source.
- Placeholder comments remain in UI, including admin settings danger zone and admin dashboard revenue chart.
- Dev reset service worker is intentionally generated before `npm run dev`.
- Stress test script includes hardcoded local Supabase anon key suitable only for local dev.

### Current Git State at Initial Audit

At the time this file was created, the worktree already had uncommitted changes not made by this audit:

- Modified: `src/app/api/upload/route.ts`
- Modified: `supabase/config.toml`
- Untracked: `supabase/templates/`

Future sessions must not revert these without explicit user instruction.

## Change Log

## 2026-07-16

### Added

- Created `PROJECT_CONTEXT.md` as the persistent project memory file.
- Documented full initial audit: project overview, tech stack, architecture, frontend/backend/database systems, auth, routes, features, integrations, current state, known issues, and technical debt.

### Updated

- Established future-session rule that this file must be read before tasks and updated after every code/schema/UI/API change.
- Recorded current lint/build baseline from the initial audit.

### Fixed

- No application code fixes were made.

### Removed

- Nothing removed.
