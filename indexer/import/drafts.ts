import { randomUUID } from 'node:crypto';
import { link, mkdir, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const UINT256_MAX = (1n << 256n) - 1n;

export interface Draft {
  id: string;
  recipient: string;
  amount: string;
  description: string;
}

export interface ImportReport {
  status: 'completed';
  imported: string[];
  rejected: { index: number; reason: string }[];
}

export class InputError extends Error {
  readonly code = 'INVALID_INPUT';
}

export class ImportFailure extends Error {
  readonly code = 'PERSISTENCE_FAILED';
  constructor(public readonly index: number, public readonly imported: string[], cause: unknown) {
    super('Draft persistence failed; earlier committed drafts remain available.', { cause });
  }
}

class DuplicateDraftError extends Error {}

function validate(value: unknown): { draft?: Draft; reason?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { reason: 'INVALID_RECORD' };
  if (!('id' in value) || typeof value.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value.id))
    return { reason: 'INVALID_ID' };
  if (!('recipient' in value) || typeof value.recipient !== 'string' || !/^0x[0-9a-f]{40}$/.test(value.recipient))
    return { reason: 'INVALID_RECIPIENT' };
  if (!('amount' in value) || typeof value.amount !== 'string' || !/^[1-9][0-9]*$/.test(value.amount)
      || value.amount.length > 78 || BigInt(value.amount) > UINT256_MAX)
    return { reason: 'INVALID_AMOUNT' };
  if (!('description' in value) || typeof value.description !== 'string' || !value.description.trim()
      || value.description.length > 1024)
    return { reason: 'INVALID_DESCRIPTION' };
  return { draft: { id: value.id, recipient: value.recipient, amount: value.amount, description: value.description } };
}

/** The destination must already exist. A hard link publishes a synced file without replacing another ID. */
export async function saveDraft(destination: string, draft: Draft): Promise<void> {
  const target = join(destination, `${draft.id}.json`);
  const temporary = join(destination, `.${draft.id}.${randomUUID()}.tmp`);
  const handle = await open(temporary, 'wx', 0o600);
  try {
    try {
      await handle.writeFile(`${JSON.stringify(draft)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try { await link(temporary, target); }
    catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')
        throw new DuplicateDraftError('Draft ID already exists.');
      throw error;
    }
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

/** Validation errors are independent; storage failures stop the batch and never report success. */
export async function importDrafts(rows: unknown, destination: string,
  save: (directory: string, draft: Draft) => Promise<void> = saveDraft): Promise<ImportReport> {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 1000)
    throw new InputError('Expected a JSON array containing 1 to 1000 drafts.');
  const imported: string[] = [];
  const rejected: ImportReport['rejected'] = [];
  let directoryReady = false;
  for (const [index, input] of rows.entries()) {
    const { draft, reason } = validate(input);
    if (!draft) { rejected.push({ index, reason: reason! }); continue; }
    if (!directoryReady) {
      try { await mkdir(destination, { recursive: true }); }
      catch (error) { throw new ImportFailure(index, imported, error); }
      directoryReady = true;
    }
    try { await save(destination, draft); imported.push(draft.id); }
    catch (error) {
      if (error instanceof DuplicateDraftError) rejected.push({ index, reason: 'DUPLICATE_ID' });
      else throw new ImportFailure(index, imported, error);
    }
  }
  return { status: 'completed', imported, rejected };
}
