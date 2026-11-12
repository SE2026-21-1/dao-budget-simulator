import { performance } from 'node:perf_hooks';

export function metrics(samples) {
  if (!samples.length) return { count: 0, p95Ms: null, maxMs: null };
  const sorted = [...samples].sort((a, b) => a - b);
  return { count: sorted.length, p95Ms: sorted[Math.ceil(0.95 * sorted.length) - 1], maxMs: sorted.at(-1) };
}

// Finalize retained samples even when a concurrent freshness/client task fails.
// Good HTTP percentiles must not turn a failed freshness campaign into PASS.
export function finalizeLoad(load, cycle, taskFailed = false) {
  load.httpStatuses = {};
  for (const sample of load.rawSamples)
    load.httpStatuses[sample[6] ?? 'transport_error'] = (load.httpStatuses[sample[6] ?? 'transport_error'] ?? 0) + 1;
  const successful = load.rawSamples.filter(sample => sample[7]);
  load.successfulRequests = successful.length;
  load.errorRequests = load.errors.length;
  load.global = metrics(successful.map(sample => sample[5]));
  load.allResponsesIncludingErrors = metrics(load.rawSamples.map(sample => sample[5]));
  load.endpoints = Object.fromEntries([...new Set(cycle)].map(endpoint => [endpoint, {
    ...metrics(successful.filter(sample => sample[2] === endpoint).map(sample => sample[5])),
    errors: load.errors.filter(error => error.endpoint === endpoint).length,
  }]));
  load.successfulRequestsPerSecond = successful.length / (load.elapsedIncludingDrainMs / 1000);
  load.metricScope = taskFailed ? 'diagnostic_failed_http_load' : 'completed_http_load';
  load.status = !taskFailed && load.errorRequests === 0 && load.global.count > 0 && load.global.p95Ms < 1000 &&
    Object.values(load.endpoints).every(endpoint => endpoint.count > 0 && endpoint.p95Ms < 1000) ? 'PASS' : 'FAIL';
}

// Capture every failure as a sample. Timing ends after the entire JSON body;
// semantic validation is outside latency but can still fail acceptance.
export async function measureJson(url, validate, { signal, timeoutMs = 10_000 } = {}) {
  const started = performance.now();
  let status = null, latencyMs;
  try {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.any([
      AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : []),
    ]) });
    status = response.status;
    const body = await response.json();
    latencyMs = performance.now() - started;
    await validate(body, status);
    return { status, latencyMs, ok: true };
  } catch (error) {
    return { status, latencyMs: latencyMs ?? performance.now() - started, ok: false,
      error: error.message, errorName: error.name };
  }
}
