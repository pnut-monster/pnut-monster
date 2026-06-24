# Latest Database Dump Manifest

- Generated At (UTC): 2026-06-24T00:00:00Z
- Source: repository snapshot
- Public Data Mode: seed-snapshot

## Files

- `db-export/public_schema.sql`
- `db-export/auth_schema.sql`
- `db-export/public_data.sql`

## Notes

- `public_schema.sql` and `auth_schema.sql` are the committed schema exports in this repository.
- `public_data.sql` is the development seed snapshot copied from `supabase/seed.sql`.
- To refresh from a running/local/linked database, run `./scripts/db/create-latest-dump.sh`.
