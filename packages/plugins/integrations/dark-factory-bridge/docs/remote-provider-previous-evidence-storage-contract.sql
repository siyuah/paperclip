-- Dark Factory remote provider previous evidence storage contract.
-- Contract-only: this file is documentation/test input, not an active migration.
-- Do not place it in migrations/ until persistence is explicitly approved.
--
-- Boundary:
-- - Stores previous readiness/breaker projection metadata only.
-- - Does not store Dark Factory Journal records.
-- - Does not store provider credentials, tokens, passwords, or connection strings.
-- - Does not authorize remote execution.
-- - Does not advance Paperclip terminal state.
-- - Dark Factory Journal remains truth source.

CREATE TABLE IF NOT EXISTS dark_factory_bridge_poc.remote_provider_previous_evidence (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  issue_id text NOT NULL,
  environment_id text NOT NULL,
  provider_lease_id text,
  storage_key text NOT NULL,
  readiness_status text NOT NULL,
  next_safe_hook text NOT NULL,
  readiness_receipt_id text NOT NULL,
  readiness_receipt_digest text NOT NULL,
  readiness_checked_at timestamptz NOT NULL,
  breaker_state text NOT NULL,
  consecutive_failures integer NOT NULL DEFAULT 0,
  consecutive_half_open_successes integer NOT NULL DEFAULT 0,
  opened_at timestamptz,
  cooldown_until timestamptz,
  open_reason text,
  last_failure_class text NOT NULL DEFAULT 'none',
  sampled_observation_count integer NOT NULL DEFAULT 0,
  alert_count integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'dark-factory-projection',
  truth_source text NOT NULL DEFAULT 'dark-factory-journal',
  authoritative boolean NOT NULL DEFAULT false CHECK (authoritative IS false),
  does_authorize_remote_execution boolean NOT NULL DEFAULT false CHECK (does_authorize_remote_execution IS false),
  terminal_state_advanced boolean NOT NULL DEFAULT false CHECK (terminal_state_advanced IS false),
  evidence_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dark_factory_bridge_poc_remote_provider_previous_evidence_storage_key_idx
  ON dark_factory_bridge_poc.remote_provider_previous_evidence (company_id, storage_key);

CREATE INDEX IF NOT EXISTS dark_factory_bridge_poc_remote_provider_previous_evidence_issue_idx
  ON dark_factory_bridge_poc.remote_provider_previous_evidence (company_id, issue_id, environment_id);

CREATE INDEX IF NOT EXISTS dark_factory_bridge_poc_remote_provider_previous_evidence_receipt_idx
  ON dark_factory_bridge_poc.remote_provider_previous_evidence (company_id, readiness_receipt_digest);
