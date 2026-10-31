# VT-064 personal branch — offline BUD draft import

Node 24.15.0 (`nvm use`), `npm ci` at repository root. No DB, RPC, wallet or secrets required.

```bash
npm run typecheck && npm run build
npm run test:vt064
npm run test:be07
npm run import:drafts -- /absolute/path/drafts.json /absolute/path/new-or-existing-output-dir
node --import tsx scripts/benchmark_vt064.mjs
```

`drafts.json` is a JSON array (1–1000 objects; file <=1 MiB):

```json
[{"id":"q1","recipient":"0x1111111111111111111111111111111111111111","amount":"1000000000000000000","description":"Draft request for 1 BUD"}]
```

`amount` uses BUD base units (18 decimals); duplicate IDs are rejected without replacing existing files. The CLI prints JSON `{status:"completed",imported:[{index,id}],rejected:[{index,reason}]}` on a completed import; a persistence error prints only a failure JSON on stderr, exits 1 and lists committed `{index,id}` plus earlier rejections. The output directory contains `<id>.json` files; this is **offline draft storage**, not a proposal, not a chain event, and never served by the GET API. Do not copy it into PostgreSQL read-model tables; a future reviewed signing/on-chain flow is needed to create proposals. Run tests with disposable directories; never point cleanup scripts at serving data.

Evidence/traceability: `spec.md`, `test-strategy.md`, `red.log`, `review-red.log`, `green.log`, `mutation.log`, `coverage.log`, `load.json`, `report.md` and `AI-usage.md`. Initial red log records absence of the importer; review-red demonstrates a behavior-level accepted-index contract failure; mutation log verifies a false-success regression is detected. Source changes are limited to `indexer/import/`, `tests/indexer/import.test.ts`, `scripts/benchmark_vt064.mjs` and package scripts. No group branch merge.

Rebuild the submission PDF from `report.md` and `AI-usage.md` on Linux with DejaVu Sans available: `python3 -m venv /tmp/vt064-pdf-venv && /tmp/vt064-pdf-venv/bin/pip install reportlab==5.1.0 && /tmp/vt064-pdf-venv/bin/python docs/vt-064/build_pdf.py`; `pdfinfo BT3_23001850_VT-064.pdf` checks total pages. Generated PDF has two main pages plus appendices. Student should review the 308-word first-person reflection and declaration before submitting on Classroom.
