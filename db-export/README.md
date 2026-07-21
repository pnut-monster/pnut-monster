# Database Export Folder

This folder stores SQL artifacts used for architecture review, VM development bootstrap, and restore. The schema files were refreshed from production on 2026-07-20 after verifying migrations 1–47; they contain definitions only, not auth user records.

## Primary Files

- `public_schema.sql`: latest exported `public` schema
- `auth_schema.sql`: latest exported `auth` schema only; auth table data is intentionally omitted
- `public_data.sql`: latest exported `public` data snapshot for development
- `LATEST_DUMP_MANIFEST.md`: metadata for current dump set

## Historical Archives

Every refresh via `./scripts/db/create-latest-dump.sh` writes timestamped copies to:

- `db-export/archive/<UTC_TIMESTAMP>/`

## Refresh Latest Dump

Do not commit auth table data. If a refresh command creates `COPY auth.*`
blocks with user rows, password hashes, tokens, emails, or audit payloads,
sanitize the file before committing.

```bash
# Local Supabase stack
./scripts/db/create-latest-dump.sh --local

# Linked Supabase project
./scripts/db/create-latest-dump.sh --linked

# Explicit database URL
./scripts/db/create-latest-dump.sh --db-url "postgresql://..."
```

## Restore Into VM Database

```bash
./scripts/db/restore-dump.sh --db-url "postgresql://postgres:postgres@127.0.0.1:54332/postgres"
```

Optional flags:
- `--skip-auth`
- `--schema-only`
