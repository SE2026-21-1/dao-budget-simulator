-- psql -v ON_ERROR_STOP=1 -v deployment_id=1 -f database/queries/be04_read_model.sql
-- Latest PUBLISHED projection only. Raw checkpoint may be newer.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SELECT d.chain_id::text, p.deployment_id::text,
    p.block_number::text AS "asOfBlock", p.block_hash AS "asOfBlockHash",
    b.block_timestamp::text AS "asOfTimestamp", p.snapshot_revision::text AS "snapshotRevision",
    p.ignored_ancillary_events, c.block_number::text AS "rawCheckpoint",
    t.total_in::text, t.total_out::text, t.balance::text
FROM projection_checkpoints p
JOIN deployments d USING (deployment_id)
JOIN indexed_blocks b USING (deployment_id,block_number,block_hash)
JOIN checkpoints c USING (deployment_id)
JOIN treasury_totals t USING (deployment_id)
WHERE p.deployment_id=:'deployment_id';

SELECT p.proposal_id::text, p.request_id, p.proposer, p.recipient, p.amount::text,
    p.description, p.description_hash, p.snapshot::text, p.deadline::text,
    s.state, s.against_votes::text, s.for_votes::text, s.abstain_votes::text, s.quorum::text,
    o.operation_id, o.queued_at::text, o.eta::text, s.operation_status,
    o.predecessor, o.salt,
    created.transaction_hash AS created_tx, queued.transaction_hash AS queued_tx,
    executed.transaction_hash AS executed_tx, canceled.transaction_hash AS canceled_tx
FROM proposals p
JOIN proposal_states s USING (deployment_id,proposal_id)
JOIN projection_checkpoints cp USING (deployment_id)
JOIN raw_events created ON created.deployment_id=p.deployment_id AND created.raw_event_id=p.created_event_id
LEFT JOIN operations o ON o.deployment_id=p.deployment_id AND o.proposal_id=p.proposal_id
LEFT JOIN raw_events queued ON queued.deployment_id=o.deployment_id AND queued.raw_event_id=o.queued_event_id
LEFT JOIN raw_events executed ON executed.deployment_id=p.deployment_id AND executed.raw_event_id=p.executed_event_id
LEFT JOIN raw_events canceled ON canceled.deployment_id=p.deployment_id AND canceled.raw_event_id=p.canceled_event_id
WHERE p.deployment_id=:'deployment_id'
ORDER BY created.block_number DESC,created.transaction_index DESC,created.log_index DESC,p.proposal_id DESC;

SELECT v.proposal_id::text,v.voter,v.support,v.weight::text,v.reason,v.params,
    r.block_number::text,r.block_hash,r.transaction_hash,r.transaction_index::text,r.log_index::text
FROM votes v JOIN raw_events r ON r.deployment_id=v.deployment_id AND r.raw_event_id=v.source_event_id
WHERE v.deployment_id=:'deployment_id'
ORDER BY r.block_number DESC,r.transaction_index DESC,r.log_index DESC;

SELECT t.transfer_id::text,t.token_address,t.from_address,t.to_address,t.amount::text,
    CASE WHEN t.from_address=t.to_address THEN 'self'
        WHEN t.to_address=t.treasury_address THEN 'in' ELSE 'out' END AS direction,
    d.proposal_id::text,d.request_id,d.operation_id,
    r.block_number::text,r.block_hash,r.transaction_hash,r.transaction_index::text,r.log_index::text
FROM transfers t JOIN raw_events r ON r.deployment_id=t.deployment_id AND r.raw_event_id=t.source_event_id
LEFT JOIN disbursements d ON d.deployment_id=t.deployment_id AND d.transfer_id=t.transfer_id
WHERE t.deployment_id=:'deployment_id'
ORDER BY r.block_number DESC,r.transaction_index DESC,r.log_index DESC;
COMMIT;
