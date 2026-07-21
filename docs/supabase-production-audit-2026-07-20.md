# Supabase Production Audit — 2026-07-20

## Scope

Read-only audit of linked project `zhehsszlakgjtkrkcqre` (`Pnut Monster`,
`ap-south-1`) using Supabase CLI, official Security/Performance Advisors, live
Postgres catalog queries through the Management API, Auth configuration, and
database operational inspection. No remote mutations or exploit tests were
performed.

## Executive assessment

Production is critically exposed. The live schema is substantially different
from the repository migration history, and several old `SECURITY DEFINER` RPCs
remain executable by unauthenticated callers without authorization checks.
Attackers can mint wallet funds and loyalty points, create paid orders from
client-supplied values, and invoke refund/cancellation functions.

The application should not accept production traffic until privileged RPC
execution is revoked and the migration state is reconciled through a reviewed,
backed-up deployment plan.

## Critical findings

### C1. Anonymous callers can execute financial and order RPCs

Official Supabase Security Advisor and live catalog results confirm nine
`SECURITY DEFINER` functions are executable by both `anon` and `authenticated`.
The most dangerous live definitions contain no caller authorization:

- `topup_wallet(uuid,numeric,numeric,text)` credits any supplied user wallet.
- `award_loyalty_points(uuid,text,text)` credits any supplied loyalty account.
- `place_order_with_wallet(jsonb,jsonb[],numeric)` trusts caller-supplied user,
  item names, unit prices, totals, discounts, taxes, and payment method, then
  inserts the order with `payment_status = 'paid'`.
- `manual_refund_order(uuid)` refunds qualifying cancelled orders without an
  admin check.
- `reject_order_with_refund(uuid)` cancels/refunds qualifying pending orders
  without an admin or assigned-staff check.

Other anonymously executable definer functions are `handle_new_user`,
`handle_new_profile_wallet`, `handle_new_outlet_settings`, and `is_admin`.

Immediate remediation: revoke `EXECUTE` from `public` and `anon` for all public
functions, then grant only explicitly reviewed RPCs to the minimum roles. Apply
the hardened function definitions only after taking a database backup.

### C2. Customers can bypass authoritative checkout through direct inserts

The live RLS policies still include `orders: users insert own` and
`order_items: users insert own`. An authenticated user can insert an order for
their own user ID and supply financial/payment fields directly, including paid
state, then insert arbitrary order items. The hardened migrations intentionally
remove these policies, but that state is not active remotely.

Immediate remediation: remove direct customer insert policies and require one
fully validated, transaction-safe order RPC.

### C3. Production schema and migration history have severe drift

`supabase migration list` shows only migrations `20240101000001` through
`20240101000014` recorded remotely; `000015` through `000042` are absent.
However, the live schema contains some later objects and a manually applied
`prevent_profile_privilege_escalation` definition. Production is therefore
neither the recorded old schema nor the repository's final schema.

Important application tables absent from the live public schema include
`app_settings`, `order_ratings`, `loyalty_ledger`, `membership_cycles`, all gift
card tables, and the extended coupon management/audit tables. Many RPCs expected
by current application code are also absent or have obsolete signatures.

Impact: security fixes are inconsistently deployed, routes can fail at runtime,
and blindly running all pending migrations risks conflicts with manually
created objects.

Immediate remediation: take a verified production backup; dump and preserve the
actual live schema; reconcile every migration/object; test on a restored staging
database; only then repair migration history and deploy forward.

## High findings

### H1. Restaurant staff order update policy is overly broad

`orders: staff update outlet orders` permits assigned staff to update an order
row directly. It does not restrict changed columns to approved status
transitions, allowing modification of sensitive order/payment fields within the
policy boundary. Hardened RPC-only status transitions are not active remotely.

### H2. Privileged functions have mutable search paths

Security Advisor reports 11 functions without a fixed `search_path`, including
wallet, loyalty, order, refund, trigger, and authorization functions. This is a
known privilege-escalation risk for `SECURITY DEFINER` code.

### H3. Production lacks most checkout/payment hardening

The live `place_order_with_wallet` predates server-side item/menu price
recalculation, customization validation, coupon/loyalty enforcement, paid-order
insert protection, payment-reference validation, and idempotency controls.
These protections exist only in unapplied or drifted repository migrations.

## Medium findings

### M1. Auth configuration is weak

- Minimum password length is 6 with no required character classes.
- Leaked-password protection is disabled.
- CAPTCHA is not enabled.
- Session timebox and inactivity timeout are unlimited.
- TOTP is enabled, but Advisor reports insufficient MFA method coverage.

Positive controls: production Site URL and callback allowlist are correct,
email auto-confirm is disabled, and Google/email providers are enabled.

### M2. Public table grants are broader than necessary

All 24 public tables grant broad table privileges to `anon` and `authenticated`;
RLS currently provides the actual boundary. While RLS is enabled on every live
public table, least-privilege grants would reduce blast radius from policy
mistakes.

### M3. Advisor performance findings

- 156 warnings for multiple permissive policies.
- 22 `auth_rls_initplan` warnings.
- 8 unindexed foreign keys.
- 26 currently unused indexes (informational; do not remove without workload
  analysis).

## Positive findings

- RLS is enabled on all 24 currently live public tables.
- The manually applied super-admin role-boundary trigger is present and uses a
  fixed `search_path`; the earlier admin self-promotion issue is blocked live.
- Supabase database lint reports no PL/pgSQL/schema errors.
- No blocking queries, long-running queries, or table bloat were found.
- Database size is approximately 12 MB with a 100% table cache hit rate.
- Project status is `ACTIVE_HEALTHY` on Postgres 17.6.

## Safe remediation order

1. Put production ordering/wallet actions into maintenance mode if feasible.
2. Take and verify a full database backup.
3. Immediately revoke anonymous/public execution of privileged functions.
4. Remove direct customer order/order-item insert policies.
5. Reconcile live schema versus migrations on a restored staging database.
6. Replace obsolete functions with explicit final hardened definitions and
   constrained grants; avoid blind string-patching migrations.
7. Apply and verify missing tables, constraints, RLS, indexes, and RPCs.
8. Harden Auth settings, then address performance advisor findings.
9. Add automated database tests for anon/customer/admin/staff attack paths.

## Remediation result — 2026-07-20

The critical findings above describe the initial production state. Remediation
was subsequently completed against linked project `zhehsszlakgjtkrkcqre`:

- Preserved schema, data, and roles backups under `db-backups/`.
- Restored production into an isolated Docker database and successfully
  rehearsed all pending migrations before touching production.
- Reconciled migration drift and deployed repository migrations through
  `20240101000047`; local and remote migration history now match.
- Revoked anonymous financial/order RPC execution, removed direct customer
  order inserts and broad staff updates, and constrained payment finalization
  to the service role with durable idempotent payment attempts.
- Added authoritative checkout validation for outlet closure, customization,
  coupon eligibility/limits, and loyalty redemption.
- Reduced Advisor `auth_rls_initplan` warnings from 30 to 0 and unindexed
  foreign keys from 17 to 0. Database lint now reports only harmless unused
  PL/pgSQL parameter/variable warnings.
- Increased minimum password length to 10 and enabled password-change
  reauthentication. Leaked-password protection and session limits were rejected
  by Supabase because they are unavailable on the current plan.

Remaining Advisor notices are 25 expected authenticated security-definer RPCs
with internal authorization, the anonymous `is_admin()` RLS helper, 193
multiple-permissive-policy performance notices, and unused-index informational
notices. The overlapping policies should not be merged without dedicated
semantic regression testing.
