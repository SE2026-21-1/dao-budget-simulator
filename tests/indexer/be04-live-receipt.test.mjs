import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { assertReceiptStatus, ReceiptRpcError, ReceiptStatusError, ReceiptTimeoutError, waitForReceipt } from '../../scripts/receipt.mjs';

const transactionHash = `0x${'ab'.repeat(32)}`;

describe('BE04 live receipt polling', () => {
  test('keeps polling after null and returns the eventual receipt', async () => {
    let calls = 0;
    const receipt = { status: '0x1', logs: [] };
    const actual = await waitForReceipt(async (method, params) => {
      assert.equal(method, 'eth_getTransactionReceipt');
      assert.deepEqual(params, [transactionHash]);
      calls += 1;
      return calls < 3 ? null : receipt;
    }, transactionHash, { step: 'delayed test transaction', timeoutMs: 1000, pollIntervalMs: 2 });

    assert.equal(calls, 3);
    assert.deepEqual(actual, receipt);
    assertReceiptStatus(actual, transactionHash, 'delayed test transaction');
  });

  test('times out after a finite deadline with step and transaction hash', async () => {
    let calls = 0;
    await assert.rejects(
      waitForReceipt(async () => { calls += 1; return null; }, transactionHash,
        { step: 'never mined test transaction', timeoutMs: 25, pollIntervalMs: 3 }),
      (error) => {
        assert.ok(error instanceof ReceiptTimeoutError);
        assert.equal(error.code, 'RECEIPT_TIMEOUT');
        assert.match(error.message, /never mined test transaction/);
        assert.match(error.message, new RegExp(transactionHash));
        return true;
      },
    );
    assert.ok(calls > 1, 'null receipts should be retried until the deadline');
    await assert.rejects(
      waitForReceipt(async () => new Promise(() => {}), transactionHash,
        { step: 'stalled RPC test transaction', timeoutMs: 15, pollIntervalMs: 3 }),
      (error) => error instanceof ReceiptTimeoutError && error.code === 'RECEIPT_TIMEOUT'
        && error.message.includes(transactionHash),
    );
  });

  test('reports RPC failures without exposing provider error details', async () => {
    await assert.rejects(
      waitForReceipt(async () => { throw new Error('https://rpc.invalid/secret=do-not-log'); }, transactionHash,
        { step: 'RPC error test transaction', timeoutMs: 100, pollIntervalMs: 2 }),
      (error) => {
        assert.ok(error instanceof ReceiptRpcError);
        assert.equal(error.code, 'RECEIPT_RPC_ERROR');
        assert.match(error.message, /RPC error test transaction/);
        assert.match(error.message, new RegExp(transactionHash));
        assert.doesNotMatch(error.message, /secret=do-not-log/);
        return true;
      },
    );
  });

  test('accepts an expected revert and rejects a revert when success was expected', () => {
    const reverted = { status: '0x0', logs: [] };
    assert.doesNotThrow(() => assertReceiptStatus(reverted, transactionHash, 'expected revert', false));
    assert.throws(
      () => assertReceiptStatus(reverted, transactionHash, 'unexpected revert'),
      (error) => error instanceof ReceiptStatusError && error.code === 'RECEIPT_STATUS_MISMATCH'
        && error.message.includes(transactionHash),
    );
    assert.doesNotThrow(() => assertReceiptStatus({ status: '0x1', logs: [] }, transactionHash, 'successful tx'));
  });
});
