# PNUT MONSTER

PNUT MONSTER is a Next.js 15 + Supabase application with three main surfaces:
- customer app
- admin app
- restaurant/staff app

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

## VM Deployment Runbook

See:
- `docs/vm-development-deployment.md`

This includes:
- VM prerequisites
- app bootstrap steps
- migration/seed workflow
- dump restore workflow
- smoke checks

## Project Structure

- `src/app/(customer)` customer experience
- `src/app/(admin)` admin panel
- `src/app/(restaurant)` outlet/staff interface
- `supabase/migrations` schema and policy migrations
- `supabase/seed.sql` development seed data
- `scripts/db` dump and restore automation
