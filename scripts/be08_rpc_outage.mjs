import assert from 'node:assert/strict';

export function createOutageRpcRecorder() {
  const outageAttempts = [], lifecycleAttempts = [], outageIds = new Set();
  const completedOutageIds = new Set(), pendingFailures = new Map();
  function record(attempt) {
    const history = pendingFailures.get(attempt.id) ?? [];
    if (attempt.offline) {
      if (!outageIds.has(attempt.id)) {
        outageIds.add(attempt.id);
        lifecycleAttempts.push(...history);
      }
      outageAttempts.push(attempt);
      lifecycleAttempts.push(attempt);
    } else if (outageIds.has(attempt.id)) lifecycleAttempts.push(attempt);

    if (attempt.httpStatus === 503) {
      history.push(attempt);
      if (history.length >= 4) {
        pendingFailures.delete(attempt.id);
        if (outageIds.has(attempt.id)) completedOutageIds.add(attempt.id);
      } else pendingFailures.set(attempt.id, history);
    } else {
      pendingFailures.delete(attempt.id);
      if (outageIds.has(attempt.id)) completedOutageIds.add(attempt.id);
    }
  }
  return { outageAttempts, lifecycleAttempts, outageIds, completedOutageIds, record };
}

// Group observed attempts by JSON-RPC ID. A partial outage trace is acceptable
// only when that same call also has an attempt outside the measured window.
export function summarizeOutageCalls(attempts, { startedAtMs, endedAtMs } = {}) {
  assert.ok(Array.isArray(attempts) && attempts.length > 0, 'Outage must record actual RPC attempts');
  assert.ok(Number.isFinite(startedAtMs) && Number.isFinite(endedAtMs) && endedAtMs >= startedAtMs,
    'Both outage window timestamps are required');

  const calls = new Map();
  for (const attempt of attempts) {
    assert.ok(Number.isSafeInteger(attempt.id) && attempt.id > 0, 'RPC call ID is required');
    assert.ok(typeof attempt.method === 'string' && attempt.method.length > 0, 'RPC method is required');
    assert.ok(Array.isArray(attempt.params), 'RPC params are required');
    assert.ok(Number.isFinite(attempt.monotonicMs), 'RPC attempt time is required');
    assert.ok(typeof attempt.offline === 'boolean', 'RPC outage state is required');
    assert.ok(attempt.httpStatus === 200 || attempt.httpStatus === 503, 'Unexpected RPC proxy status');
    if (attempt.offline) assert.equal(attempt.httpStatus, 503, 'Offline RPC attempts must return 503');

    let call = calls.get(attempt.id);
    if (!call) {
      call = { id: attempt.id, method: attempt.method, params: attempt.params, samples: [], completed: false };
      calls.set(attempt.id, call);
    }
    assert.ok(!call.completed, 'Do not reuse a completed RPC call ID; attempts must remain bounded');
    assert.equal(attempt.method, call.method, 'RPC retries must preserve method');
    assert.deepEqual(attempt.params, call.params, 'RPC retries must preserve params');
    assert.ok(attempt.monotonicMs >= (call.samples.at(-1)?.monotonicMs ?? -Infinity),
      'RPC attempts for one call must be ordered');
    assert.ok(call.samples.length < 4, 'RPC attempts must remain bounded');
    call.samples.push(attempt);
    call.completed = attempt.httpStatus === 200 || call.samples.length === 4;
  }

  const logicalCalls = [...calls.values()].filter(call =>
    call.samples.some(sample => sample.offline &&
      sample.monotonicMs >= startedAtMs && sample.monotonicMs <= endedAtMs));
  assert.ok(logicalCalls.length > 0, 'Outage must contain RPC attempts in its measured window');
  return logicalCalls.map(call => {
    const samples = call.samples;
    const outageSamples = samples.filter(sample => sample.offline &&
      sample.monotonicMs >= startedAtMs && sample.monotonicMs <= endedAtMs);
    const count = outageSamples.length;
    const gapsMs = samples.slice(1).map((sample, n) => sample.monotonicMs - samples[n].monotonicMs);
    const clippedAtStart = samples.some(sample => !sample.offline && sample.monotonicMs < startedAtMs);
    const clippedAtEnd = samples.some(sample => !sample.offline && sample.monotonicMs > endedAtMs);
    assert.ok(count >= 1 && count <= 4, `RPC attempt count must remain bounded (call ${call.id}: ${count})`);
    assert.ok(count === 4 || clippedAtStart || clippedAtEnd,
      `A partial outage call needs same-ID evidence outside the outage window (call ${call.id})`);
    assert.ok(gapsMs.every(gap => gap >= 100), 'Default retries must use positive backoff');
    return { id: call.id, method: call.method, attempts: count, gapsMs, clippedAtStart, clippedAtEnd };
  });
}
