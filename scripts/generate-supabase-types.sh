#!/usr/bin/env bash
# NOTE TO CLAUDE: This code relates to the old CRE based system. It's being kept
# in until you've confirmed the Zama port works end to end. You can use it as
# reference for how the old system used to work, but you should not update or
# maintain these files.

# generate-supabase-types.sh — Regenerate Supabase TypeScript types from the live database
#
# Requires: supabase CLI, DATABASE_URL in .env
#
# Usage: ./scripts/generate-supabase-types.sh
#   or:  pnpm generate:supabase-types  (from workspace root)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT="$ROOT_DIR/packages/common/src/__generated__/supabase-types.ts"

# Load DATABASE_URL from root .env
if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

: "${DATABASE_URL:?DATABASE_URL not set — add it to .env}"

echo "Generating Supabase types from database..."
# stderr has "Connecting to..." message — discard it
supabase gen types --db-url "$DATABASE_URL" --schema public 2>/dev/null > "$OUT"

echo "Generated: $OUT"
