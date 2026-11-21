import assert from 'node:assert/strict';

// HTTP requests carry the HttpRpc logical call ID, independent of worker stdout
// delivery. A projection error and its recovery check can precede one worker_error.
export function summarizeOutageCalls(attempts) {
  assert.ok(attempts.length > 0, 'Outage must record actual RPC attempts');
  const calls = [];
  const seen = new Set();
  for (const attempt of attempts) {
    assert.ok(Number.isSafeInteger(attempt.id) && attempt.id > 0, 'RPC call ID is required');
    assert.equal(attempt.httpStatus, 503);
    assert.ok(Number.isFinite(attempt.monotonicMs), 'RPC attempt time is required');
    let call = calls.at(-1);
    if (call?.id !== attempt.id) {
      assert.ok(!seen.has(attempt.id), 'Serial worker must not reuse a completed RPC call ID');
      seen.add(attempt.id);
      call = { id: attempt.id, method: attempt.method, params: attempt.params, samples: [] };
      calls.push(call);
    }
    assert.equal(attempt.method, call.method, 'RPC retries must preserve method');
    assert.deepEqual(attempt.params, call.params, 'RPC retries must preserve params');
    call.samples.push(attempt);
  }
  return calls.map((call, index) => {
    const count = call.samples.length;
    const gapsMs = call.samples.slice(1).map((sample, n) => sample.monotonicMs - call.samples[n].monotonicMs);
    assert.ok(count >= 1 && count <= 4, `RPC attempt count must remain bounded (call ${call.id}: ${count})`);
    // Only the first/last call can straddle the outage observation window.
    const windowBoundary = index === 0 || index === calls.length - 1;
    assert.ok(windowBoundary || count === 4, 'Interior outage calls must exhaust four attempts');
    assert.ok(gapsMs.every(gap => gap >= 100), 'Default retries must use positive backoff');
    return { id: call.id, method: call.method, attempts: count, gapsMs, windowBoundary };
  });
}
