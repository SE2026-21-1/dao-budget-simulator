import assert from 'node:assert/strict';
import { open, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export function options(args, names) {
  assert.equal(args.length, names.length * 2, `Required flags: ${names.join(' ')}`);
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    assert.ok(names.includes(args[index]) && !Object.hasOwn(values, args[index]), 'Unknown/duplicate option');
    assert.ok(args[index + 1], 'Missing option value');
    values[args[index]] = args[index + 1];
  }
  return values;
}

/** Reserve output before any chain writes; atomic fsync journal replacement at every boundary. */
export async function journal(path) {
  const output = resolve(path);
  const initial = await open(output, 'wx', 0o600);
  await initial.close();
  let serial = 0;
  return async value => {
    const temporary = `${output}.${process.pid}.${serial++}.tmp`;
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, output);
    const directory = await open(dirname(output), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  };
}
