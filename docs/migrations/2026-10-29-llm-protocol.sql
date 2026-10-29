-- Additive migration. Apply before deploying code that selects protocol_config.
-- Run with psql -v ON_ERROR_STOP=1 against the intended database.
BEGIN;
ALTER TABLE ai_providers ADD COLUMN IF NOT EXISTS protocol_config jsonb;
CREATE TABLE IF NOT EXISTS ai_usage_attempts (
  attempt_id text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id integer NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
  model text NOT NULL,
  protocol text NOT NULL,
  status text NOT NULL,
  usage jsonb NOT NULL,
  rates jsonb NOT NULL,
  settlement text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
-- Rollback: deploy the previous application first. Retain these additive objects
-- to preserve request evidence; the old application ignores them. Do not reset
-- daily aggregates or replay already-settled attempt IDs.
