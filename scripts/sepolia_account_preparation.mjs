// Offline preparation only. Reuse reviewed parsers/loaders; never call a signer.
import { constants } from 'node:fs';
import { access, lstat, mkdir, open, readFile, readdir, statfs } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { Wallet, getAddress, ZeroAddress } from 'ethers';

export const APPROVED_SOURCE = 'e17ef61a8a51518005c38b0808cdc06fe7a68bbf';
export const ROLES = Object.freeze(['A', 'B', 'C', 'D', 'funding', 'deployer', 'caller', 'recipient', 'outsider']);
export const BOOTSTRAP = Object.freeze(['deployer', 'funding', 'A', 'B', 'C', 'D']);
export const DEMO = Object.freeze(['caller', 'recipient', 'outsider']);
export const REVIEWED_MODULES = Object.freeze([
  'governance_sepolia.mjs', 'governance_local.mjs', 'governance_operations.mjs', 'receipt.mjs',
  'deploy_sepolia.mjs', 'check_roles_sepolia.mjs', 'preflight_sepolia.mjs', 'sepolia_cli.mjs',
  'check_sepolia_readonly.mjs', 'smoke_lifecycle.mjs',
]);
const root = fileURLToPath(new URL('../', import.meta.url));
export class PreparationError extends Error {
  constructor(code) { super(code); this.code = code; }
}
function requireSafe(value, code) { if (!value) throw new PreparationError(code); }
export function binding(source, owner) {
  requireSafe(source === APPROVED_SOURCE, 'WRONG_APPROVED_SOURCE');
  requireSafe(typeof owner === 'string' && owner.length > 0 && owner.length <= 128 && owner.trim() === owner
    && !/[\u0000-\u001f\u007f]/u.test(owner), 'INVALID_SIGNER_OWNER');
}

/** No deployment entrypoint is imported. Verify every reviewed module before importing pure exports. */
export async function reviewedImplementation() {
  for (const name of REVIEWED_MODULES) {
    const path = `scripts/${name}`;
    const expected = execFileSync('git', ['show', `${APPROVED_SOURCE}:${path}`], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
    requireSafe(expected.equals(await readFile(join(root, path))), 'REVIEWED_SOURCE_MISMATCH');
  }
  return import('./governance_sepolia.mjs');
}

/** Linux only: reject symlink components, Git checkouts and Windows/shared filesystem mounts. */
async function safeComponents(path) {
  requireSafe(process.platform === 'linux', 'LINUX_REQUIRED');
  requireSafe(isAbsolute(path) && resolve(path) === path && !/^\/mnt\/[a-z](?:\/|$)/i.test(path), 'UNSAFE_PATH');
  let current = parse(path).root;
  for (const component of path.slice(current.length).split('/').filter(Boolean)) {
    current = join(current, component);
    const info = await lstat(current);
    requireSafe(info.isDirectory() && !info.isSymbolicLink(), 'UNSAFE_PATH');
    try { await lstat(join(current, '.git')); throw new PreparationError('OUTPUT_INSIDE_GIT'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  // ext4 (WSL Linux VHD), tmpfs, overlayfs, btrfs, xfs. Do not certify NTFS/DrvFS/9p/NFS/CIFS ACLs.
  const fsType = Number((await statfs(path)).type) >>> 0;
  requireSafe([0xef53, 0x01021994, 0x794c7630, 0x9123683e, 0x58465342].includes(fsType), 'UNSUPPORTED_FILESYSTEM');
}
async function privateDirectory(path) {
  await safeComponents(path);
  const info = await lstat(path);
  requireSafe(info.uid === process.getuid() && (info.mode & 0o7777) === 0o700, 'PRIVATE_DIRECTORY_REQUIRED');
}
async function safeJson(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    requireSafe(info.isFile() && info.nlink === 1 && info.uid === process.getuid()
      && (info.mode & 0o7777) === 0o600 && info.size <= 1024 * 1024, 'PRIVATE_FILE_REQUIRED');
    return JSON.parse(await handle.readFile('utf8'));
  } finally { await handle.close(); }
}
async function writeNew(path, value) {
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`); await handle.sync(); }
  finally { await handle.close(); }
}
async function syncDirectory(path) {
  const handle = await open(path, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}
function sameKeys(object, keys, code) {
  requireSafe(object && typeof object === 'object' && !Array.isArray(object)
    && JSON.stringify(Object.keys(object).sort()) === JSON.stringify([...keys].sort()), code);
}

export async function initialize(directory, source, owner) {
  binding(source, owner);
  requireSafe(isAbsolute(directory) && resolve(directory) === directory, 'UNSAFE_PATH');
  await privateDirectory(dirname(directory));
  await access(dirname(directory), constants.W_OK | constants.X_OK);
  await reviewedImplementation();
  await mkdir(directory, { mode: 0o700 }); // no recursive/no overwrite; never delete an existing set
  await mkdir(join(directory, 'bootstrap'), { mode: 0o700 });
  await mkdir(join(directory, 'demo'), { mode: 0o700 });
  await writeNew(join(directory, 'PREPARATION.json'), { approvedSourceCommit: source, signerOwner: owner });
  await syncDirectory(directory);
  return { status: 'EMPTY_LAYOUT_NO_WALLETS_CREATED', directory };
}

function keystoreAddress(value) {
  requireSafe(value && value.version === 3 && typeof value.address === 'string', 'INVALID_KEYSTORE');
  const crypto = value.crypto ?? value.Crypto;
  requireSafe(crypto?.cipher === 'aes-128-ctr' && typeof crypto.ciphertext === 'string'
    && /^[0-9a-f]{64}$/i.test(crypto.ciphertext) && /^[0-9a-f]{64}$/i.test(crypto.mac)
    && /^[0-9a-f]{32}$/i.test(crypto.cipherparams?.iv), 'INVALID_KEYSTORE');
  const k = crypto.kdfparams;
  // Read compatibility/resource bounds, not a password-strength or KDF-strength certification.
  // This utility does not generate/encrypt keys and has no KDF tuning switch.
  const supportedScrypt = crypto.kdf === 'scrypt' && Number.isSafeInteger(k?.n) && k.n >= 2 && k.n <= 1048576
    && (BigInt(k.n) & BigInt(k.n - 1)) === 0n && Number.isSafeInteger(k.r) && k.r >= 1 && k.r <= 32
    && Number.isSafeInteger(k.p) && k.p >= 1 && k.p <= 16 && k.dklen === 32 && 128 * k.n * k.r <= 512 * 1024 * 1024;
  const supportedPbkdf2 = crypto.kdf === 'pbkdf2' && Number.isSafeInteger(k?.c) && k.c >= 1
    && k.c <= 10000000 && k.prf === 'hmac-sha256' && k.dklen === 32;
  requireSafe(supportedScrypt || supportedPbkdf2, 'UNSUPPORTED_KDF');
  requireSafe(!('privateKey' in value) && !('mnemonic' in value), 'PLAINTEXT_KEY_FORBIDDEN');
  const address = getAddress(`0x${value.address.replace(/^0x/i, '')}`);
  requireSafe(address !== ZeroAddress, 'ZERO_ADDRESS');
  return address;
}
async function inspect(directory, source, owner, exported) {
  binding(source, owner);
  await privateDirectory(directory);
  const expected = ['bootstrap', 'demo', 'PREPARATION.json', ...(exported ? ['accounts.json', 'keystores.json', 'PREPARED.json'] : [])];
  requireSafe(JSON.stringify((await readdir(directory)).sort()) === JSON.stringify(expected.sort()), 'INCOMPLETE_OR_EXISTING_OUTPUT');
  const preparation = await safeJson(join(directory, 'PREPARATION.json'));
  sameKeys(preparation, ['approvedSourceCommit', 'signerOwner'], 'INVALID_PREPARATION');
  requireSafe(preparation.approvedSourceCommit === source && preparation.signerOwner === owner, 'PREPARATION_BINDING_MISMATCH');
  const stores = {}, accounts = {};
  for (const [group, names] of [['bootstrap', BOOTSTRAP], ['demo', DEMO]]) {
    const path = join(directory, group);
    await privateDirectory(path);
    requireSafe(JSON.stringify((await readdir(path)).sort()) === JSON.stringify([...names].sort()), 'KEYSTORE_ROLE_SET_MISMATCH');
    for (const role of names) {
      const path = join(directory, group, role);
      stores[role] = { path, value: await safeJson(path) };
      accounts[role] = keystoreAddress(stores[role].value);
    }
  }
  const map = { format: 'dao-budget-sepolia-accounts-v1', chainId: '11155111', approvedSourceCommit: source, signerOwner: owner, accounts };
  const implementation = await reviewedImplementation();
  implementation.validateRoleMap(map, source);
  return { map, stores, implementation };
}

export async function exportPublic(directory, source, owner) {
  const { map } = await inspect(directory, source, owner, false);
  const config = Object.fromEntries(BOOTSTRAP.map(role => [role, { path: join(directory, 'bootstrap', role), passwordFd: 3 }]));
  await writeNew(join(directory, 'accounts.json'), map);
  await writeNew(join(directory, 'keystores.json'), config);
  await writeNew(join(directory, 'PREPARED.json'), { status: 'EXPORTED_NOT_UNLOCK_VALIDATED', approvedSourceCommit: source });
  await syncDirectory(directory);
  return { status: 'EXPORTED_NOT_UNLOCK_VALIDATED', publicMap: map };
}

export async function validatePrepared(directory, source, owner, passwordFd, demoPasswordFd) {
  requireSafe(Number.isInteger(passwordFd) && passwordFd >= 3 && Number.isInteger(demoPasswordFd)
    && demoPasswordFd >= 3 && demoPasswordFd !== passwordFd, 'TWO_DISTINCT_PASSWORD_FDS_REQUIRED');
  const { map, stores, implementation } = await inspect(directory, source, owner, true);
  const actual = await safeJson(join(directory, 'accounts.json'));
  implementation.validateRoleMap(actual, source);
  requireSafe(isDeepStrictEqual(actual, map), 'PUBLIC_MAP_KEYSTORE_MISMATCH');
  const config = await safeJson(join(directory, 'keystores.json'));
  sameKeys(config, BOOTSTRAP, 'BOOTSTRAP_ROLE_SET_MISMATCH');
  for (const role of BOOTSTRAP) {
    sameKeys(config[role], ['path', 'passwordFd'], 'INVALID_BOOTSTRAP_ENTRY');
    requireSafe(config[role].path === stores[role].path && config[role].passwordFd === 3, 'BOOTSTRAP_MAPPING_MISMATCH');
  }
  const prepared = await safeJson(join(directory, 'PREPARED.json'));
  sameKeys(prepared, ['status', 'approvedSourceCommit'], 'INVALID_PREPARATION');
  requireSafe(prepared.status === 'EXPORTED_NOT_UNLOCK_VALIDATED' && prepared.approvedSourceCommit === source, 'PREPARATION_BINDING_MISMATCH');
  const runtimeConfig = Object.fromEntries(BOOTSTRAP.map(role => [role, { ...config[role], passwordFd }]));
  try {
    // Existing reviewed loader decrypts all six and checks their addresses. Never invoke its returned signer.
    await implementation.keystoreSigners(runtimeConfig, actual.accounts);
  } catch (error) {
    throw new PreparationError(error.message?.includes('keystore does not match approved address')
      || (error.code === 'INVALID_ARGUMENT' && error.argument === 'address'
        && error.shortMessage === 'keystore address/privateKey mismatch')
      ? 'BOOTSTRAP_ADDRESS_MISMATCH' : 'BOOTSTRAP_UNLOCK_FAILED');
  }
  let demoPassword;
  try {
    demoPassword = (await readFile(`/proc/self/fd/${demoPasswordFd}`, 'utf8')).replace(/\r?\n$/, '');
    for (const role of DEMO) {
      const wallet = await Wallet.fromEncryptedJson(JSON.stringify(stores[role].value), demoPassword);
      requireSafe(wallet.address === map.accounts[role], 'DEMO_ADDRESS_MISMATCH');
    }
  } catch { throw new PreparationError('DEMO_UNLOCK_OR_ADDRESS_FAILED'); }
  finally { demoPassword = undefined; }
  return { status: 'OFFLINE_KEYSTORE_COMPATIBILITY_PASS_NOT_AUTHORIZED', approvedSourceCommit: source,
    bootstrapRoles: [...BOOTSTRAP], demoRoles: [...DEMO], accounts: map.accounts,
    notice: 'No network, signing, funding or broadcast. Actual custody/exclusive-use confirmation remains separate.' };
}

export function parseArgs(args, names) {
  requireSafe(args.length === names.length * 2, 'INVALID_OPTIONS');
  const out = {};
  for (let i = 0; i < args.length; i += 2) {
    requireSafe(names.includes(args[i]) && !Object.hasOwn(out, args[i]) && args[i + 1], 'INVALID_OPTIONS');
    out[args[i]] = args[i + 1];
  }
  return out;
}
export function fail(error) {
  console.error(JSON.stringify({ status: 'ACCOUNT_PREPARATION_FAILED', code: error instanceof PreparationError ? error.code : 'VALIDATION_OR_FILESYSTEM_FAILED',
    recovery: 'Preserve existing wallets. Inspect privately; do not overwrite, delete or mix a partial set. No secrets in reports.' }));
  process.exitCode = 1;
}
