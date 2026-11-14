# VT-064 — Phan Thanh Dũng / 23001850

Individual BC-03 assignment; SE2026-T16. Offline BUD draft importer, not a Governor proposal/chain event. Submission branch: https://github.com/SE2026-21-1/dao-budget-simulator/tree/personal/23001850-vt064-submission-20261114 . Do not merge before group review. Historical PR31 was already merged09/11; this new branch is separate and unmerged.

## Run

Node **24.15.0**, npm with committed lockfile; no DB/RPC/wallet/secret required for importer. From repository root:

```bash
nvm use
npm ci
npm run test:vt064
npm run test:be07
npm run typecheck
npm run build
node --import tsx scripts/benchmark_vt064.mjs
node --experimental-test-coverage '--test-coverage-include=indexer/import/**' --import tsx --test tests/indexer/import.test.ts tests/indexer/import-encoding.test.ts
```

`test:vt064` runs actual importer/CLI/property tests (21 Node checks including grouped subtests in the recorded run). BE07 is a separately attributed15-test old-behavior regression, not PostgreSQL/whole-system acceptance. Benchmark releases80in-process tasks onto the real temporary filesystem,8warmups,1draft/task, records all80latencies; target nearest-rankp95≤2500ms. No80external-user/HTTP/DB/chain performance claim.

## Import a file

```bash
npm run import:drafts -- /absolute/path/drafts.json /absolute/path/draft-output
```

UTF-8 JSON,1MiB maximum,1–1000rows. Example:

```json
[{"id":"q1","recipient":"0x1111111111111111111111111111111111111111","amount":"1000000000000000000","description":"Draft request for1BUD"}]
```

Amounts are positive canonical uint256 base units. Each valid draft is atomically created as`<id>.json`; duplicate IDs never overwrite. Bad fields reject only their row, preserving valid neighbors. Malformed UTF-8/JSON rejects the complete input before any persistence; leading UTF-8 BOM stays rejected, valid Unicode/replacement character in data is preserved without normalization. Persistence failures return exit1/errorJSON onstderr with confirmed imports/prior rejects; no stdoutsuccess. Earlier files survive, later rows are not claimed. Output is local staging only; do not write drafts into PostgreSQL projections or treat them as signed proposals.

## Evidence / mutation

- Original baseline1bb182144d516c13d6bb32fc30d2778af71a8169; new clean-worktree baseline0328eea8e3f5fca5fb7c5e1f92fa744720e4f43c.
- Actual module-only plan/test-first commit31cd658 → behavioral RED → runtimefix8e6f27a → GREEN; benchmark samples sourceb79beda. See`20261114-results.json` and date-prefixed logs.
- `20261114-module-plan.md` records real delegated prompt/assumptions plus≥2review corrections before runtime patch;`AI-usage.md` distinguishes current and historical AI assistance.
- Deliberate false-success mutant3e6ce68 exists only on local experiment branch, not submission ancestry/remote. `20261114-mutation.patch` is inert evidence, not executable code in submission. To reproduce, create a disposable detached worktree atb79beda, apply the one-line source hunk shown in that file, install dependencies and run:

```bash
node --import tsx --test --test-name-pattern='persistence failure cannot be returned as success' tests/indexer/import.test.ts
```

The mutant must exit1 with Missing expected rejection; unmodified source must exit0. Do not apply mutation to submission/group branch or serving data. Historical logs/patches are immutable original observations, not relabeled as new runs.

## PDF

Required output at repository root:`BT3_23001850_VT-064.pdf`. Main content must be≤8pages; AI log/execution appendices excluded. Report source:`report.md`; links/table/Unicode rendered with DejaVu Sans:

Shortened output14/11: **5 main pages +2 appendix pages =7 pages total**, reflection314words.
`20261114-pdf-short-verification.log` records the new page counts, links and checksum.
Full AI log and raw execution logs remain on GitHub; only the PDF appendices are condensed.

```bash
python3 -m venv /tmp/vt064-pdf
/tmp/vt064-pdf/bin/pip install reportlab==5.1.0
/tmp/vt064-pdf/bin/python docs/vt-064/build_pdf.py
pdfinfo /tmp/vt064-main-only.pdf
pdfinfo BT3_23001850_VT-064.pdf
```

Read the AI-assisted reflection and declaration before personally uploading the singlePDF plus branch link to Classroom. No Classroom upload, peer approval, source merge or testnet acceptance is claimed here.
