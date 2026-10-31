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

`amount` uses BUD base units (18 decimals); duplicate IDs are rejected without replacing existing files. The CLI prints JSON `{status:"completed",imported:[...],rejected:[{index,reason}]}` on a completed import; a persistence error prints only a failure JSON on stderr, exits 1 and lists IDs already committed. The output directory contains `<id>.json` files; this is **offline draft storage**, not a proposal, not a chain event, and never served by the GET API. Do not copy it into PostgreSQL read-model tables; a future reviewed signing/on-chain flow is needed to create proposals. Run tests with disposable directories; never point cleanup scripts at serving data.

Evidence/traceability: `spec.md`, `test-strategy.md`, `red.log`, `green.log`, `mutation.log`, `load.json`, `report.md` and `AI-usage.md`. Red log records absence of this importer at baseline; mutation log verifies a behavioral regression is detected. Source changes are limited to `indexer/import/`, `tests/indexer/import.test.ts`, `scripts/benchmark_vt064.mjs` and package scripts. No group branch merge.
