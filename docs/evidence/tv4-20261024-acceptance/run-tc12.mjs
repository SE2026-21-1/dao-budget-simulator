#!/usr/bin/env node
// Acceptance driver: fresh caller-owned Anvil and PostgreSQL cluster only.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Interface, id, toQuantity } from 'ethers';
import pg from 'pg';
import { deployGovernance, requireLoopbackRpc } from '../../../scripts/governance_local.mjs';
import { assertReceiptStatus, waitForReceipt } from '../../../scripts/receipt.mjs';
import { parseBe06Manifest } from '../../../indexer/be06/manifest.ts';
import { assertEmptyDatabase, rebuildDatabase } from '../../../indexer/be06/rebuild.ts';
import { compareDatabases } from '../../../indexer/be06/compare.ts';
import { HttpRpc } from '../../../indexer/rpc.ts';
import { PostgresStorage } from '../../../indexer/storage.ts';
import { sync } from '../../../indexer/syncer.ts';
import { project } from '../../../indexer/projection/projector.ts';
import { firstBlock } from '../../../indexer/scope.ts';
import { createApiServer } from '../../../indexer/api/server.ts';

assert.equal(process.env.TV4_TC12_ISOLATED, '1', 'Explicitly select a new caller-owned cluster and empty Anvil.');
const rpcUrl = process.env.TV4_TC12_RPC_URL;
requireLoopbackRpc(rpcUrl);
const adminUrl = new URL(process.env.TV4_TC12_POSTGRES_URL);
assert.equal(adminUrl.hostname, '127.0.0.1');
assert.equal(adminUrl.username, 'be04_test');
assert.equal(adminUrl.pathname, '/postgres');
assert.equal(adminUrl.search, '');
assert.equal(adminUrl.hash, '');
const output = resolve(process.env.TV4_TC12_OUTPUT);
await mkdir(output, { recursive: false });
const root = fileURLToPath(new URL('../../../', import.meta.url));
const admin = new pg.Pool({ connectionString: adminUrl.href, max: 1 });
const transport = new HttpRpc(rpcUrl);
const rpc = (method, params = []) => transport.call(method, params);
const report = { status: 'FAIL', sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  startedAt: new Date().toISOString(), scope: 'TC12: independent fresh databases at S/S+1/D/D+1/E-1/E and the exact eight-proposal H=t0+1000 fixture; no reorg rollback or testnet.',
  driverSha256: createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'), receipts: [], cases: [] };
let api;
const openPools = new Set();
try {
  report.postgres = (await admin.query('SELECT version() AS version')).rows[0].version;
  const wallets = await rpc('eth_accounts');
  const accounts = Object.fromEntries(['A', 'B', 'C', 'D', 'funding', 'deployer', 'caller', 'recipient', 'outsider'].map((name, i) => [name, wallets[i]]));
  const { manifest, abis } = await deployGovernance(rpc, { root, accounts });
  report.manifest = manifest;
  const abi = Object.fromEntries(Object.entries(abis).map(([key, value]) => [key, new Interface(value)]));
  const address = Object.fromEntries(Object.entries(manifest.contracts).map(([key, value]) => [key, value.address]));
  const U = 10n ** 18n;
  const t0 = BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp) + 10n;
  report.t0 = String(t0);
  const definitions = [['Executed', 0], ['Queued Waiting', 100], ['Queued Ready', 200], ['Succeeded', 500], ['Defeated', 510], ['Active', 800], ['Canceled', 900], ['Pending', 950]];
  const proposals = {};
  const actions = [];
  const at = (offset, action) => actions.push({ offset, action });
  async function send(label, from, contract, method, args) {
    const transactionHash = await rpc('eth_sendTransaction', [{ from, to: address[contract], data: abi[contract].encodeFunctionData(method, args), gas: toQuantity(8_000_000) }]);
    const receipt = await waitForReceipt(rpc, transactionHash, { step: label });
    assertReceiptStatus(receipt, transactionHash, label, true);
    report.receipts.push({ label, ...receipt });
    return receipt;
  }
  async function call(contract, method, args, block = 'latest') {
    return abi[contract].decodeFunctionResult(method, await rpc('eth_call', [{ to: address[contract], data: abi[contract].encodeFunctionData(method, args) }, block]));
  }
  for (const [label, offset] of definitions) {
    const description = `  ${JSON.stringify({ version: 1, title: `TC12 ${label} 🗳️`, body: 'Đối soát cùng H; giữ nguyên byte description.' })}  `;
    const requestId = id(`tv4-tc12:${label}`);
    const targets = [address.Treasury], values = ['0'];
    const calldatas = [abi.Treasury.encodeFunctionData('disburse', [requestId, accounts.recipient, 1000n * U])];
    const descriptionHash = id(description);
    const proposalId = String((await call('Governor', 'hashProposal', [targets, values, calldatas, descriptionHash]))[0]);
    proposals[label] = { label, offset, proposalId, requestId, targets, values, calldatas, description, descriptionHash };
    at(offset, async () => {
      await send(`propose ${label}`, accounts.A, 'Governor', 'propose', [targets, values, calldatas, description]);
      assert.equal((await call('Governor', 'proposalSnapshot', [proposalId]))[0], t0 + BigInt(offset + 60));
      assert.equal((await call('Governor', 'proposalDeadline', [proposalId]))[0], t0 + BigInt(offset + 360));
    });
    for (const [voter, delta] of label === 'Defeated' ? [['D', 61]] : label === 'Active' ? [['A', 61]] : ['Pending', 'Canceled'].includes(label) ? [] : [['A', 61], ['B', 62]])
      at(offset + delta, () => send(`vote ${label} ${voter}`, accounts[voter], 'Governor', 'castVote', [proposalId, 1]));
  }
  const args = (label) => { const p = proposals[label]; return [p.targets, p.values, p.calldatas, p.descriptionHash]; };
  at(361, () => send('queue Executed', accounts.caller, 'Governor', 'queue', args('Executed')));
  at(481, () => send('execute Executed', accounts.caller, 'Governor', 'execute', args('Executed')));
  at(700, () => send('queue Queued Ready', accounts.caller, 'Governor', 'queue', args('Queued Ready')));
  at(901, () => send('cancel Canceled', accounts.A, 'Governor', 'cancel', args('Canceled')));
  at(950, () => send('queue Queued Waiting', accounts.caller, 'Governor', 'queue', args('Queued Waiting')));
  const boundaries = new Map();
  for (const [label, offset] of [['S', 60], ['S+1', 61], ['D', 360], ['D+1', 361], ['E-1', 480], ['E', 481], ['eight-states', 1000]])
    at(offset, async () => { await rpc('evm_mine'); boundaries.set(label, await rpc('eth_getBlockByNumber', ['latest', false])); });
  for (const { offset, action } of actions.sort((a, b) => a.offset - b.offset)) {
    await rpc('evm_setNextBlockTimestamp', [toQuantity(t0 + BigInt(offset))]);
    await action();
  }
  await rpc('anvil_mine', ['0x2', '0x0']);
  report.proposals = Object.values(proposals);
  const createPool = async (name) => {
    assert.match(name, /^tv4_tc12_(reference|target)_[0-6]$/);
    await admin.query(`CREATE DATABASE ${name} OWNER be04_test`);
    const url = new URL(adminUrl); url.pathname = `/${name}`;
    const pool = new pg.Pool({ connectionString: url.href, max: 3 });
    openPools.add(pool);
    await assertEmptyDatabase(pool);
    return pool;
  };
  let index = 0;
  for (const [label, header] of boundaries) {
    const h = String(BigInt(header.number));
    const reference = await createPool(`tv4_tc12_reference_${index}`);
    const target = await createPool(`tv4_tc12_target_${index++}`);
    const loaded = parseBe06Manifest(manifest, rpcUrl, h);
    for (const name of ['001_initial', '002_be03', '003_be04', '004_be05_api'])
      await reference.query(await readFile(new URL(`../../../database/migrations/${name}.sql`, import.meta.url), 'utf8'));
    const d = (await reference.query(`INSERT INTO deployments(chain_id,deployment_name,deployment_block,abi_version,governance_config)
      VALUES(31337,'tv4-tc12',$1,'tv4-tc12',$2::jsonb) RETURNING deployment_id::text`, [String(firstBlock(loaded.config)), JSON.stringify(manifest.config)])).rows[0].deployment_id;
    for (const c of [...loaded.config.contracts, { role: 'governance_token', ...loaded.governanceToken }])
      await reference.query(`INSERT INTO deployment_contracts(deployment_id,chain_id,contract_role,contract_address,deployment_block,abi_version)
        VALUES($1,31337,$2,$3,$4,$5)`, [d, c.role, c.address.toLowerCase(), String(c.deploymentBlock), c.abiVersion]);
    const config = { ...loaded.config, deploymentId: d };
    await sync(config, transport, new PostgresStorage(reference));
    const projection = await project(config, transport, reference);
    assert.equal(projection.context.asOfBlock, h);
    assert.equal(projection.context.asOfBlockHash, header.hash);
    const rebuilt = await rebuildDatabase({ manifest: loaded, atBlock: h, rpc: transport, referencePool: reference, targetPool: target });
    const comparison = await compareDatabases({ referencePool: reference, rebuildPool: target, config, atBlock: h, rpc: transport });
    assert.equal(comparison.result, 'equal', JSON.stringify(comparison.mismatches));
    const states = (await reference.query('SELECT proposal_id::text,state,quorum::text,operation_status FROM proposal_states ORDER BY proposal_id')).rows;
    const executedState = states.find((s) => s.proposal_id === proposals.Executed.proposalId);
    const expected = { S: 'Pending', 'S+1': 'Active', D: 'Active', 'D+1': 'Queued', 'E-1': 'Queued', E: 'Executed', 'eight-states': 'Executed' }[label];
    assert.equal(executedState.state, expected);
    assert.equal(executedState.quorum, label === 'S' ? null : String(200n * U));
    const outcome = { label, h, hash: header.hash, timestamp: String(BigInt(header.timestamp)), projection, states, rebuild: rebuilt, comparison };
    if (label === 'eight-states') {
      assert.equal(BigInt(header.timestamp), t0 + 1000n);
      assert.equal(states.length, 8);
      for (const p of Object.values(proposals)) {
        const state = states.find((s) => s.proposal_id === p.proposalId);
        assert.equal(state.state, p.label.startsWith('Queued') ? 'Queued' : p.label, p.label);
        assert.equal(state.operation_status, p.label === 'Queued Waiting' ? 'Waiting' : p.label === 'Queued Ready' ? 'Ready' : p.label === 'Executed' ? 'Done' : null, p.label);
        const pinned = { blockHash: header.hash, requireCanonical: true };
        if (t0 + BigInt(p.offset + 60) < BigInt(header.timestamp)) {
          const past = [];
          for (const voter of ['A', 'B', 'C', 'D']) past.push(String((await call('GOV', 'getPastVotes', [accounts[voter], t0 + BigInt(p.offset + 60)], pinned))[0]));
          assert.deepEqual(past, [400n, 300n, 200n, 100n].map((n) => String(n * U)));
          assert.equal((await call('GOV', 'getPastTotalSupply', [t0 + BigInt(p.offset + 60)], pinned))[0], 1000n * U);
        }
      }
      assert.equal((await call('Governor', 'proposalEta', [proposals['Queued Waiting'].proposalId], { blockHash: header.hash, requireCanonical: true }))[0], t0 + 1070n);
      assert.equal((await call('Governor', 'proposalEta', [proposals['Queued Ready'].proposalId], { blockHash: header.hash, requireCanonical: true }))[0], t0 + 820n);
      assert.equal(projection.treasury.totalIn, String(10000n * U));
      assert.equal(projection.treasury.totalOut, String(1000n * U));
      assert.equal(projection.treasury.balance, String(9000n * U));
      assert.equal((await call('BUD', 'balanceOf', [accounts.recipient], { blockHash: header.hash, requireCanonical: true }))[0], 1000n * U);
      assert.equal((await call('BUD', 'balanceOf', [accounts.funding], { blockHash: header.hash, requireCanonical: true }))[0], 10000n * U);
      api = createApiServer({ pool: reference, cursorSecret: randomBytes(32).toString('hex') });
      await new Promise((done, reject) => { api.once('error', reject); api.listen(0, '127.0.0.1', done); });
      const query = new URLSearchParams({ chainId: '31337', deploymentId: 'tv4-tc12', asOfBlock: h, asOfBlockHash: header.hash });
      const base = `http://127.0.0.1:${api.address().port}/api`;
      const request = async (path) => { const response = await fetch(`${base}${path}?${query}`); const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body)); assert.equal(body.context.asOfBlockHash, header.hash); return body; };
      outcome.api = { summary: await request('/summary'), proposals: await request('/proposals'), details: [] };
      assert.equal(outcome.api.summary.data.proposalCounts.total, 8);
      assert.equal(outcome.api.summary.data.treasury.balance, String(9000n * U));
      for (const p of Object.values(proposals)) {
        const detail = await request(`/proposals/${p.proposalId}`);
        assert.equal(detail.data.state, p.label.startsWith('Queued') ? 'Queued' : p.label);
        assert.equal(detail.data.description, p.description);
        assert.equal(detail.data.votes.quorum, p.label === 'Pending' ? null : String(200n * U));
        outcome.api.details.push(detail);
      }
      await new Promise((done) => api.close(done)); api = null;
    }
    report.cases.push(outcome);
    await writeFile(resolve(output, `${index}-${label.replaceAll(/[^a-zA-Z0-9-]/g, '_')}.json`), JSON.stringify(outcome, (_, value) => typeof value === 'bigint' ? String(value) : value, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ label, h, status: 'PASS', counts: projection.counts }));
    await reference.end(); openPools.delete(reference);
    await target.end(); openPools.delete(target);
  }
  report.status = 'PASS';
} catch (error) {
  report.error = { name: error.name, code: error.code, message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  if (api) await new Promise((done) => api.close(done));
  await Promise.all([...openPools].map((pool) => pool.end()));
  await admin.end();
  report.finishedAt = new Date().toISOString();
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, (_, value) => typeof value === 'bigint' ? String(value) : value, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: report.status, cases: report.cases.length, error: report.error?.message }));
}
