#!/usr/bin/env node
// Public read-only snapshots; nonce/head/pool are corroboration, not provider no-send proof.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { Interface, isAddress } from 'ethers';
const [handoffPath, accountA, accountB, output] = process.argv.slice(2);
assert.ok(isAddress(accountA) && isAddress(accountB) && accountA.toLowerCase() !== accountB.toLowerCase());
const handoff = JSON.parse(await readFile(handoffPath, 'utf8'));
assert.equal(handoff.chainId, '31337');
assert.equal(new URL(handoff.rpcUrl).hostname, '127.0.0.1');
const exchanges = [];
const rpc = async (method, params = []) => {
  const request = { jsonrpc: '2.0', id: exchanges.length + 1, method, params };
  const startedAt = new Date().toISOString();
  const response = await fetch(handoff.rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
  const text = await response.text();
  exchanges.push({ startedAt, finishedAt: new Date().toISOString(), request, httpStatus: response.status, headers: Object.fromEntries(response.headers), responseBody: text });
  assert.equal(response.status, 200);
  const body = JSON.parse(text);
  assert.ok(!body.error, JSON.stringify(body.error));
  return body.result;
};
const chainId = await rpc('eth_chainId');
assert.equal(chainId, '0x7a69');
const headBefore = await rpc('eth_getBlockByNumber', ['latest', false]);
const at = { blockHash: headBefore.hash, requireCanonical: true };
const abi = new Interface(['function clock() view returns (uint48)', 'function proposalThreshold() view returns (uint256)', 'function getVotes(address,uint256) view returns (uint256)']);
const call = async (name, args = []) => abi.decodeFunctionResult(name, await rpc('eth_call', [{ to: handoff.contracts.Governor, data: abi.encodeFunctionData(name, args) }, at]))[0];
const clock = await call('clock');
const threshold = await call('proposalThreshold');
const accounts = {};
for (const [label, address] of [['A', accountA], ['B', accountB]]) {
  accounts[label] = { address, latestNonce: await rpc('eth_getTransactionCount', [address, 'latest']), pendingNonce: await rpc('eth_getTransactionCount', [address, 'pending']), pastVotes: String(await call('getVotes', [address, clock - 1n])) };
}
const txpool = await rpc('txpool_status');
const headAfter = await rpc('eth_getBlockByNumber', ['latest', false]);
assert.equal(headAfter.hash, headBefore.hash, 'Snapshot crossed a changing head; do not claim atomic snapshot');
await writeFile(output, JSON.stringify({ sourceCommit: handoff.sourceCommit, manifestSha256: handoff.manifestSha256, capturedAt: new Date().toISOString(), chainId, head: { number: headBefore.number, hash: headBefore.hash }, clock: String(clock), threshold: String(threshold), accounts, txpool, exchanges }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ output, head: headBefore.number, accounts, txpool }));
