-- Privacy-safe, first-party evidence for OSS fellowship reporting.
-- Opaque keys must be secret-keyed HMAC-SHA-256 digests. Public routes expose aggregates only.

CREATE TABLE oss_coverage_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key_hash TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  request_id TEXT NOT NULL,
  collector_version TEXT NOT NULL,
  collector_key_slot TEXT NOT NULL,
  window_started_at TIMESTAMP NOT NULL,
  window_ended_at TIMESTAMP NOT NULL,
  status TEXT NOT NULL DEFAULT 'collecting',
  repositories_measured INTEGER NOT NULL,
  contribution_count INTEGER NOT NULL,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT oss_coverage_window_order CHECK (window_ended_at > window_started_at),
  CONSTRAINT oss_coverage_idempotency_hash CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT oss_coverage_request_hash CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT oss_coverage_request_id CHECK (length(request_id) BETWEEN 1 AND 128),
  CONSTRAINT oss_coverage_collector_version CHECK (collector_version ~ '^[A-Za-z0-9._-]{1,64}$'),
  CONSTRAINT oss_coverage_collector_key_slot CHECK (collector_key_slot IN ('current', 'previous')),
  CONSTRAINT oss_coverage_status CHECK (status IN ('collecting', 'completed', 'failed')),
  CONSTRAINT oss_coverage_repository_count CHECK (repositories_measured > 0),
  CONSTRAINT oss_coverage_contribution_count CHECK (contribution_count >= 0),
  CONSTRAINT oss_coverage_completion CHECK (
    (status = 'completed' AND completed_at IS NOT NULL) OR
    (status <> 'completed' AND completed_at IS NULL)
  )
);

CREATE INDEX idx_oss_coverage_status_window
  ON oss_coverage_batches (status, window_ended_at);
CREATE UNIQUE INDEX idx_oss_coverage_idempotency
  ON oss_coverage_batches (idempotency_key_hash);
CREATE UNIQUE INDEX idx_oss_coverage_window_version
  ON oss_coverage_batches (window_started_at, window_ended_at, collector_version);

CREATE TABLE oss_contribution_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES oss_coverage_batches(id) ON DELETE CASCADE,
  repository_key TEXT NOT NULL,
  contributor_key TEXT NOT NULL,
  contributor_type TEXT NOT NULL DEFAULT 'external',
  contribution_key TEXT NOT NULL,
  opened_at TIMESTAMP NOT NULL,
  first_maintainer_response_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT oss_contribution_repository_key CHECK (repository_key ~ '^[0-9a-f]{64}$'),
  CONSTRAINT oss_contribution_contributor_key CHECK (contributor_key ~ '^[0-9a-f]{64}$'),
  CONSTRAINT oss_contribution_external_only CHECK (contributor_type = 'external'),
  CONSTRAINT oss_contribution_key CHECK (contribution_key ~ '^[0-9a-f]{64}$'),
  CONSTRAINT oss_contribution_response_order CHECK (
    first_maintainer_response_at IS NULL OR first_maintainer_response_at >= opened_at
  )
);

CREATE INDEX idx_oss_contributions_batch
  ON oss_contribution_records (batch_id);
CREATE INDEX idx_oss_contributions_batch_contributor
  ON oss_contribution_records (batch_id, contributor_key);
CREATE UNIQUE INDEX idx_oss_contributions_batch_contribution
  ON oss_contribution_records (batch_id, contribution_key);

CREATE TABLE oss_case_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key_hash TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  request_id TEXT NOT NULL,
  collector_version TEXT NOT NULL,
  collector_key_slot TEXT NOT NULL,
  repository_key TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  checkpoint_id TEXT NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
  restore_event_id UUID NOT NULL REFERENCES restore_events(id) ON DELETE CASCADE,
  recorded_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT oss_case_repository_key CHECK (repository_key ~ '^[0-9a-f]{64}$'),
  CONSTRAINT oss_case_idempotency_hash CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT oss_case_request_hash CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT oss_case_request_id CHECK (length(request_id) BETWEEN 1 AND 128),
  CONSTRAINT oss_case_collector_version CHECK (collector_version ~ '^[A-Za-z0-9._-]{1,64}$'),
  CONSTRAINT oss_case_collector_key_slot CHECK (collector_key_slot IN ('current', 'previous'))
);

CREATE INDEX idx_oss_case_evidence_repository
  ON oss_case_evidence (repository_key);
CREATE UNIQUE INDEX idx_oss_case_evidence_idempotency
  ON oss_case_evidence (idempotency_key_hash);
CREATE INDEX idx_oss_case_evidence_project
  ON oss_case_evidence (project_id);
CREATE UNIQUE INDEX idx_oss_case_evidence_restore
  ON oss_case_evidence (restore_event_id);
