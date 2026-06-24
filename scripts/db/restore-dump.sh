#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EXPORT_DIR="${ROOT_DIR}/db-export"

DB_URL=""
INCLUDE_AUTH=1
INCLUDE_DATA=1

usage() {
  cat <<'EOF'
Restore PNUT MONSTER dump files into a target PostgreSQL database.

Usage:
  ./scripts/db/restore-dump.sh --db-url <url> [--skip-auth] [--schema-only]

Options:
  --db-url <url>    Target database URL (required)
  --skip-auth       Skip restoring db-export/auth_schema.sql
  --schema-only     Restore schema files only (skip public_data.sql)
  -h, --help        Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-url)
      DB_URL="${2:-}"
      shift 2
      ;;
    --skip-auth)
      INCLUDE_AUTH=0
      shift
      ;;
    --schema-only)
      INCLUDE_DATA=0
      shift
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

if [[ -z "$DB_URL" ]]; then
  echo "--db-url is required." >&2
  usage
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required but not found." >&2
  exit 1
fi

run_sql_file() {
  local sql_file="$1"
  if [[ ! -f "$sql_file" ]]; then
    echo "Missing required file: $sql_file" >&2
    exit 1
  fi
  echo "Applying $(basename "$sql_file")..."
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$sql_file"
}

if [[ "$INCLUDE_AUTH" -eq 1 ]]; then
  run_sql_file "${EXPORT_DIR}/auth_schema.sql"
fi

run_sql_file "${EXPORT_DIR}/public_schema.sql"

if [[ "$INCLUDE_DATA" -eq 1 ]]; then
  run_sql_file "${EXPORT_DIR}/public_data.sql"
fi

echo "Restore completed."
