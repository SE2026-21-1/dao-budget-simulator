import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('status passes all Node arguments and leaves run files and processes alone', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'be09-status-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const run = join(dir, 'run');
  await mkdir(join(run, 'pids'), { recursive: true });
  const runtime = JSON.stringify({ deploymentName: 'test deployment with spaces' });
  await writeFile(join(run, 'runtime.json'), runtime);
  await writeFile(join(run, 'run-id'), 'test-run\n');
  await writeFile(join(run, 'pids', 'anvil.pid'), `${process.pid}\n`);
  const shim = join(dir, 'mock-fetch.mjs');
  await writeFile(shim, `
    import assert from 'node:assert/strict';
    if (process.argv[1] === '-') {
      assert.deepEqual(process.argv.slice(2), ['http://127.0.0.1:18545', 'http://127.0.0.1:3300',
        'http://127.0.0.1:5173/', 'test deployment with spaces']);
      globalThis.fetch = async (url, options) => {
        const target = new URL(url);
        if (target.port === '18545') {
          assert.equal(JSON.parse(options.body).method, 'eth_chainId');
          return { json: async () => ({ result: '0x7a69' }) };
        }
        if (target.port === '3300') {
          assert.equal(target.pathname, '/api/health');
          assert.equal(target.searchParams.get('chainId'), '31337');
          assert.equal(target.searchParams.get('deploymentId'), 'test deployment with spaces');
          return { status: 200, json: async () => ({ data: { publication: 'ready', indexer: 'synced' } }) };
        }
        assert.equal(target.href, 'http://127.0.0.1:5173/');
        return { status: 200 };
      };
    }
  `);
  const env = { ...process.env, BE09_STATE_ROOT: dir, BE09_RUN_DIR: run,
    NODE_OPTIONS: `--import=${pathToFileURL(shim).href}` };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync('bash', ['scripts/be09-local.sh', 'status'], {
    encoding: 'utf8', env,
  });
  assert.equal(result.status, 1, result.stderr); // The synthetic services are down.
  assert.ifError(result.error);
  assert.match(result.stdout, /RPC chain=31337; API HTTP=200 publication=ready; frontend HTTP=200/, result.stderr);
  assert.doesNotMatch(result.stderr, /undefined|No such file or directory/);
  assert.equal(await readFile(join(run, 'runtime.json'), 'utf8'), runtime);
  assert.equal(await readFile(join(run, 'pids', 'anvil.pid'), 'utf8'), `${process.pid}\n`);
  process.kill(process.pid, 0);
});
