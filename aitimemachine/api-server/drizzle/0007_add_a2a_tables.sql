-- Migration: add `a2a_agents` and `a2a_messages` for durable Agent-to-Agent state
-- Source: api-server A2AService DB-backing (services/a2aService.ts)
-- Notes:
--  - Replaces the previous in-memory agent registry + message inbox so
--    registered agents, their API keys, and queued/broadcast messages survive
--    restarts and are shared across horizontally-scaled instances.
--  - Additive + idempotent (CREATE TABLE/INDEX IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS a2a_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  endpoint TEXT,
  api_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  registered_at TIMESTAMP NOT NULL DEFAULT now(),
  last_seen TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT a2a_agents_api_key_unique UNIQUE (api_key)
);

CREATE INDEX IF NOT EXISTS idx_a2a_agents_api_key ON a2a_agents (api_key);
CREATE INDEX IF NOT EXISTS idx_a2a_agents_status ON a2a_agents (status);

CREATE TABLE IF NOT EXISTS a2a_messages (
  id TEXT PRIMARY KEY,
  from_agent_id TEXT NOT NULL,
  to_agent_id TEXT NOT NULL,
  message_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  session_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_a2a_messages_to_agent ON a2a_messages (to_agent_id);
CREATE INDEX IF NOT EXISTS idx_a2a_messages_to_agent_created ON a2a_messages (to_agent_id, created_at);
