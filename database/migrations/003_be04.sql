-- BE04 read model publication is independent of the durable BE03 raw checkpoint.
BEGIN;
ALTER TABLE votes ADD COLUMN params evm_hex_data NOT NULL DEFAULT '0x';

CREATE TABLE projection_checkpoints (
    deployment_id BIGINT PRIMARY KEY REFERENCES deployments (deployment_id),
    block_number evm_uint256 NOT NULL,
    block_hash evm_hash32 NOT NULL,
    source_scope evm_hash32 NOT NULL,
    snapshot_revision UUID NOT NULL,
    ignored_ancillary_events INTEGER NOT NULL CHECK (ignored_ancillary_events >= 0),
    published_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (deployment_id, block_number, block_hash)
        REFERENCES indexed_blocks (deployment_id, block_number, block_hash)
);

CREATE TABLE proposal_states (
    deployment_id BIGINT NOT NULL,
    proposal_id evm_uint256 NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('Pending','Active','Canceled','Defeated','Succeeded','Queued','Executed')),
    against_votes evm_uint256 NOT NULL,
    for_votes evm_uint256 NOT NULL,
    abstain_votes evm_uint256 NOT NULL,
    quorum evm_uint256,
    operation_status TEXT CHECK (operation_status IN ('Waiting','Ready','Done','Canceled')),
    PRIMARY KEY (deployment_id, proposal_id),
    FOREIGN KEY (deployment_id, proposal_id) REFERENCES proposals (deployment_id, proposal_id)
);

-- These views are published together with projection_checkpoints. Do not label
-- them with the (possibly newer) raw checkpoint. Self transfers net to zero.
CREATE VIEW treasury_totals AS
SELECT d.deployment_id,
    COALESCE(sum(t.amount) FILTER (WHERE t.to_address = t.treasury_address AND t.from_address <> t.treasury_address), 0) AS total_in,
    COALESCE(sum(t.amount) FILTER (WHERE t.from_address = t.treasury_address AND t.to_address <> t.treasury_address), 0) AS total_out,
    COALESCE(sum(CASE WHEN t.from_address = t.to_address THEN 0
        WHEN t.to_address = t.treasury_address THEN t.amount ELSE -t.amount END), 0) AS balance
FROM deployments d LEFT JOIN transfers t USING (deployment_id)
GROUP BY d.deployment_id;

COMMENT ON TABLE projection_checkpoints IS
    'Only this H/hash/revision labels BE04 tables. Publication and all derived rows commit atomically after historical RPC reconciliation.';
COMMENT ON TABLE proposal_states IS
    'Materialized at projection H, refreshed even without business events; every state/tally/quorum reconciled with contract at the same H.';
COMMIT;
