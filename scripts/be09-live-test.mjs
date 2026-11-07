import { resolve } from 'node:path';

export function liveTestEnvironment(runtime, parent = process.env) {
  const values = {
    BE05_LIVE_API_URL: runtime.urls?.api,
    BE05_LIVE_CHAIN_ID: runtime.chainId,
    BE05_LIVE_DEPLOYMENT_ID: runtime.deploymentName,
    BE05_LIVE_RPC_URL: runtime.urls?.rpc,
  };
  for (const [name, value] of Object.entries(values)) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${name} in runtime metadata.`);
  }
  return { PATH: parent.PATH, LD_LIBRARY_PATH: parent.LD_LIBRARY_PATH, HOME: parent.HOME, CI: '1', ...values };
}

export function classifyLiveTest(run, json, targetFile) {
  const failure = reason => ({ status: 'FAIL', executed: false, reason });
  if (run.error || run.signal || run.status === null || run.status === undefined) return failure('Vitest did not complete normally.');
  if (!json || typeof json !== 'object') return failure('Vitest JSON result is missing or invalid.');
  const keys = ['numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests'];
  if (!keys.every(key => Number.isSafeInteger(json[key]) && json[key] >= 0) || typeof json.success !== 'boolean' || !Array.isArray(json.testResults))
    return failure('Vitest JSON result has invalid counts or structure.');
  const counts = { total: json.numTotalTests, passed: json.numPassedTests, failed: json.numFailedTests,
    skipped: json.numPendingTests, todo: json.numTodoTests };
  const matches = json.testResults.filter(result => typeof result.name === 'string' && resolve(result.name) === resolve(targetFile));
  if (matches.length !== 1 || !Array.isArray(matches[0].assertionResults)) return { ...failure('Expected live test file is absent or duplicated.'), counts };
  const assertions = matches[0].assertionResults;
  const allowed = new Set(['passed', 'failed', 'pending', 'skipped', 'todo', 'disabled']);
  if (assertions.length !== counts.total || !assertions.every(item => allowed.has(item.status)) ||
      assertions.filter(item => item.status === 'passed').length !== counts.passed ||
      assertions.filter(item => item.status === 'failed').length !== counts.failed ||
      assertions.filter(item => ['pending', 'skipped', 'disabled'].includes(item.status)).length !== counts.skipped ||
      assertions.filter(item => item.status === 'todo').length !== counts.todo)
    return { ...failure('Vitest counts do not match live test assertions.'), counts };
  const executed = counts.passed + counts.failed > 0;
  if (run.status !== 0 || !json.success || counts.failed > 0 || matches[0].status === 'failed')
    return { status: 'FAIL', executed, counts, reason: 'Vitest reported a failure or a nonzero exit.' };
  if (counts.total === 0) return { ...failure('Vitest did not discover the live test.'), counts };
  if (counts.skipped || counts.todo) return { status: 'SKIP', executed, counts, reason: 'At least one live test was skipped or marked todo.' };
  if (counts.passed !== counts.total || matches[0].status !== 'passed')
    return { status: 'FAIL', executed, counts, reason: 'Vitest result is not a complete pass.' };
  return { status: 'PASS', executed: true, counts };
}
