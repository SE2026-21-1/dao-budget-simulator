#!/usr/bin/env node
import assert from 'node:assert/strict';
import { open, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Interface, id, toQuantity } from 'ethers';
import { createRpc, checkGovernanceRoles, requireLoopbackRpc } from './governance_local.mjs';
import { assertReceiptStatus, waitForReceipt } from './receipt.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const usage = 'Usage: node --import tsx scripts/be09-seed.mjs --rpc <loopback-url> --manifest <manifest.json> --output <seed-report.json>';

function options(args) {
  const result = {};
  if (args.length !== 6) throw new Error(usage);
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!['--rpc', '--manifest', '--output'].includes(key) || result[key] || !args[index + 1]) throw new Error(usage);
    result[key] = args[index + 1];
  }
  if (!result['--rpc'] || !result['--manifest'] || !result['--output']) throw new Error(usage);
  return result;
}

async function main() {
  const args = options(process.argv.slice(2));
  requireLoopbackRpc(args['--rpc']);
  const output = resolve(args['--output']);
  const handle = await open(output, 'wx', 0o600);
  const report = {
    format: 'dao-budget-be09-governance-seed-v1', status: 'FAIL',
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    chainId: '31337', proposalId: null, requestId: null, receipts: [],
  };
  try {
    const manifest = JSON.parse(await readFile(resolve(args['--manifest']), 'utf8'));
    assert.equal(manifest.format, 'dao-budget-local-governance-v1', 'Unsupported deployment manifest');
    assert.equal(manifest.sourceCommit, report.sourceCommit, 'Manifest source revision differs from this worktree');
    assert.equal(manifest.chainId, report.chainId, 'Deployment must use local chain 31337');
    assert.ok(manifest.accounts?.A && manifest.accounts?.B && manifest.accounts?.caller && manifest.accounts?.outsider && manifest.accounts?.recipient,
      'Manifest does not contain the official unlocked demo accounts');

    const rpc = createRpc(args['--rpc']);
    const artifacts = {};
    for (const name of ['BudgetGovernor', 'BudgetToken', 'Treasury', 'TimelockController']) {
      const path = resolve(root, `out/${name}.sol/${name}.json`);
      artifacts[name] = JSON.parse(await readFile(path, 'utf8'));
    }
    const interfaces = {
      Governor: new Interface(artifacts.BudgetGovernor.abi),
      BUD: new Interface(artifacts.BudgetToken.abi),
      Treasury: new Interface(artifacts.Treasury.abi),
      Timelock: new Interface(artifacts.TimelockController.abi),
    };
    const addresses = Object.fromEntries(Object.entries(manifest.contracts).map(([name, item]) => [name, item.address]));
    const account = manifest.accounts;
    const U = 10n ** 18n;
    const call = async (contract, method, values = []) => interfaces[contract].decodeFunctionResult(method,
      await rpc('eth_call', [{ to: addresses[contract], data: interfaces[contract].encodeFunctionData(method, values) }, 'latest']));
    const one = async (contract, method, values = []) => (await call(contract, method, values))[0];
    const block = async () => rpc('eth_getBlockByNumber', ['latest', false]);
    const at = async timestamp => rpc('evm_setNextBlockTimestamp', [Number(timestamp)]);
    const send = async (label, from, contract, method, values, timestamp) => {
      if (timestamp !== undefined) await at(timestamp);
      const txHash = await rpc('eth_sendTransaction', [{ from, to: addresses[contract],
        data: interfaces[contract].encodeFunctionData(method, values), gas: toQuantity(8_000_000) }]);
      const receipt = await waitForReceipt(rpc, txHash, { step: label });
      assertReceiptStatus(receipt, txHash, label);
      const mined = await rpc('eth_getBlockByHash', [receipt.blockHash, false]);
      if (timestamp !== undefined) assert.equal(BigInt(mined.timestamp), BigInt(timestamp), `${label}: timestamp differs from requested boundary`);
      const saved = { label, transactionHash: receipt.transactionHash, blockNumber: BigInt(receipt.blockNumber).toString(),
        blockHash: receipt.blockHash, transactionIndex: BigInt(receipt.transactionIndex).toString(), timestamp: BigInt(mined.timestamp).toString() };
      report.receipts.push(saved);
      return { receipt, saved };
    };

    assert.equal(BigInt(await rpc('eth_chainId', [])), 31337n, 'RPC chain does not match manifest');
    report.initialRoleAudit = await checkGovernanceRoles(rpc, manifest, { root });

    // This is the QA02 1000-BUD proposal/vote/queue/execute scenario in
    // smoke_governance.mjs, applied to the caller-owned persistent Anvil.
    const description = '{"version":1,"title":"Demo chi 1000 BUD","body":"Khoan chi mo phong cho nghiem thu QA02."}';
    const requestId = id('tv4:qa02-demo-1000');
    const targets = [addresses.Treasury];
    const values = ['0'];
    const calldatas = [interfaces.Treasury.encodeFunctionData('disburse', [requestId, account.recipient, 1000n * U])];
    const descriptionHash = id(description);
    const proposalId = String(await one('Governor', 'hashProposal', [targets, values, calldatas, descriptionHash]));
    const proposed = await send('QA02 demo propose 1000 BUD', account.A, 'Governor', 'propose', [targets, values, calldatas, description]);
    const created = proposed.receipt.logs.filter(log => log.address.toLowerCase() === addresses.Governor.toLowerCase())
      .map(log => interfaces.Governor.parseLog(log)).find(event => event?.name === 'ProposalCreated');
    assert.equal(String(created?.args.proposalId), proposalId, 'ProposalCreated proposalId differs from hashProposal');
    assert.equal(created.args.description, description, 'ProposalCreated description changed');

    const snapshot = BigInt(await one('Governor', 'proposalSnapshot', [proposalId]));
    const deadline = BigInt(await one('Governor', 'proposalDeadline', [proposalId]));
    const voteA = await send('QA02 A votes For 400 GOV', account.A, 'Governor', 'castVote', [proposalId, 1], snapshot + 1n);
    const voteB = await send('QA02 B votes For 300 GOV', account.B, 'Governor', 'castVote', [proposalId, 1], snapshot + 1n);
    const queuedAt = deadline + 1n;
    const queued = await send('QA02 caller queues through Governor', account.caller, 'Governor', 'queue',
      [targets, values, calldatas, descriptionHash], queuedAt);
    const eta = BigInt(await one('Governor', 'proposalEta', [proposalId]));
    assert.equal(eta, queuedAt + 120n, 'Timelock ETA differs from locked 120-second delay');
    const executed = await send('QA02 outsider executes 1000 BUD through Governor at ETA', account.outsider,
      'Governor', 'execute', [targets, values, calldatas, descriptionHash], eta);

    assert.equal(await one('Governor', 'state', [proposalId]), 7n, 'Proposal must be Executed');
    assert.equal(await one('Treasury', 'paidRequests', [requestId]), true, 'Treasury did not mark the request paid');
    const finalVotes = Array.from(await call('Governor', 'proposalVotes', [proposalId])).map(String);
    assert.deepEqual(finalVotes, ['0', String(700n * U), '0'], 'On-chain vote tally differs from 400+300 GOV');
    assert.equal(await one('BUD', 'balanceOf', [addresses.Treasury]), 9000n * U, 'Treasury balance differs after 1000-BUD execution');
    const eventNames = executed.receipt.logs.map(log => {
      for (const [name, address] of Object.entries(addresses)) {
        if (address.toLowerCase() === log.address.toLowerCase()) return interfaces[name]?.parseLog(log)?.name;
      }
      return undefined;
    }).filter(Boolean);
    assert.deepEqual(eventNames, ['Transfer', 'BudgetDisbursed', 'CallExecuted', 'ProposalExecuted'], 'Execution receipt event order differs from official flow');

    // Two empty confirmations let the K=2 worker publish the execution block.
    await rpc('evm_mine', []);
    await rpc('evm_mine', []);
    const finalBlock = await block();
    const roles = await checkGovernanceRoles(rpc, manifest, { root });
    report.status = 'PASS';
    report.proposalId = proposalId;
    report.requestId = requestId;
    report.proposal = { description, descriptionHash, proposer: account.A, targets, values, calldatas,
      snapshot: snapshot.toString(), deadline: deadline.toString(), state: 'Executed',
      votes: { against: finalVotes[0], for: finalVotes[1], abstain: finalVotes[2] } };
    report.voteReceipts = [voteA.saved, voteB.saved];
    report.execution = { transactionHash: executed.saved.transactionHash, blockNumber: executed.saved.blockNumber,
      blockHash: executed.saved.blockHash, recipient: account.recipient, amount: String(1000n * U), eventNames };
    report.confirmationBlocksMined = 2;
    report.finalBlock = { number: BigInt(finalBlock.number).toString(), hash: finalBlock.hash, timestamp: BigInt(finalBlock.timestamp).toString() };
    report.finalRoleAudit = { height: roles.height, blockHash: roles.blockHash, sourceCommit: roles.manifestSourceCommit };
  } catch (error) {
    report.status = 'FAIL';
    report.error = { name: error?.name ?? 'Error', message: error?.message ?? String(error) };
    await handle.writeFile(`${JSON.stringify(report, null, 2)}\n`);
    await handle.close();
    console.error(`BE09 governance seed failed; report retained at ${output}`);
    throw error;
  }
  await handle.writeFile(`${JSON.stringify(report, null, 2)}\n`);
  await handle.close();
  process.stdout.write(JSON.stringify({ status: report.status, proposalId: report.proposalId,
    finalBlock: report.finalBlock, report: output }) + '\n');
}

main().catch(error => { console.error(`BE09 governance seed failed: ${error.message}`); process.exitCode = 1; });
