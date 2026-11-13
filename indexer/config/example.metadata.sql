-- Synthetic metadata matching example.json. Run ONLY on a new BE02 demo/test DB
-- after 001_initial.sql. Replace all metadata with a verified SC06 deployment for real scans.
-- This file is not a migration and proves no blockchain deployment.
BEGIN;
INSERT INTO deployments
    (chain_id, deployment_name, deployment_block, abi_version, governance_config)
VALUES (31337, 'synthetic-be02-example', 100, 'synthetic-be02-unconfirmed-sc06', '{}')
RETURNING deployment_id \gset
INSERT INTO deployment_contracts
    (deployment_id, chain_id, contract_role, contract_address, deployment_block, abi_version)
VALUES
    (:deployment_id, 31337, 'budget_token', '0x4444444444444444444444444444444444444444', 100, 'oz-5.4.0-erc20'),
    (:deployment_id, 31337, 'treasury', '0x1111111111111111111111111111111111111111', 101, 'sc01-itreasury-v1'),
    (:deployment_id, 31337, 'timelock', '0x3333333333333333333333333333333333333333', 102, 'oz-5.4.0-timelock'),
    (:deployment_id, 31337, 'governor', '0x2222222222222222222222222222222222222222', 103, 'oz-5.4.0-governor');
COMMIT;
\echo 'Use this deploymentId in config:' :deployment_id
