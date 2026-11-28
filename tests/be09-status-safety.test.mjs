import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, chmod, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Every fetch is replaced before invocation: no candidate/protected endpoint is contacted.
for (const override of [undefined, '18545']) {
  test(`status refuses incomplete/stopped run before any network, terminal override=${override}`, async t => {
    const state = await mkdtemp(join(tmpdir(), 'be09-status-guard-'));
    t.after(() => rm(state, { recursive: true, force: true }));
    const run = join(state, 'runs/stopped');
    await mkdir(join(run, 'pids'), { recursive: true });
    await writeFile(join(run, 'run-id'), 'stopped\n');
    await writeFile(join(run, 'runtime.json'), JSON.stringify({ deploymentName: 'test', sourceCommit: 'not-the-source', urls: { rpc: 'http://127.0.0.1:28545' } }));
    await writeFile(join(state, 'pg_ctl'), '#!/bin/sh\nexit 1\n');
    await chmod(join(state, 'pg_ctl'), 0o700);
    const requests = join(state, 'requests.jsonl');
    const shim = join(state, 'fetch.mjs');
    await writeFile(shim, `import {appendFileSync} from 'node:fs'; globalThis.fetch = async url => { appendFileSync(${JSON.stringify(requests)}, JSON.stringify(String(url))+'\\n'); return {status:200,json:async()=>({result:'0x7a69',data:{publication:'ready',indexer:'synced'}})}; };`);
    const env = { ...process.env, BE09_NODE_DIR: dirname(process.execPath), BE09_PG_DIR: state, BE09_STATE_ROOT: state, BE09_RUN_DIR: run, NODE_OPTIONS: `--import=${pathToFileURL(shim).href}`, RPC_URL: 'http://127.0.0.1:18545' };
    delete env.NODE_TEST_CONTEXT;
    if (override === undefined) delete env.BE09_RPC_PORT; else env.BE09_RPC_PORT = override;
    const result = spawnSync('bash', [join(root, 'scripts/be09-local.sh'), 'status'], { env, cwd: root, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 1, result.stderr);
    const observed = await readFile(requests, 'utf8').catch(() => '');
    console.log(JSON.stringify({ terminalOverride: override ?? 'unset', status: result.status, requests: observed.trim().split('\n').filter(Boolean) }));
    await assert.rejects(access(requests), { code: 'ENOENT' }, 'stopped/malformed metadata must not cause any request');
  });
}
