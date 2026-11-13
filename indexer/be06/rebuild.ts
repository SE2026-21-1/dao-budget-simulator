import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Interface, ZeroAddress, keccak256 } from 'ethers';
import type { Pool, PoolClient } from 'pg';
import { firstBlock, scopeHash, safeBlock, confirmationDepth } from '../scope.js';
import { IndexerError } from '../errors.js';
import { HttpRpc, hex, quantity, blockTag, type RpcTransport } from '../rpc.js';
import { readHeader } from '../reader.js';
import { sync, type SyncReport } from '../syncer.js';
import { PostgresStorage } from '../storage.js';
import { canonical } from '../projection/chain.js';
import { project, type ProjectionReport } from '../projection/projector.js';
import { deploymentScope, type LoadedManifest } from './manifest.js';

const governorAbi = new Interface([
  'function CLOCK_MODE() view returns (string)',
  'function clock() view returns (uint48)',
  'function token() view returns (address)',
  'function treasury() view returns (address)',
  'function timelock() view returns (address)',
  'function proposalThreshold() view returns (uint256)',
  'function votingDelay() view returns (uint256)',
  'function votingPeriod() view returns (uint256)',
  'function quorumNumerator() view returns (uint256)',
  'function quorumDenominator() view returns (uint256)',
]);
const timelockAbi = new Interface(['function getMinDelay() view returns (uint256)']);
const treasuryAbi = new Interface(['function budgetToken() view returns (address)']);
const tokenAbi = new Interface([
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
]);

export interface ChainMetadata {
  atBlock: string;
  blockHash: string;
  blockTimestamp: string;
  contractCodeHashes: Record<string, { address: string; deploymentBlock: string; codeHash: string }>;
  governanceToken: string;
  governanceConfig: Record<string, string>;
  treasuryBalance: string;
  links: { governor: string; governanceToken: string; timelock: string; treasury: string; budgetToken: string };
}

export interface RebuildReport {
  result: 'rebuilt';
  manifest: { format: string; sha256: string; sourceCommit: string | null };
  scope: ReturnType<typeof deploymentScope>;
  target: { deploymentId: string; deploymentName: string };
  confirmations: number;
  requestedBlock: string;
  blockHash: string;
  chainHeadBefore: string;
  safeBlockBefore: string;
  chainHeadAfter: string;
  safeBlockAfter: string;
  rawCheckpoint: { block: string; hash: string };
  projection: ProjectionReport;
  chainMetadata: ChainMetadata;
  decodeWarnings: { complete: boolean; unknownTopics: number; decodeErrors: number };
}

function fail(code: string, message: string): never {
  throw new IndexerError(code, message);
}

async function endpointIdentity(pool: Pool): Promise<{ database: string; address: string | null; port: number | null }> {
  const result = await pool.query<{ database: string; address: string | null; port: number | null }>(
    'SELECT current_database() AS database, inet_server_addr()::text AS address, inet_server_port() AS port');
  return result.rows[0]!;
}

export async function assertDifferentDatabases(source: Pool, target: Pool): Promise<void> {
  const [a, b] = await Promise.all([endpointIdentity(source), endpointIdentity(target)]);
  if (a.database === b.database && a.address === b.address && a.port === b.port) {
    fail('BE06_DATABASE_COLLISION', 'Reference and rebuild target resolve to the same PostgreSQL database.');
  }
  // Unix socket endpoints have NULL inet addresses. Equal database names there
  // are rejected conservatively because pg cannot prove the clusters differ.
  if (a.database === b.database && a.address === null && b.address === null) {
    fail('BE06_DATABASE_COLLISION', 'Reference and rebuild target may be the same Unix-socket database.');
  }
}

export async function assertEmptyDatabase(pool: Pool): Promise<void> {
  const result = await pool.query<{ objects: string }>(`
    SELECT (
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%') +
      (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%') +
      (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
       WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%') +
      (SELECT count(*) FROM pg_namespace WHERE nspname NOT IN ('pg_catalog','information_schema','public') AND nspname NOT LIKE 'pg_toast%')
    )::text AS objects`);
  if (result.rows[0]!.objects !== '0') {
    fail('BE06_TARGET_NOT_EMPTY', 'Rebuild target must contain no user tables, views, sequences, functions, types or schemas.');
  }
}

async function callAt<T>(rpc: RpcTransport, address: string, abi: Interface, method: string, args: unknown[], hash: string): Promise<T> {
  try {
    const data = abi.encodeFunctionData(method, args);
    const output = hex(await rpc.call('eth_call', [{ to: address, data }, { blockHash: hash, requireCanonical: true }]), `${method} result`);
    const decoded = abi.decodeFunctionResult(method, output);
    if (abi.encodeFunctionResult(method, decoded).toLowerCase() !== output) {
      fail('BE06_CHAIN_METADATA_INVALID', `Historical ${method} result is not canonically ABI encoded.`);
    }
    return decoded as T;
  } catch (error) {
    if (error instanceof IndexerError) throw error;
    fail('BE06_CHAIN_METADATA_UNAVAILABLE', `Cannot verify ${method} at the requested block hash.`);
  }
}

function nonemptyCode(value: unknown, label: string): string {
  const code = hex(value, `${label} bytecode`);
  if (code === '0x') fail('BE06_MANIFEST_CONTRACT_MISSING', `${label} has no bytecode at the required block.`);
  return code;
}

export async function readChainMetadata(config: LoadedManifest['config'], rpc: RpcTransport, atBlock: bigint,
  blockHash: string, blockTimestamp: bigint, governanceToken: LoadedManifest['governanceToken']): Promise<ChainMetadata> {
  if (quantity(await rpc.call('eth_chainId', []), 'eth_chainId') !== config.chainId) {
    fail('CHAIN_ID_MISMATCH', 'RPC chainId differs from the verified manifest.');
  }
  const canonicalHeader = await readHeader(rpc, atBlock);
  if (canonicalHeader.hash !== blockHash || canonicalHeader.timestamp !== blockTimestamp) {
    fail('BE06_CANONICAL_HASH_MISMATCH', 'Requested H/hash/timestamp is no longer canonical.');
  }
  const byRole = new Map(config.contracts.map((contract) => [contract.role, contract]));
  const governor = byRole.get('governor')!;
  const timelock = byRole.get('timelock')!;
  const treasury = byRole.get('treasury')!;
  const budgetToken = byRole.get('budget_token')!;
  const contractCodeHashes: ChainMetadata['contractCodeHashes'] = {};
  for (const contract of config.contracts) {
    if (contract.deploymentBlock > atBlock) {
      fail('BE06_MANIFEST_CONTRACT_AFTER_H', `${contract.role} deployment is after H.`);
    }
    const deploymentCode = nonemptyCode(await rpc.call('eth_getCode', [contract.address, blockTag(contract.deploymentBlock)]), `${contract.role} deployment`);
    const atHCode = nonemptyCode(await rpc.call('eth_getCode', [contract.address, { blockHash, requireCanonical: true }]), `${contract.role} at H`);
    if (deploymentCode !== atHCode) {
      fail('BE06_CONTRACT_CODE_CHANGED', `${contract.role} bytecode differs between deployment block and H.`);
    }
    contractCodeHashes[contract.role] = {
      address: contract.address,
      deploymentBlock: contract.deploymentBlock.toString(),
      codeHash: keccak256(atHCode),
    };
  }
  if (governanceToken.deploymentBlock > atBlock) {
    fail('BE06_MANIFEST_CONTRACT_AFTER_H', 'Governance token deployment is after H.');
  }
  const governanceDeploymentCode = nonemptyCode(await rpc.call('eth_getCode',
    [governanceToken.address, blockTag(governanceToken.deploymentBlock)]), 'governance token deployment');
  const governanceCode = nonemptyCode(await rpc.call('eth_getCode',
    [governanceToken.address, { blockHash, requireCanonical: true }]), 'governance token at H');
  if (governanceDeploymentCode !== governanceCode) {
    fail('BE06_CONTRACT_CODE_CHANGED', 'Governance token bytecode differs between deployment block and H.');
  }
  contractCodeHashes.governance_token = {
    address: governanceToken.address,
    deploymentBlock: governanceToken.deploymentBlock.toString(),
    codeHash: keccak256(governanceCode),
  };
  const [clockMode, clock, governorTimelock, governorTreasury, govAddress, proposalThreshold,
    votingDelay, votingPeriod, quorumNumerator, quorumDenominator] = await Promise.all([
    callAt<[string]>(rpc, governor.address, governorAbi, 'CLOCK_MODE', [], blockHash),
    callAt<[bigint]>(rpc, governor.address, governorAbi, 'clock', [], blockHash),
    callAt<[string]>(rpc, governor.address, governorAbi, 'timelock', [], blockHash),
    callAt<[string]>(rpc, governor.address, governorAbi, 'treasury', [], blockHash),
    callAt<[string]>(rpc, governor.address, governorAbi, 'token', [], blockHash),
    callAt<[bigint]>(rpc, governor.address, governorAbi, 'proposalThreshold', [], blockHash),
    callAt<[bigint]>(rpc, governor.address, governorAbi, 'votingDelay', [], blockHash),
    callAt<[bigint]>(rpc, governor.address, governorAbi, 'votingPeriod', [], blockHash),
    callAt<[bigint]>(rpc, governor.address, governorAbi, 'quorumNumerator', [], blockHash),
    callAt<[bigint]>(rpc, governor.address, governorAbi, 'quorumDenominator', [], blockHash),
  ]);
  if (clockMode[0] !== 'mode=timestamp' || clock[0] !== blockTimestamp) {
    fail('BE06_GOVERNOR_CLOCK_MISMATCH', 'Governor clock must equal the timestamp of H and use mode=timestamp.');
  }
  if (governorTimelock[0].toLowerCase() !== timelock.address || governorTreasury[0].toLowerCase() !== treasury.address) {
    fail('BE06_CONTRACT_LINK_MISMATCH', 'Governor timelock/Treasury linkage differs from the manifest at H.');
  }
  if (govAddress[0] === ZeroAddress || govAddress[0].toLowerCase() !== governanceToken.address) {
    fail('BE06_CONTRACT_LINK_MISMATCH', 'Governor token() differs from the governance token in the verified manifest.');
  }
  const [treasuryBudgetToken, minDelay, govSupply, budSupply, treasuryBalance] = await Promise.all([
    callAt<[string]>(rpc, treasury.address, treasuryAbi, 'budgetToken', [], blockHash),
    callAt<[bigint]>(rpc, timelock.address, timelockAbi, 'getMinDelay', [], blockHash),
    callAt<[bigint]>(rpc, govAddress[0], tokenAbi, 'totalSupply', [], blockHash),
    callAt<[bigint]>(rpc, budgetToken.address, tokenAbi, 'totalSupply', [], blockHash),
    callAt<[bigint]>(rpc, budgetToken.address, tokenAbi, 'balanceOf', [treasury.address], blockHash),
  ]);
  if (treasuryBudgetToken[0].toLowerCase() !== budgetToken.address) {
    fail('BE06_CONTRACT_LINK_MISMATCH', 'Treasury budgetToken linkage differs from the manifest at H.');
  }
  if (quorumDenominator[0] === 0n || quorumNumerator[0] > quorumDenominator[0]) {
    fail('BE06_CHAIN_METADATA_INVALID', 'On-chain quorum fraction is invalid.');
  }
  return {
    atBlock: atBlock.toString(),
    blockHash,
    blockTimestamp: blockTimestamp.toString(),
    contractCodeHashes,
    governanceToken: govAddress[0].toLowerCase(),
    governanceConfig: {
      proposalThreshold: proposalThreshold[0].toString(),
      quorumNumerator: quorumNumerator[0].toString(),
      quorumDenominator: quorumDenominator[0].toString(),
      votingDelay: votingDelay[0].toString(),
      votingPeriod: votingPeriod[0].toString(),
      minDelay: minDelay[0].toString(),
      clockMode: clockMode[0],
      govSupply: govSupply[0].toString(),
      budSupply: budSupply[0].toString(),
    },
    treasuryBalance: treasuryBalance[0].toString(),
    links: {
      governor: governor.address,
      governanceToken: governanceToken.address,
      timelock: timelock.address,
      treasury: treasury.address,
      budgetToken: budgetToken.address,
    },
  };
}

async function applyMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    for (const migration of ['001_initial.sql', '002_be03.sql', '003_be04.sql', '004_be05_api.sql', '005_be07.sql']) {
      const sql = await readFile(new URL(`../../database/migrations/${migration}`, import.meta.url), 'utf8');
      await client.query(sql);
    }
  } finally {
    client.release();
  }
}

async function createMetadata(pool: Pool, manifest: LoadedManifest, chain: ChainMetadata): Promise<{
  deploymentId: string; deploymentName: string;
}> {
  const config = manifest.config;
  const deploymentName = manifest.deploymentName ?? `be06-${createHash('sha256')
    .update(JSON.stringify(deploymentScope(config))).digest('hex').slice(0, 24)}`;
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query<{ deployment_id: string }>(`
      INSERT INTO deployments (chain_id,deployment_name,deployment_block,abi_version,governance_config,confirmation_depth)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING deployment_id::text`, [
      config.chainId.toString(), deploymentName, firstBlock(config).toString(), `be06:${manifest.format}`,
      JSON.stringify({ ...chain.governanceConfig, sourceCommit: manifest.sourceCommit, manifestFormat: manifest.format,
        governanceToken: chain.governanceToken, budAddress: chain.links.budgetToken }), confirmationDepth(config),
    ]);
    const deploymentId = inserted.rows[0]!.deployment_id;
    for (const contract of config.contracts) {
      await client.query(`INSERT INTO deployment_contracts
        (deployment_id,chain_id,contract_role,contract_address,deployment_block,abi_version)
        VALUES ($1,$2,$3,$4,$5,$6)`, [deploymentId, config.chainId.toString(), contract.role, contract.address,
        contract.deploymentBlock.toString(), contract.abiVersion]);
    }
    await client.query('COMMIT');
    return { deploymentId, deploymentName };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function rebuildDatabase(options: {
  manifest: LoadedManifest;
  atBlock: string;
  rpc?: RpcTransport;
  referencePool: Pool;
  targetPool: Pool;
  onBatch?: (batch: { fromBlock: string; toBlock: string }) => void;
}): Promise<RebuildReport> {
  const { manifest, referencePool, targetPool } = options;
  const config = manifest.config;
  const at = BigInt(options.atBlock);
  if (config.toBlock === 'latest' || config.toBlock !== at) {
    fail('BE06_INVALID_RANGE', 'BE06 config must pin exactly the requested H.');
  }
  await assertDifferentDatabases(referencePool, targetPool);
  await assertEmptyDatabase(targetPool);

  const rpc = options.rpc ?? new HttpRpc(config.rpcUrl);
  const k = confirmationDepth(config);
  const headBefore = quantity(await rpc.call('eth_blockNumber', []), 'eth_blockNumber');
  const safeBefore = safeBlock(headBefore, k);
  if (safeBefore === null || at > safeBefore) {
    fail('BE06_BLOCK_UNCONFIRMED', `Requested H=${at} is not confirmed by K=${k}; safe block is ${safeBefore?.toString() ?? 'none'}.`);
  }
  const header = await readHeader(rpc, at);
  const chain = await readChainMetadata(config, rpc, at, header.hash, header.timestamp, manifest.governanceToken);
  await canonical(config, rpc, at, header.hash);

  await applyMigrations(targetPool);
  const identity = await createMetadata(targetPool, manifest, chain);
  const targetConfig = { ...config, deploymentId: identity.deploymentId, toBlock: at };
  const storage = new PostgresStorage(targetPool);
  const raw: SyncReport = await sync(targetConfig, rpc, storage, (batch) => options.onBatch?.(batch));
  const rawCheckpoint = raw.checkpoint;
  if (!rawCheckpoint || BigInt(rawCheckpoint.number) !== at || rawCheckpoint.hash !== header.hash) {
    fail('BE06_CHECKPOINT_NOT_AT_H', `BE03 checkpoint did not reach exactly H=${at} with the requested hash.`);
  }
  const projection: ProjectionReport = await project(targetConfig, rpc, targetPool);
  if (BigInt(projection.context.asOfBlock) !== at || projection.context.asOfBlockHash !== header.hash) {
    fail('BE06_PROJECTION_NOT_AT_H', 'BE04 projection did not publish exactly the requested H/hash.');
  }
  const headAfter = quantity(await rpc.call('eth_blockNumber', []), 'eth_blockNumber');
  const safeAfter = safeBlock(headAfter, k);
  if (safeAfter === null || at > safeAfter) {
    fail('BE06_BLOCK_CONFIRMATION_LOST', `H=${at} no longer has K=${k} confirmations after rebuild.`);
  }
  await canonical(config, rpc, at, header.hash);
  const stored = await targetPool.query<{ block_number: string; block_hash: string }>(
    'SELECT trunc(block_number)::text AS block_number,block_hash FROM projection_checkpoints WHERE deployment_id=$1',
    [identity.deploymentId]);
  if (stored.rowCount !== 1 || stored.rows[0]!.block_number !== at.toString() || stored.rows[0]!.block_hash !== header.hash) {
    fail('BE06_PROJECTION_NOT_AT_H', 'Persisted BE04 checkpoint differs from requested H/hash.');
  }
  const ahead = await targetPool.query<{ count: string }>(`SELECT count(*)::text AS count FROM indexed_blocks
    WHERE deployment_id=$1 AND block_number>$2`, [identity.deploymentId, at.toString()]);
  if (ahead.rows[0]!.count !== '0') fail('BE06_EVENT_AFTER_H', 'Target contains indexed headers after H.');
  const eventsAhead = await targetPool.query<{ count: string }>(`SELECT count(*)::text AS count FROM raw_events
    WHERE deployment_id=$1 AND block_number>$2`, [identity.deploymentId, at.toString()]);
  if (eventsAhead.rows[0]!.count !== '0') fail('BE06_EVENT_AFTER_H', 'Target contains raw events after H.');
  return {
    result: 'rebuilt',
    manifest: { format: manifest.format, sha256: manifest.manifestSha256, sourceCommit: manifest.sourceCommit },
    scope: deploymentScope(config),
    target: identity,
    confirmations: k,
    requestedBlock: at.toString(),
    blockHash: header.hash,
    chainHeadBefore: headBefore.toString(),
    safeBlockBefore: safeBefore.toString(),
    chainHeadAfter: headAfter.toString(),
    safeBlockAfter: safeAfter.toString(),
    rawCheckpoint: { block: rawCheckpoint.number, hash: rawCheckpoint.hash },
    projection,
    chainMetadata: chain,
    decodeWarnings: { complete: raw.decodeComplete, unknownTopics: raw.unknownTopics, decodeErrors: raw.decodeErrors },
  };
}

export async function verifyRequestedHash(rpc: RpcTransport, config: LoadedManifest['config'], at: bigint,
  hash: string): Promise<void> {
  await canonical(config, rpc, at, hash);
}
