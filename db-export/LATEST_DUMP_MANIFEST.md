# Latest Database Dump Manifest

- Generated At (UTC): 2026-07-20
- Source: linked production Supabase project
- Public Data Mode: seed-snapshot

## Files

- `db-export/public_schema.sql`
- `db-export/auth_schema.sql`
- `db-export/public_data.sql`

## Notes

- `public_schema.sql` and `auth_schema.sql` were freshly exported schema-only from the linked production project after confirming all 47 migrations are in parity.
- `public_data.sql` is the development seed snapshot copied from `supabase/seed.sql`.
- To refresh from a running/local/linked database, run `./scripts/db/create-latest-dump.sh`.
