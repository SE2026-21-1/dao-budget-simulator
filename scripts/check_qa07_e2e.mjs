#!/usr/bin/env node
// Narrow real-chain browser acceptance. The owned unlocked EIP-1193 adapter is NOT MetaMask.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createServer as reserveServer } from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Interface, toQuantity } from 'ethers';
import pg from 'pg';
import { verifyKeyboard } from './qa07_keyboard.mjs';
import { assertReconciledSnapshot } from './qa07_snapshot.mjs';

const args = process.argv.slice(2);
assert.ok(args[0] === '--postgres-bin' && args[2] === '--output',
  'node --import tsx scripts/check_qa07_e2e.mjs --postgres-bin /absolute/bin --output /new/evidence [--project-root /reviewed/checkout] [--serve]');
const serve = args.at(-1) === '--serve';
const options = serve ? args.slice(0, -1) : args;
assert.ok(options.length === 4 || (options.length === 6 && options[4] === '--project-root'), 'Unexpected QA07 options');
assert.equal(process.getuid() === 0, false, 'Use an unprivileged user.');
assert.ok(Number(process.versions.node.split('.')[0]) >= 24);
const root = options[4] === '--project-root' ? resolve(options[5]) : fileURLToPath(new URL('../', import.meta.url));
const fromProject = path => import(pathToFileURL(join(root, path)).href);
const { createRpc, deployGovernance } = await fromProject('scripts/governance_local.mjs');
const { createSmokeLifecycle } = await fromProject('scripts/smoke_lifecycle.mjs');
const { waitForReceipt } = await fromProject('scripts/receipt.mjs');
const { createApiServer } = await fromProject('indexer/api/server.ts');
const output = resolve(args[3]);
await mkdir(output, { mode: 0o700 }); // Refuse to overwrite evidence.
const scope = createSmokeLifecycle();
const report = { format: 'qa07-browser-e2e-v2', status: 'RUNNING', startedAt: new Date().toISOString(),
  scope: 'Owned unforked Anvil + fresh PostgreSQL + actual CLI worker + HTTP API + Vite + real headless Chrome. EIP-1193 unlocked Anvil adapter, NOT MetaMask, NOT testnet or extension acceptance.',
  command: [process.execPath, '--import', 'tsx', ...process.argv.slice(1)],
  runtime: { node: process.version, executable: process.execPath }, sourceHashes: {}, commands: [],
  browserTransactions: [], publications: [], checks: [], screenshots: [], browserErrors: [],
  extensionOnly: ['MetaMask extension popup permission/signature rejection', 'MetaMask add/switch network and account events', 'External signing, public testnet and explorer confirmation'],
  ownership: { postgres: 'fresh cluster; numeric loopback; no caller DATABASE_URL', anvil: 'fresh spawned process; no fork; no caller RPC_URL', signing: 'only owned unlocked local account A' } };
report.projectRoot = root;
report.qaHarness = { path: fileURLToPath(import.meta.url),
  sha256: createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'),
  snapshotSha256: createHash('sha256').update(await readFile(new URL('./qa07_snapshot.mjs', import.meta.url))).digest('hex'),
  keyboardSha256: createHash('sha256').update(await readFile(new URL('./qa07_keyboard.mjs', import.meta.url))).digest('hex') };
let pool, browser, api, proxy, uiProxy, releaseRecovery, releaseUi, worker;
const logs = new Map();
const sleep = ms => new Promise(done => setTimeout(done, ms));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(PG|DATABASE_URL$|RPC_URL$|NODE_OPTIONS$|VITE_)/.test(key)));
async function port() {
  const s = reserveServer(); s.listen(0, '127.0.0.1'); await once(s, 'listening');
  const p = s.address().port; await new Promise(done => s.close(done)); return p;
}
function start(label, command, argv, extraEnv = {}) {
  report.commands.push({ label, command: [command, ...argv] });
  const child = scope.spawn(command, argv, { cwd: root, env: { ...env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
  const entry = { stdout: '', stderr: '' }; logs.set(label, entry);
  child.stdout.on('data', text => { entry.stdout += text; }); child.stderr.on('data', text => { entry.stderr += text; });
  child.on('error', error => { entry.stderr += error.stack; }); return child;
}
async function until(label, predicate, ms = 60000) {
  const end = Date.now() + ms;
  do { scope.throwIfInterrupted(); if (await predicate()) return; await sleep(100); } while (Date.now() < end);
  throw new Error(`Timed out: ${label}`);
}
async function screenshot(page, name) {
  const path = `${name}.png`; await page.screenshot({ path: join(output, path), fullPage: true });
  await writeFile(join(output, `${name}.txt`), await page.locator('body').innerText());
  report.screenshots.push(path);
}
async function hashes(directory) {
  for (const e of await readdir(join(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${e.name}`;
    if (e.isDirectory()) await hashes(path);
    else if (e.isFile()) report.sourceHashes[path] = createHash('sha256').update(await readFile(join(root, path))).digest('hex');
  }
}
try {
  for (const directory of ['contracts', 'indexer', 'database/migrations', 'frontend/src', 'frontend/public']) await hashes(directory);
  for (const path of ['scripts/governance_local.mjs', 'scripts/smoke_lifecycle.mjs', 'package-lock.json', 'frontend/package-lock.json', 'foundry.toml', 'foundry.lock'])
    report.sourceHashes[path] = createHash('sha256').update(await readFile(join(root, path))).digest('hex');
  const directory = await scope.temporaryDirectory('/tmp/dao-qa07-owned-');
  const pgBin = resolve(args[1]);
  report.runtime.postgresBinary = execFileSync(join(pgBin, 'postgres'), ['--version'], { encoding: 'utf8' }).trim();
  assert.match(report.runtime.postgresBinary, /18\.4/);
  const pgPort = await port();
  const initArgs = ['-D', join(directory, 'pg'), '-U', 'qa07_test', '--auth=trust', '--no-locale', '--encoding=UTF8'];
  report.commands.push({ label: 'initdb', command: [join(pgBin, 'initdb'), ...initArgs] });
  await writeFile(join(output, 'initdb.log'), execFileSync(join(pgBin, 'initdb'), initArgs, { encoding: 'utf8', env }));
  const postgres = start('postgres', join(pgBin, 'postgres'), ['-D', join(directory, 'pg'), '-h', '127.0.0.1', '-p', String(pgPort), '-k', directory]);
  const databaseUrl = `postgresql://qa07_test@127.0.0.1:${pgPort}/postgres`;
  pool = new pg.Pool({ connectionString: databaseUrl, max: 5, connectionTimeoutMillis: 1000 });
  await until('owned PostgreSQL', async () => {
    assert.equal(postgres.exitCode, null, logs.get('postgres').stderr);
    try { await pool.query('SELECT 1'); return true; } catch { return false; }
  });
  report.runtime.postgres = (await pool.query('SELECT version() AS v')).rows[0].v;
  assert.equal((await pool.query("SELECT 1 FROM pg_tables WHERE schemaname='public'")).rowCount, 0);
  for (const name of ['001_initial', '002_be03', '003_be04', '004_be05_api', '005_be07'])
    await pool.query(await readFile(join(root, `database/migrations/${name}.sql`), 'utf8'));
  const anvilPort = await port();
  const anvilBin = process.env.ANVIL_BIN ?? 'anvil';
  report.runtime.anvil = execFileSync(anvilBin, ['--version'], { encoding: 'utf8' }).trim();
  report.runtime.forge = execFileSync(process.env.FORGE_BIN ?? 'forge', ['--version'], { encoding: 'utf8' }).trim();
  const anvil = start('anvil', anvilBin, ['--host', '127.0.0.1', '--port', String(anvilPort), '--chain-id', '31337', '--hardfork', 'osaka', '--timestamp', '1800000000', '--silent']);
  const rpcUrl = `http://127.0.0.1:${anvilPort}`;
  const rpc = createRpc(rpcUrl);
  await until('owned Anvil', async () => {
    assert.equal(anvil.exitCode, null, logs.get('anvil').stderr);
    try { return await rpc('eth_chainId') === '0x7a69'; } catch { return false; }
  });
  const wallets = await rpc('eth_accounts');
  const accounts = Object.fromEntries(['A', 'B', 'C', 'D', 'funding', 'deployer', 'caller', 'recipient', 'outsider'].map((name, i) => [name, wallets[i]]));
  const { manifest, abis } = await deployGovernance(rpc, { root, accounts }); report.manifest = manifest;
  const addresses = Object.fromEntries(Object.entries(manifest.contracts).map(([name, c]) => [name, c.address]));
  const abi = Object.fromEntries(Object.entries(abis).map(([name, a]) => [name, new Interface(a)]));
  const call = async (name, method, values = [], at = 'latest') => abi[name].decodeFunctionResult(method,
    await rpc('eth_call', [{ to: addresses[name], data: abi[name].encodeFunctionData(method, values) }, at]))[0];
  const send = async (name, method, values, from = accounts.funding) => {
    const hash = await rpc('eth_sendTransaction', [{ from, to: addresses[name], data: abi[name].encodeFunctionData(method, values), gas: '0x7a1200' }]);
    const receipt = await waitForReceipt(rpc, hash, { step: method }); assert.equal(receipt.status, '0x1'); return receipt;
  };
  const roleNames = { budget_token: 'BUD', treasury: 'Treasury', timelock: 'Timelock', governor: 'Governor' };
  const startBlock = Object.values(roleNames).map(n => BigInt(manifest.contracts[n].deploymentBlock)).reduce((a, b) => a < b ? a : b);
  const deploymentId = (await pool.query(`INSERT INTO deployments(chain_id,deployment_name,deployment_block,abi_version,governance_config)
    VALUES(31337,'qa07-e2e',$1,'qa07-e2e',$2::jsonb) RETURNING deployment_id::text`, [String(startBlock), JSON.stringify(manifest.config)])).rows[0].deployment_id;
  const contracts = Object.entries(roleNames).map(([role, name]) => ({ role, address: addresses[name].toLowerCase(), deploymentBlock: manifest.contracts[name].deploymentBlock, abiVersion: manifest.contracts[name].abiVersion }));
  for (const c of [...contracts, { role: 'governance_token', address: addresses.GOV.toLowerCase(), ...manifest.contracts.GOV }])
    await pool.query(`INSERT INTO deployment_contracts(deployment_id,chain_id,contract_role,contract_address,deployment_block,abi_version) VALUES($1,31337,$2,$3,$4,$5)`,
      [deploymentId, c.role, c.address.toLowerCase(), c.deploymentBlock, c.abiVersion]);
  let recoveryArmed = false;
  let recoveryGate = Promise.resolve();
  const rpcCalls = []; report.workerRpc = rpcCalls;
  proxy = createServer(async (req, res) => {
    try {
      let text = ''; for await (const chunk of req) text += chunk;
      const body = JSON.parse(text); const entry = { at: new Date().toISOString(), method: body.method, params: body.params }; rpcCalls.push(entry);
      if (recoveryArmed && (await pool.query('SELECT indexer_state FROM deployments WHERE deployment_id=$1', [deploymentId])).rows[0].indexer_state.phase === 'recovering') {
        entry.heldForRecoveryEvidence = true; await recoveryGate;
      }
      const upstream = await fetch(rpcUrl, { method: 'POST', body: text, headers: { 'content-type': 'application/json' } });
      res.writeHead(upstream.status, { 'content-type': 'application/json' }); res.end(await upstream.text());
    } catch (error) { res.writeHead(503); res.end(error.message); }
  });
  proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
  const configPath = join(directory, 'worker.json');
  await writeFile(configPath, JSON.stringify({ rpcUrl: `http://127.0.0.1:${proxy.address().port}`, chainId: '31337', deploymentId,
    fromBlock: String(startBlock), toBlock: 'latest', batchSize: '100', confirmations: 2, reorgWindow: 128, pollIntervalMs: 200, contracts }));
  worker = start('worker', process.execPath, ['--import', 'tsx', 'indexer/cli.ts', '--config', configPath, '--worker'], { DATABASE_URL: databaseUrl });
  const vitePort = await port();
  let uiMode = 'normal', uiGate = Promise.resolve();
  api = createApiServer({ pool, cursorSecret: randomBytes(32).toString('hex'), snapshotTtlSeconds: 900 });
  api.listen(0, '127.0.0.1'); await once(api, 'listening');
  const apiBase = `http://127.0.0.1:${api.address().port}`;
  // This transport fault proxy never fabricates API envelopes or edits application state.
  uiProxy = createServer(async (req, res) => {
    try {
      if (uiMode === 'hold' && req.url.startsWith('/api/proposals')) await uiGate;
      if (uiMode === 'offline' && req.url.startsWith('/api/proposals')) { res.destroy(); return; }
      const upstream = await fetch(`${apiBase}${req.url}`);
      res.writeHead(upstream.status, { 'content-type': 'application/json', 'access-control-allow-origin': `http://127.0.0.1:${vitePort}` }); res.end(await upstream.text());
    } catch { res.destroy(); }
  });
  uiProxy.listen(0, '127.0.0.1'); await once(uiProxy, 'listening');
  report.uiProxyPort = uiProxy.address().port;
  const get = async (path, extra = {}) => {
    const q = new URLSearchParams({ chainId: '31337', deploymentId: 'qa07-e2e', ...extra });
    const response = await fetch(`${apiBase}/api${path}?${q}`); return { status: response.status, body: await response.json() };
  };
  const publish = async label => {
    const h = await rpc('eth_getBlockByNumber', ['latest', false]); await rpc('anvil_mine', ['0x2', '0x0']);
    let response;
    await until(`worker publication ${label}`, async () => {
      assert.equal(worker.exitCode, null, logs.get('worker').stderr);
      response = await get('/summary'); return response.status === 200 && response.body.context.asOfBlock === String(BigInt(h.number)) && response.body.context.asOfBlockHash === h.hash;
    });
    const sql = (await pool.query('SELECT block_number::text AS h,block_hash AS hash FROM projection_checkpoints WHERE deployment_id=$1', [deploymentId])).rows[0];
    assert.equal(sql.h, response.body.context.asOfBlock); assert.equal(sql.hash, response.body.context.asOfBlockHash);
    const balance = String(await call('BUD', 'balanceOf', [addresses.Treasury], { blockHash: sql.hash, requireCanonical: true }));
    assert.equal(balance, response.body.data.treasury.balance);
    report.publications.push({ label, sql, api: response.body, contractBalanceAtHash: balance }); return response.body;
  };
  await publish('bootstrap');
  const vite = start('vite', process.execPath, ['frontend/node_modules/vite/bin/vite.js', 'frontend', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], {
    VITE_API_BASE_URL: `http://127.0.0.1:${uiProxy.address().port}`, VITE_CHAIN_ID: '31337', VITE_DEPLOYMENT_ID: 'qa07-e2e', VITE_RPC_URL: rpcUrl,
    VITE_CHAIN_NAME: serve ? 'QA07 isolated Local Anvil' : 'QA07 owned Anvil (NOT MetaMask)', VITE_GOVERNOR_ADDRESS: addresses.Governor, VITE_TREASURY_ADDRESS: addresses.Treasury,
    VITE_GOV_TOKEN_ADDRESS: addresses.GOV, VITE_BUD_TOKEN_ADDRESS: addresses.BUD, VITE_TIMELOCK_ADDRESS: addresses.Timelock,
  });
  const uiBase = `http://127.0.0.1:${vitePort}`;
  await until('Vite', async () => { assert.equal(vite.exitCode, null, logs.get('vite').stderr); try { return (await fetch(uiBase)).ok; } catch { return false; } });
  if (serve) {
    report.scope = 'Owned isolated reviewed-source handoff for manual real-extension acceptance; startup is not wallet/E2E PASS.';
    report.ownership.signing = 'No wallet injected in --serve; the external operator controls signing. Unlocked fixture accounts are used only for setup.';
    report.publicHandoff = { format: 'qa07-public-handoff-v1', sourceCommit: manifest.sourceCommit,
      chainId: '31337', deploymentId: 'qa07-e2e', confirmations: 2, frontendUrl: uiBase,
      apiUrl: `http://127.0.0.1:${uiProxy.address().port}`, rpcUrl, contracts: addresses,
      accounts, manifestSha256: createHash('sha256').update(JSON.stringify(manifest, null, 2) + '\n').digest('hex') };
    await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
    await writeFile(join(output, 'handoff.json'), JSON.stringify(report.publicHandoff, null, 2) + '\n', { mode: 0o600 });
    report.status = 'SERVING_NOT_ACCEPTANCE';
    console.log(JSON.stringify({ type: 'QA07_SERVE_READY', ...report.publicHandoff }));
    scope.dispose();
    report.stopSignal = await new Promise(done => {
      const handlers = Object.fromEntries(['SIGINT', 'SIGTERM'].map(signal => [signal, () => {
        for (const [name, handler] of Object.entries(handlers)) process.removeListener(name, handler);
        done(signal);
      }]));
      for (const [signal, handler] of Object.entries(handlers)) process.once(signal, handler);
    });
    report.status = 'SERVE_STOPPED';
  } else {
  const driver = await import(pathToFileURL(resolve(process.env.QA07_PLAYWRIGHT_MODULE ?? 'node_modules/playwright/index.mjs')).href);
  report.runtime.playwright = JSON.parse(await readFile(new URL('./package.json', pathToFileURL(resolve(process.env.QA07_PLAYWRIGHT_MODULE ?? 'node_modules/playwright/index.mjs'))), 'utf8')).version;
  browser = await driver.chromium.launch({ executablePath: process.env.QA07_CHROME_BIN ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  report.runtime.chrome = browser.version();
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', error => report.browserErrors.push(error.message));
  await page.exposeBinding('qa07Rpc', async (_source, { method, params }) => {
    if (method === 'eth_sendTransaction') {
      assert.equal(params[0].from.toLowerCase(), accounts.A.toLowerCase());
      const payload = { ...params[0], gas: '0x7a1200' };
      const hash = await rpc(method, [payload]); report.browserTransactions.push({ method, payload, transactionHash: hash }); return hash;
    }
    return rpc(method, params);
  });
  await page.addInitScript(({ account }) => {
    const listeners = new Map(); let chainId = '0x7a69', connected = false, reject = false;
    const emit = (event, value) => { for (const fn of listeners.get(event) ?? []) fn(value); };
    const provider = { on(event, fn) { listeners.set(event, [...(listeners.get(event) ?? []), fn]); }, removeListener(event, fn) { listeners.set(event, (listeners.get(event) ?? []).filter(f => f !== fn)); },
      async request({ method, params = [] }) {
        if (method === 'eth_chainId') return chainId;
        if (method === 'eth_accounts') return connected ? [account] : [];
        if (method === 'eth_requestAccounts') { connected = true; return [account]; }
        if (method === 'wallet_switchEthereumChain') { chainId = params[0].chainId; emit('chainChanged', chainId); return null; }
        if (method === 'wallet_getCapabilities') return {};
        if (method === 'eth_sendTransaction' && reject) { reject = false; throw Object.assign(new Error('QA07 adapter user rejected request (NOT MetaMask)'), { code: 4001 }); }
        return window.qa07Rpc({ method, params });
      } };
    window.ethereum = provider;
    window.__QA07_WALLET__ = { rejectNext() { reject = true; }, wrongNetwork() { chainId = '0x1'; emit('chainChanged', chainId); } };
    const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { uuid: 'qa07-owned-anvil', name: 'QA07 unlocked EIP-1193 adapter (NOT MetaMask)' }, provider } }));
    window.addEventListener('eip6963:requestProvider', announce);
  }, { account: accounts.A });
  for (const width of [1366, 390])
    await verifyKeyboard(page, { uiBase, width, recipient: accounts.recipient, report, screenshot });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(`${uiBase}/proposals/new`);
  await page.getByRole('button', { name: 'Kết nối ví', exact: true }).first().click();
  await page.getByText('Đã kết nối', { exact: true }).waitFor();
  await page.locator('#proposal-title').fill('QA07 same-proposal browser lifecycle');
  await page.locator('#proposal-body').fill('QA07 browser receipt to real worker to API to UI; one proposal and deployment.');
  await page.locator('#proposal-recipient').fill(accounts.recipient);
  await page.locator('#proposal-amount').fill('11000');
  await page.getByRole('button', { name: 'Tiếp tục: xem lại' }).click();
  const requestId = (await page.getByRole('region', { name: 'Xem lại đề xuất' }).innerText()).match(/Request ID:\s*(0x[0-9a-f]{64})/i)[1];
  await page.evaluate(() => window.__QA07_WALLET__.wrongNetwork());
  await page.getByText('Sai mạng', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Ký và tạo đề xuất' }).isDisabled(), true);
  await screenshot(page, '01-wrong-network');
  await page.getByRole('button', { name: /Chuyển sang QA07/ }).click();
  await page.getByText('Đã kết nối', { exact: true }).waitFor();
  await page.evaluate(() => window.__QA07_WALLET__.rejectNext());
  await page.getByRole('button', { name: 'Ký và tạo đề xuất' }).click();
  await page.locator('.transaction-status--error').waitFor();
  assert.match(await page.locator('.transaction-status--error').innerText(), /từ chối/);
  assert.equal(report.browserTransactions.length, 0); await screenshot(page, '02-signature-rejected-adapter');
  await page.getByRole('button', { name: 'Ký và tạo đề xuất' }).click();
  await page.locator('.transaction-status--success').waitFor();
  const proposalLink = page.locator('.proposal-full-id a'); await proposalLink.waitFor();
  const proposalId = await proposalLink.innerText();
  report.identity = { requestId, proposalId, deploymentId: 'qa07-e2e', chainId: '31337', addresses };
  await screenshot(page, '03-propose-confirmed-not-indexed');
  await proposalLink.click(); await page.getByRole('heading', { name: 'Không tìm thấy đề xuất' }).waitFor();
  await screenshot(page, '04-confirmed-not-indexed-detail');
  await publish('propose');
  await page.getByRole('button', { name: 'Tải dữ liệu mới nhất' }).click();
  await page.getByRole('heading', { name: 'QA07 same-proposal browser lifecycle' }).waitFor();
  const snapshot = BigInt(await call('Governor', 'proposalSnapshot', [proposalId]));
  const deadline = BigInt(await call('Governor', 'proposalDeadline', [proposalId]));
  await rpc('evm_setNextBlockTimestamp', [toQuantity(snapshot + 1n)]); await rpc('evm_mine'); await publish('active');
  await page.getByRole('button', { name: 'Tải dữ liệu mới nhất' }).click();
  await page.getByRole('button', { name: 'Bỏ phiếu', exact: true }).click(); await page.locator('.transaction-status--success').waitFor();
  await screenshot(page, '05-vote-receipt'); await publish('voted');
  await rpc('evm_setNextBlockTimestamp', [toQuantity(deadline + 1n)]); await rpc('evm_mine'); await publish('succeeded');
  await page.getByRole('button', { name: 'Tải dữ liệu mới nhất' }).click();
  await page.getByRole('button', { name: 'Queue', exact: true }).click(); await page.locator('.transaction-status--success').waitFor();
  await publish('queued'); await page.getByRole('button', { name: 'Tải dữ liệu mới nhất' }).click();
  const eta = BigInt(await call('Governor', 'proposalEta', [proposalId]));
  await rpc('evm_setNextBlockTimestamp', [toQuantity(eta)]); await rpc('evm_mine'); await publish('ready');
  await page.getByRole('button', { name: 'Tải dữ liệu mới nhất' }).click();
  await page.getByRole('button', { name: 'Execute', exact: true }).click(); await page.locator('.transaction-status--reverted').waitFor();
  const revertedTx = report.browserTransactions.at(-1); revertedTx.receipt = await waitForReceipt(rpc, revertedTx.transactionHash, { step: 'underfunded browser execute' });
  assert.equal(revertedTx.receipt.status, '0x0');
  assert.equal(String(await call('BUD', 'balanceOf', [addresses.Treasury])), '10000000000000000000000');
  assert.equal(await call('Treasury', 'paidRequests', [requestId]), false);
  await screenshot(page, '06-execute-reverted');
  report.topUpReceipt = await send('BUD', 'transfer', [addresses.Treasury, 2000n * 10n ** 18n]);
  await publish('top-up-after-revert'); await page.getByRole('button', { name: 'Tải dữ liệu mới nhất' }).click();
  await page.getByRole('button', { name: 'Execute', exact: true }).click(); await page.locator('.transaction-status--success').waitFor();
  await screenshot(page, '07-execute-confirmed'); const final = await publish('executed');
  await page.getByRole('button', { name: 'Tải dữ liệu mới nhất' }).click();
  await page.locator('.status-pill--executed').waitFor();
  await page.getByText(final.context.asOfBlockHash, { exact: true }).waitFor();
  const uiSnapshot = {
    text: await page.locator('.snapshot-info').innerText(),
    asOfBlockHash: await page.locator('.snapshot-info code').nth(0).innerText(),
    snapshotRevision: await page.locator('.snapshot-info code').nth(1).innerText(),
  };
  assert.equal(uiSnapshot.asOfBlockHash, final.context.asOfBlockHash, 'Rendered UI hash must match the reconciled publication');
  assert.equal(uiSnapshot.snapshotRevision, final.context.snapshotRevision, 'Rendered UI revision must match the reconciled publication');
  await screenshot(page, '08-executed-reconciled-ui');
  const detail = await get(`/proposals/${proposalId}`); assert.equal(detail.status, 200);
  const transfers = await get('/treasury/transfers', { proposalId }); assert.equal(transfers.status, 200);
  assertReconciledSnapshot(final.context, detail.body.context, transfers.body.context);
  assert.equal(detail.body.data.requestId, requestId); assert.equal(detail.body.data.state, 'Executed');
  assert.equal(detail.body.data.operation.status, 'Done');
  const executeHash = report.browserTransactions.at(-1).transactionHash;
  const transfer = transfers.body.data.find(t => t.transactionHash === executeHash);
  assert.ok(transfer); assert.equal(transfer.requestId, requestId); assert.equal(transfer.proposalId, proposalId);
  assert.equal(transfer.amount, '11000000000000000000000'); assert.equal(final.data.treasury.balance, '1000000000000000000000');
  const at = { blockHash: final.context.asOfBlockHash, requireCanonical: true };
  assert.equal(String(await call('Governor', 'state', [proposalId], at)), '7');
  assert.equal(await call('Timelock', 'isOperationDone', [detail.body.data.operation.operationId], at), true);
  report.reconciliation = { detail, transfers, context: final.context, operationId: detail.body.data.operation.operationId,
    uiSnapshot,
    executeHash, requestId, proposalId, treasuryBalance: String(await call('BUD', 'balanceOf', [addresses.Treasury], at)),
    recipientBalance: String(await call('BUD', 'balanceOf', [accounts.recipient], at)), paid: await call('Treasury', 'paidRequests', [requestId], at) };
  assert.equal(report.reconciliation.recipientBalance, '11000000000000000000000'); assert.equal(report.reconciliation.paid, true);
  const disbursement = (await pool.query(`SELECT d.request_id,d.proposal_id::text,d.operation_id,d.amount::text,r.transaction_hash,r.block_hash
    FROM disbursements d JOIN raw_events r ON r.deployment_id=d.deployment_id AND r.raw_event_id=d.source_event_id
    WHERE d.deployment_id=$1 AND d.request_id=$2`, [deploymentId, requestId])).rows;
  assert.equal(disbursement.length, 1);
  assert.deepEqual(disbursement[0], { request_id: requestId, proposal_id: proposalId,
    operation_id: report.reconciliation.operationId, amount: transfer.amount, transaction_hash: executeHash, block_hash: transfer.blockHash });
  report.reconciliation.sqlDisbursement = disbursement[0];
  assert.equal(detail.body.data.transactions.created, report.browserTransactions[0].transactionHash);
  assert.equal(detail.body.data.transactions.queued, report.browserTransactions[2].transactionHash);
  assert.equal(detail.body.data.transactions.executed, executeHash);
  for (const tx of report.browserTransactions) {
    tx.receipt ??= await waitForReceipt(rpc, tx.transactionHash, { step: 'browser transaction evidence' });
    const decoded = abi.Governor.parseTransaction({ data: tx.payload.data });
    tx.decoded = decoded.name;
    tx.arguments = JSON.parse(JSON.stringify(decoded.args, (_key, value) => typeof value === 'bigint' ? String(value) : value));
    assert.equal(tx.payload.to.toLowerCase(), addresses.Governor.toLowerCase());
    if (decoded.name === 'castVote') assert.equal(String(decoded.args[0]), proposalId);
    const events = tx.receipt.logs.filter(log => log.address.toLowerCase() === addresses.Governor.toLowerCase())
      .map(log => { try { return abi.Governor.parseLog(log); } catch { return null; } }).filter(Boolean);
    if (tx.receipt.status === '0x1') assert.ok(events.some(event => String(event.args.proposalId) === proposalId));
  }
  assert.deepEqual(report.browserTransactions.map(t => t.decoded), ['propose', 'castVote', 'queue', 'execute', 'execute']);
  report.checks.push('same browser-created proposal: propose/vote/queue/reverted-execute/funded-execute; receipts, worker, API, rendered UI revision and canonical H/hash reconciled');
  uiMode = 'hold'; uiGate = new Promise(done => { releaseUi = done; });
  await page.goto(`${uiBase}/proposals`); await page.getByRole('status', { name: 'Đang tải dữ liệu đề xuất' }).waitFor(); await screenshot(page, '09-loading-real-transport');
  uiMode = 'offline'; releaseUi(); await page.getByRole('button', { name: 'Thử lại', exact: true }).waitFor(); await screenshot(page, '10-api-network-error');
  uiMode = 'normal'; await page.getByRole('button', { name: 'Thử lại', exact: true }).click(); await page.getByText('QA07 same-proposal browser lifecycle', { exact: true }).waitFor(); await screenshot(page, '11-error-retry-recovered');
  const branchPoint = await rpc('evm_snapshot');
  report.orphanFunding = await send('BUD', 'transfer', [addresses.Treasury, 1n]); await publish('orphan-branch');
  const cursorPage = await get('/treasury/transfers', { limit: '1' }); assert.equal(cursorPage.status, 200); assert.ok(cursorPage.body.pagination.nextCursor);
  recoveryArmed = true; recoveryGate = new Promise(done => { releaseRecovery = done; });
  assert.equal(await rpc('evm_revert', [branchPoint]), true);
  report.canonicalFunding = await send('BUD', 'transfer', [addresses.Treasury, 2n]); await rpc('anvil_mine', ['0x2', '0x0']);
  await until('real worker recovery gate', async () => (await pool.query('SELECT indexer_state FROM deployments WHERE deployment_id=$1', [deploymentId])).rows[0].indexer_state.phase === 'recovering');
  const recovery = report.recovery = { gate: (await pool.query('SELECT indexer_state FROM deployments WHERE deployment_id=$1', [deploymentId])).rows[0],
    summary: await get('/summary'), oldCursor: await get('/treasury/transfers', { limit: '1', cursor: cursorPage.body.pagination.nextCursor }) };
  assert.equal(recovery.summary.status, 503); assert.equal(recovery.summary.body.error.code, 'DATA_NOT_READY');
  assert.equal(recovery.oldCursor.status, 409); assert.equal(recovery.oldCursor.body.error.code, 'SNAPSHOT_INVALIDATED');
  await page.goto(`${uiBase}/proposals/${proposalId}`); await page.getByRole('button', { name: 'Thử lại', exact: true }).waitFor(); await screenshot(page, '12-recovery-503-ui');
  recoveryArmed = false; releaseRecovery();
  await until('worker recovered publication', async () => (await get('/summary')).status === 200);
  recovery.recovered = await get('/summary'); assert.notEqual(recovery.recovered.body.context.snapshotRevision, cursorPage.body.context.snapshotRevision);
  recovery.oldCursorAfterRecovery = await get('/treasury/transfers', { limit: '1', cursor: cursorPage.body.pagination.nextCursor }); assert.equal(recovery.oldCursorAfterRecovery.status, 409);
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click(); await page.locator('.status-pill--executed').waitFor(); await screenshot(page, '13-canonical-recovery-ui');
  report.checks.push('adapter wrong-network locks signing; adapter code4001 rejection with no tx; confirmed-not-indexed; real receipt revert; loading/network error/retry; actual worker recovering503 and cursor409 with canonical recovery');
  const mobile = await context.newPage(); await mobile.setViewportSize({ width: 390, height: 844 }); await mobile.goto(`${uiBase}/proposals/${proposalId}`);
  await mobile.locator('.status-pill--executed').waitFor(); await screenshot(mobile, '14-mobile-executed');
  report.checks.push('desktop 1366x900 and mobile 390x844 screenshots captured from real rendered pages');
  assert.deepEqual(report.browserErrors, []);
  report.status = 'PASS';
  }
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally {
  releaseRecovery?.(); releaseUi?.();
  const cleanupFailure = (field, error) => {
    report[field] = error.message; report.status = 'FAIL'; process.exitCode = 1;
  };
  await browser?.close().catch(error => cleanupFailure('browserCleanupError', error));
  for (const server of [uiProxy, api, proxy]) if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  await pool?.end();
  await scope.stopChildren().catch(error => cleanupFailure('cleanupError', error));
  for (const [name, log] of logs) { await writeFile(join(output, `${name}.stdout.log`), log.stdout); await writeFile(join(output, `${name}.stderr.log`), log.stderr); }
  await scope.cleanup().catch(error => cleanupFailure('cleanupError', error)); scope.dispose();
  report.finishedAt = new Date().toISOString();
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, report: join(output, 'report.json'), error: report.error }));
}
