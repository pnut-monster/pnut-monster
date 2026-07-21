# PNUT MONSTER

Production food ordering, payments, wallet, loyalty, and outlet-operations platform deployed at [pnut.monster](https://pnut.monster). It combines a Next.js 15 Cloudflare Worker with Supabase Postgres/Auth/Realtime, Razorpay, and AWS S3/SES.

The application has three role-aware surfaces: customer, admin, and restaurant/outlet staff. The complete system description, trust boundaries, route catalog, dependency map, and operations guidance are in [docs/architecture.md](docs/architecture.md).

## Prerequisites

- Node.js `20.x`
- npm
- Docker (for local Supabase)
- Supabase CLI (via `npx supabase ...`)

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp docs/env.vm.example .env.local
```

3. Start local Supabase and apply schema/seed:

```bash
npx supabase start
npx supabase db reset
```

4. Start the app:

```bash
npm run dev
```

App URL: `http://localhost:3000`

## Database Dump Bundle

Latest dump artifacts are in `db-export/`:
- `public_schema.sql`
- `auth_schema.sql`
- `public_data.sql`
- `LATEST_DUMP_MANIFEST.md`

### Refresh latest dump

```bash
# local Supabase database
./scripts/db/create-latest-dump.sh --local

# linked Supabase project
./scripts/db/create-latest-dump.sh --linked

# explicit DB URL
./scripts/db/create-latest-dump.sh --db-url "postgresql://..."
```

### Restore dump into a target DB

```bash
./scripts/db/restore-dump.sh --db-url "postgresql://postgres:postgres@127.0.0.1:54332/postgres"
```

Optional flags:
- `--skip-auth`
- `--schema-only`

## Documentation

- [Architecture and feature catalog](docs/architecture.md)
- [Current full audit](docs/codebase-deep-audit-2026-07-20.md)
- [Database and production reconciliation](docs/supabase-production-audit-2026-07-20.md)
- [Cloudflare deployment](docs/cloudflare-deployment.md)
- [AWS email service](docs/aws-email-service.md)
- [S3 setup](docs/s3-setup.md)
- [VM development deployment](docs/vm-development-deployment.md)
- [Environment template](.env.example)

## Release Validation

```bash
npm run lint
npm run build
npm run email:templates:validate
npm audit --omit=dev
```

## Project Structure

- `src/app/(customer)` customer experience
- `src/app/(admin)` admin panel
- `src/app/(restaurant)` outlet/staff interface
- `supabase/migrations` schema and policy migrations
- `supabase/seed.sql` development seed data
- `scripts/db` dump and restore automation
