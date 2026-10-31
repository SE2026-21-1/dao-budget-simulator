import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ImportFailure, InputError, importDrafts } from './drafts.js';

export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  if (args.length !== 2 || !args[0] || !args[1]) {
    process.stderr.write(`${JSON.stringify({ code: 'INVALID_ARGUMENT', message: 'Usage: npm run import:drafts -- <input.json> <output-directory>' })}\n`);
    return 1;
  }
  try {
    if ((await stat(args[0])).size > 1024 * 1024) throw new InputError('Input must be at most 1 MiB.');
    const bytes = await readFile(args[0]);
    if (bytes.length > 1024 * 1024) throw new InputError('Input must be at most 1 MiB.');
    let rows: unknown;
    try { rows = JSON.parse(bytes.toString('utf8')) as unknown; }
    catch { throw new InputError('Input must contain a JSON array.'); }
    const report = await importDrafts(rows, args[1]);
    process.stdout.write(`${JSON.stringify(report)}\n`);
    return 0;
  } catch (error) {
    const code = error instanceof ImportFailure || error instanceof InputError ? error.code : 'INPUT_READ_FAILED';
    const report = error instanceof ImportFailure ? { code, index: error.index, imported: error.imported } : { code };
    process.stderr.write(`${JSON.stringify(report)}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await main();
