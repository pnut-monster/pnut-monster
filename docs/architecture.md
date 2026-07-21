# PNUT MONSTER Production Architecture

Last verified: 2026-07-20. Production: `https://pnut.monster`.

## System overview

PNUT MONSTER is one Next.js App Router application with three presentation surfaces backed by one Supabase project. Customer pages cover discovery, cart, checkout, orders, wallet, loyalty, referrals, addresses, notifications, profile, support, and authentication. Admin pages operate orders, catalog, outlets, users, loyalty, coupons, gift cards, campaigns, notifications, reports, and settings. Restaurant pages provide an outlet-scoped live order queue, menu overrides, and settings.

```text
Browser/PWA
  -> Cloudflare Worker (Next.js/OpenNext: pages, middleware, API routes)
     -> Supabase Auth + Postgres/RLS/RPC + Realtime
     -> Razorpay Orders/Payments <- signed webhook
     -> AWS S3 (images and private email templates)
     -> AWS SES (transactional delivery)
```

## Technology and deployment

- Next.js 15, React 18, TypeScript 5, Tailwind CSS 4, Zustand 5.
- Cloudflare Workers through `@opennextjs/cloudflare`; `wrangler.jsonc` maps `pnut.monster/*`, enables Node compatibility, static assets, image binding, logs, and source maps.
- Supabase Postgres 15, Auth, PostgREST RPC, RLS, and Realtime. There is no ORM.
- Razorpay server SDK plus HMAC verification and durable `payment_attempts` recovery.
- AWS SDK v3 for S3, SES, and operational inspection scripts. CloudFront is optional through `NEXT_PUBLIC_CDN_URL`.
- Serwist provides the production service worker/PWA shell. Development disables it and clears stale registrations.
- Supported runtime is Node >=20 and <23. Builds executed with newer Node versions are outside the declared support range.

Build flow: `npm install` -> `npm run lint` -> `npm run build` for the standard server build. Cloudflare uses `npm run build:cloudflare`, then `npm run deploy:cloudflare`. Secrets belong in Cloudflare encrypted secrets and never in `wrangler.jsonc`.

## Frontend architecture

Route groups under `src/app` separate `(customer)`, `(admin)`, and `(restaurant)` layouts without changing public URLs. The root layout owns fonts, global design tokens, toast handling, and offline state. Local UI primitives live in `src/components/ui`; surface-specific components live in `src/components/customer` and `src/components/restaurant`.

Zustand persists cart and selected-outlet state. Most feature pages use React local state and Supabase browser queries. The restaurant order queue subscribes to Realtime and uses 15-second polling as a resilience fallback. Module/page caches and email-template memory caching exist; there is no Redis or other shared application cache.

Customer routes: `/`, `/about`, `/outlets`, `/menu`, `/menu/[slug]`, `/search`, `/cart`, `/checkout`, `/orders`, `/orders/[id]`, confirmation, `/wallet`, `/loyalty`, `/referral`, `/notifications`, `/addresses`, `/profile`, `/profile-setup`, `/support`, and auth routes.

Admin routes: `/admin`, `/admin/orders`, `/admin/menu`, `/admin/outlets`, `/admin/customers`, `/admin/loyalty`, `/admin/coupons`, `/admin/gift-cards`, `/admin/campaigns`, `/admin/notifications`, `/admin/reports`, and `/admin/settings`.

Restaurant routes: `/restaurant`, `/restaurant/orders`, `/restaurant/menu`, and `/restaurant/settings`.

## Backend and API catalog

Next route handlers are the server boundary for provider credentials and privileged Auth operations:

| Method/path | Responsibility |
|---|---|
| `POST /api/upload` | Authenticated, same-origin, signature-checked images to S3; avatars are self-service, brand/catalog folders require admin. |
| `DELETE /api/upload?key=` | Admin deletion of generated, allow-listed S3 keys. |
| `GET /api/coupons/eligible` | Customer coupon preview and extended eligibility. |
| `POST /api/auth/forgot-password` | Rate-limited recovery initiation using the configured site origin. |
| `POST /api/email/welcome` | Authenticated welcome email. |
| `POST /api/admin/email/templates/cache` | Admin email-template cache invalidation. |
| `POST /api/admin/verify-role` | Admin-session role verification. |
| `POST/PATCH /api/admin/users` | Privileged Auth user creation and controlled role updates. |
| `POST /api/razorpay/create-order` | Creates a customer payment attempt and Razorpay order. |
| `POST /api/razorpay/verify-payment` | Verifies captured payment and idempotently finalizes an order. |
| `POST /api/razorpay/wallet-topup` | Creates/verifies wallet top-ups. |
| `POST /api/razorpay/webhook` | Validates raw-body webhook HMAC and recovers captured/failed attempts. |

Many ordinary reads and RLS-authorized writes go directly from the browser to Supabase. Financial and security-sensitive changes use database functions, including order placement/finalization, wallet and loyalty operations, refunds/rejections, gift cards, and role boundaries.

## Identity and authorization

Supabase Auth supports email/password, OTP/magic link, password recovery, and Google OAuth. Customer and admin sessions use separate cookie keys (`sb-customer-auth-token` and `sb-admin-auth-token`) to avoid cross-surface session confusion. Middleware refreshes sessions, then checks profile roles for protected route groups.

Roles are `customer`, `outlet_staff`, `admin`, and `super_admin`. `/admin/*` requires admin or super-admin; `/restaurant/*` accepts outlet staff or admins; customer account/checkout routes require a user. RLS remains the primary data boundary. Database trigger and RPC hardening prevent direct privilege escalation. The service-role key is server-only and bypasses RLS, so it is restricted to narrow API operations.

## Data architecture

The canonical database definition is the ordered set of 47 SQL migrations in `supabase/migrations`. On 2026-07-20 the linked production project reported exact local/remote parity through migration `20240101000047`. Fresh schema-only production exports are committed as `db-export/public_schema.sql` and `db-export/auth_schema.sql`; auth user rows are intentionally excluded.

Core domains are profiles and addresses; outlets/staff/settings; categories/items/customizations/overrides; orders/items/ratings; wallet transactions; loyalty ledger/missions/membership/referrals; coupons/campaigns; gift cards; notifications; app settings; and payment attempts. Foreign keys and unique indexes protect identifiers and payment idempotency. RLS policies and security-definer functions encode tenancy and role rules.

No external queue is configured. `expire_gift_cards`, membership renewal functions, and payment recovery are callable jobs, but the repository contains no cron scheduler. Razorpay webhooks provide event-driven payment recovery. Operators must schedule recurring database maintenance outside this repository.

## Integrations and storage

- S3 image objects are generated under allow-listed prefixes. The browser performs Cloudflare-compatible resize/conversion; the server verifies magic bytes and size before upload. Production fails closed if S3 is absent.
- Email HTML sources live in `email-templates/`, are validated/uploaded by `scripts/email`, fetched privately from S3, safely rendered, cached with bounded TTL/entries, and delivered by SES. Branding is centralized in `src/lib/email/config.ts`.
- Razorpay payment signatures and provider amounts/currency are verified server-side. Captured attempts are persisted and finalized idempotently; failed synchronous finalization can be retried by webhook.
- There is no third-party CMS. Catalog, campaigns, notifications, and page-facing business content are managed through the admin panel and Supabase tables.

## Configuration

`.env.example` is authoritative. Required production groups are Supabase URL/anon/service role, site URL, Razorpay public/secret/webhook keys, AWS credentials or workload identity, S3 bucket/region/CDN, SES sender/region, and email-template bucket/prefix. Email branding, cache TTL, social links, and support links are optional overrides. Public variables are browser-visible; service-role, AWS, Razorpay, and webhook secrets must never use `NEXT_PUBLIC_`.

## Dependency map and ownership

| Area | Primary code | Depends on |
|---|---|---|
| UI/routes | `src/app`, `src/components` | React, Tailwind, Supabase browser client, Zustand |
| Session boundary | `src/middleware.ts`, `src/lib/supabase` | Supabase Auth/cookies/profiles |
| Checkout/payment | checkout + Razorpay APIs | Razorpay, `payment_attempts`, order/wallet RPCs |
| Email | `src/lib/email`, `email-templates` | S3 templates, SES, branding env |
| Media | upload API, `src/lib/s3`, ImageUpload | S3/CDN and admin/customer authorization |
| Operations | admin/restaurant routes | RLS/RPC, Realtime, app/outlet settings |
| Persistence | migrations/types | Supabase Postgres, Auth schema |
| Deployment | Next/OpenNext/Wrangler/Serwist configs | Cloudflare Worker and assets |

## Operations, quality, and known risks

Health is validated with lint, production build, email-template validation, dependency audit, migration parity, and a staged secret scan. There is currently no unit, integration, or E2E framework; financial and authorization regression tests are the highest-value missing control. In-memory rate limits are instance-local. CSP still needs nonces/hashes to remove `unsafe-inline`/`unsafe-eval`. Recurring database jobs need an external schedule. Generated Supabase types should be refreshed whenever migrations change.

For finding-level evidence and remediation status, see `docs/codebase-deep-audit-2026-07-20.md`. Historical July 8 audit files are snapshots, not the current production assessment.
