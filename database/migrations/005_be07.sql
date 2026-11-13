-- Durable recovery gate and RPC observations; no header pruning (BE03 prefix invariant).
BEGIN;
ALTER TABLE deployments ADD COLUMN indexer_state JSONB NOT NULL DEFAULT '{"phase":"unverified"}'::jsonb
  CHECK (jsonb_typeof(indexer_state)='object' AND indexer_state->>'phase' IN
    ('unverified','ready','recovering','replaying','rebuild_required'));
COMMENT ON COLUMN deployments.indexer_state IS
  'BE07 recovery gate, canonical validation heartbeat and lag observation. Updated under BE02 chain advisory lock.';
COMMIT;
