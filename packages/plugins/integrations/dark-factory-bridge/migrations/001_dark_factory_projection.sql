-- Dark Factory bridge projection namespace tables.
-- These tables intentionally store only derived projection/cache/cursor/receipt data.
-- Paperclip host derives this schema from plugin key `paperclipai.dark-factory-bridge`
-- and manifest database.namespaceSlug `dark_factory_bridge`, then creates it
-- before applying plugin migrations.

-- They do not store secrets, tokens, provider credentials, or authoritative Dark Factory Journal records.
-- The Dark Factory Journal remains the truth source; this plugin namespace is not a second truth source.

CREATE TABLE IF NOT EXISTS plugin_dark_factory_bridge_a197d0c9b7.projection_cache (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  issue_id text NOT NULL,
  linked_run_id text NOT NULL,
  -- Phase 2 compatibility aliases make reconciliation explicit without copying Journal truth.
  run_id text NOT NULL,
  journal_cursor text NOT NULL,
  last_sequence_no integer NOT NULL,
  projection_status text NOT NULL,
  callback_receipt_id text NOT NULL,
  source_journal_ref text NOT NULL,
  projection_payload jsonb NOT NULL,
  projection_json jsonb NOT NULL,
  stale_reason text,
  source text NOT NULL DEFAULT 'dark-factory-projection',
  truth_source text NOT NULL DEFAULT 'dark-factory-journal',
  authoritative boolean NOT NULL DEFAULT false CHECK (authoritative IS false),
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dark_factory_bridge_projection_cache_issue_unique UNIQUE (company_id, issue_id)
);

CREATE TABLE IF NOT EXISTS plugin_dark_factory_bridge_a197d0c9b7.journal_cursors (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  issue_id text NOT NULL,
  linked_run_id text NOT NULL,
  run_id text NOT NULL,
  journal_cursor text NOT NULL,
  last_sequence_no integer NOT NULL,
  last_journal_sequence_no integer NOT NULL,
  journal_ref text NOT NULL,
  source_journal_ref text NOT NULL,
  monotonic boolean NOT NULL DEFAULT true,
  gap_detected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dark_factory_bridge_journal_cursors_company_issue_unique UNIQUE (company_id, issue_id)
);

CREATE TABLE IF NOT EXISTS plugin_dark_factory_bridge_a197d0c9b7.callback_receipts (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  issue_id text NOT NULL,
  linked_run_id text NOT NULL,
  run_id text NOT NULL,
  journal_cursor text,
  last_sequence_no integer,
  idempotency_key text NOT NULL,
  receipt_status text NOT NULL,
  terminal_state_advanced boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dark_factory_bridge_callback_receipts_idempotency_unique UNIQUE (company_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS plugin_dark_factory_bridge_a197d0c9b7.rehydrate_requests (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  issue_id text NOT NULL,
  linked_run_id text NOT NULL,
  run_id text NOT NULL,
  journal_cursor text,
  callback_receipt_id text NOT NULL,
  reason text,
  request_status text NOT NULL DEFAULT 'requested',
  terminal_state_advanced boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
