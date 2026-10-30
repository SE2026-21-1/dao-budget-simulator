import { performance } from 'node:perf_hooks';

export function metrics(samples) {
  if (!samples.length) return { count: 0, p95Ms: null, maxMs: null };
  const sorted = [...samples].sort((a, b) => a - b);
  return { count: sorted.length, p95Ms: sorted[Math.ceil(0.95 * sorted.length) - 1], maxMs: sorted.at(-1) };
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
