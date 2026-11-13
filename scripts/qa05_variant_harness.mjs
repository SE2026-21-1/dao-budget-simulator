import assert from 'node:assert/strict';
import { createServer as netServer } from 'node:net';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { Interface, ZeroAddress, ZeroHash, getAddress, id, toQuantity } from 'ethers';
import pg from 'pg';
import { deployGovernance, checkGovernanceRoles } from './governance_local.mjs';
import { createSmokeLifecycle } from './smoke_lifecycle.mjs';
import { parseConfig } from '../indexer/config.ts';
import { HttpRpc } from '../indexer/rpc.ts';
import { PostgresStorage } from '../indexer/storage.ts';
import { sync } from '../indexer/syncer.ts';
import { project } from '../indexer/projection/projector.ts';
import { createApiServer } from '../indexer/api/server.ts';
import { assertEmptyDatabase } from '../indexer/be06/rebuild.ts';

export const json = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? String(v) : v, 2);
const pause = ms => new Promise(done => setTimeout(done, ms));
async function port() {
  const s = netServer(); await new Promise((ok, fail) => { s.once('error', fail); s.listen(0, '127.0.0.1', ok); });
  const p = s.address().port; await new Promise(ok => s.close(ok)); return p;
}
const listen = s => new Promise((ok, fail) => { s.once('error', fail); s.listen(0, '127.0.0.1', ok); });
async function close(s) { s.closeAllConnections(); await new Promise(ok => s.close(ok)); }

// This control surface is local test instrumentation, not a production API.
// A checkpoint cannot pass until a real browser returns its observed evidence.
export async function createVariantHarness({ root, output, adminUrl, report }) {
  const events = new Set(); let current; let ack; let sequence = 0; let completed = false;
  const control = createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' }); res.end(); return;
      }
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
        events.add(res); req.once('close', () => events.delete(res));
        if (current) res.write(`data: ${json(current).replace(/\n/g, '')}\n\n`);
        if (completed) res.end('event: done\ndata: {}\n\n');
        return;
      }
      if (path === '/config') {
        res.writeHead(current ? 200 : 503, { 'content-type': 'application/json' }); res.end(json(current ?? {})); return;
      }
      if (path === '/ack' && req.method === 'POST') {
        let text = ''; for await (const part of req) text += part;
        const result = JSON.parse(text); assert.equal(result.id, current?.id, 'Wrong browser checkpoint');
        const done = ack; ack = undefined; current = undefined;
        res.writeHead(200); res.end('ok'); done(result); return;
      }
      if ((path === '/rpc' || path.startsWith('/api/')) && current) {
        let body = ''; for await (const part of req) body += part;
        const upstream = path === '/rpc' ? current.rpcUrl : current.apiUrl + req.url;
        const response = await fetch(upstream, { method: req.method, headers: { 'content-type': 'application/json' }, ...(body ? { body } : {}) });
        res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json', 'access-control-allow-origin': '*' }); res.end(await response.text()); return;
      }
      res.writeHead(404); res.end();
    } catch (error) { res.writeHead(500); res.end(String(error)); }
  });
  await listen(control);
  const controlUrl = `http://127.0.0.1:${control.address().port}`;
  await writeFile(`${output}/control.json`, json({ controlUrl }), { flag: 'wx' });
  const admin = new pg.Client({ connectionString: adminUrl }); await admin.connect();
  const harness = {
    async case(label, run, options = {}) {
      const life = createSmokeLifecycle(); const servers = []; const pools = [];
      const row = { label, receipts: [], checks: [], checkpoints: [], reset: 'new owned Anvil at empty block0; new canonical F0 deployment; distinct owned empty DB per checkpoint', result: 'RUNNING' };
      report.cases.push(row);
      let anvil; let rpcUrl;
      try {
        const p = await port(); rpcUrl = `http://127.0.0.1:${p}`;
        anvil = life.spawn('anvil', ['--host', '127.0.0.1', '--port', String(p), '--chain-id', '31337', '--hardfork', 'osaka', '--timestamp', '1799999900', '--silent'], { stdio: ['ignore', 'pipe', 'pipe'] });
        row.process = { pid: anvil.pid, port: p, stdout: '', stderr: '' };
        anvil.stdout.on('data', d => { row.process.stdout += d; }); anvil.stderr.on('data', d => { row.process.stderr += d; });
        anvil.once('exit', (code, signal) => { row.process.exit = { code, signal }; });
        let rpcId = 0;
        const rpc = async (method, params = []) => {
          life.throwIfInterrupted();
          const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }) });
          assert.equal(response.status, 200); const body = await response.json();
          if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`); return body.result;
        };
        let ready = false;
        for (let n = 0; n < 100; n++) { try { ready = await rpc('eth_chainId') === '0x7a69'; if (ready) break; } catch {} await pause(50); }
        assert.ok(ready, 'Owned Anvil unavailable'); assert.equal(await rpc('eth_blockNumber'), '0x0');
        const raw = await rpc('eth_accounts');
        const accounts = Object.fromEntries(['A', 'B', 'C', 'D', 'funding', 'deployer', 'caller', 'recipient', 'outsider', 'recipient2'].map((key, i) => [key, getAddress(raw[i])]));
        const deploymentAccounts = Object.fromEntries(Object.entries(accounts).filter(([key]) => key !== 'recipient2'));
        const { manifest, abis } = await deployGovernance(rpc, { root, accounts: deploymentAccounts }); row.manifest = manifest;
        row.roles = await checkGovernanceRoles(rpc, manifest, { root });
        const abi = Object.fromEntries(Object.entries(abis).map(([key, value]) => [key, new Interface(value)]));
        const address = Object.fromEntries(Object.entries(manifest.contracts).map(([key, value]) => [key, value.address]));
        const call = async (contract, method, args = []) => abi[contract].decodeFunctionResult(method, await rpc('eth_call', [{ to: address[contract], data: abi[contract].encodeFunctionData(method, args) }, 'latest']));
        const one = async (...args) => (await call(...args))[0];
        const tx = async ({ label: name, contract = 'Governor', from, method, args = [], at, expectError }) => {
          if (at !== undefined) await rpc('evm_setNextBlockTimestamp', [toQuantity(at)]);
          const hash = await rpc('eth_sendTransaction', [{ from, to: address[contract], data: abi[contract].encodeFunctionData(method, args), gas: toQuantity(12_000_000) }]);
          let receipt; for (let n = 0; n < 100; n++) { receipt = await rpc('eth_getTransactionReceipt', [hash]); if (receipt) break; await pause(50); }
          assert.ok(receipt, `${name}: receipt missing`);
          const block = await rpc('eth_getBlockByHash', [receipt.blockHash, false]);
          const record = { ...receipt, label: name, contract, method, from, args, timestamp: BigInt(block.timestamp) }; row.receipts.push(record);
          assert.equal(receipt.status, expectError ? '0x0' : '0x1', `${label}/${name}`);
          if (at !== undefined) assert.equal(BigInt(block.timestamp), BigInt(at), `${name}: timestamp`);
          if (expectError) {
            assert.deepEqual(receipt.logs, []);
            const trace = await rpc('debug_traceTransaction', [hash, { disableStorage: true, disableStack: true, enableMemory: false }]);
            const data = trace.returnValue.startsWith('0x') ? trace.returnValue : `0x${trace.returnValue}`;
            let decoded;
            for (const iface of [abi[contract], ...Object.values(abi)]) { try { decoded = iface.parseError(data); if (decoded) break; } catch {} }
            record.error = { name: decoded?.name ?? null, args: decoded ? Array.from(decoded.args) : [], data };
            assert.equal(record.error.name, expectError.name, `${name}: error ${data}`);
            if (expectError.data !== undefined) assert.equal(data, expectError.data);
            if (expectError.args !== undefined) assert.deepEqual(record.error.args, expectError.args);
          }
          return record;
        };
        const at = async time => { await rpc('evm_setNextBlockTimestamp', [toQuantity(time)]); await rpc('evm_mine'); assert.equal(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp), BigInt(time)); };
        const U = 10n ** 18n; const t0 = 1800000000n;
        const propose = async ({ creator = accounts.A, requestId = id(`tv4:${label}`), recipient = accounts.recipient, amount = 1000n * U, description = JSON.stringify({ version: 1, title: `QA05 ${label}`, body: 'Khoan chi mo phong cho nghiem thu TV4.' }), at: time = t0 } = {}) => {
          const action = [[address.Treasury], [0n], [abi.Treasury.encodeFunctionData('disburse', [requestId, recipient, amount])], id(description)];
          const proposalId = await one('Governor', 'hashProposal', action);
          const receipt = await tx({ label: 'propose', from: creator, method: 'propose', args: [...action.slice(0, 3), description], at: time });
          const created = receipt.logs.filter(l => l.address.toLowerCase() === address.Governor.toLowerCase()).map(l => abi.Governor.parseLog(l)).find(l => l?.name === 'ProposalCreated');
          assert.ok(created); assert.equal(created.args.proposalId, proposalId); assert.equal(created.args.proposer.toLowerCase(), creator.toLowerCase());
          assert.deepEqual(Array.from(created.args.targets).map(x => x.toLowerCase()), [address.Treasury.toLowerCase()]);
          assert.deepEqual(Array.from(created.args[3]), [0n]); assert.deepEqual(Array.from(created.args.calldatas), action[2]); assert.equal(created.args.description, description);
          return { id: proposalId, requestId, creator, recipient, amount, description, action, snapshot: await one('Governor', 'proposalSnapshot', [proposalId]), deadline: await one('Governor', 'proposalDeadline', [proposalId]) };
        };
        const pass = async proposal => {
          await tx({ label: 'A For400', from: accounts.A, method: 'castVote', args: [proposal.id, 1], at: proposal.snapshot + 1n });
          await tx({ label: 'B For300', from: accounts.B, method: 'castVote', args: [proposal.id, 1], at: proposal.snapshot + 2n });
          assert.deepEqual(Array.from(await call('Governor', 'proposalVotes', [proposal.id])), [0n, 700n * U, 0n]);
        };
        const queue = async proposal => {
          const receipt = await tx({ label: 'queue via Governor', from: accounts.caller, method: 'queue', args: proposal.action, at: proposal.deadline + 1n });
          proposal.eta = await one('Governor', 'proposalEta', [proposal.id]); assert.ok(proposal.eta >= BigInt(receipt.timestamp) + 120n);
          const salt = `0x${(BigInt(`${address.Governor}${'0'.repeat(24)}`) ^ BigInt(proposal.action[3])).toString(16).padStart(64, '0')}`;
          proposal.operationId = await one('Timelock', 'hashOperationBatch', [...proposal.action.slice(0, 3), ZeroHash, salt]);
          assert.equal(await one('Timelock', 'isOperationPending', [proposal.operationId]), true); return proposal;
        };
        const invariants = async proposal => ({
          treasury: String(await one('BUD', 'balanceOf', [address.Treasury])), recipient: String(await one('BUD', 'balanceOf', [proposal?.recipient ?? accounts.recipient])), funding: String(await one('BUD', 'balanceOf', [accounts.funding])),
          ...(proposal ? { paid: await one('Treasury', 'paidRequests', [proposal.requestId]), state: String(await one('Governor', 'state', [proposal.id])), votes: Array.from(await call('Governor', 'proposalVotes', [proposal.id])).map(String), eta: String(await one('Governor', 'proposalEta', [proposal.id])),
            hasVoted: Object.fromEntries(await Promise.all(['A', 'B', 'C', 'D', 'caller', 'outsider', 'deployer'].map(async key => [key, await one('Governor', 'hasVoted', [proposal.id, accounts[key]])]))),
            ...(proposal.operationId ? { operationTimestamp: String(await one('Timelock', 'getTimestamp', [proposal.operationId])), operationReady: await one('Timelock', 'isOperationReady', [proposal.operationId]), operationDone: await one('Timelock', 'isOperationDone', [proposal.operationId]) } : {}) } : {})
        });
        const checkpoint = async ({ label: stage, proposals = [], expectedStates, expectedTreasury, expectedPayouts, ui = {} }) => {
          const head = await rpc('eth_getBlockByNumber', ['latest', false]); const height = String(BigInt(head.number));
          const dbName = `tv4_variants_${++sequence}`; await admin.query(`CREATE DATABASE ${dbName}`);
          const dbUrl = new URL(adminUrl); dbUrl.pathname = `/${dbName}`;
          const pool = new pg.Pool({ connectionString: String(dbUrl), max: 3 }); pools.push(pool); await assertEmptyDatabase(pool);
          for (const migration of ['001_initial', '002_be03', '003_be04', '004_be05_api', '005_be07']) await pool.query(await readFile(`${root}/database/migrations/${migration}.sql`, 'utf8'));
          const keys = { budget_token: 'BUD', treasury: 'Treasury', timelock: 'Timelock', governor: 'Governor' };
          const start = Object.values(keys).map(k => BigInt(manifest.contracts[k].deploymentBlock)).reduce((a, b) => a < b ? a : b);
          const deploymentId = (await pool.query("INSERT INTO deployments(chain_id,deployment_name,deployment_block,abi_version,governance_config) VALUES(31337,'qa05-variants',$1,'qa05-live',$2::jsonb) RETURNING deployment_id::text", [String(start), json(manifest.config)])).rows[0].deployment_id;
          for (const [role, key] of Object.entries({ ...keys, governance_token: 'GOV' })) {
            const c = manifest.contracts[key]; await pool.query('INSERT INTO deployment_contracts(deployment_id,chain_id,contract_role,contract_address,deployment_block,abi_version) VALUES($1,31337,$2,$3,$4,$5)', [deploymentId, role, c.address.toLowerCase(), c.deploymentBlock, c.abiVersion]);
          }
          const contracts = Object.entries(keys).map(([role, key]) => ({ role, address: address[key].toLowerCase(), deploymentBlock: manifest.contracts[key].deploymentBlock, abiVersion: manifest.contracts[key].abiVersion }));
          const config = parseConfig({ rpcUrl, chainId: '31337', deploymentId, fromBlock: String(start), toBlock: height, batchSize: '7', confirmations: 2, contracts }, {});
          // interval=0 still follows Anvil's wall clock after elapsed API work.
          // Explicit same-time descendants keep exact S/E boundaries unchanged.
          for (let i = 0; i < 2; i++) {
            await rpc('evm_setNextBlockTimestamp', [head.timestamp]); await rpc('evm_mine');
          }
          const confirmedHead = await rpc('eth_getBlockByNumber', ['latest', false]);
          assert.equal(BigInt(confirmedHead.number), BigInt(head.number) + 2n);
          assert.equal(confirmedHead.timestamp, head.timestamp, 'K2 confirmation must not move the tested timestamp');
          const transport = new HttpRpc(rpcUrl); const rawResult = await sync(config, transport, new PostgresStorage(pool)); assert.equal(rawResult.checkpoint.hash, head.hash);
          const projection = await project(config, transport, pool);
          const api = createApiServer({ pool, cursorSecret: randomBytes(32).toString('hex'), snapshotTtlSeconds: 3600 }); await listen(api); servers.push(api);
          const apiUrl = `http://127.0.0.1:${api.address().port}`; const responses = {};
          const get = async (key, path, extra = {}) => {
            const query = new URLSearchParams({ chainId: '31337', deploymentId: 'qa05-variants', asOfBlock: height, asOfBlockHash: head.hash, ...extra });
            const response = await fetch(`${apiUrl}/api${path}?${query}`); const body = await response.json(); responses[key] = { status: response.status, body }; assert.equal(response.status, 200, json(body));
            for (const field of ['asOfBlock', 'asOfBlockHash', 'snapshotRevision']) assert.equal(body.context[field], projection.context[field]); return body;
          };
          const summary = await get('summary', '/summary'); assert.equal(String(summary.data.proposalCounts.total), String(proposals.length));
          if (expectedTreasury !== undefined) assert.equal(summary.data.treasury.balance, String(expectedTreasury));
          for (let n = 0; n < proposals.length; n++) {
            const proposal = proposals[n]; const detail = await get(`detail-${n}`, `/proposals/${proposal.id}`);
            if (expectedStates) assert.equal(detail.data.state, expectedStates[n]);
            assert.equal(detail.data.requestId, proposal.requestId); await get(`votes-${n}`, `/proposals/${proposal.id}/votes`);
            const chainVotes = Array.from(await call('Governor', 'proposalVotes', [proposal.id])).map(String);
            assert.deepEqual([detail.data.votes.against, detail.data.votes.for, detail.data.votes.abstain], chainVotes);
          }
          const transfers = await get('outgoing', '/treasury/transfers', { direction: 'out' }); if (expectedPayouts !== undefined) assert.equal(transfers.pagination.totalCount, expectedPayouts);
          const rejected = row.receipts.filter(r => r.status === '0x0').map(r => r.transactionHash);
          const rejectedRawEvents = (await pool.query('SELECT count(*)::int AS n FROM raw_events WHERE deployment_id=$1 AND transaction_hash=ANY($2::text[])', [deploymentId, rejected])).rows[0].n; assert.equal(rejectedRawEvents, 0);
          const snapshot = { label: stage, head: { number: height, hash: head.hash, timestamp: String(BigInt(head.timestamp)) }, database: dbName, raw: rawResult, projection, responses, rejectedRawEvents, ui };
          row.checkpoints.push(snapshot);
          current = { id: sequence, case: label, stage, controlUrl, rpcUrl, apiUrl, manifest, accounts, proposals: proposals.map(p => ({ ...p, id: String(p.id), snapshot: String(p.snapshot), deadline: String(p.deadline) })), expectedStates, context: projection.context, ui, uiForms: row.uiForms ?? [] };
          const browserResult = new Promise(done => { ack = done; });
          await writeFile(`${output}/checkpoint-${sequence}-before-browser.json`, json({ current, snapshot, receipts: row.receipts, checks: row.checks }), { flag: 'wx' });
          const event = `data: ${json(current).replace(/\n/g, '')}\n\n`; for (const subscriber of events) subscriber.write(event);
          console.log(`QA05_UI_READY ${controlUrl} ${label} ${stage}`);
          snapshot.browser = await browserResult; assert.equal(snapshot.browser.status, 'PASS', json(snapshot.browser));
          return snapshot;
        };
        const ctx = { U, t0, label, accounts, abi, address, manifest, rpc, row, call, one, tx, at, propose, pass, queue, invariants, checkpoint };
        for (const key of options.undelegated ?? []) await tx({ label: `F0 ${key} undelegated`, contract: 'GOV', from: accounts[key], method: 'delegate', args: [ZeroAddress], at: t0 - 2n });
        await run(ctx); row.result = 'PASS';
      } catch (error) { row.result = 'FAIL'; row.error = { name: error.name, message: error.message, stack: error.stack }; throw error; }
      finally {
        for (const server of servers) await close(server); for (const pool of pools) await pool.end();
        await life.cleanup(); life.dispose();
        row.shutdown = { apiClosed: servers.every(s => !s.listening), anvil: row.process?.exit ?? null, ownedPid: anvil?.pid };
        await writeFile(`${output}/case-${report.cases.length}.json`, json(row), { flag: 'wx' });
      }
    },
    async close() {
      completed = true; for (const subscriber of events) subscriber.end('event: done\ndata: {}\n\n');
      await admin.end(); await close(control);
    },
  };
  return harness;
}
