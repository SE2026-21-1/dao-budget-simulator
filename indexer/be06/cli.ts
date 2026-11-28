#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import { IndexerError, publicError } from '../errors.js';
import { HttpRpc } from '../rpc.js';
import { compareDatabases, exportNormalizedDatabase } from './compare.js';
import { loadBe06Manifest } from './manifest.js';
import { rebuildDatabase } from './rebuild.js';

const { Pool } = pg;
const usage = `Usage:
  npm run be06 -- rebuild --manifest <verified-handoff.json> --at <H> [--output <report.json>]
  npm run be06 -- export --manifest <verified-handoff.json> --at <H> --database reference|target --output <normalized.json>
  npm run be06 -- compare --manifest <verified-handoff.json> --at <H> [--json-output <report.json>] [--summary-output <report.md>]

Environment: RPC_URL, BE06_REFERENCE_DATABASE_URL (read-only source), BE06_TARGET_DATABASE_URL (empty for rebuild; rebuilt for export/compare).
K comes from the manifest (default 2). H is mandatory and never replaced with latest.`;

function options(args: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--') || out.has(key)) {
      throw new IndexerError('INVALID_ARGUMENT', usage);
    }
    out.set(key, value);
  }
  return out;
}

function required(values: Map<string, string>, name: string): string {
  const value = values.get(name);
  if (!value) throw new IndexerError('INVALID_ARGUMENT', `Missing ${name}.\n${usage}`);
  return value;
}

function poolFor(value: string | undefined, label: string): pg.Pool {
  if (!value) throw new IndexerError('INVALID_CONFIG', `Set ${label} to the intended PostgreSQL database.`);
  try {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error();
  } catch {
    throw new IndexerError('INVALID_CONFIG', `${label} must be a PostgreSQL URL.`);
  }
  return new Pool({ connectionString: value, max: 2, connectionTimeoutMillis: 10_000 });
}

async function writeNew(path: string, contents: string): Promise<void> {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, contents, { flag: 'wx', mode: 0o600 });
}

function markdown(report: Awaited<ReturnType<typeof compareDatabases>>): string {
  const source = report.reference;
  const rebuilt = report.rebuild;
  const status = report.result === 'equal' ? 'PASS — dữ liệu chuẩn hóa bằng nhau.' : `FAIL — ${report.mismatches.length} mismatch.`;
  const rows = [
    `# BE06 compare tại H=${report.requestedBlock}`,
    '',
    `Kết quả: **${status}**`,
    '',
    `- Hash tham chiếu: ${source?.context.blockHash ?? 'không có'}`,
    `- Hash rebuild: ${rebuilt?.context.blockHash ?? 'không có'}`,
    `- Scope khớp: ${source && rebuilt && JSON.stringify(source.context.scope) === JSON.stringify(rebuilt.context.scope) ? 'yes' : 'no'}`,
    `- Chain cross-check: ${report.chainCrossCheck ? 'PASS (state, proposalVotes/quorum, timelock, clock/linkage, balanceOf)' : 'FAIL/BLOCKED'}`,
    `- Proposals: ${source?.proposals.length ?? 'n/a'} / ${rebuilt?.proposals.length ?? 'n/a'}`,
    `- Votes: ${source?.votes.length ?? 'n/a'} / ${rebuilt?.votes.length ?? 'n/a'}`,
    `- Operations: ${source?.operations.length ?? 'n/a'} / ${rebuilt?.operations.length ?? 'n/a'}`,
    `- Transfers: ${source?.transfers.length ?? 'n/a'} / ${rebuilt?.transfers.length ?? 'n/a'}`,
    `- Disbursements: ${source?.disbursements.length ?? 'n/a'} / ${rebuilt?.disbursements.length ?? 'n/a'}`,
    `- Treasury in/out/balance: ${source?.treasury.totalIn ?? 'n/a'} / ${source?.treasury.totalOut ?? 'n/a'} / ${source?.treasury.balance ?? 'n/a'}`,
    `- Decode warnings retained: ${source?.decodeWarnings.length ?? 'n/a'} / ${rebuilt?.decodeWarnings.length ?? 'n/a'}`,
    '',
    '## Mismatches',
    '',
  ];
  if (!report.mismatches.length) rows.push('None.');
  else for (const item of report.mismatches) rows.push(`- \`${item.path}\`: reference=${JSON.stringify(item.reference)}; rebuild=${JSON.stringify(item.rebuild)}`);
  rows.push('');
  return rows.join('\n');
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  if (args.length === 1 && ['--help','-h'].includes(args[0]!)) {
    process.stdout.write(`${usage}\n`);
    return 0;
  }
  const command = args[0];
  if (!['rebuild','export','compare'].includes(command ?? '')) {
    process.stderr.write(`${usage}\n`);
    return 1;
  }
  const values = options(args.slice(1));
  const manifestPath = required(values, '--manifest');
  const at = required(values, '--at');
  if (!/^(0|[1-9][0-9]*)$/.test(at)) throw new IndexerError('INVALID_ARGUMENT', '--at must be a canonical decimal block number.');
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new IndexerError('INVALID_CONFIG', 'Set RPC_URL to the chain that owns the verified manifest.');
  const manifest = await loadBe06Manifest(manifestPath, rpcUrl, at);
  if (command === 'export') {
    const database = required(values, '--database');
    if (database !== 'reference' && database !== 'target') throw new IndexerError('INVALID_ARGUMENT', '--database must be reference or target.');
    const pool = poolFor(database === 'reference' ? process.env.BE06_REFERENCE_DATABASE_URL : process.env.BE06_TARGET_DATABASE_URL,
      database === 'reference' ? 'BE06_REFERENCE_DATABASE_URL' : 'BE06_TARGET_DATABASE_URL');
    try {
      const dataset = await exportNormalizedDatabase(pool, manifest.config, at);
      await writeNew(required(values, '--output'), `${JSON.stringify(dataset, null, 2)}\n`);
      process.stdout.write(JSON.stringify({ result: 'exported', database, atBlock: at, blockHash: dataset.context.blockHash }) + '\n');
      return 0;
    } finally { await pool.end(); }
  }

  const referencePool = poolFor(process.env.BE06_REFERENCE_DATABASE_URL, 'BE06_REFERENCE_DATABASE_URL');
  const targetPool = poolFor(process.env.BE06_TARGET_DATABASE_URL, 'BE06_TARGET_DATABASE_URL');
  try {
    if (command === 'rebuild') {
      const report = await rebuildDatabase({ manifest, atBlock: at, rpc: new HttpRpc(rpcUrl), referencePool, targetPool,
        onBatch: (batch) => process.stdout.write(JSON.stringify({ type: 'batch_committed', ...batch }) + '\n') });
      const output = values.get('--output');
      if (output) await writeNew(output, `${JSON.stringify(report, null, 2)}\n`);
      process.stdout.write(`${JSON.stringify(report)}\n`);
      return 0;
    }
    const report = await compareDatabases({ referencePool, rebuildPool: targetPool, config: manifest.config,
      atBlock: at, rpc: new HttpRpc(rpcUrl) });
    const jsonPath = values.get('--json-output') ?? `reports/be06-compare-${at}.json`;
    const markdownPath = values.get('--summary-output') ?? `reports/be06-compare-${at}.md`;
    await writeNew(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    await writeNew(markdownPath, markdown(report));
    process.stdout.write(`${JSON.stringify({ result: report.result, requestedBlock: report.requestedBlock,
      mismatches: report.mismatches.length, json: resolve(jsonPath), summary: resolve(markdownPath),
      chainCrossCheck: report.chainCrossCheck })}\n`);
    return report.result === 'equal' ? 0 : 2;
  } finally {
    await Promise.all([referencePool.end(), targetPool.end()]);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = await main(); }
  catch (error) {
    process.stderr.write(`${JSON.stringify({ type: 'error', ...publicError(error) })}\n`);
    process.exitCode = 1;
  }
}
