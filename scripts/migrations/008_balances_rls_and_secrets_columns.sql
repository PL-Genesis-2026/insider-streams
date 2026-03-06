-- ==========================================================================
-- Migration: 008_balances_rls_and_secrets_columns.sql
-- Purpose:
--   1. Enable RLS on the balances VIEW (service role only)
--   2. Rename secrets.market_data → event_data
--   3. Change secrets.secret_data from jsonb to text
-- ==========================================================================

-- 1. Enable RLS on balances VIEW — service role bypasses RLS,
--    so with no policies, only service_role can access it.
ALTER VIEW balances SET (security_invoker = true);

-- 2. Rename market_data → event_data
ALTER TABLE secrets RENAME COLUMN market_data TO event_data;

-- 3. Change secret_data from jsonb to text
ALTER TABLE secrets ALTER COLUMN secret_data TYPE text USING secret_data::text;

-- 4. Enable pg_jsonschema for JSON Schema validation
CREATE EXTENSION IF NOT EXISTS pg_jsonschema;

-- 5. Enforce JSON schema on event_data using pg_jsonschema:
--    { marketplace: string, event: string, marketId: number, leg: "yes"|"no" }
ALTER TABLE secrets ADD CONSTRAINT secrets_event_data_schema CHECK (
  event_data IS NULL OR jsonb_matches_schema(
    '{
      "type": "object",
      "required": ["marketplace", "event", "marketId", "leg"],
      "properties": {
        "marketplace": { "type": "string" },
        "event": { "type": "string" },
        "marketId": { "type": "number" },
        "leg": { "type": "string", "enum": ["yes", "no"] }
      },
      "additionalProperties": false
    }',
    event_data
  )
);
