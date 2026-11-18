import { mkdir, readFile, writeFile, symlink, rename, realpath, copyFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { readManifest, requireThat, safeFailure } from './common.mjs';

const [command, root, ...args] = process.argv.slice(2);
async function point(name, target) {
  const temporary = `${root}/.${name}-${randomUUID()}`;
  await symlink(target, temporary);
  try { await rename(temporary, `${root}/${name}`); }
  catch (error) { await unlink(temporary).catch(() => {}); throw error; }
}
try {
  if (command === 'value') {
    const [which, key] = args;
    const manifest = await readManifest(`${root}/${which}/manifest.json`);
    const state = JSON.parse(await readFile(`${root}/${which}/state.json`, 'utf8'));
    const value = ({ sha: manifest.sha, migrationSet: manifest.migrationSet, releaseDir: state.releaseDir, schemaFingerprint: state.schemaFingerprint })[key];
    requireThat(typeof value === 'string' && !/[\r\n]/.test(value), 'Invalid recorded deployment state.');
    console.log(value);
  } else if (command === 'previous') {
    await point('previous', await realpath(`${root}/current`));
  } else if (command === 'activate') {
    const [releaseDir, schemaFingerprint] = args;
    requireThat(/^[a-f0-9]{64}$/.test(schemaFingerprint ?? ''), 'Invalid deployment schema fingerprint.');
    const manifest = await readManifest(`${releaseDir}/manifest.json`);
    const snapshot = `${root}/state/${manifest.sha}-${randomUUID()}`;
    await mkdir(snapshot, { recursive: true, mode: 0o700 });
    await copyFile(`${releaseDir}/manifest.json`, `${snapshot}/manifest.json`);
    await writeFile(`${snapshot}/state.json`, JSON.stringify({ releaseDir: await realpath(releaseDir), schemaFingerprint, activatedAt: new Date().toISOString() }) + '\n', { mode: 0o600 });
    await point('current', snapshot);
  } else requireThat(false, 'Unknown state operation.');
} catch (error) { safeFailure('Release state')(error); }
