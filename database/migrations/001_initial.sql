-- BE01: read model PostgreSQL. Chạy một lần trên database mới bằng ON_ERROR_STOP.
-- Không dùng NUMERIC(78,0): typmod đó làm tròn phần lẻ trước khi CHECK chạy.
BEGIN;

CREATE DOMAIN evm_uint256 AS NUMERIC
    CHECK (VALUE >= 0
       AND VALUE <= 115792089237316195423570985008687907853269984665640564039457584007913129639935
       AND VALUE = trunc(VALUE));

CREATE DOMAIN evm_address AS TEXT
    CHECK (VALUE ~ '^0x[0-9a-f]{40}$');

CREATE DOMAIN evm_hash32 AS TEXT
    CHECK (VALUE ~ '^0x[0-9a-f]{64}$');

CREATE DOMAIN evm_hex_data AS TEXT
    CHECK (VALUE ~ '^0x([0-9a-f]{2})*$');

CREATE TABLE deployments (
    deployment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    chain_id evm_uint256 NOT NULL CHECK (chain_id > 0),
    deployment_name TEXT NOT NULL CHECK (length(deployment_name) > 0),
    snapshot_revision UUID NOT NULL DEFAULT gen_random_uuid(),
    deployment_block evm_uint256 NOT NULL,
    abi_version TEXT NOT NULL CHECK (length(abi_version) > 0),
    governance_config JSONB NOT NULL CHECK (jsonb_typeof(governance_config) = 'object'),
    gov_decimals SMALLINT NOT NULL DEFAULT 18 CHECK (gov_decimals = 18),
    bud_decimals SMALLINT NOT NULL DEFAULT 18 CHECK (bud_decimals = 18),
    confirmation_depth INTEGER NOT NULL DEFAULT 2 CHECK (confirmation_depth >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (chain_id, deployment_name),
    UNIQUE (deployment_id, chain_id)
);

-- Mỗi địa chỉ có deployment block/ABI riêng; không giả định cả bộ deploy cùng block.
CREATE TABLE deployment_contracts (
    deployment_id BIGINT NOT NULL,
    chain_id evm_uint256 NOT NULL,
    contract_role TEXT NOT NULL CHECK (contract_role IN
        ('governor', 'timelock', 'treasury', 'budget_token', 'governance_token')),
    contract_address evm_address NOT NULL
        CHECK (contract_address <> '0x0000000000000000000000000000000000000000'),
    deployment_block evm_uint256 NOT NULL,
    abi_version TEXT NOT NULL CHECK (length(abi_version) > 0),
    PRIMARY KEY (deployment_id, contract_role),
    UNIQUE (deployment_id, contract_role, contract_address),
    UNIQUE (deployment_id, chain_id, contract_role, contract_address),
    UNIQUE (deployment_id, contract_address),
    FOREIGN KEY (deployment_id, chain_id)
        REFERENCES deployments (deployment_id, chain_id)
);

-- Lưu cả block không có event: checkpoint H vẫn có hash và timestamp chính xác.
CREATE TABLE indexed_blocks (
    deployment_id BIGINT NOT NULL REFERENCES deployments (deployment_id),
    block_number evm_uint256 NOT NULL,
    block_hash evm_hash32 NOT NULL,
    parent_hash evm_hash32 NOT NULL,
    block_timestamp evm_uint256 NOT NULL,
    PRIMARY KEY (deployment_id, block_number),
    UNIQUE (deployment_id, block_number, block_hash)
);

CREATE TABLE raw_events (
    raw_event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    deployment_id BIGINT NOT NULL,
    chain_id evm_uint256 NOT NULL,
    contract_role TEXT NOT NULL,
    contract_address evm_address NOT NULL,
    block_number evm_uint256 NOT NULL,
    block_hash evm_hash32 NOT NULL,
    transaction_hash evm_hash32 NOT NULL,
    transaction_index BIGINT NOT NULL CHECK (transaction_index >= 0),
    log_index BIGINT NOT NULL CHECK (log_index >= 0),
    topics evm_hash32[] NOT NULL CHECK (
        cardinality(topics) BETWEEN 0 AND 4
        AND (cardinality(topics) = 0 OR
            (array_ndims(topics) = 1 AND array_lower(topics, 1) = 1))
        AND array_position(topics, NULL) IS NULL),
    data evm_hex_data NOT NULL,
    removed BOOLEAN NOT NULL DEFAULT FALSE CHECK (removed = FALSE),
    event_name TEXT,
    decoded_payload JSONB CHECK (jsonb_typeof(decoded_payload) = 'object'),
    rpc_log JSONB NOT NULL CHECK (jsonb_typeof(rpc_log) = 'object'),
    indexed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Khóa dedup toàn chain, không thêm deployment_id để vô tình cho trùng log.
    UNIQUE (chain_id, transaction_hash, log_index),
    UNIQUE (deployment_id, raw_event_id),
    UNIQUE (deployment_id, raw_event_id, contract_role),
    FOREIGN KEY (deployment_id, chain_id, contract_role, contract_address)
        REFERENCES deployment_contracts
            (deployment_id, chain_id, contract_role, contract_address),
    FOREIGN KEY (deployment_id, block_number, block_hash)
        REFERENCES indexed_blocks (deployment_id, block_number, block_hash)
);

CREATE INDEX raw_events_replay_idx ON raw_events
    (deployment_id, block_number, transaction_index, log_index);
CREATE INDEX raw_events_contract_idx ON raw_events
    (deployment_id, contract_address, block_number, log_index);

CREATE TABLE proposals (
    deployment_id BIGINT NOT NULL REFERENCES deployments (deployment_id),
    proposal_id evm_uint256 NOT NULL,
    request_id evm_hash32 NOT NULL,
    proposer evm_address NOT NULL,
    treasury_address evm_address NOT NULL,
    treasury_role TEXT NOT NULL DEFAULT 'treasury' CHECK (treasury_role = 'treasury'),
    recipient evm_address NOT NULL CHECK (
        recipient <> '0x0000000000000000000000000000000000000000'
        AND recipient <> treasury_address),
    amount evm_uint256 NOT NULL CHECK (amount > 0),
    -- BYTEA giữ được cả NUL/UTF-8 không hợp lệ mà Solidity string vẫn cho phép.
    description_bytes BYTEA NOT NULL,
    description TEXT CHECK (description IS NULL OR convert_to(description, 'UTF8') = description_bytes),
    description_hash evm_hash32 NOT NULL,
    targets evm_address[] NOT NULL CHECK (
        array_ndims(targets) = 1 AND array_lower(targets, 1) = 1
        AND cardinality(targets) = 1 AND targets[1] IS NOT NULL
        AND targets[1] = treasury_address),
    native_values evm_uint256[] NOT NULL CHECK (
        array_ndims(native_values) = 1 AND array_lower(native_values, 1) = 1
        AND cardinality(native_values) = 1 AND native_values[1] IS NOT NULL
        AND native_values[1] = 0),
    calldatas evm_hex_data[] NOT NULL CHECK (
        array_ndims(calldatas) = 1 AND array_lower(calldatas, 1) = 1
        AND cardinality(calldatas) = 1 AND calldatas[1] IS NOT NULL),
    snapshot evm_uint256 NOT NULL,
    deadline evm_uint256 NOT NULL CHECK (deadline >= snapshot),
    created_event_id BIGINT NOT NULL,
    canceled_event_id BIGINT,
    executed_event_id BIGINT,
    source_role TEXT NOT NULL DEFAULT 'governor' CHECK (source_role = 'governor'),
    PRIMARY KEY (deployment_id, proposal_id),
    UNIQUE (deployment_id, created_event_id),
    UNIQUE (deployment_id, proposal_id, request_id, recipient, amount),
    CHECK (canceled_event_id IS NULL OR executed_event_id IS NULL),
    FOREIGN KEY (deployment_id, treasury_role, treasury_address)
        REFERENCES deployment_contracts (deployment_id, contract_role, contract_address),
    FOREIGN KEY (deployment_id, created_event_id, source_role)
        REFERENCES raw_events (deployment_id, raw_event_id, contract_role),
    FOREIGN KEY (deployment_id, canceled_event_id, source_role)
        REFERENCES raw_events (deployment_id, raw_event_id, contract_role),
    FOREIGN KEY (deployment_id, executed_event_id, source_role)
        REFERENCES raw_events (deployment_id, raw_event_id, contract_role)
);

-- requestId không UNIQUE: hai proposal được phép cùng yêu cầu, kể cả bytes32(0).
CREATE INDEX proposals_request_idx ON proposals (deployment_id, request_id);
CREATE INDEX proposals_created_idx ON proposals (deployment_id, created_event_id, proposal_id);
CREATE INDEX proposals_proposer_idx ON proposals (deployment_id, proposer, proposal_id);

CREATE TABLE votes (
    deployment_id BIGINT NOT NULL,
    proposal_id evm_uint256 NOT NULL,
    voter evm_address NOT NULL,
    support SMALLINT NOT NULL CHECK (support IN (0, 1, 2)),
    weight evm_uint256 NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    source_event_id BIGINT NOT NULL,
    source_role TEXT NOT NULL DEFAULT 'governor' CHECK (source_role = 'governor'),
    PRIMARY KEY (deployment_id, proposal_id, voter),
    UNIQUE (deployment_id, source_event_id),
    FOREIGN KEY (deployment_id, proposal_id)
        REFERENCES proposals (deployment_id, proposal_id),
    FOREIGN KEY (deployment_id, source_event_id, source_role)
        REFERENCES raw_events (deployment_id, raw_event_id, contract_role)
);
CREATE INDEX votes_page_idx ON votes (deployment_id, proposal_id, source_event_id, voter);

CREATE TABLE operations (
    deployment_id BIGINT NOT NULL,
    operation_id evm_hash32 NOT NULL,
    proposal_id evm_uint256 NOT NULL,
    predecessor evm_hash32 NOT NULL,
    salt evm_hash32 NOT NULL,
    queued_at evm_uint256 NOT NULL,
    eta evm_uint256 NOT NULL CHECK (eta >= queued_at),
    queued_event_id BIGINT NOT NULL,
    scheduled_event_id BIGINT NOT NULL,
    executed_event_id BIGINT,
    canceled_event_id BIGINT,
    queue_source_role TEXT NOT NULL DEFAULT 'governor' CHECK (queue_source_role = 'governor'),
    timelock_source_role TEXT NOT NULL DEFAULT 'timelock' CHECK (timelock_source_role = 'timelock'),
    PRIMARY KEY (deployment_id, operation_id),
    UNIQUE (deployment_id, proposal_id),
    UNIQUE (deployment_id, proposal_id, operation_id),
    UNIQUE (deployment_id, queued_event_id),
    UNIQUE (deployment_id, scheduled_event_id),
    CHECK (executed_event_id IS NULL OR canceled_event_id IS NULL),
    FOREIGN KEY (deployment_id, proposal_id)
        REFERENCES proposals (deployment_id, proposal_id),
    FOREIGN KEY (deployment_id, queued_event_id, queue_source_role)
        REFERENCES raw_events (deployment_id, raw_event_id, contract_role),
    FOREIGN KEY (deployment_id, scheduled_event_id, timelock_source_role)
        REFERENCES raw_events (deployment_id, raw_event_id, contract_role),
    FOREIGN KEY (deployment_id, executed_event_id, timelock_source_role)
        REFERENCES raw_events (deployment_id, raw_event_id, contract_role),
    FOREIGN KEY (deployment_id, canceled_event_id, timelock_source_role)
        REFERENCES raw_events (deployment_id, raw_event_id, contract_role)
);
CREATE INDEX operations_proposal_idx ON operations (deployment_id, proposal_id);
CREATE INDEX operations_eta_idx ON operations (deployment_id, eta, operation_id);

CREATE TABLE transfers (
    transfer_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    deployment_id BIGINT NOT NULL REFERENCES deployments (deployment_id),
    token_address evm_address NOT NULL,
    token_role TEXT NOT NULL DEFAULT 'budget_token' CHECK (token_role = 'budget_token'),
    treasury_address evm_address NOT NULL,
    treasury_role TEXT NOT NULL DEFAULT 'treasury' CHECK (treasury_role = 'treasury'),
    from_address evm_address NOT NULL,
    to_address evm_address NOT NULL,
    amount evm_uint256 NOT NULL,
    source_event_id BIGINT NOT NULL,
    CHECK (from_address = treasury_address OR to_address = treasury_address),
    UNIQUE (deployment_id, transfer_id),
    UNIQUE (deployment_id, source_event_id),
    UNIQUE (deployment_id, transfer_id, from_address, to_address, amount),
    FOREIGN KEY (deployment_id, token_role, token_address)
        REFERENCES deployment_contracts (deployment_id, contract_role, contract_address),
    FOREIGN KEY (deployment_id, treasury_role, treasury_address)
        REFERENCES deployment_contracts (deployment_id, contract_role, contract_address),
    FOREIGN KEY (deployment_id, source_event_id, token_role)
        REFERENCES raw_events (deployment_id, raw_event_id, contract_role)
);
CREATE INDEX transfers_page_idx ON transfers (deployment_id, source_event_id, transfer_id);
CREATE INDEX transfers_from_idx ON transfers (deployment_id, from_address, source_event_id);
CREATE INDEX transfers_to_idx ON transfers (deployment_id, to_address, source_event_id);

-- Chỉ liên kết Treasury event với Transfer đã tính; không phải nguồn dòng tiền thứ hai.
CREATE TABLE disbursements (
    deployment_id BIGINT NOT NULL,
    chain_id evm_uint256 NOT NULL,
    treasury_address evm_address NOT NULL,
    source_role TEXT NOT NULL DEFAULT 'treasury' CHECK (source_role = 'treasury'),
    request_id evm_hash32 NOT NULL,
    recipient evm_address NOT NULL CHECK (
        recipient <> '0x0000000000000000000000000000000000000000'
        AND recipient <> treasury_address),
    amount evm_uint256 NOT NULL CHECK (amount > 0),
    source_event_id BIGINT NOT NULL,
    transfer_id BIGINT NOT NULL,
    proposal_id evm_uint256,
    operation_id evm_hash32,
    PRIMARY KEY (deployment_id, request_id),
    UNIQUE (chain_id, treasury_address, request_id),
    UNIQUE (deployment_id, source_event_id),
    UNIQUE (deployment_id, transfer_id),
    CHECK (operation_id IS NULL OR proposal_id IS NOT NULL),
    FOREIGN KEY (deployment_id, chain_id) REFERENCES deployments (deployment_id, chain_id),
    FOREIGN KEY (deployment_id, source_role, treasury_address)
        REFERENCES deployment_contracts (deployment_id, contract_role, contract_address),
    FOREIGN KEY (deployment_id, source_event_id, source_role)
        REFERENCES raw_events (deployment_id, raw_event_id, contract_role),
    FOREIGN KEY (deployment_id, transfer_id, treasury_address, recipient, amount)
        REFERENCES transfers (deployment_id, transfer_id, from_address, to_address, amount),
    FOREIGN KEY (deployment_id, proposal_id, request_id, recipient, amount)
        REFERENCES proposals (deployment_id, proposal_id, request_id, recipient, amount),
    FOREIGN KEY (deployment_id, proposal_id, operation_id)
        REFERENCES operations (deployment_id, proposal_id, operation_id)
);
CREATE INDEX disbursements_proposal_idx ON disbursements (deployment_id, proposal_id);

CREATE TABLE checkpoints (
    deployment_id BIGINT PRIMARY KEY REFERENCES deployments (deployment_id),
    block_number evm_uint256 NOT NULL,
    block_hash evm_hash32 NOT NULL,
    observed_head_block evm_uint256 NOT NULL CHECK (observed_head_block >= block_number),
    confirmation_depth INTEGER NOT NULL CHECK (confirmation_depth >= 0),
    CHECK (observed_head_block >= block_number + confirmation_depth),
    sync_status TEXT NOT NULL CHECK (sync_status IN ('syncing', 'ready', 'rebuild_required')),
    last_error_code TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (deployment_id, block_number, block_hash)
        REFERENCES indexed_blocks (deployment_id, block_number, block_hash)
);

COMMENT ON DOMAIN evm_uint256 IS
    'Exact uint256; unconstrained NUMERIC avoids rounding fractional inputs before validation.';
COMMENT ON TABLE raw_events IS
    'Canonical confirmed logs only; topics/data plus block and transaction coordinates allow replay.';
COMMENT ON TABLE proposals IS
    'Read projection. No current_state: evaluate state at H using event blocks, timestamp and historical eth_call.';
COMMENT ON TABLE transfers IS
    'Only configured BUD transfers involving Treasury; sole source of treasury inflow/outflow, including zero transfers.';
COMMENT ON TABLE disbursements IS
    'Successful payment metadata linked one-to-one to an existing BUD outflow; never sum as another outflow.';
COMMENT ON TABLE checkpoints IS
    'Advance in the same transaction as all indexed blocks, raw logs and projections for the complete batch.';

COMMIT;
