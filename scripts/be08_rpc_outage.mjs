import assert from 'node:assert/strict';

// HTTP requests retain the HttpRpc logical call ID; bounded projection calls
// may interleave retries, and worker stdout does not mark call boundaries.
export function summarizeOutageCalls(attempts, { startedAtMs, endedAtMs, boundaryWindowMs = 5_000 } = {}) {
  assert.ok(attempts.length > 0, 'Outage must record actual RPC attempts');
  const hasWindow = startedAtMs !== undefined || endedAtMs !== undefined;
  if (hasWindow) {
    assert.ok(Number.isFinite(startedAtMs) && Number.isFinite(endedAtMs) && endedAtMs >= startedAtMs,
      'Both outage window timestamps are required');
    assert.ok(Number.isFinite(boundaryWindowMs) && boundaryWindowMs >= 0, 'Outage boundary window must be nonnegative');
  }
  const calls = new Map();
  for (const attempt of attempts) {
    assert.ok(Number.isSafeInteger(attempt.id) && attempt.id > 0, 'RPC call ID is required');
    assert.equal(attempt.httpStatus, 503);
    assert.ok(Number.isFinite(attempt.monotonicMs), 'RPC attempt time is required');
    let call = calls.get(attempt.id);
    if (!call) {
      call = { id: attempt.id, method: attempt.method, params: attempt.params, samples: [] };
      calls.set(attempt.id, call);
    } else {
      assert.ok(call.samples.length < 4,
        'Do not reuse a completed RPC call ID; RPC attempts must remain bounded');
    }
    assert.equal(attempt.method, call.method, 'RPC retries must preserve method');
    assert.deepEqual(attempt.params, call.params, 'RPC retries must preserve params');
    call.samples.push(attempt);
  }
  const logicalCalls = [...calls.values()];
  return logicalCalls.map(call => {
    const count = call.samples.length;
    const gapsMs = call.samples.slice(1).map((sample, n) => sample.monotonicMs - call.samples[n].monotonicMs);
    assert.ok(count >= 1 && count <= 4, `RPC attempt count must remain bounded (call ${call.id}: ${count})`);
    const windowBoundary = !hasWindow ||
      call.samples[0].monotonicMs - startedAtMs <= boundaryWindowMs ||
      endedAtMs - call.samples.at(-1).monotonicMs <= boundaryWindowMs;
    assert.ok(windowBoundary || count === 4, 'Interior outage calls must exhaust four attempts');
    assert.ok(gapsMs.every(gap => gap >= 100), 'Default retries must use positive backoff');
    return { id: call.id, method: call.method, attempts: count, gapsMs, windowBoundary };
  });
}
