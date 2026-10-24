// Fresh BE03 acceptance. Run from repo root with Windows Node 24 --import tsx.
// Forge is deliberately invoked separately in Ubuntu/WSL; never invoke Windows Forge.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { Interface, id, keccak256, toQuantity } from 'ethers';
import { createRpc } from '../../../scripts/governance_local.mjs';
import { decodeLog } from '../../../indexer/decoder.ts';
import { getAbi } from '../../../indexer/abi-registry.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const directory = fileURLToPath(new URL('./', import.meta.url));
const anvilExe = join(root, 'dist/be03-tools/package/bin/anvil.exe');
const castExe = join(root, 'dist/be03-tools/cast-1.7.1/package/bin/cast.exe');
const pgBin = 'C:\\Program Files\\PostgreSQL\\18\\bin';
const sha = x => createHash('sha256').update(x).digest('hex');
const json = x => JSON.stringify(x, null, 2) + '\n';
const save = (name, x) => writeFile(join(directory, name), json(x));
const canonical = x => JSON.stringify(x, (_k, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const report = { startedAt: new Date().toISOString(), status: 'RUNNING', classification: 'Fresh real Anvil receipts -> BE03 real RPC -> isolated real PostgreSQL; no BE04', commands: [], stages: [], receipts: [], assertions: [], cleanup: {} };
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('PG') && !['DATABASE_URL', 'RPC_URL', 'NODE_OPTIONS', 'BE03_TEST_DATABASE_URL'].includes(k)));
let pool, admin, anvil, anvilClosed, pgDir, clusterStarted = false, rpc, rpcUrl;
let anvilStdout = '', anvilStderr = '';
async function freePort() {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
async function run(label, executable, args, extraEnv = {}, accepted = [0]) {
  const child = spawn(executable, args, { cwd: root, env: { ...env, ...extraEnv }, windowsHide: true, timeout: 120000 });
  let stdout = '', stderr = '', error;
  child.stdout.on('data', x => { stdout += x; }); child.stderr.on('data', x => { stderr += x; });
  child.on('error', x => { error = x.message; });
  const [exitCode, signal] = await once(child, label === 'pg-start' ? 'exit' : 'close');
  // On Windows postgres inherits pg_ctl pipe handles even with its server log.
  if (label === 'pg-start') { child.stdout.destroy(); child.stderr.destroy(); }
  await writeFile(join(directory, `${label}.txt`), stdout + stderr);
  const result = { label, command: [executable, ...args], exitCode, signal, log: `${label}.txt`, ...(error ? { error } : {}) };
  report.commands.push(result); await save(`${label}.json`, result);
  assert.ok(accepted.includes(exitCode), `${label}: exit ${exitCode}; ${stderr.slice(-1000)}`);
  return { ...result, stdout, stderr };
}
async function version(executable, args = ['--version']) {
  return { executable, sha256: sha(await readFile(executable)), output: execFileSync(executable, args, { encoding: 'utf8', windowsHide: true }).trim() };
}
async function sql(text, values = []) { return (await pool.query(text, values)).rows; }
const HEADERS = 'SELECT block_number::text,block_hash,parent_hash,block_timestamp::text FROM indexed_blocks ORDER BY indexed_blocks.block_number';
const EVENTS = 'SELECT raw_event_id::text,chain_id::text,contract_role,contract_address,block_number::text,block_hash,transaction_hash,transaction_index::text,log_index::text,topics::text[],data,removed,event_name,decoded_payload,rpc_log,decode_status,decode_error_code FROM raw_events ORDER BY raw_events.block_number,raw_events.transaction_index,raw_events.log_index';
const CHECKPOINT = 'SELECT c.deployment_id::text,c.block_number::text,c.block_hash,b.block_hash AS header_hash,c.observed_head_block::text,c.confirmation_depth,c.source_scope,c.sync_status,c.last_error_code FROM checkpoints c JOIN indexed_blocks b USING(deployment_id,block_number,block_hash)';
async function snapshot(label) {
  const state = { headers: await sql(HEADERS), events: await sql(EVENTS), checkpoint: await sql(CHECKPOINT) };
  state.digest = sha(canonical(state)); await save(`sql-${label}.json`, state); return state;
}

try {
  assert.equal(process.platform, 'win32', 'Use Windows Node with existing Windows PG/Anvil; Forge runs in WSL separately.');
  report.runtime = { node: process.version, executable: process.execPath, platform: process.platform,
    anvil: await version(anvilExe), cast: await version(castExe), postgres: await version(join(pgBin, 'postgres.exe')),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() };
  report.sourceHashes = {};
  for (const folder of ['contracts', 'indexer', 'database/migrations', 'scripts']) {
    for (const entry of await readdir(join(root, folder), { recursive: true, withFileTypes: true })) {
      if (entry.isFile()) {
        const absolute = join(entry.parentPath, entry.name);
        const relative = absolute.slice(root.length).replaceAll('\\', '/');
        report.sourceHashes[relative] = sha(await readFile(absolute));
      }
    }
  }
  // Verify every cache-declared output, every physical metadata source and compiler setting.
  const cache = JSON.parse(await readFile(join(root, 'cache/solidity-files-cache.json'), 'utf8'));
  const artifacts = [], sources = new Map(), generated = new Set(), normalizedSources = new Set(), preprocessedTests = new Map();
  for (const [source, item] of Object.entries(cache.files)) {
    assert.equal(item.seenByCompiler, true);
    for (const [name, versions] of Object.entries(item.artifacts)) {
      for (const [compiler, profiles] of Object.entries(versions)) {
        assert.equal(compiler, '0.8.37');
        for (const [profile, output] of Object.entries(profiles)) {
          const path = `out/${output.path}`, bytes = await readFile(join(root, path));
          const artifact = JSON.parse(bytes), metadata = artifact.metadata;
          assert.equal(metadata.compiler.version, '0.8.37+commit.f401782d');
          assert.equal(metadata.settings.evmVersion, 'osaka');
          assert.deepEqual(metadata.settings.optimizer, { enabled: true, runs: 200 });
          assert.deepEqual(metadata.settings.compilationTarget, { [source]: name });
          const abiCanonical = abi => new Interface(abi).fragments.map(f => f.format('json')).sort();
          assert.deepEqual(abiCanonical(artifact.abi), abiCanonical(metadata.output.abi));
          for (const [sourcePath, info] of Object.entries(metadata.sources)) {
            if (sourcePath.startsWith('foundry-pp/')) { generated.add(sourcePath); continue; }
            if (!sources.has(sourcePath)) sources.set(sourcePath, await readFile(join(root, sourcePath)));
            let compilerHash = keccak256(sources.get(sourcePath));
            if (compilerHash !== info.keccak256) {
              compilerHash = keccak256(Buffer.from(sources.get(sourcePath).toString('utf8').replaceAll('\r\n', '\n')));
              normalizedSources.add(sourcePath);
            }
            if (compilerHash !== info.keccak256) {
              assert.ok(sourcePath.startsWith('tests/') && cache.preprocessed === true && cache.native_dependencies[sourcePath], `${path}: unexpected source mismatch ${sourcePath}`);
              preprocessedTests.set(sourcePath, { sourceSha256: sha(sources.get(sourcePath)), lfKeccak256: compilerHash, compilerKeccak256: info.keccak256,
                provenance: 'Foundry dynamic_test_linking preprocessor; WSL force rebuild reproduces all artifact bytes' });
            }
          }
          artifacts.push({ source, name, profile, path, buildId: output.build_id, sha256: sha(bytes), compiler: metadata.compiler.version, evm: metadata.settings.evmVersion });
        }
      }
    }
  }
  // Compiler generated preprocessor units are regenerated by WSL force build, not filesystem sources.
  report.artifacts = { cacheSourceCount: Object.keys(cache.files).length, artifactCount: artifacts.length,
    checkedPhysicalMetadataSources: sources.size, crlfNormalizedSources: [...normalizedSources].sort(), preprocessedTests: Object.fromEntries(preprocessedTests), generatedSources: [...generated].sort(), generatedSourceProvenance: 'WSL forge build --force; see forge-rebuild.txt and rebuild-comparison.json', outputs: artifacts };
  await save('artifact-verification.json', report.artifacts);
  await run('backend-build', process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json']);
  await run('backend-typecheck', process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']);
  await run('be03-unit-decoder', process.execPath, ['--import', 'tsx', '--test', 'tests/indexer/syncer.test.ts', 'tests/indexer/decoder.test.ts']);

  const temp = await mkdtemp(join(tmpdir(), 'dao-be03-live-')); pgDir = join(temp, 'data');
  const pgPort = await freePort();
  report.postgres = { root: temp, cluster: pgDir, address: '127.0.0.1', port: pgPort, user: 'be03_test', database: 'be03_live', separateRegressionDatabase: 'be03_test', auth: 'trust; owned temporary loopback test cluster only' };
  await run('pg-initdb', join(pgBin, 'initdb.exe'), ['-D', pgDir, '-U', 'be03_test', '--auth=trust', '--encoding=UTF8', '--locale=C']);
  clusterStarted = true;
  await run('pg-start', join(pgBin, 'pg_ctl.exe'), ['start', '-w', '-t', '30', '-D', pgDir, '-l', join(temp, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${pgPort}`]);
  admin = new pg.Pool({ connectionString: `postgresql://be03_test@127.0.0.1:${pgPort}/postgres` });
  await admin.query('CREATE DATABASE be03_live'); await admin.query('CREATE DATABASE be03_test');
  const databaseUrl = `postgresql://be03_test@127.0.0.1:${pgPort}/be03_live`;
  pool = new pg.Pool({ connectionString: databaseUrl, max: 3 });
  assert.equal((await sql("SELECT 1 FROM pg_tables WHERE schemaname='public'")).length, 0);
  report.postgres.identity = await sql('SELECT current_database(),current_user,host(inet_server_addr()) AS address,inet_server_port() AS port,version()');
  for (const migration of ['001_initial.sql', '002_be03.sql']) await pool.query(await readFile(join(root, 'database/migrations', migration), 'utf8'));
  await run('be03-postgres-regression', process.execPath, ['--import', 'tsx', '--test', 'tests/indexer/checkpoint-storage.test.ts'],
    { BE03_TEST_DATABASE_URL: `postgresql://be03_test@127.0.0.1:${pgPort}/be03_test`, BE03_TEST_ISOLATED: '1' });

  const port = await freePort(); rpcUrl = `http://127.0.0.1:${port}`;
  const anvilArgs = ['--host', '127.0.0.1', '--port', String(port), '--chain-id', '31337', '--hardfork', 'osaka', '--timestamp', '1800000000', '--silent'];
  anvil = spawn(anvilExe, anvilArgs, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  anvil.stdout.on('data', x => { anvilStdout += x; }); anvil.stderr.on('data', x => { anvilStderr += x; });
  anvilClosed = once(anvil, 'close');
  report.anvil = { command: [anvilExe, ...anvilArgs], pid: anvil.pid, rpcUrl };
  rpc = createRpc(rpcUrl);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    assert.equal(anvil.exitCode, null, anvilStderr);
    try { ready = await rpc('eth_chainId') === '0x7a69'; } catch { /* startup only */ }
    if (ready) break; await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(ready);
  assert.equal(await rpc('eth_blockNumber'), '0x0');
  report.anvil.metadata = await rpc('anvil_metadata'); assert.equal(report.anvil.metadata.forkedNetwork, null);
  const cast = await run('cast-chain-id', castExe, ['chain-id', '--rpc-url', rpcUrl]); assert.equal(cast.stdout.trim(), '31337');
  await run('repository-deploy', process.execPath, ['scripts/deploy_local.mjs', '--rpc', rpcUrl, '--output', join(directory, 'manifest.json')]);
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  report.manifest = 'manifest.json'; report.receipts.push(...manifest.receipts);
  assert.equal(manifest.localChain.instanceId, report.anvil.metadata.instanceId);
  const keys = { BUD: 'budget_token', Treasury: 'treasury', Timelock: 'timelock', Governor: 'governor' };
  const contracts = Object.entries(keys).map(([key, role]) => ({ role, ...manifest.contracts[key], address: manifest.contracts[key].address.toLowerCase() }));
  const deploymentBlock = contracts.reduce((min, c) => BigInt(c.deploymentBlock) < min ? BigInt(c.deploymentBlock) : min, BigInt(contracts[0].deploymentBlock));
  const deploymentId = (await sql(`INSERT INTO deployments(chain_id,deployment_name,deployment_block,abi_version,governance_config,confirmation_depth)
    VALUES(31337,$1,$2,'be03-live-manifest-v1',$3,2) RETURNING deployment_id::text`, [`be03-${randomUUID()}`, deploymentBlock.toString(), manifest.config]))[0].deployment_id;
  for (const c of contracts) await sql('INSERT INTO deployment_contracts(deployment_id,chain_id,contract_role,contract_address,deployment_block,abi_version) VALUES($1,31337,$2,$3,$4,$5)', [deploymentId, c.role, c.address, c.deploymentBlock, c.abiVersion]);
  const config = { rpcUrl, chainId: '31337', deploymentId, fromBlock: '0', toBlock: 'latest', batchSize: '3', confirmations: 2,
    contracts: contracts.map(({ role, address, deploymentBlock, abiVersion }) => ({ role, address, deploymentBlock, abiVersion })) };
  await save('config.json', config);
  const configPath = join(directory, 'config.json');
  const cliEnv = { DATABASE_URL: databaseUrl, RPC_URL: rpcUrl };
  const abi = {};
  for (const [key, name] of Object.entries({ Governor: 'BudgetGovernor', Treasury: 'Treasury', BUD: 'BudgetToken', Timelock: 'TimelockController' }))
    abi[key] = new Interface(JSON.parse(await readFile(join(root, `out/${name}.sol/${name}.json`), 'utf8')).abi);
  const address = key => manifest.contracts[key].address;
  const call = async (key, method, args = [], height = 'latest') => abi[key].decodeFunctionResult(method, await rpc('eth_call', [{ to: address(key), data: abi[key].encodeFunctionData(method, args) }, height]))[0];
  const tx = async (label, from, key, method, args, timestamp) => {
    if (timestamp !== undefined) await rpc('evm_setNextBlockTimestamp', [toQuantity(timestamp)]);
    const hash = await rpc('eth_sendTransaction', [{ from, to: address(key), data: abi[key].encodeFunctionData(method, args), gas: toQuantity(15000000) }]);
    const receipt = await rpc('eth_getTransactionReceipt', [hash]); assert.equal(receipt?.status, '0x1', label);
    report.receipts.push({ label, ...receipt }); await save('receipts.json', report.receipts); return receipt;
  };
  const checkpoint = async () => (await sql(CHECKPOINT))[0];
  const syncCli = async (label) => {
    const result = await run(label, process.execPath, ['--import', 'tsx', 'indexer/cli.ts', '--config', configPath, '--sync'], cliEnv, [0, 2]);
    const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean).map(x => JSON.parse(x));
    const last = lines.at(-1); assert.equal(last.type, 'sync_result'); assert.equal(last.status, last.unknownTopics ? 'raw_synced_with_decode_issues' : 'raw_synced'); assert.equal(last.decodeErrors, 0);
    assert.equal(result.exitCode, last.unknownTopics ? 2 : 0); report.stages.push({ label, ...last }); return last;
  };
  const U = 10n ** 18n, amount = 1000n * U;
  const description = JSON.stringify({ version: 1, title: 'Nghiệm thu BE03 từ WSL', body: 'Receipt thật, K=2 và PostgreSQL riêng.' });
  const requestId = id(`be03-live:${manifest.localChain.instanceId}`);
  const proposalArgs = [[address('Treasury')], [0], [abi.Treasury.encodeFunctionData('disburse', [requestId, manifest.accounts.recipient, amount])], id(description)];
  const proposalId = await call('Governor', 'hashProposal', proposalArgs);
  await tx('propose', manifest.accounts.A, 'Governor', 'propose', [...proposalArgs.slice(0, 3), description]);
  const start = await call('Governor', 'proposalSnapshot', [proposalId]);
  const deadline = await call('Governor', 'proposalDeadline', [proposalId]);
  const reason = 'Đồng ý cấp ngân sách — kiểm chứng ABI mới 🗳️', params = '0x123400ff';
  const voteReceipt = await tx('vote WithParams', manifest.accounts.A, 'Governor', 'castVoteWithReasonAndParams', [proposalId, 1, reason, params], start + 1n);
  const voteLog = voteReceipt.logs.find(log => log.topics[0] === abi.Governor.getEvent('VoteCastWithParams').topicHash);
  assert.ok(voteLog, 'Fresh receipt must emit WithParams');
  const governorConfig = config.contracts.find(c => c.role === 'governor');
  const freshDecode = decodeLog({ contract: { ...governorConfig, deploymentBlock: BigInt(governorConfig.deploymentBlock) },
    blockNumber: BigInt(voteLog.blockNumber), blockHash: voteLog.blockHash, transactionHash: voteLog.transactionHash,
    transactionIndex: BigInt(voteLog.transactionIndex), logIndex: BigInt(voteLog.logIndex), topics: voteLog.topics, data: voteLog.data, rawLog: voteLog });
  assert.deepEqual(freshDecode, { status: 'decoded', eventName: 'VoteCastWithParams', abiVersion: governorConfig.abiVersion,
    payload: { voter: manifest.accounts.A.toLowerCase(), proposalId: proposalId.toString(), support: '1', weight: String(400n * U), reason, params } });
  report.withParams = { receipt: voteReceipt, log: voteLog, decoder: freshDecode };
  await save('withparams-receipt-decoder.json', report.withParams);
  const voteH = BigInt(voteReceipt.blockNumber);
  report.k2 = [];
  for (let following = 0; following <= 2; following++) {
    if (following) await rpc('evm_mine');
    const stage = await syncCli(`k2-${following}-following`);
    assert.equal(stage.head, String(voteH + BigInt(following)));
    assert.equal(stage.checkpoint.number, String(voteH + BigInt(following) - 2n));
    const rows = await sql('SELECT decoded_payload FROM raw_events WHERE transaction_hash=$1 AND event_name=$2', [voteReceipt.transactionHash, 'VoteCastWithParams']);
    assert.equal(rows.length, following === 2 ? 1 : 0);
    if (rows.length) assert.deepEqual(rows[0].decoded_payload, freshDecode.payload);
    report.k2.push({ followingBlocks: following, head: stage.head, safeBlock: stage.safeBlock, checkpoint: await checkpoint(), withParamsRows: rows.length });
    await snapshot(`k2-${following}`);
  }
  await tx('vote plain', manifest.accounts.B, 'Governor', 'castVote', [proposalId, 1]);
  await tx('queue', manifest.accounts.caller, 'Governor', 'queue', proposalArgs, deadline + 1n);
  const eta = await call('Governor', 'proposalEta', [proposalId]);
  const executeReceipt = await tx('execute', manifest.accounts.outsider, 'Governor', 'execute', proposalArgs, eta);
  assert.equal(await call('Governor', 'state', [proposalId]), 7n);
  assert.equal(await call('Treasury', 'paidRequests', [requestId]), true);
  assert.equal(await call('BUD', 'balanceOf', [manifest.accounts.recipient]), amount);
  assert.equal(await call('BUD', 'balanceOf', [address('Treasury')]), 9000n * U);
  report.governance = { proposalId: String(proposalId), requestId, snapshot: String(start), deadline: String(deadline), eta: String(eta), executeTransactionHash: executeReceipt.transactionHash, state: '7', paidRequests: true, recipientBUD: String(amount), treasuryBUD: String(9000n * U) };
  const executeH = BigInt(executeReceipt.blockNumber);
  const beforeExecuteConfirm = await syncCli('execute-unconfirmed');
  assert.equal(beforeExecuteConfirm.checkpoint.number, String(executeH - 2n));
  assert.equal((await sql("SELECT 1 FROM raw_events WHERE event_name='ProposalExecuted'")).length, 0);
  await rpc('evm_mine'); await rpc('evm_mine');
  const afterExecuteConfirm = await syncCli('execute-confirmed');
  assert.equal(afterExecuteConfirm.checkpoint.number, String(executeH));
  assert.equal((await sql("SELECT 1 FROM raw_events WHERE event_name='ProposalExecuted'")).length, 1);

  // Reuse existing transaction barriers with REAL RPC: terminate before/after COMMIT.
  report.crashResume = [];
  for (const point of ['beforeCommit', 'afterCommit']) {
    await tx(`tail transfer ${point}`, manifest.accounts.funding, 'BUD', 'transfer', [manifest.accounts.recipient, 1]);
    await rpc('evm_mine'); await rpc('evm_mine');
    const before = await snapshot(`${point}-before-worker`);
    const child = spawn(process.execPath, ['--import', 'tsx', 'tests/indexer/crash-worker.ts', configPath, point], {
      cwd: root, env: { ...env, RPC_URL: rpcUrl, BE03_TEST_DATABASE_URL: databaseUrl }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', x => { stdout += x; }); child.stderr.on('data', x => { stderr += x; });
    const closed = once(child, 'close');
    const timeout = setTimeout(() => child.kill(), 30000);
    try {
      const message = await Promise.race([once(child, 'message').then(x => x[0]), closed.then(x => { throw new Error(`Worker exited before barrier: ${x}; ${stderr}`); })]);
      assert.equal(message.point, point); child.kill(); await closed;
    } finally { clearTimeout(timeout); if (child.exitCode === null && child.signalCode === null) { child.kill(); await closed; } }
    assert.equal(stdout, '', `${point}: no success message before barrier`);
    const killed = await snapshot(`${point}-after-kill`);
    if (point === 'beforeCommit') assert.equal(killed.digest, before.digest);
    else assert.equal(BigInt(killed.checkpoint[0].block_number), BigInt(before.checkpoint[0].block_number) + 3n);
    const restart = await syncCli(`${point}-restart`);
    const resumed = await snapshot(`${point}-resumed`);
    if (point === 'afterCommit') { assert.equal(restart.committedBatches, 0); assert.equal(resumed.digest, killed.digest); }
    assert.equal(resumed.checkpoint[0].block_number, String(BigInt(await rpc('eth_blockNumber')) - 2n));
    report.crashResume.push({ point, beforeDigest: before.digest, afterKillDigest: killed.digest, afterResumeDigest: resumed.digest,
      checkpointBefore: before.checkpoint[0], checkpointAfterKill: killed.checkpoint[0], checkpointAfterResume: resumed.checkpoint[0], restartCommittedBatches: restart.committedBatches,
      successOutputBeforeKill: stdout, stderrBeforeKill: stderr });
  }
  const beforeRerun = await snapshot('before-idle-reruns');
  for (let i = 1; i <= 2; i++) { const rerun = await syncCli(`idle-rerun-${i}`); assert.equal(rerun.committedBatches, 0); }
  const afterRerun = await snapshot('after-idle-reruns'); assert.equal(afterRerun.digest, beforeRerun.digest);
  const redecode = await run('offline-redecode', process.execPath, ['--import', 'tsx', 'indexer/cli.ts', '--config', configPath, '--redecode'], cliEnv, [0, 2]);
  report.redecode = JSON.parse(redecode.stdout.trim());
  assert.equal((await snapshot('after-redecode')).digest, afterRerun.digest);

  // Compare all canonical receipts up to SAME H against raw SQL, independently of readBatch.
  const finalState = await snapshot('final');
  const cp = finalState.checkpoint[0], H = BigInt(cp.block_number), header = await rpc('eth_getBlockByNumber', [toQuantity(H), false]);
  assert.equal(cp.block_hash, header.hash); assert.equal(cp.header_hash, header.hash); assert.equal(cp.confirmation_depth, 2);
  assert.equal(BigInt(cp.observed_head_block), H + 2n); assert.equal(await rpc('eth_blockNumber'), toQuantity(H + 2n));
  assert.equal(finalState.headers.length, Number(H - deploymentBlock + 1n));
  const byAddress = new Map(config.contracts.map(c => [c.address, c]));
  const receiptLogs = [], allReceipts = [], allHeaders = [];
  for (let n = deploymentBlock; n <= H; n++) {
    const block = await rpc('eth_getBlockByNumber', [toQuantity(n), false]);
    allHeaders.push(block);
    const storedHeader = finalState.headers[Number(n - deploymentBlock)];
    assert.deepEqual(storedHeader, { block_number: String(n), block_hash: block.hash, parent_hash: block.parentHash, block_timestamp: String(BigInt(block.timestamp)) });
    for (const hash of block.transactions) {
      const receipt = await rpc('eth_getTransactionReceipt', [hash]); assert.equal(receipt.blockHash, block.hash); assert.equal(receipt.status, '0x1');
      allReceipts.push(receipt);
      for (const log of receipt.logs) if (byAddress.has(log.address.toLowerCase()) && n >= BigInt(byAddress.get(log.address.toLowerCase()).deploymentBlock)) receiptLogs.push(log);
    }
  }
  const eventKey = log => `${log.transactionHash ?? log.transaction_hash}:${BigInt(log.logIndex ?? log.log_index)}`;
  const storedByKey = new Map(finalState.events.map(row => [eventKey(row), row]));
  assert.equal(storedByKey.size, finalState.events.length); assert.equal(finalState.events.length, receiptLogs.length);
  report.decodeClassification = [];
  const unknowns = new Map();
  for (const log of receiptLogs) {
    const row = storedByKey.get(eventKey(log)); assert.ok(row);
    assert.deepEqual(row.rpc_log, log); assert.deepEqual(row.topics, log.topics); assert.equal(row.data, log.data);
    assert.equal(row.contract_address, log.address.toLowerCase()); assert.equal(row.block_hash, log.blockHash);
    assert.equal(row.block_number, String(BigInt(log.blockNumber))); assert.equal(row.transaction_index, String(BigInt(log.transactionIndex)));
    const c = byAddress.get(log.address.toLowerCase()), key = Object.keys(keys).find(k => keys[k] === c.role);
    const parsed = abi[key].parseLog(log); assert.ok(parsed, 'Every real log must be classified by full current artifact ABI');
    const registration = getAbi(c);
    if (registration.interface.getEvent(log.topics[0])) {
      const payload = {};
      for (let i = 0; i < parsed.fragment.inputs.length; i++) {
        const input = parsed.fragment.inputs[i], v = parsed.args[i];
        const normalize = (type, value) => type.baseType === 'array' ? Array.from(value, x => normalize(type.arrayChildren, x))
          : typeof value === 'bigint' ? String(value) : type.type === 'address' ? value.toLowerCase() : value;
        payload[input.name] = normalize(input, v);
      }
      assert.equal(row.decode_status, 'decoded'); assert.equal(row.event_name, parsed.name); assert.deepEqual(row.decoded_payload, payload); assert.equal(row.decode_error_code, null);
    } else {
      assert.equal(row.decode_status, 'unknown_topic'); assert.equal(row.decode_error_code, 'UNKNOWN_TOPIC'); assert.equal(row.event_name, null); assert.equal(row.decoded_payload, null);
      const allowed = new Set(['RoleGranted', 'RoleRevoked', 'MinDelayChange', 'VotingDelaySet', 'VotingPeriodSet', 'ProposalThresholdSet', 'QuorumNumeratorUpdated', 'TimelockChange']);
      assert.ok(allowed.has(parsed.name), `Unexpected unsupported event ${parsed.name}`);
      assert.ok(BigInt(log.blockNumber) < BigInt(report.receipts.find(r => r.label === 'propose').blockNumber), 'Only bootstrap administrative events may be unknown');
      const key_ = `${c.role}:${parsed.name}:${log.topics[0]}`; unknowns.set(key_, (unknowns.get(key_) ?? 0) + 1);
    }
    report.decodeClassification.push({ transactionHash: log.transactionHash, logIndex: String(BigInt(log.logIndex)), artifactEventName: parsed.name, storedEventName: row.event_name, status: row.decode_status });
  }
  report.unsupportedBootstrapEvents = [...unknowns].map(([event, count]) => ({ event, count }));
  const finalVote = finalState.events.find(row => row.transaction_hash === voteReceipt.transactionHash && row.event_name === 'VoteCastWithParams');
  assert.deepEqual(finalVote.decoded_payload, freshDecode.payload); assert.deepEqual(finalVote.rpc_log, voteLog);
  assert.equal(finalState.events.filter(row => row.decode_status === 'decode_error').length, 0);
  assert.ok(['ProposalCreated', 'VoteCastWithParams', 'VoteCast', 'CallScheduled', 'CallSalt', 'ProposalQueued', 'CallExecuted', 'ProposalExecuted', 'Transfer', 'BudgetDisbursed'].every(name => finalState.events.some(row => row.event_name === name)));
  for (const table of ['proposals', 'votes', 'proposal_actions', 'disbursements']) {
    if ((await sql('SELECT to_regclass($1) AS name', [table]))[0].name) assert.equal((await sql(`SELECT count(*)::int AS count FROM ${table}`))[0].count, 0);
  }
  await save('canonical-rpc-at-H.json', { H: String(H), header, headers: allHeaders, receipts: allReceipts });
  report.sameHeight = { H: String(H), blockHash: header.hash, head: String(H + 2n), checkpoint: cp, headerCount: finalState.headers.length,
    receiptLogCount: receiptLogs.length, rawEventCount: finalState.events.length, distinctEventCount: storedByKey.size,
    decodedCount: finalState.events.filter(x => x.decode_status === 'decoded').length,
    unknownBootstrapCount: finalState.events.filter(x => x.decode_status === 'unknown_topic').length, decodeErrorCount: 0,
    missingEvents: 0, duplicateEvents: 0, rawMismatches: 0, supportedDecodeMismatches: 0, finalDigest: finalState.digest,
    receiptEvidence: 'canonical-rpc-at-H.json', sqlEvidence: 'sql-final.json', sqlQueries: { headers: HEADERS, events: EVENTS, checkpoint: CHECKPOINT } };
  report.assertions = ['Fresh unforked chain at H=0; deploy via repository deploy_local.mjs (governance_local.mjs provenance normalization fixed); new manifest verifies source/compiler/ABI/runtime/roles',
    'Real propose -> WithParams vote + plain vote -> queue -> execute, proposal state=Executed and 1000 BUD paid',
    'K=2: WithParams excluded at 0/1 following block, included at 2 following blocks',
    'Real RPC crash before COMMIT rolls back full batch; restart ingests missing range',
    'Real RPC crash after COMMIT before stdout; restart commits zero batches and preserves full snapshot',
    'Two idle CLI restarts and offline redecode preserve event IDs/raw/decoded payload and checkpoint',
    'All canonical receipts/headers through H equal raw PostgreSQL; all supported decode payloads equal full compiler ABI decode',
    'Unsupported bootstrap administrative topics explicitly preserved; no business unknown or decode_error',
    'No projection rows/BE04; no contracts/libraries modified during this acceptance; no commit/push/PR'];
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.error = { message: error.message, stack: error.stack }; process.exitCode = 1;
} finally {
  await pool?.end(); await admin?.end();
  if (anvil) {
    if (anvil.exitCode === null && anvil.signalCode === null) anvil.kill();
    const timeout = setTimeout(() => anvil.kill('SIGKILL'), 5000);
    const stopped = await anvilClosed; clearTimeout(timeout);
    report.cleanup.anvil = { stopped, rpcUnavailable: await fetch(rpcUrl, { signal: AbortSignal.timeout(1000) }).then(() => false, () => true) };
    if (!report.cleanup.anvil.rpcUnavailable) { report.status = 'FAIL'; process.exitCode = 1; }
    await writeFile(join(directory, 'anvil-output.txt'), anvilStdout + anvilStderr);
  }
  if (clusterStarted) {
    try {
      await run('pg-stop', join(pgBin, 'pg_ctl.exe'), ['stop', '-w', '-t', '30', '-m', 'fast', '-D', pgDir]);
      const status = await run('pg-status-after-stop', join(pgBin, 'pg_ctl.exe'), ['status', '-D', pgDir], {}, [3]);
      report.cleanup.postgres = { stopped: status.exitCode === 3, retainedCluster: pgDir };
      await writeFile(join(directory, 'postgres-server.txt'), await readFile(join(pgDir, '..', 'postgres.log')));
    } catch (error) { report.cleanup.postgres = { error: error.message }; report.status = 'FAIL'; process.exitCode = 1; }
  }
  report.finishedAt = new Date().toISOString();
  await save('integration.json', report);
  console.log(json({ status: report.status, sameHeight: report.sameHeight, error: report.error, cleanup: report.cleanup }));
}
