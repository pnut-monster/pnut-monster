# Database Export Folder

This folder stores SQL artifacts used for VM development bootstrap and restore.

## Primary Files

- `public_schema.sql`: latest exported `public` schema
- `auth_schema.sql`: latest exported `auth` schema
- `public_data.sql`: latest exported `public` data snapshot for development
- `LATEST_DUMP_MANIFEST.md`: metadata for current dump set

## Historical Archives

Every refresh via `./scripts/db/create-latest-dump.sh` writes timestamped copies to:

- `db-export/archive/<UTC_TIMESTAMP>/`

## Refresh Latest Dump

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
