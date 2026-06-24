#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EXPORT_DIR="${ROOT_DIR}/db-export"
TIMESTAMP_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
TIMESTAMP_TAG="$(date -u +"%Y%m%dT%H%M%SZ")"

SOURCE="local"
DB_URL=""
DATA_MODE="dump"

usage() {
  cat <<'EOF'
Create latest SQL dump files for PNUT MONSTER.

Usage:
  ./scripts/db/create-latest-dump.sh [--local | --linked | --db-url <url>]

Options:
  --local           Dump from local Supabase database (default)
  --linked          Dump from linked Supabase project
  --db-url <url>    Dump from explicit database URL
  -h, --help        Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local)
      SOURCE="local"
      shift
      ;;
    --linked)
      SOURCE="linked"
      shift
      ;;
    --db-url)
      SOURCE="db-url"
      DB_URL="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ "$SOURCE" == "db-url" && -z "$DB_URL" ]]; then
  echo "--db-url requires a value." >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required but not found." >&2
  exit 1
fi

mkdir -p "${EXPORT_DIR}"
mkdir -p "${EXPORT_DIR}/archive/${TIMESTAMP_TAG}"

TMP_DIR="$(mktemp -d "${EXPORT_DIR}/.tmp_dump_${TIMESTAMP_TAG}_XXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

run_dump() {
  if [[ "$SOURCE" == "local" ]]; then
    npx supabase db dump --local "$@"
  elif [[ "$SOURCE" == "linked" ]]; then
    npx supabase db dump --linked "$@"
  else
    npx supabase db dump --db-url "$DB_URL" "$@"
  fi
}

echo "Creating public schema dump..."
run_dump --schema public --file "${TMP_DIR}/public_schema.sql"

echo "Creating auth schema dump..."
run_dump --schema auth --file "${TMP_DIR}/auth_schema.sql"

echo "Creating public data dump..."
if run_dump --data-only --schema public --file "${TMP_DIR}/public_data.sql"; then
  DATA_MODE="dump"
else
  echo "Public data dump failed. Falling back to supabase/seed.sql for development data." >&2
  cp "${ROOT_DIR}/supabase/seed.sql" "${TMP_DIR}/public_data.sql"
  DATA_MODE="seed-fallback"
fi

cp "${TMP_DIR}/public_schema.sql" "${EXPORT_DIR}/archive/${TIMESTAMP_TAG}/public_schema.sql"
cp "${TMP_DIR}/auth_schema.sql" "${EXPORT_DIR}/archive/${TIMESTAMP_TAG}/auth_schema.sql"
cp "${TMP_DIR}/public_data.sql" "${EXPORT_DIR}/archive/${TIMESTAMP_TAG}/public_data.sql"

mv "${TMP_DIR}/public_schema.sql" "${EXPORT_DIR}/public_schema.sql"
mv "${TMP_DIR}/auth_schema.sql" "${EXPORT_DIR}/auth_schema.sql"
mv "${TMP_DIR}/public_data.sql" "${EXPORT_DIR}/public_data.sql"

cat > "${EXPORT_DIR}/LATEST_DUMP_MANIFEST.md" <<EOF
# Latest Database Dump Manifest

- Generated At (UTC): ${TIMESTAMP_UTC}
- Source: ${SOURCE}
- Public Data Mode: ${DATA_MODE}

## Files

- \`db-export/public_schema.sql\`
- \`db-export/auth_schema.sql\`
- \`db-export/public_data.sql\`

## Archive Copy

- \`db-export/archive/${TIMESTAMP_TAG}/\`

## Restore

Use:

\`\`\`bash
./scripts/db/restore-dump.sh --db-url "postgresql://postgres:postgres@127.0.0.1:54332/postgres"
\`\`\`
EOF

echo "Dump refresh complete."
echo "Latest files written to: ${EXPORT_DIR}"
echo "Archive created at: ${EXPORT_DIR}/archive/${TIMESTAMP_TAG}"
