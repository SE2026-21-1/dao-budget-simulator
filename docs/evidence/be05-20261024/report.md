# BE05 verification — 2026-10-24

## Scope and provenance

- BE05 branch: `feature/tv2-be05`, based on the unmerged BE04 branch `feature/tv2-be04` at `53638b816d2b327d6a41fd8657566ee3f503b956`.
- PR #23 remains open and is the dependency. The remote BE04 branch still points to that same SHA; no newer BE04 changes were present at verification time.
- Local live run status: **PASS**. The report has the fresh deployment manifest, source hashes, receipts and projection/API observations in [`live.json`](live.json).
- Environment: WSL2 Ubuntu 26.04, regular Linux UID; Node 24.15.0, npm 11.12.1; Forge/Anvil 1.8.5 (`51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f`); Solc 0.8.37, Osaka, optimizer enabled with 200 runs; PostgreSQL 18.4 original Ubuntu package. PostgreSQL and Anvil were fresh, unforked, and bound to loopback. Exact tool versions are in [`toolchain-final.txt`](toolchain-final.txt). No project dependency version was changed.
- Docker, PowerShell and `pwsh` are unavailable. Their wrappers remain **BLOCKED**; direct PostgreSQL and live suites ran against isolated resources created for this verification. See [`wrapper-status.json`](wrapper-status.json).

## Live cross-check

The official BE04 live deployment runner was extended to call the HTTP API after each completed BE04 publication. The fresh run deployed contracts to Anvil, sent governance transactions, ran BE03 sync, BE04 projection and then queried the real HTTP server backed by PostgreSQL. It produced 24 receipts and passed all 10 publication phases/API checks, including Pending/Active/deadline/result/Queued/Ready/Executed, zero `requestId` duplicate, underfunded execute revert, top-up and retry.

At H=`67`, hash `0xe97832b322764ee72481d093d9ce3598d423779e47eddc5c017ff00af12daeee`, SQL and the hash-pinned Treasury `balanceOf(H)` both report `1000000000000000000000`. SQL/API totals are `13000000000000000000000` in, `12000000000000000000000` out and `1000000000000000000000` balance. The HTTP context has the same H/hash/revision as the projection. Health correctly remains `degraded`: BE03 raw decode is incomplete with 16 retained unknown topics and zero decode errors; BE05 does not erase that warning. `lagSeconds` is null because BE03 has no current observed head-time measurement.

## Verification matrix

| Check | Result | Counts / command / evidence |
|---|---|---|
| Fresh install from lockfile | PASS | `npm ci`; no package or lockfile changes; zero vulnerabilities in install output (see workspace run log, not committed as an artifact). |
| Typecheck, build and whitespace validation | PASS | `npm run typecheck`, `npm run build`, `git diff --check`; [`static-checks-final.log`](static-checks-final.log). |
| BE02 unit | PASS | `npm run test:be02`; 64 passed, 0 failed, 0 skipped; [`be02-unit-final.log`](be02-unit-final.log). |
| BE03 unit | PASS | `npm run test:be03`; 22 passed, 0 failed, 0 skipped; [`be03-unit-final.log`](be03-unit-final.log). |
| BE04 unit | PASS | `npm run test:be04`; 27 passed, 0 failed, 0 skipped, including receipt polling; [`be04-unit-final.log`](be04-unit-final.log). |
| BE02 isolated PostgreSQL | PASS | Direct suite on fresh loopback PostgreSQL 18.4; 21 passed, 0 skipped; [`be02-postgres.log`](be02-postgres.log). |
| BE03 isolated PostgreSQL | PASS | Direct suite on fresh loopback PostgreSQL 18.4; 16 passed, 0 skipped; includes atomic recovery/concurrency and redecode regression; [`be03-postgres.log`](be03-postgres.log). |
| BE04 isolated PostgreSQL | PASS | Direct suite on fresh loopback PostgreSQL 18.4; 10 passed, 0 skipped; includes both repaired P2 regressions; [`be04-postgres.log`](be04-postgres.log). |
| BE05 HTTP API + PostgreSQL | PASS | `node --import tsx --test tests/api/server.test.mjs` on a fresh PostgreSQL database; 3 top-level tests passed, 0 skipped. Tests cover all six routes, signed/keyset pagination, 45-row 20/20/5 traversal, pinned pages while publication advances, concurrent publication, invalidation, invalid/unavailable metadata, exact raw descriptions, uint256 and Transfer accounting; [`api-postgres-final.log`](api-postgres-final.log). |
| BE05 database wrapper | BLOCKED | `npm run test:api:db` cannot start its container because Docker is unavailable. The underlying HTTP+PostgreSQL suite above was run directly against isolated PostgreSQL. [`wrapper-api-db.log`](wrapper-api-db.log). |
| BE05 live wrapper | BLOCKED | `npm run test:be05:live` cannot start its containers because Docker is unavailable. The same official deployment/live runner was run directly with fresh Anvil and PostgreSQL; see live result above and [`wrapper-live.log`](wrapper-live.log). |
| PowerShell wrappers | BLOCKED | Neither `powershell` nor `pwsh` is installed. Linux direct equivalents ran where available. |
| Fresh live integration | PASS | `node --import tsx scripts/check_be04_live.mjs --output docs/evidence/be05-20261024/live.json --api`; 10/10 phases, 24 receipts, SQL and contract balance match at H=67; [`live.json`](live.json), [`live-console.log`](live-console.log). |
| Contract build | PASS | `forge build`; existing timestamp/cast/test-environment warnings are preserved in [`forge-build-final.log`](forge-build-final.log); no contract or dependency was modified. |
| Contract ABI compatibility | PASS | `forge test --match-path tests/unit/OperationAbiCompatibility.t.sol`; 2 passed, 0 skipped; [`forge-compat-final.log`](forge-compat-final.log). |
| Fixture / ABI checks | PASS | `node scripts/check_be01.mjs` (123 fixture objects, 45 hash-valid proposals, 20/20/5 pagination) and `python3 scripts/check.py` (SC01); [`fixture-check-final.log`](fixture-check-final.log), [`sc01-check-final.log`](sc01-check-final.log). |
| CI after this BE05 commit | NOT RUN | To run after the draft PR is created; do not interpret the earlier BE04 CI as validation of BE05. |
| Docker / PowerShell wrapper paths | BLOCKED | Environment limitation only; no wrapper result is reported as PASS. |

## Snapshot/API behavior and limits

The first request copies one committed BE04 publication and its proposal, vote, and BUD Transfer rows into immutable `api_read_*` tables in one `REPEATABLE READ` transaction. Signed cursors identify that exact H/hash/revision, scope, filter, limit and keyset. A later publication therefore cannot change an existing cursor's result. Expired, removed or canonical-invalid snapshots return an error; the API never relabels newer rows with an older H. GET requests can write only this serving cache and never modify raw, projection or business tables or call RPC/indexer/projector.

BE05 requires verified deployment contract metadata and typed governance configuration. Its health endpoint reports retained unknown raw events and currently does not probe RPC; `lagSeconds` stays null. Historical cursor availability is bounded by snapshot TTL (default 900 seconds). Production rebuild/compare, reorg rollback/retry and benchmark/NFR08 validation remain BE06, BE07 and BE08 work. The API shape, cursor lifetime and health semantics still need TV3 consumer review.

The Docker-backed wrappers, the post-PR GitHub Actions run, and broader frontend consumer integration are not evidenced as complete here.
