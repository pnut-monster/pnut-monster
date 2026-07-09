# PNUT MONSTER VM Development Deployment Guide

This runbook covers full development deployment on a VM:
- app setup
- database schema setup
- seed/data load
- latest dump generation and restore

## 1) Project Snapshot

- Framework: Next.js 15 (App Router), React 18, TypeScript
- Database stack: Supabase (Postgres 15 + Auth + Realtime)
- File storage: AWS S3 (optional CloudFront)
- Package manager: npm (lockfile present)
- Recommended Node.js: `20.x` (AWS SDK dependencies in this repo require Node 20+)

Main areas in the app:
- Customer app: `src/app/(customer)`
- Admin app: `src/app/(admin)`
- Restaurant/staff app: `src/app/(restaurant)`
- Supabase SQL: `supabase/migrations`, `supabase/seed.sql`
- SQL dump exports: `db-export`

## 2) Database and Schema Overview

The source of truth for schema is `supabase/migrations/*.sql`.

### Public schema tables (domain)

- Identity and users: `profiles`
- Outlets and staff: `outlets`, `outlet_staff`, `outlet_settings`
- Menu: `menu_categories`, `menu_subcategories`, `menu_items`, `item_customization_groups`, `customization_options`, `outlet_menu_items`
- Orders: `orders`, `order_items`
- Wallet: `wallets`, `wallet_transactions`
- Loyalty: `loyalty_tiers`, `loyalty_accounts`, `loyalty_actions`, `loyalty_points_log`
- Missions: `missions`, `mission_progress`
- Promotions and notifications: `coupons`, `coupon_usage`, `campaigns`, `notifications`

### Key DB functions and triggers

- User lifecycle:
  - `handle_new_user()` creates `profiles` row from `auth.users`
  - `handle_new_profile_wallet()` creates `wallets` row
- Outlet lifecycle:
  - `handle_new_outlet_settings()` creates `outlet_settings` row
- Wallet/ordering:
  - `topup_wallet(...)`
  - `place_order_with_wallet(...)`
  - `manual_refund_order(...)`
  - `reject_order_with_refund(...)`
- Loyalty:
  - `award_loyalty_points(...)`
- Utility:
  - `update_updated_at()` trigger helper
  - `generate_delivery_code()` trigger helper
  - `is_admin()` RLS helper

### Access control

- RLS is enabled on all public domain tables.
- Policies support:
  - public read for active catalog/outlets/campaign entities
  - customer read/write only for own data
  - admin (`admin`, `super_admin`) full access
  - outlet staff scoped access for assigned outlets

Policy definitions are mainly in:
- `supabase/migrations/20240101000011_rls_policies.sql`
- `supabase/migrations/20240101000012_outlet_staff.sql`
- `supabase/migrations/20240101000015_staff_order_policies.sql`

## 3) VM Prerequisites

Commands below are for Ubuntu 22.04/24.04.

```bash
sudo apt update
sudo apt install -y git curl ca-certificates gnupg lsb-release unzip jq postgresql-client
```

Install Node.js 20:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

Install Docker (required for local Supabase stack):

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker
docker --version
```

## 4) Clone and Install

```bash
git clone https://github.com/host-havone/newpnut.git newpnut
cd newpnut
npm install
```

## 5) Environment Configuration

Use template:

```bash
cp docs/env.vm.example .env.local
```

Update values in `.env.local`:
- Supabase URL and keys
- Google OAuth credentials
- AWS S3 credentials/bucket/region
- CDN URL (optional)

Do not commit `.env.local`.

## 6) Database Setup on VM

### Option A (recommended): Migrations + seed

This gives a clean, reproducible development DB.

```bash
npx supabase start
npx supabase db reset
```

What this does:
- starts local Supabase services from `supabase/config.toml`
- applies all migrations in order
- loads `supabase/seed.sql`

Default DB port in this repo: `54332`.

### Option B: Restore from latest dump bundle

Use this when you want to mirror the latest exported snapshot instead of only seed data.

```bash
./scripts/db/restore-dump.sh --db-url "postgresql://postgres:postgres@127.0.0.1:54332/postgres"
```

Notes:
- restore into a fresh/empty development DB
- if schema already exists, restore can fail on duplicate objects
- use `--skip-auth` if your target DB already has managed Supabase auth schema

## 7) Run App on VM

Development mode:

```bash
npm run dev -- --hostname 0.0.0.0 --port 3000
```

Production-like mode on VM:

```bash
npm run build
npm run start -- -H 0.0.0.0 -p 3000
```

## 8) Latest Dump Workflow

Current dump files:
- `db-export/public_schema.sql`
- `db-export/auth_schema.sql`
- `db-export/public_data.sql`
- `db-export/LATEST_DUMP_MANIFEST.md`

Refresh latest dump files:

```bash
# from local Supabase stack (requires npx supabase start)
./scripts/db/create-latest-dump.sh --local

# from linked Supabase project
./scripts/db/create-latest-dump.sh --linked

# from explicit database URL
./scripts/db/create-latest-dump.sh --db-url "postgresql://..."
```

Each refresh also writes a timestamped archive copy to:
- `db-export/archive/<UTC_TIMESTAMP>/`

## 9) Deployment Smoke Checks

App routes:
- `http://<vm-ip>:3000/`
- `http://<vm-ip>:3000/admin/login`
- `http://<vm-ip>:3000/restaurant/login`

DB checks:

```sql
select count(*) from public.outlets;
select count(*) from public.menu_items;
select count(*) from public.loyalty_tiers;
select count(*) from public.orders;
```

## 10) Common Issues

- Docker not running:
  - `npx supabase start` / `status` fails until Docker daemon is active.
- Missing OAuth env:
  - warnings for `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` can appear from Supabase config.
- S3 not configured:
  - media upload paths can fail if AWS env vars are empty.
- RLS confusion:
  - use service role key only for trusted server/admin paths.
