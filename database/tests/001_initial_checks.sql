-- Chỉ dữ liệu tổng hợp; chạy sau migration trong database tạm. Không giữ dữ liệu test.
BEGIN;

CREATE FUNCTION pg_temp.add_log(p_deployment BIGINT, p_role TEXT, p_tx_digit TEXT,
                                p_log_index BIGINT, p_event_name TEXT)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
    result_id BIGINT;
BEGIN
    INSERT INTO raw_events (
        deployment_id, chain_id, contract_role, contract_address,
        block_number, block_hash, transaction_hash, transaction_index, log_index,
        topics, data, event_name, rpc_log)
    SELECT c.deployment_id, c.chain_id, c.contract_role, c.contract_address,
           b.block_number, b.block_hash, '0x' || repeat(p_tx_digit, 64), 0, p_log_index,
           ARRAY['0x' || repeat('0', 64)]::evm_hash32[], '0x', p_event_name,
           jsonb_build_object('synthetic', true, 'address', c.contract_address,
               'blockNumber', '0x64', 'blockHash', b.block_hash,
               'transactionHash', '0x' || repeat(p_tx_digit, 64),
               'transactionIndex', '0x0', 'logIndex', '0x' || to_hex(p_log_index),
               'topics', jsonb_build_array('0x' || repeat('0', 64)),
               'data', '0x', 'removed', false)
    FROM deployment_contracts c
    JOIN indexed_blocks b USING (deployment_id)
    WHERE c.deployment_id = p_deployment AND c.contract_role = p_role
    RETURNING raw_event_id INTO STRICT result_id;
    RETURN result_id;
END;
$$;

DO $$
DECLARE
    max_uint CONSTANT TEXT := '115792089237316195423570985008687907853269984665640564039457584007913129639935';
    bad_value TEXT;
    d1 BIGINT;
    d2 BIGINT;
    d3 BIGINT;
    current_dep BIGINT;
    created1 BIGINT;
    created2 BIGINT;
    created_other BIGINT;
    zero_log BIGINT;
    out_log BIGINT;
    paid_log BIGINT;
    other_out_log BIGINT;
    other_paid_log BIGINT;
    raw_zero_paid BIGINT;
    transfer_out BIGINT;
    transfer_other BIGINT;
    treasury1 evm_address := '0x1111111111111111111111111111111111111111';
    treasury2 evm_address := '0x2222222222222222222222222222222222222222';
    recipient evm_address := '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    token1 evm_address := '0x4444444444444444444444444444444444444444';
    zero_hash evm_hash32 := '0x' || repeat('0', 64);
    description_exact TEXT := ' {"version":1, "title":"Mẫu kiểm tra", "body":"Giữ nguyên khoảng trắng và Unicode."} ';
    revision_before UUID;
BEGIN
    IF (max_uint::evm_uint256)::TEXT <> max_uint THEN
        RAISE EXCEPTION 'uint256 max không round-trip chính xác';
    END IF;
    IF ('0'::evm_uint256)::TEXT <> '0' THEN
        RAISE EXCEPTION 'uint256 zero không round-trip';
    END IF;
    FOREACH bad_value IN ARRAY ARRAY[
        '-1', '0.1', '0.0000000000000000000000000000000000000001',
        '115792089237316195423570985008687907853269984665640564039457584007913129639936',
        max_uint || '.1', 'NaN', 'Infinity', '-Infinity'
    ] LOOP
        BEGIN
            PERFORM bad_value::evm_uint256;
            RAISE EXCEPTION 'Đã nhận uint256 không hợp lệ: %', bad_value;
        EXCEPTION WHEN check_violation THEN NULL;
        END;
    END LOOP;

    INSERT INTO deployments (chain_id, deployment_name, deployment_block, abi_version, governance_config)
    VALUES (31337, 'be01-test-one', 100, 'synthetic-be01', '{}') RETURNING deployment_id INTO d1;
    INSERT INTO deployments (chain_id, deployment_name, deployment_block, abi_version, governance_config)
    VALUES (31337, 'be01-test-two', 100, 'synthetic-be01', '{}') RETURNING deployment_id INTO d2;
    INSERT INTO deployments (chain_id, deployment_name, deployment_block, abi_version, governance_config)
    VALUES (31338, 'be01-test-other-chain', 100, 'synthetic-be01', '{}') RETURNING deployment_id INTO d3;
    SELECT snapshot_revision INTO revision_before FROM deployments WHERE deployment_id = d1;
    UPDATE deployments SET snapshot_revision = gen_random_uuid() WHERE deployment_id = d1;
    IF revision_before IS NULL OR revision_before =
       (SELECT snapshot_revision FROM deployments WHERE deployment_id = d1) THEN
        RAISE EXCEPTION 'Serving revision không đổi khi vô hiệu hóa snapshot';
    END IF;

    INSERT INTO deployment_contracts
        (deployment_id, chain_id, contract_role, contract_address, deployment_block, abi_version)
    SELECT d.deployment_id, d.chain_id, r.role,
           ('0x' || repeat(CASE WHEN d.deployment_id = d2 AND r.role = 'treasury'
                               THEN '2' ELSE r.digit END, 40))::evm_address,
           100, 'synthetic-be01'
    FROM deployments d
    CROSS JOIN (VALUES ('treasury', '1'), ('governor', '3'), ('budget_token', '4'),
                       ('timelock', '5'), ('governance_token', '6')) AS r(role, digit)
    WHERE d.deployment_id IN (d1, d2, d3);
    INSERT INTO indexed_blocks (deployment_id, block_number, block_hash, parent_hash, block_timestamp)
    SELECT d, 100, ('0x' || repeat('1', 64))::evm_hash32, zero_hash, 1792285200
    FROM unnest(ARRAY[d1, d2, d3]) AS x(d);

    created1 := pg_temp.add_log(d1, 'governor', 'a', 0, 'ProposalCreated');
    created2 := pg_temp.add_log(d1, 'governor', 'a', 1, 'ProposalCreated');
    created_other := pg_temp.add_log(d2, 'governor', 'b', 0, 'ProposalCreated');
    -- Cùng tx/log trên chain khác được phép; cùng chain dù deployment khác phải bị chặn.
    PERFORM pg_temp.add_log(d3, 'governor', 'a', 0, 'ProposalCreated');
    BEGIN
        PERFORM pg_temp.add_log(d2, 'governor', 'a', 0, 'ProposalCreated');
        RAISE EXCEPTION 'Đã nhận raw log trùng giữa hai deployment cùng chain';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
        UPDATE raw_events SET contract_address = treasury1 WHERE raw_event_id = created1;
        RAISE EXCEPTION 'Đã nhận địa chỉ sai role của raw event';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    BEGIN
        UPDATE raw_events SET block_hash = zero_hash WHERE raw_event_id = created1;
        RAISE EXCEPTION 'Đã nhận block hash không thuộc deployment/block';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    -- Cùng requestId (kể cả zero) trong hai proposal là hợp lệ.
    INSERT INTO proposals (deployment_id, proposal_id, request_id, proposer, treasury_address,
        recipient, amount, description_bytes, description, description_hash, targets, native_values, calldatas,
        snapshot, deadline, created_event_id)
    VALUES
        (d1, 1, zero_hash, recipient, treasury1, recipient, max_uint::evm_uint256,
         convert_to(description_exact, 'UTF8'), description_exact, zero_hash, ARRAY[treasury1], ARRAY[0]::evm_uint256[],
         ARRAY['0x']::evm_hex_data[], 1792285260, 1792285560, created1),
        (d1, 2, zero_hash, recipient, treasury1, recipient, 1,
         convert_to(description_exact, 'UTF8'), description_exact, zero_hash, ARRAY[treasury1], ARRAY[0]::evm_uint256[],
         ARRAY['0x']::evm_hex_data[], 1792285260, 1792285560, created2),
        (d2, 1, zero_hash, recipient, treasury2, recipient, 1,
         convert_to(description_exact, 'UTF8'), description_exact, zero_hash, ARRAY[treasury2], ARRAY[0]::evm_uint256[],
         ARRAY['0x']::evm_hex_data[], 1792285260, 1792285560, created_other);
    IF (SELECT amount::TEXT FROM proposals WHERE deployment_id = d1 AND proposal_id = 1) <> max_uint
       OR (SELECT description FROM proposals WHERE deployment_id = d1 AND proposal_id = 1) <> description_exact THEN
        RAISE EXCEPTION 'Proposal làm đổi amount/description';
    END IF;
    BEGIN
        UPDATE proposals SET description = 'bytes đã bị đổi'
        WHERE deployment_id = d1 AND proposal_id = 2;
        RAISE EXCEPTION 'Đã nhận description text khác bytes gốc';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    UPDATE proposals SET description = NULL, description_bytes = decode('00ff', 'hex')
    WHERE deployment_id = d1 AND proposal_id = 2;
    IF (SELECT encode(description_bytes, 'hex') FROM proposals
        WHERE deployment_id = d1 AND proposal_id = 2) <> '00ff' THEN
        RAISE EXCEPTION 'Không giữ được description bytes ngoài miền PostgreSQL TEXT';
    END IF;
    BEGIN
        INSERT INTO votes (deployment_id, proposal_id, voter, support, weight, source_event_id)
        VALUES (d2, 1, recipient, 1, 1, created1);
        RAISE EXCEPTION 'Đã nhận source event của deployment khác';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO votes (deployment_id, proposal_id, voter, support, weight, source_event_id)
        VALUES (d2, 2, recipient, 1, 1, created_other);
        RAISE EXCEPTION 'Đã nhận proposal chỉ có ở deployment khác';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    zero_log := pg_temp.add_log(d1, 'budget_token', 'c', 0, 'Transfer');
    out_log := pg_temp.add_log(d1, 'budget_token', 'c', 1, 'Transfer');
    paid_log := pg_temp.add_log(d1, 'treasury', 'c', 2, 'BudgetDisbursed');
    other_out_log := pg_temp.add_log(d1, 'budget_token', 'd', 0, 'Transfer');
    other_paid_log := pg_temp.add_log(d1, 'treasury', 'd', 1, 'BudgetDisbursed');
    raw_zero_paid := pg_temp.add_log(d1, 'treasury', 'e', 0, 'BudgetDisbursed');
    INSERT INTO transfers (deployment_id, token_address, treasury_address, from_address,
                          to_address, amount, source_event_id)
    VALUES (d1, token1, treasury1, recipient, treasury1, 0, zero_log);
    zero_log := pg_temp.add_log(d1, 'budget_token', '7', 0, 'Transfer');
    INSERT INTO transfers (deployment_id, token_address, treasury_address, from_address,
                          to_address, amount, source_event_id)
    VALUES (d1, token1, treasury1, treasury1, treasury1, 99, zero_log);
    IF (SELECT COALESCE(sum(CASE WHEN to_address = treasury1 THEN amount ELSE 0 END), 0)
             - COALESCE(sum(CASE WHEN from_address = treasury1 THEN amount ELSE 0 END), 0)
        FROM transfers WHERE deployment_id = d1) <> 0 THEN
        RAISE EXCEPTION 'Self-transfer làm đổi số dư';
    END IF;
    INSERT INTO transfers (deployment_id, token_address, treasury_address, from_address,
                          to_address, amount, source_event_id)
    VALUES (d1, token1, treasury1, treasury1, recipient, max_uint::evm_uint256, out_log)
    RETURNING transfer_id INTO transfer_out;
    INSERT INTO transfers (deployment_id, token_address, treasury_address, from_address,
                          to_address, amount, source_event_id)
    VALUES (d1, token1, treasury1, treasury1, recipient, 1, other_out_log)
    RETURNING transfer_id INTO transfer_other;
    IF (SELECT amount::TEXT FROM transfers WHERE transfer_id = transfer_out) <> max_uint THEN
        RAISE EXCEPTION 'Transfer làm mất độ chính xác uint256 max';
    END IF;
    INSERT INTO disbursements (deployment_id, chain_id, treasury_address, request_id,
        recipient, amount, source_event_id, transfer_id, proposal_id)
    VALUES (d1, 31337, treasury1, zero_hash, recipient, max_uint::evm_uint256,
            paid_log, transfer_out, 1);
    BEGIN
        INSERT INTO disbursements (deployment_id, chain_id, treasury_address, request_id,
            recipient, amount, source_event_id, transfer_id, proposal_id)
        VALUES (d1, 31337, treasury1, zero_hash, recipient, 1, other_paid_log, transfer_other, 2);
        RAISE EXCEPTION 'Đã trả requestId lần hai';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO disbursements (deployment_id, chain_id, treasury_address, request_id,
            recipient, amount, source_event_id, transfer_id)
        VALUES (d1, 31337, treasury1, '0x' || repeat('f', 64), recipient, 0,
                raw_zero_paid, transfer_other);
        RAISE EXCEPTION 'Đã nhận khoản giải ngân bằng 0 vào projection';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO disbursements (deployment_id, chain_id, treasury_address, request_id,
            recipient, amount, source_event_id, transfer_id)
        VALUES (d1, 31337, treasury1, '0x' || repeat('f', 64), recipient, 2,
                other_paid_log, transfer_other);
        RAISE EXCEPTION 'Đã nhận disbursement không khớp amount của BUD Transfer';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    -- Treasury mới và chain khác được phép trả cùng requestId.
    FOREACH current_dep IN ARRAY ARRAY[d2, d3] LOOP
        out_log := pg_temp.add_log(current_dep, 'budget_token', 'f', 0, 'Transfer');
        paid_log := pg_temp.add_log(current_dep, 'treasury', 'f', 1, 'BudgetDisbursed');
        INSERT INTO transfers (deployment_id, token_address, treasury_address, from_address,
                              to_address, amount, source_event_id)
        SELECT current_dep, token1, c.contract_address, c.contract_address, recipient, 1, out_log
        FROM deployment_contracts c WHERE deployment_id = current_dep AND contract_role = 'treasury'
        RETURNING transfer_id INTO transfer_other;
        INSERT INTO disbursements (deployment_id, chain_id, treasury_address, request_id,
            recipient, amount, source_event_id, transfer_id)
        SELECT current_dep, c.chain_id, c.contract_address, zero_hash,
               recipient, 1, paid_log, transfer_other
        FROM deployment_contracts c WHERE deployment_id = current_dep AND contract_role = 'treasury';
    END LOOP;

    BEGIN
        INSERT INTO checkpoints (deployment_id, block_number, block_hash, observed_head_block,
                                 confirmation_depth, sync_status)
        VALUES (d1, 101, zero_hash, 103, 2, 'ready');
        RAISE EXCEPTION 'Checkpoint đã vượt dữ liệu block đã ghi';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    INSERT INTO checkpoints (deployment_id, block_number, block_hash, observed_head_block,
                             confirmation_depth, sync_status)
    VALUES (d1, 100, '0x' || repeat('1', 64), 102, 2, 'ready');
    RAISE NOTICE 'BE01 checks passed: exact uint256, invalid domains, description bytes, zero/self transfer, raw dedup, scopes/FKs, payout link and checkpoint';
END;
$$;

ROLLBACK;
