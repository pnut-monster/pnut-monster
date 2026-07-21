# PNUT MONSTER Deep Codebase Audit — 2026-07-21

## Executive summary

The current repository is materially safer than the pre-hardening system described in the
2026-07-20 audit. Sensitive order, wallet, loyalty, refund, staff, and role operations now
have server/database authorization boundaries; checkout recomputes commercial values in
Postgres; Razorpay verification checks signatures, provider state, amount, currency, user,
and a durable payment attempt; OAuth redirects are constrained; and production validation
is clean.

No critical source-level authorization bypass was found in the current 47-migration state.
The most important remaining issue is payment initiation: the Razorpay order amount is still
accepted from the browser before the authoritative checkout calculation. A tampered or stale
amount can therefore be captured and only then rejected during finalization. The webhook
recovery route also remains unavailable in production until its secret is configured.

This audit reviewed all 229 tracked files, 56 built routes, 14 route handlers, 47 database
migrations, authentication and middleware, customer/admin/restaurant flows, payments,
uploads, email, PWA behavior, Cloudflare/OpenNext configuration, dependency state, and
repository hygiene. It was a static and local-build audit; live production infrastructure
and the linked Supabase project were not re-audited.

## Remediation status — 2026-07-21

All repository-level findings were remediated in the same working session:

- Razorpay initiation now creates a service-role-only authoritative checkout quote by
  executing the exact checkout function in a rolled-back database subtransaction. The
  provider amount comes from that quote, payment attempts reference it uniquely, and
  finalization consumes the quote's stored payload and amount.
- Password reset is non-enumerating and protected by shared per-IP and per-email limits.
- Welcome email is atomically one-time per profile and protected by a durable cooldown.
- Payment and upload limits moved from unbounded process-local maps to a shared Postgres
  limiter with hashed subjects and expiry cleanup.
- Audited coupon, gift-card, and loyalty mutations now inspect errors; coupon outlet
  restriction replacement is transactional through an admin-authorized RPC.
- Current local-schema Supabase types were regenerated, and high-risk payment/rate-limit
  paths no longer require `as never` casts.
- Static audit regression guards and live local-database privilege/RLS regression checks
  were added as `npm run test:audit` and `npm run test:db-audit`.
- Tracked database archives were removed and `/db-backups/` is ignored by default.

One deployment action cannot be completed from repository access: production still lacks
`RAZORPAY_WEBHOOK_SECRET`, and no matching secret is available locally. The same newly
generated value must be configured in the Razorpay dashboard and Cloudflare Worker; setting
only one side would disable webhook verification.

## Prioritized findings

### High — Payment amount is trusted at initiation and validated only after capture

- Evidence: `src/app/(customer)/checkout/page.tsx:361` sends browser-computed `amountDue`;
  `src/app/api/razorpay/create-order/route.ts:102-126` validates only a numeric range before
  creating the Razorpay order. The durable payload is finalized later through
  `finalize_captured_payment_attempt`.
- The database correctly recomputes item prices, customizations, discounts, tax, packaging,
  wallet use, and loyalty, and rejects an insufficient `razorpay_amount_paid`. That prevents
  an underpayment from creating a paid order, but the rejection occurs after funds can be
  captured.
- Impact: stale cart/settings data or a malicious request can create and pay an underfunded
  Razorpay order. Order finalization then fails, leaving a captured payment requiring recovery
  or refund and producing a poor customer/support outcome.
- Recommendation: add one service-side checkout-quote RPC that returns an immutable quote ID,
  authoritative amount, and expiry; create Razorpay orders only from that quote; persist the
  quote with the payment attempt; and make finalization compare against the same quote.

### High operational — Razorpay webhook recovery is not deployable without its secret

- Evidence: the webhook requires `RAZORPAY_WEBHOOK_SECRET`, documented in `.env.example:54`
  and `docs/cloudflare-deployment.md:37`; `PROJECT_CONTEXT.md` records that the production
  binding is still absent.
- Impact: if the browser closes, loses connectivity, or verification fails after capture,
  automatic provider-driven recovery cannot run. This amplifies the payment-initiation issue.
- Recommendation: generate a dedicated secret, configure the identical value in Razorpay and
  Cloudflare, enable the captured/failed events, and run replay/idempotency tests before
  considering the recovery path operational.

### Medium — Password reset enables account enumeration and email abuse

- Evidence: `src/app/api/auth/forgot-password/route.ts:48-62` queries the profile with the
  service role and returns a distinct 404 and message for an unknown email; the endpoint has
  no rate limit or challenge before `resetPasswordForEmail` at line 67.
- Impact: attackers can discover registered customer addresses and repeatedly trigger reset
  mail, consuming email reputation and support capacity.
- Recommendation: always return the same generic success response, add durable per-IP and
  per-normalized-email limits, and consider Turnstile after a low threshold. Keep provider
  Auth rate limits enabled as defense in depth.

### Medium — Authenticated users can repeatedly send welcome mail

- Evidence: `src/app/api/email/welcome/route.ts:6-35` authenticates the caller but has no
  idempotency record, cooldown, or distributed rate limit before invoking SES.
- Impact: any account can repeatedly send email to itself, creating avoidable SES cost,
  reputation pressure, and noisy telemetry.
- Recommendation: send welcome mail from a trusted signup/profile-completion event and store
  `welcome_email_sent_at`; otherwise enforce a durable per-user cooldown.

### Medium — Process-local rate limiting is incomplete and unbounded

- Evidence: create-order, verify-payment, wallet-topup, and upload use module-level `Map`
  instances (`create-order/route.ts:15`, `verify-payment/route.ts:21`,
  `wallet-topup/route.ts:17`, `upload/route.ts:12`). Expired keys are replaced only when that
  same key returns and are never globally pruned.
- Impact: limits are inconsistent across Cloudflare instances/restarts and attacker-selected
  IP keys can grow a long-lived instance's memory. Forgot-password and email routes have no
  equivalent controls.
- Recommendation: use Cloudflare rate-limit bindings, Durable Objects, or another shared
  bounded store; key authenticated payment limits by user plus IP; validate trusted proxy
  headers; and prune/TTL all keys.

### Medium — Several admin mutations ignore database errors

- Evidence: unchecked writes remain in gift-card status updates
  (`admin/gift-cards/page.tsx:353`), coupon deletes/status/campaign operations
  (`admin/coupons/page.tsx:517-565`), loyalty actions/missions/campaign settings
  (`admin/loyalty/page.tsx:480-638`), and some multi-step menu operations.
- Impact: the UI can report or display success after an RLS, constraint, network, or partial
  multi-step failure. Coupon restriction replacement is especially vulnerable to partial
  state because delete and insert are separate client calls.
- Recommendation: check every result, show actionable errors, and move multi-table catalog,
  coupon, and gift-card changes into transactional RPCs with server-side audit logging.

### Medium — No automated regression test suite exists

- Evidence: `package.json` has no unit, integration, or E2E test script; the only test-like
  utility is a stress script.
- Impact: the highest-risk boundaries—payment idempotency/recovery, RPC authorization, RLS,
  role escalation prevention, refund state transitions, and coupon/customization validation—
  rely on manual verification.
- Recommendation: begin with SQL authorization/transaction tests and Playwright smoke tests
  for auth, checkout, wallet, admin roles, restaurant assignment, and order transitions.

### Low — Generated database types still lag the schema

- Evidence: 232 `as never` casts remain across `src`; newer RPCs/tables such as payment
  attempts, gift cards, outlet settings, and loyalty features are not fully represented in
  `src/lib/supabase/types.ts`.
- Impact: schema drift and payload mistakes are hidden from TypeScript, particularly in
  financial and admin paths.
- Recommendation: generate types from the production-parity migration state in CI and remove
  casts incrementally, starting with payment and admin mutation code.

### Low — Database backup artifacts are tracked in Git

- Evidence: two files under `db-backups/`, including a 770 KB custom-format dump, are tracked.
  The current ignore rule covers only `db-backups/production-*`.
- Impact: opaque database archives increase repository size and create a future risk of
  committing business or personal data even when the current artifact is development-only.
- Recommendation: verify contents, move needed backups to encrypted access-controlled object
  storage, remove them from Git history if sensitive, and ignore `/db-backups/` by default.

## Security controls verified

- Middleware separates admin and customer cookie namespaces and role-gates admin/restaurant
  routes. Protected customer routes authenticate with `getUser()`.
- OAuth `next` values reject scheme-relative paths, backslashes, and control characters.
- Service-role use is confined to server route handlers and the server-only admin client.
- The upload API checks origin, authentication/role, folder allowlist, size, decoded image
  signature/dimensions, generated keys, and production storage availability.
- Profile role changes are constrained both in the admin API and by the database privilege
  escalation trigger.
- Current migrations revoke broad RPC execution, pin security-definer search paths, constrain
  order/staff operations, remove direct customer order insertion, and deny client access to
  payment attempts.
- Checkout validates active/open outlet, item and outlet availability, authoritative prices,
  customization membership/counts, coupon eligibility and limits, nth-order discount,
  loyalty limits, wallet balance, payment amount, and payment idempotency.
- Razorpay verification checks HMAC signatures with timing-safe comparison, fetches provider
  payment/order state, requires `captured`, matches amount/currency/order/user, and persists a
  durable attempt before finalization.
- The webhook is signed and finalization is service-role-only and idempotent in the database.
- No tracked live secret pattern was found; the Razorpay key in `.env.example` is a placeholder.

## Quality and validation results

- `npm run lint`: pass, zero warnings/errors.
- `npx tsc --noEmit`: pass.
- `npm run email:templates:validate`: pass, 26 templates.
- `npm run build` with isolated `NEXT_DIST_DIR`: pass, 56 routes generated.
- `npm audit --omit=dev`: zero known production vulnerabilities.
- Build observations: middleware is 82.6 KB; admin pages generally load 219–228 KB first-load
  JavaScript; Webpack reports a non-fatal large-string cache warning; Node reports the upstream
  `module.register()` deprecation warning.

## Remediation order

1. Bind payment initiation to an authoritative server quote.
2. Configure and test the production Razorpay webhook secret/recovery flow.
3. Make password reset non-enumerating and add shared rate limits to all abuse-prone routes.
4. Make welcome email event-driven/idempotent.
5. Transactionalize admin multi-table writes and handle every mutation error.
6. Add database authorization/payment tests and E2E smoke coverage.
7. Regenerate database types and remove high-risk `as never` casts.
8. Remove database archives from normal Git tracking.
