-- BE05: immutable API read snapshots. These rows survive BE04 replacing its
-- latest-only materialization, so signed cursors never read a newer projection.
BEGIN;

CREATE TABLE api_read_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id BIGINT NOT NULL REFERENCES deployments (deployment_id),
    chain_id evm_uint256 NOT NULL,
    block_number evm_uint256 NOT NULL,
    block_hash evm_hash32 NOT NULL,
    block_timestamp evm_uint256 NOT NULL,
    snapshot_revision UUID NOT NULL,
    source_scope evm_hash32 NOT NULL,
    summary JSONB NOT NULL CHECK (jsonb_typeof(summary) = 'object'),
    sync JSONB NOT NULL CHECK (jsonb_typeof(sync) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    invalidated_at TIMESTAMPTZ,
    FOREIGN KEY (deployment_id, chain_id) REFERENCES deployments (deployment_id, chain_id),
    FOREIGN KEY (deployment_id, block_number, block_hash)
        REFERENCES indexed_blocks (deployment_id, block_number, block_hash) ON DELETE CASCADE,
    UNIQUE (deployment_id, block_number, block_hash, snapshot_revision, source_scope)
);
CREATE INDEX api_read_snapshots_expiry_idx ON api_read_snapshots (expires_at);

CREATE TABLE api_read_proposals (
    snapshot_id UUID NOT NULL REFERENCES api_read_snapshots (snapshot_id) ON DELETE CASCADE,
    proposal_id evm_uint256 NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('Pending','Active','Canceled','Defeated','Succeeded','Queued','Executed')),
    created_block evm_uint256 NOT NULL,
    created_tx_index BIGINT NOT NULL CHECK (created_tx_index >= 0),
    created_log_index BIGINT NOT NULL CHECK (created_log_index >= 0),
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    PRIMARY KEY (snapshot_id, proposal_id)
);
CREATE INDEX api_read_proposals_page_idx ON api_read_proposals
    (snapshot_id, created_block DESC, created_tx_index DESC, created_log_index DESC, proposal_id DESC);
CREATE INDEX api_read_proposals_state_idx ON api_read_proposals (snapshot_id, state, proposal_id);

CREATE TABLE api_read_votes (
    snapshot_id UUID NOT NULL REFERENCES api_read_snapshots (snapshot_id) ON DELETE CASCADE,
    proposal_id evm_uint256 NOT NULL,
    block_number evm_uint256 NOT NULL,
    transaction_index BIGINT NOT NULL CHECK (transaction_index >= 0),
    log_index BIGINT NOT NULL CHECK (log_index >= 0),
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    PRIMARY KEY (snapshot_id, proposal_id, block_number, transaction_index, log_index)
);
CREATE INDEX api_read_votes_page_idx ON api_read_votes
    (snapshot_id, proposal_id, block_number DESC, transaction_index DESC, log_index DESC);

CREATE TABLE api_read_transfers (
    snapshot_id UUID NOT NULL REFERENCES api_read_snapshots (snapshot_id) ON DELETE CASCADE,
    block_number evm_uint256 NOT NULL,
    transaction_index BIGINT NOT NULL CHECK (transaction_index >= 0),
    log_index BIGINT NOT NULL CHECK (log_index >= 0),
    proposal_id evm_uint256,
    direction TEXT NOT NULL CHECK (direction IN ('in','out','self')),
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    PRIMARY KEY (snapshot_id, block_number, transaction_index, log_index)
);
CREATE INDEX api_read_transfers_page_idx ON api_read_transfers
    (snapshot_id, block_number DESC, transaction_index DESC, log_index DESC);
CREATE INDEX api_read_transfers_filter_idx ON api_read_transfers (snapshot_id, direction, proposal_id);

COMMENT ON TABLE api_read_snapshots IS
    'BE05 immutable serving snapshots copied from one committed BE04 publication in a single REPEATABLE READ transaction. Expired snapshots are unavailable; publication never relabels them.';
COMMENT ON TABLE api_read_proposals IS 'Immutable proposal page rows for an API snapshot, with exact numeric keyset columns.';
COMMENT ON TABLE api_read_votes IS 'Immutable vote page rows for an API snapshot; weights and reasons come from the BE04 projection.';
COMMENT ON TABLE api_read_transfers IS 'Immutable BUD Transfer rows for an API snapshot; disbursement metadata only links a Transfer.';

COMMIT;
