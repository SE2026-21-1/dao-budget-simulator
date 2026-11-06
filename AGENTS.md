# Repository Guidelines

## Project Overview

Local/testnet DAO budget simulator: GOV holders propose and vote on BUD spending; Governor/Timelock authorize Treasury disbursements. Confirmed chain activity becomes a PostgreSQL read model served to a React UI. This is not a production-funds deployment; local acceptance does not establish testnet or extension-wallet acceptance.

## Architecture & Data Flow

- `contracts/BudgetGovernor.sol` restricts proposals to one Treasury disbursement; OpenZeppelin Governor and Timelock enforce voting/execution. `contracts/Treasury.sol` uses `SPENDER_ROLE`, custom errors, and paid-request tracking to prevent duplicate spending. `GovernanceToken.sol` supplies votes; `BudgetToken.sol` is the spending asset.
- `indexer/cli.ts` loads a verified deployment config; `reader.ts`/`decoder.ts` ingest RPC logs, while `syncer.ts`/`storage.ts` persist deployment-scoped raw logs and confirmed checkpoints. `indexer/recovery.ts` fences reorg publication before canonical ancestor search and replay; `worker.ts` serializes sync → `projection/projector.ts`, which reconciles historical calls at H/hash and atomically publishes the read model. Raw checkpoint, publication, and API snapshot can be at different heights.
- `indexer/api/main.ts` starts the PostgreSQL-backed, read-only HTTP API in `indexer/api/server.ts`; signed cursors pin immutable snapshots. The API neither sends transactions nor drives indexing. `frontend/src/data/api.ts` reads API snapshots; without `VITE_API_BASE_URL`, it reads `fixtures/api/` and disables writes. API failure in live mode must not silently select fixtures. Wallet-signed writes flow through `frontend/src/chain/transactions.ts` directly to contracts; refresh the UI after the indexer publishes the new snapshot.
- BE07 recovery (`database/migrations/005_be07.sql`) invalidates old cursors before rollback; beyond `reorgWindow` (default 128) use the isolated rebuild/compare path in `indexer/be06/` (`docs/be06.md`).

## Key Directories

- `contracts/`, `contracts/interfaces/`: Solidity contracts and integration boundary; `shared/abi/` and `frontend/src/abi/` hold consumer ABIs.
- `indexer/`: RPC ingestion, checkpoint/reorg recovery, projection, worker, BE06 rebuild, and `api/`; `database/migrations/` and `database/queries/` define persistence and read models.
- `frontend/src/`: Vite/React routes (`App.tsx`), data access (`data/`), wallet and transactions (`chain/`). `fixtures/`: synthetic integration and offline UI data.
- `tests/`: Solidity unit/integration/attack/invariant tests plus Node indexer/API/smoke tests; `database/tests/` holds SQL checks. `scripts/` contains local deployment, audit, CI and disposable database runners; `docs/` has component runbooks.

## Development Commands

```bash
nvm use                              # .nvmrc: Node 24.15.0
npm ci                               # root backend/indexer dependencies
npm run typecheck && npm run build   # root TypeScript only
npm ci --prefix frontend             # separate frontend lockfile
npm run dev --prefix frontend -- --host 127.0.0.1
npm run lint --prefix frontend && npm run test --prefix frontend && npm run build --prefix frontend
git submodule update --init --recursive
forge build
forge test -vv
forge fmt --check
```

For a migrated PostgreSQL database and verified deployment metadata, export `RPC_URL` and `DATABASE_URL`, copy `indexer/config/example.json` to `indexer/config/local.json`, and replace synthetic addresses/block/ABI versions and deployment ID. Apply `database/migrations/001_initial.sql` through `005_be07.sql` in order; `005` is required for BE07 auto-recovery. Run `npm run indexer -- --config indexer/config/local.json --worker` for continuous sync/projection (`toBlock: "latest"`); `--sync-project` is one catch-up and `--project` replays stored raw data. Use a stable random `API_CURSOR_SECRET` of at least 32 bytes and `npm run api` (default `127.0.0.1:3000`). CLI processes do not auto-load `.env`; see `.env.example`, `frontend/.env.example`, `docs/be07.md`, and `docs/api.md`. For local chain deployment use a fresh, unforked loopback Anvil and `scripts/deploy_local.mjs` followed by `scripts/check_roles.mjs` (`README.md`).

## Code Conventions & Common Patterns

- Solidity is pinned to `0.8.37`, EVM `osaka`; use existing OpenZeppelin extensions, explicit role checks, custom errors and `*.t.sol` tests. Preserve Treasury request-ID uniqueness and proposal calldata/ABI compatibility.
- Root TypeScript uses strict `NodeNext`, ESM imports with `.js` specifiers, async RPC/SQL operations, typed domain errors and JSON CLI reports. Pass RPC/storage or PostgreSQL pools into existing functions/factories instead of introducing global mutable clients; keep related SQL/checkpoint changes transactional. Unknown topics/decode errors are recorded and may produce CLI exit `2`, not falsely reported as complete.
- Frontend uses React hooks/context (`WalletProvider`, `useTransaction`) for account/network and signing state; guard stale async requests and distinguish signing, receipt confirmation, and snapshot refresh. Preserve original proposal payloads and enforce chain/deployment checks before writes. `VITE_*` settings are public browser configuration, never secrets.

## Important Files

`foundry.toml` (Solidity paths/compiler/CI fuzz settings), root and frontend `package.json` (independent commands), `indexer/cli.ts`, `indexer/worker.ts`, `indexer/recovery.ts`, `indexer/projection/projector.ts`, `indexer/api/main.ts`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `scripts/ci.sh`, `README.md`, and `docs/be07.md`.

## Runtime/Tooling Preferences

Use npm with both committed lockfiles, Node **24.15.0**, Foundry **1.8.5** (`forge`, `cast`, `anvil`), and PostgreSQL (tested at **18.4**). Root TypeScript is `~5.9.3`; frontend TypeScript is `~6.0.2`, Vite/Vitest and oxlint. Root has no `npm test` or `npm run lint` umbrella. Never put private keys or RPC secrets in committed files or browser-exposed `VITE_*` variables; do not point disposable database runners or BE06 rebuild at a live API database.

## Testing & QA

Run the affected suite: `forge test --match-path tests/unit/Treasury.t.sol -vv`, `npm run test:be03`, `npm run test:be04`, `npm run test:be07`, or `npm run test --prefix frontend`. Database/live acceptance requires a disposable PostgreSQL/Anvil environment: `npm run test:be07:native` with `BE07_PG_BIN=/absolute/pg18.4/bin`, or `npm run test:tv4:native -- --postgres-bin /absolute/pg18.4/bin --output /tmp/new-tv4-evidence`. Bare `npm run test:api` requires `BE05_TEST_ISOLATED=1` and a disposable `BE05_TEST_DATABASE_URL`. Solidity tests use Foundry `setUp`, `test*`, fuzz and `invariant*`; backend tests use `node:test`/`node:assert/strict` and synthetic RPC fixtures; frontend transaction tests use colocated Vitest `*.test.ts`. `FOUNDRY_PROFILE=ci FOUNDRY_FUZZ_SEED=0x20261021 bash scripts/ci.sh` runs contracts format/build/test and Python ABI/fixture checks. Browser-wallet acceptance is separate; no coverage percentage gate is configured.
