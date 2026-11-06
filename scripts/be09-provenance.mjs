import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const sourceFiles = ['scripts/be09-local.sh', 'scripts/be09-seed.mjs', 'scripts/be09-register.mjs',
  'scripts/be09-diagnose.mjs', 'scripts/be09-verify.mjs', 'scripts/be09-live-test.mjs', 'scripts/be09-provenance.mjs'];

export async function sourceProvenance(root, sourceCommit) {
  if (!/^[0-9a-f]{40,64}$/.test(sourceCommit)) throw new Error('Expected a full Git source revision.');
  const sha256 = {};
  for (const file of sourceFiles) sha256[file] = createHash('sha256').update(await readFile(resolve(root, file))).digest('hex');
  return { sourceCommit, sha256 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [root, output, sourceCommit] = process.argv.slice(2);
  if (!root || !output || !sourceCommit || process.argv.length !== 5) throw new Error('Usage: be09-provenance.mjs <root> <output.json> <source-commit>');
  await writeFile(output, JSON.stringify(await sourceProvenance(root, sourceCommit), null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
