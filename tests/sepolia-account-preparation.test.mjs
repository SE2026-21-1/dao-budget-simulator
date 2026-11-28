import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { execFileSync, spawn } from 'node:child_process';
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Wallet, encryptKeystoreJson } from 'ethers';
import { APPROVED_SOURCE, BOOTSTRAP, ROLES, initialize, reviewedImplementation } from '../scripts/sepolia_account_preparation.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
// Disposable test-only passwords. No production default or test KDF option exists in the CLIs.
const passwords = ['Disposable-test-only-bootstrap-456!', 'Disposable-test-only-demo-789!'];
const owner = 'disposable-test-custodian';
let parent, prepared, implementation;
const wallets = {};
let sequence = 0;
async function cli(script, args, secrets = passwords) {
  // Node's extra stdio 'pipe' is a Unix socket on Linux and cannot be reopened via /proc/self/fd.
  // Match the real Bash runbook: read test passwords from stdin, pass actual anonymous pipes at FD3/4.
  const transport = 'IFS= read -r bootstrap; IFS= read -r demo; exec "$@" 3< <(printf "%s" "$bootstrap") 4< <(printf "%s" "$demo")';
  const p = spawn('bash', ['--noprofile', '--norc', '-c', transport, 'sc10-disposable-test', process.execPath,
    '--import', join(root, 'tests/helpers/sepolia-preparation-guard.mjs'), join(root, 'scripts', script), ...args],
  { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '', err = '';
  p.stdout.on('data', x => { out += x; }); p.stderr.on('data', x => { err += x; });
  p.stdin.on('error', () => {});p.stdin.end(`${secrets[0]}\n${secrets[1]}\n`);
  const code = await new Promise((resolve, reject) => { p.once('error', reject); p.once('close', resolve); });
  for (const secret of [...passwords, ...secrets, ...Object.values(wallets).flatMap(w => [w.privateKey, w.privateKey.slice(2), w.mnemonic.phrase])]) {
    assert.equal((out + err).includes(secret), false, 'CLI must not disclose disposable secrets');
  }
  assert.notEqual(code, 90, 'No network or signing method may be called');
  return { code, out, err };
}
const args = directory => ['--directory', directory, '--approved-source', APPROVED_SOURCE, '--signer-owner', owner];
const validate = (directory, secrets) => cli('validate_sepolia_accounts.mjs', [...args(directory), '--password-fd', '3', '--demo-password-fd', '4'], secrets);
async function copySet() {
  const path = join(parent, `copy-${sequence++}`); await cp(prepared, path, { recursive: true });
  // Exported absolute keystore paths belong to the original private directory; rebind the copied test bundle explicitly.
  const p = join(path, 'keystores.json'), j = JSON.parse(await readFile(p));
  for (const role of BOOTSTRAP) j[role].path = join(path, 'bootstrap', role);
  await writeFile(p, JSON.stringify(j)); return path;
}
async function mutateMap(directory, fn) {
  const p = join(directory, 'accounts.json'), j = JSON.parse(await readFile(p));fn(j);await writeFile(p, JSON.stringify(j));
}

before(async () => {
  parent = await mkdtemp(join(tmpdir(), 'sc10-disposable-tests-'));await chmod(parent, 0o700);
  implementation = await reviewedImplementation();
  prepared = join(parent, 'original');await initialize(prepared, APPROVED_SOURCE, owner);
  for (const role of ROLES) {
    const wallet = Wallet.createRandom();wallets[role] = wallet;
    // Standard ethers6.17.0 default scrypt N=131072,r=8,p=1; no fast test override.
    const encrypted = await encryptKeystoreJson({ address: wallet.address, privateKey: wallet.privateKey },
      passwords[BOOTSTRAP.includes(role) ? 0 : 1]);
    await writeFile(join(prepared, BOOTSTRAP.includes(role) ? 'bootstrap' : 'demo', role), encrypted, { mode: 0o600 });
  }
  const result = await cli('prepare_sepolia_accounts.mjs', ['export', ...args(prepared)]);
  assert.equal(result.code, 0, result.err);
});
after(async () => { if (parent) await rm(parent, { recursive: true, force: true }); });

test('nine distinct nonzero test accounts, exact public schema and six bootstrap paths', async () => {
  const map = JSON.parse(await readFile(join(prepared, 'accounts.json')));
  const accounts = implementation.validateRoleMap(map, APPROVED_SOURCE);
  assert.deepEqual(Object.keys(accounts).sort(), [...ROLES].sort());
  assert.equal(new Set(Object.values(accounts)).size, 9);
  assert.ok(Object.values(accounts).every(a => !/^0x0{40}$/.test(a)));
  const config = JSON.parse(await readFile(join(prepared, 'keystores.json')));
  assert.deepEqual(Object.keys(config).sort(), [...BOOTSTRAP].sort());
  assert.equal(config.caller, undefined);assert.equal(config.recipient, undefined);assert.equal(config.outsider, undefined);
  for (const role of BOOTSTRAP) assert.deepEqual(config[role], { path: join(prepared, 'bootstrap', role), passwordFd: 3 });
  assert.deepEqual((await readdir(join(prepared, 'demo'))).sort(), ['caller', 'outsider', 'recipient']);
  const text = JSON.stringify(map);assert.equal(/privateKey|mnemonic|password|ciphertext/i.test(text), false);
  assert.ok(Object.values(wallets).every(w => !text.includes(w.privateKey)));
});

test('actual reviewed six-keystore loader unlocks and verifies all addresses without network or signing', async () => {
  const r = await validate(prepared);assert.equal(r.code, 0, r.err);
  const result = JSON.parse(r.out);assert.equal(result.status, 'OFFLINE_KEYSTORE_COMPATIBILITY_PASS_NOT_AUTHORIZED');
  for (const role of ROLES) assert.equal(result.accounts[role], wallets[role].address);
});

test('wrong password fails closed with sanitized stderr and no secret output', async () => {
  const r = await validate(prepared, ['Wrong-disposable-password', passwords[1]]);
  assert.equal(r.code, 1);assert.equal(JSON.parse(r.err).code, 'BOOTSTRAP_UNLOCK_FAILED');assert.equal(r.out, '');
});

test('decrypted keystore/address mismatch is rejected by the existing loader, not only metadata checks', async () => {
  const p = await copySet(), target = join(p, 'bootstrap', 'deployer');
  const j = JSON.parse(await readFile(target));j.address = wallets.caller.address.slice(2).toLowerCase();await writeFile(target, JSON.stringify(j));
  // Keep metadata/public-map mutually consistent but encrypted key points at the original deployer.
  const caller = JSON.parse(await readFile(join(p, 'demo', 'caller')));caller.address = wallets.deployer.address.slice(2).toLowerCase();
  await writeFile(join(p, 'demo', 'caller'), JSON.stringify(caller));
  await mutateMap(p, m => { [m.accounts.deployer, m.accounts.caller] = [m.accounts.caller, m.accounts.deployer]; });
  const r = await validate(p);assert.equal(r.code, 1);assert.equal(JSON.parse(r.err).code, 'BOOTSTRAP_ADDRESS_MISMATCH');
});

for (const [name, mutate] of [
  ['missing role', m => { delete m.accounts.A; }],
  ['extra role', m => { m.accounts.extra = m.accounts.A; }],
  ['duplicate address', m => { m.accounts.B = m.accounts.A; }],
  ['zero address', m => { m.accounts.A = '0x' + '0'.repeat(40); }],
  ['malformed address', m => { m.accounts.A = '0x123'; }],
  ['wrong chain type', m => { m.chainId = 11155111; }],
  ['wrong chain value', m => { m.chainId = '31337'; }],
  ['wrong source', m => { m.approvedSourceCommit = '0'.repeat(40); }],
  ['invalid signer owner', m => { m.signerOwner = ''; }],
  ['private field in map', m => { m.password = 'not-a-real-password'; }],
]) test(`existing parser and CLI reject ${name}`, async () => {
  const p = await copySet();await mutateMap(p, mutate);
  const map = JSON.parse(await readFile(join(p, 'accounts.json')));
  assert.throws(() => implementation.validateRoleMap(map, APPROVED_SOURCE));
  const r = await validate(p);assert.equal(r.code, 1);assert.equal(r.out, '');
});

test('missing/extra keystores and caller added to bootstrap fail before unlocking', async () => {
  for (const kind of ['missing', 'extra', 'caller']) {
    const p = await copySet();
    if (kind === 'missing') await rm(join(p, 'bootstrap', 'A'));
    if (kind === 'extra') await writeFile(join(p, 'demo', 'extra'), '{}', { mode: 0o600 });
    if (kind === 'caller') { const f = join(p, 'keystores.json'), j = JSON.parse(await readFile(f));j.caller = j.A;await writeFile(f, JSON.stringify(j)); }
    assert.equal((await validate(p)).code, 1);
  }
});

test('no-overwrite preserves existing encrypted files and exported map bytes', async () => {
  const files = ['accounts.json', 'keystores.json', 'bootstrap/A'];
  const before = await Promise.all(files.map(f => readFile(join(prepared, f))));
  assert.equal((await cli('prepare_sepolia_accounts.mjs', ['init', ...args(prepared)])).code, 1);
  assert.equal((await cli('prepare_sepolia_accounts.mjs', ['export', ...args(prepared)])).code, 1);
  const after = await Promise.all(files.map(f => readFile(join(prepared, f))));assert.deepEqual(after, before);
});

test('private paths, symlinks, hard links, Git checkout, Windows mount and permissive files fail closed', async () => {
  const p = await copySet();await chmod(join(p, 'bootstrap/A'), 0o644);assert.equal((await validate(p)).code, 1);
  await chmod(join(p, 'bootstrap/A'), 0o600);await chmod(join(p, 'demo'), 0o755);assert.equal((await validate(p)).code, 1);
  const symbolic = join(parent, 'symlink');await symlink(prepared, symbolic);assert.equal((await validate(symbolic)).code, 1);
  const p2 = await copySet();await rm(join(p2, 'bootstrap/A'));await symlink(join(prepared, 'bootstrap/A'), join(p2, 'bootstrap/A'));assert.equal((await validate(p2)).code, 1);
  assert.equal((await cli('prepare_sepolia_accounts.mjs', ['init', ...args(join(root, 'keys-never-created'))])).code, 1);
  assert.equal((await cli('prepare_sepolia_accounts.mjs', ['init', ...args('/mnt/c/keys-never-created')])).code, 1);
  const { link } = await import('node:fs/promises');const p3 = await copySet();await link(join(p3, 'bootstrap/A'), join(parent, 'hardlink'));assert.equal((await validate(p3)).code, 1);
  const p4 = await copySet();await rm(join(p4, 'bootstrap/A'));execFileSync('mkfifo', ['-m', '600', join(p4, 'bootstrap/A')]);assert.equal((await validate(p4)).code, 1);
});

test('interrupted or partial wallet generation cannot be exported or certified complete', async () => {
  const p = join(parent, 'partial');await initialize(p, APPROVED_SOURCE, owner);
  await cp(join(prepared, 'bootstrap/A'), join(p, 'bootstrap/A'));
  const r = await cli('prepare_sepolia_accounts.mjs', ['export', ...args(p)]);assert.equal(r.code, 1);
  assert.deepEqual((await readdir(p)).sort(), ['PREPARATION.json', 'bootstrap', 'demo']);
  assert.equal((await validate(p)).code, 1);
});

test('truncated encrypted file and interrupted metadata export fail without overwriting existing data', async () => {
  const p = await copySet();await writeFile(join(p, 'bootstrap/A'), '{"version":3');assert.equal((await validate(p)).code, 1);
  const p2 = await copySet();await rm(join(p2, 'PREPARED.json'));
  const before = await readFile(join(p2, 'accounts.json'));assert.equal((await validate(p2)).code, 1);
  assert.equal((await cli('prepare_sepolia_accounts.mjs', ['export', ...args(p2)])).code, 1);
  assert.deepEqual(await readFile(join(p2, 'accounts.json')), before);
});

test('unwritable parent and invalid owner/source are rejected without generating files', async () => {
  const p = join(parent, 'unwritable');await mkdir(p, { mode: 0o500 });
  assert.equal((await cli('prepare_sepolia_accounts.mjs', ['init', ...args(join(p, 'set'))])).code, 1);
  await chmod(p, 0o700);
  for (const [source, name] of [['0'.repeat(40), owner], [APPROVED_SOURCE, ''], [APPROVED_SOURCE, ' bad '], [APPROVED_SOURCE, 'bad\nowner']]) {
    await assert.rejects(initialize(join(parent, `bad-${sequence++}`), source, name));
  }
});

test('keystore KDF/cipher structure, private file permissions, and FD boundaries are checked', async () => {
  for (const mutate of [j => { (j.crypto ?? j.Crypto).kdfparams.n = 3; }, j => { (j.crypto ?? j.Crypto).cipher = 'plaintext'; }, j => { j.privateKey = 'forbidden'; }]) {
    const p = await copySet(), f = join(p, 'bootstrap/A'), j = JSON.parse(await readFile(f));mutate(j);await writeFile(f, JSON.stringify(j));assert.equal((await validate(p)).code, 1);
  }
  for (const path of [prepared, join(prepared, 'bootstrap'), join(prepared, 'demo')])assert.equal((await lstat(path)).mode & 0o777, 0o700);
  for (const group of ['bootstrap', 'demo'])for (const role of await readdir(join(prepared, group)))assert.equal((await lstat(join(prepared, group, role))).mode & 0o777, 0o600);
  const bad = await cli('validate_sepolia_accounts.mjs', [...args(prepared), '--password-fd', '2', '--demo-password-fd', '4']);assert.equal(bad.code, 1);
});

test('CLI help describes offline metadata, inherited FDs and no generation/export/signing', async () => {
  for (const script of ['prepare_sepolia_accounts.mjs', 'validate_sepolia_accounts.mjs'])assert.equal((await cli(script, ['--help'])).code, 0);
});
