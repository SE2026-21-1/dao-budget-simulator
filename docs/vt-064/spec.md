# VT-064 — Specification and AI-assisted plan (pre-code)

Baseline: `1bb182144d516c13d6bb32fc30d2778af71a8169`, branch `personal/23001850-vt-064-bulk-import`. Individual exercise; no upstream merge.

## Problem

An operator needs a repeatable offline bulk import of **draft** BUD spending requests. One malformed record must not discard other valid drafts. Imported drafts are *not* Governor proposals, votes, or Treasury authorizations. The existing read model only contains confirmed chain facts.

## Acceptance criteria

- AC1: A JSON array of 1–1000 draft objects can be imported from a local file; each accepted draft has an ID, lower-case 20-byte EVM recipient, canonical positive uint256 BUD amount (base units), and nonempty description. Result identifies accepted and rejected input indexes with a reason.
- AC2: Invalid draft at any position is rejected independently; valid drafts before and after it persist with exact amount/recipient/description. An empty/invalid-only array never claims a successful persisted draft.
- AC3: A persisted draft is created atomically under a separate destination directory; a duplicate ID must not overwrite an existing draft, and a retry reports the conflict without losing other valid rows.
- AC4: If persistence fails, command exits nonzero with a distinct persistence error and counts only confirmed writes; it must never print a success report for a failed write. Earlier committed drafts remain usable.
- AC5: Import cannot mutate chain-derived proposals, raw events, checkpoints, snapshots or send transactions; existing read API and BE07 ingestion remain unchanged.

## Nonfunctional constraints and invariant

- NFR1: 80 simultaneous independent import tasks, measured wall-clock p95 <= 2.5 s on this workstation; this is a local slice target, not full 80-user API throughput.
- NFR2: bounded input (1 MiB, at most 1000 rows), deterministic error indexes and no network/secret handling. Per-item atomic create (`open` temporary exclusive, sync, hard-link without overwrite), temporary cleanup; distinct IDs allow concurrent imports.
- Core invariant: **every reported `imported` ID corresponds to an atomically persisted draft with the same data; rejected rows never remove or overwrite valid committed drafts.** Chain authority is unchanged.

## Coding-agent plan and review

Prompt supplied to coding agent (module-only context): “In the DAO backend, implement a small runnable offline bulk import of budget-request drafts. Preserve valid rows around invalid rows and never claim success after persistence failure. First plan files and tests; do not touch chain-derived proposal tables or GET API. Consider 80 concurrent tasks and property-generated mixed rows.” Context provided: `indexer/storage.ts:25–61,270–289`, `indexer/api/server.ts:1–10`, `database/migrations/001_initial.sql:102–120`, `tests/indexer/cli.test.ts:1–35`, `package.json:9–45`, `tsconfig.json`; no frontend or other team modules.

Initial agent plan (before repository review): add POST `/api/import` persisting directly into `proposals`; wrap whole array in one SQL transaction; write examples-only unit tests. Revised plan:
1. Reject POST and proposal-table insertion: `indexer/api/server.ts` serves GET snapshots and `proposals` are sourced from canonical `raw_events`/chain publication (`database/migrations/001_initial.sql:102–120`, `indexer/storage.ts:38–61`). An offline draft store in new `indexer/import/drafts.ts` and CLI `indexer/import/cli.ts` avoids inventing chain facts. No change to API/indexer/checkpoint.
2. Reject one all-or-nothing transaction: `indexer/storage.ts:270–289` is *intentionally* atomic for canonical chain batches, but AC2 explicitly requires independent failures for user draft rows. Persist each valid draft atomically in its own file; stop and error on an infrastructure write failure, preserving already committed drafts.
3. Reject examples-only tests: generated seeded mixtures check accepted-set equality, exact bytes, and order independence for unique IDs; negative and failure paths test conflict, path safety and persistence error; CLI smoke checks exit/report. Benchmark 80 independent tasks with distinct temp destinations.

Planned changes: `indexer/import/drafts.ts`, `indexer/import/cli.ts`, `tests/indexer/import.test.ts`, `package.json` scripts, `docs/vt-064/README.md`, report/evidence under `docs/vt-064/`. No external dependency or migration. Assumptions: drafts are local/offline staging, not automatically proposed on-chain; input JSON is trusted only as data, never as a filesystem path; duplicates are rejected, not silently upserted. An API/UI import or conversion from draft to signed proposal needs a separate reviewed change.

Missing-context risk: a module-only view could misread `proposals` as a writable draft store; the chain publication and wallet transaction boundary, only visible when reviewing repository contracts, rules out that tempting plan. Check against the full repository after isolated AI planning; keep this limitation explicit in the submission.
