-- ==========================================================================
-- Migration: 010_rename_leg_to_outcome.sql
-- Purpose: Rename "leg" → "outcome" in the event_data JSON schema
-- ==========================================================================

-- 1. Update existing rows: rename the "leg" key to "outcome"
UPDATE secrets
SET event_data = (event_data - 'leg') || jsonb_build_object('outcome', event_data->'leg')
WHERE event_data IS NOT NULL AND event_data ? 'leg';

-- 2. Drop the old constraint that enforces "leg"
ALTER TABLE secrets DROP CONSTRAINT secrets_event_data_schema;

-- 3. Re-add the constraint with "outcome" instead of "leg"
ALTER TABLE secrets ADD CONSTRAINT secrets_event_data_schema CHECK (
  event_data IS NULL OR jsonb_matches_schema(
    '{
      "type": "object",
      "required": ["marketplace", "event", "marketId", "outcome"],
      "properties": {
        "marketplace": { "type": "string" },
        "event": { "type": "string" },
        "marketId": { "type": "number" },
        "outcome": { "type": "string", "enum": ["yes", "no"] }
      },
      "additionalProperties": false
    }',
    event_data
  )
);
