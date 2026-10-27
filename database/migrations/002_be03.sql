-- BE01 stays unchanged. Existing checkpoints have no proven source scope:
-- leave NULL and refuse runtime adoption rather than guess their coverage.
BEGIN;
ALTER TABLE checkpoints ADD COLUMN source_scope evm_hash32;
ALTER TABLE raw_events ADD COLUMN decode_status TEXT
    CHECK (decode_status IN ('decoded', 'unknown_topic', 'decode_error'));
ALTER TABLE raw_events ADD COLUMN decode_error_code TEXT;
ALTER TABLE raw_events ADD CONSTRAINT raw_decode_state CHECK (
    decode_status IS NULL OR
    ((decode_status = 'decoded' AND event_name IS NOT NULL AND decoded_payload IS NOT NULL AND decode_error_code IS NULL) OR
    (decode_status = 'unknown_topic' AND event_name IS NULL AND decoded_payload IS NULL AND decode_error_code = 'UNKNOWN_TOPIC') OR
    (decode_status = 'decode_error' AND event_name IS NULL AND decoded_payload IS NULL AND decode_error_code = 'DECODE_ERROR')) IS TRUE
);
COMMENT ON COLUMN checkpoints.source_scope IS 'SHA256 chain/deployment/sorted source tuples; NULL legacy checkpoints require investigation.';
COMMENT ON COLUMN raw_events.decode_status IS 'Durable raw vs decoded completeness. NULL means legacy BE02/unclassified, never complete.';
COMMIT;
