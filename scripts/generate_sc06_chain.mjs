// SC06 fixture adapter: uses TV4 deployment/role audit/receipt/resource helpers unchanged.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { id, toQuantity, ZeroHash } from 'ethers';
import { createRpc, deployGovernance, checkGovernanceRoles } from './governance_local.mjs';
import { waitForReceipt, assertReceiptStatus } from './receipt.mjs';
import { createSmokeLifecycle } from './smoke_lifecycle.mjs';
import { checkFixture, decodedEvents, interfaces } from './check_sc06_chain.mjs';
import { generationFiles, verifySources, sha } from './sc06_provenance.mjs';

assert.equal(process.argv.length, 3, 'Usage: node --import tsx scripts/generate_sc06_chain.mjs <NEW-output-directory>');
const output = resolve(process.argv[2]), root = fileURLToPath(new URL('../', import.meta.url));
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const sourceHashes = Object.fromEntries(await Promise.all(generationFiles.map(async p => [p, sha(await readFile(resolve(root, p)))])));
await verifySources(sourceCommit, sourceHashes); // Refuse uncommitted generator/checker before sending any transaction.
try { await stat(output); throw new Error('Output already exists; never overwrite evidence'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const life = createSmokeLifecycle();
let anvilError = '';
try {
  const server = createServer();
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const port = server.address().port;
  await new Promise(done => server.close(done));
  const child = life.spawn('anvil', ['--host', '127.0.0.1', '--port', String(port), '--chain-id', '31337',
    '--hardfork', 'osaka', '--timestamp', '1800000000', '--silent'], { stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', b => { anvilError += b.toString(); });
  const rpc = createRpc(`http://127.0.0.1:${port}`);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { ready = await rpc('eth_chainId') === '0x7a69'; } catch { /* bounded startup */ }
    if (ready) break;
    await new Promise(done => setTimeout(done, 50));
  }
  assert.ok(ready, `Anvil not ready: ${anvilError}`);
  const [A, B, C, D, funding, deployer, caller, recipient, outsider] = await rpc('eth_accounts');
  const { manifest } = await deployGovernance(rpc, { root, accounts: { A, B, C, D, funding, deployer, caller, recipient, outsider } });
  const abi = await interfaces(), address = k => manifest.contracts[k].address;
  const one = async (name, method, args = [], block = 'latest') => abi[name].decodeFunctionResult(method,
    await rpc('eth_call', [{ to: address(name), data: abi[name].encodeFunctionData(method, args) }, block]))[0];
  const tx = async (from, method, args, at) => {
    if (at !== undefined) await rpc('evm_setNextBlockTimestamp', [toQuantity(at)]);
    const hash = await rpc('eth_sendTransaction', [{ from, to: address('Governor'), data: abi.Governor.encodeFunctionData(method, args), gas: toQuantity(8_000_000) }]);
    const r = await waitForReceipt(rpc, hash, { step: method });
    assertReceiptStatus(r, hash, method);
    return hash;
  };
  const proposals = [];
  for (const canceled of [false, true]) {
    const description = canceled
      ? ' {"version":1,"title":"Hủy đề xuất Pending","body":"Người tạo hủy trước snapshot, không có operation."} '
      : ' {"version":1, "title":"Chi ngân sách — tiếng Việt", "body":"Giữ  hai khoảng trắng; Unicode: e\u0301 và é.\\nKhông đổi bytes."} ';
    const requestId = id(canceled ? 'sc06:cancel' : 'sc06:pay');
    const amount = canceled ? '2000000000000000000000' : '1000000000000000000000';
    const calldata = abi.Treasury.encodeFunctionData('disburse', [requestId, recipient, amount]);
    const arrays = [[address('Treasury')], ['0'], [calldata]];
    const descriptionHash = id(description);
    const proposalId = (await one('Governor', 'hashProposal', [...arrays, descriptionHash])).toString();
    const salt = '0x' + (BigInt(address('Governor') + '0'.repeat(24)) ^ BigInt(descriptionHash)).toString(16).padStart(64, '0');
    const operationId = await one('Timelock', 'hashOperationBatch', [...arrays, ZeroHash, salt]);
    const transactions = { create: await tx(A, 'propose', [...arrays, description]) };
    if (canceled) transactions.cancel = await tx(A, 'cancel', [...arrays, descriptionHash]);
    else {
      const snapshot = await one('Governor', 'proposalSnapshot', [proposalId]);
      transactions.voteA = await tx(A, 'castVote', [proposalId, 1], snapshot + 1n);
      transactions.voteB = await tx(B, 'castVote', [proposalId, 1]);
      const deadline = await one('Governor', 'proposalDeadline', [proposalId]);
      transactions.queue = await tx(caller, 'queue', [...arrays, descriptionHash], deadline + 1n);
      const eta = await one('Governor', 'proposalEta', [proposalId]);
      transactions.execute = await tx(outsider, 'execute', [...arrays, descriptionHash], eta);
    }
    proposals.push({ requestId, recipient, amount, calldata, description, descriptionHash, proposalId, salt, operationId, transactions });
  }
  const auditCalls = [];
  const audit = await checkGovernanceRoles(async (method, args) => {
    const result = await rpc(method, args);
    if (method === 'eth_call') auditCalls.push({ ...args[0], block: args[1], result });
    return result;
  }, manifest, { root });
  const head = toQuantity(BigInt(audit.height));
  const f = { kind: 'sc06-canonical-local-receipts-v1', manifest, roleAudit: audit,
    scope: 'Real local Anvil receipts; one continuous history, no snapshot/revert. Offline archived chain after generator exits. Not SC05 deployment-preflight or testnet acceptance.',
    head: { number: head, hash: audit.blockHash }, blocks: [], receipts: [], transactions: [], proposals, calls: auditCalls, balances: {}, expectedDecoded: [], runtimeCode: {},
    generation: { sourceCommit, node: process.version, sourceHashes } };
  for (const key of Object.keys(manifest.contracts)) f.runtimeCode[key] = await rpc('eth_getCode', [address(key), head]);
  for (let n = 0n; n <= BigInt(head); n++) {
    const block = await rpc('eth_getBlockByNumber', [toQuantity(n), false]); f.blocks.push(block);
    for (const hash of block.transactions) {
      f.receipts.push(await rpc('eth_getTransactionReceipt', [hash]));
      f.transactions.push(await rpc('eth_getTransactionByHash', [hash]));
    }
  }
  const call = async (name, method, args = []) => {
    const to = address(name), data = abi[name].encodeFunctionData(method, args);
    const result = await rpc('eth_call', [{ to, data }, head]);
    f.calls.push({ to, data, block: head, result });
    return abi[name].decodeFunctionResult(method, result)[0];
  };
  for (const p of proposals) {
    const arrays = [[address('Treasury')], ['0'], [p.calldata]];
    await call('Governor', 'hashProposal', [...arrays, p.descriptionHash]);
    await call('Timelock', 'hashOperationBatch', [...arrays, ZeroHash, p.salt]);
    await call('Governor', 'state', [p.proposalId]);
    await call('Timelock', 'getTimestamp', [p.operationId]);
    await call('Treasury', 'paidRequests', [p.requestId]);
    const snapshot = await one('Governor', 'proposalSnapshot', [p.proposalId], head);
    if (BigInt(audit.timestamp) > snapshot) await call('Governor', 'quorum', [snapshot]);
  }
  for (const [name, account] of Object.entries({ treasury: address('Treasury'), recipient, funding })) f.balances[name] = (await call('BUD', 'balanceOf', [account])).toString();
  await call('BUD', 'decimals'); await call('BUD', 'totalSupply');
  f.expectedDecoded = decodedEvents(f);
  f.verification = await checkFixture(f, rpc);
  await life.stopChildren();
  await mkdir(output, { recursive: false });
  await writeFile(resolve(output, 'chain.json'), JSON.stringify(f, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(f.verification));
} finally {
  await life.cleanup(); life.dispose();
}
