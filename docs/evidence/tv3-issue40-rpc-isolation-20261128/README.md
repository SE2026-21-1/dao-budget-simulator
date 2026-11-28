# TV3 Issue40 RPC isolation patch — source/unit evidence

**ISSUE40 OPEN / HOLD — RUNTIME SKIP.** This packet documents implementation and isolated tests, not an actual lifecycle attempt. No runtime run ID, manifest, serve transcript, actual lifecycle termination or Windows-control recovery is claimed or synthesized.

## Source and permissions

- Approved BE09 baseline: `e8e443c6986a17c46e9ac4fba41c4fe3fa88eff0`; tree `4e69dbc53de4c8c5a90a0fbeb32d1c423e3adb6c`.
- Branch/worktree: `tv3/issue40-rpc-isolation-20261128`, `/home/chung2k5/dao-issue40-rpc-isolation-20261128`, created from that exact baseline. Initial status was clean. Baseline ancestry check against fetched Dev returned1 (not an ancestor); integrated Dev `e17ef61a8a51518005c38b0808cdc06fe7a68bbf` is a separate source line.
- Candidate descendant source identity: `SOURCE_SHA256SUMS.txt` binds every changed source/test/CI/runbook file. The publishing commit containing this packet supplies its full Git revision without a self-referential SHA in this README. It is NOT the approved baseline or an approved descendant yet.
- TV2 [7238386171](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7238386171) and TV4 [7238797366](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7238797366) grant conditional design/implementation permission only. Descendant approval, allocation, receiver confirmation and runtime permission remain separate missing gates.
- Personal checkouts, staged/unstaged/untracked work, PR64 and #42 state/services were not modified by this patch. Historical result bytes were not rewritten; three executable historical test sources were migrated, not their sealed results.

## Findings and fixes

| Finding | Implementation and regression |
| --- | --- |
| P1: bind-check/Anvil bind race could accept unrelated chain31337 | Exclusive process identity captures PID/PPID/start ticks/boot ID/executable/exact argv and run marker; `/proc` socket-inode/PID-fd gate requires owned IPv4 127.0.0.1 listener before readiness and before deploy/role/seed. Dead child, bind failure, wildcard/foreign/wrong-loopback listener refuse without request, deployment or seed. No fallback or foreign-process kill. |
| P1: stale/cross-run/default metadata used by status/verify/restart | Bootstrap pins canonical root/run/PGDATA/source/tree/scope/tuple, source hashes and working-source fingerprint. Exact-run artifact seal binds runtime/env/config/manifest/seed/provenance. Strict consistency precedes live tests, DB/network access and worker restart. Existing shell overrides/global RPC do not select endpoints. A stopped run never probes reclaimed endpoints. |
| P1: string-only roots and marker-only cleanup | Canonical component walks reject symlinks/traversal/out-of-root/cross-run state. PID identity and postmaster PID/PGDATA are validated immediately before signals. Cleanup requires bootstrap source identity but not completed registration, retaining safe partial-bootstrap cleanup. PostgreSQL gets guarded fast-shutdown SIGINT; no terminal-supplied pg_ctl can redirect shutdown. |
| P2: executable registration caller compatibility | Migrated `docs/evidence/be09-20261106/readiness.test.mjs` required CLI flag, preserving all DB/role/fromBlock assertions and adding every output URL assertion. Sole production runner caller passes the same required URL. |
| P2: injected wallet may retain old chain31337 configuration | No production wallet change. Wallet/provider excluded from narrow future lifecycle; Windows control/HTTP client config must be approved separately. No wallet acceptance claim. |

The original bounded worker-restart grace remains only when source/allocation and every nonworker listener remain authenticated. Restart snapshots/config/env are revalidated before signal/spawn; source/foreign-RPC failure gets no grace. None of these records is a tamper-proof security boundary against the same OS owner; local check/use races are narrowed, not an atomic kernel network lock.

## RPC propagation matrix

One new-run `RPC_URL` is derived from validated `BE09_RPC_PORT` exactly once. Only unset defaults18545 for ordinary runs; empty/whitespace/sign/nondecimal/out-of-range/collision fails before bind/mkdir/init/spawn. Raw input is bounded64 characters and significant digits5 before numeric conversion; leading zeros normalize. Issue40 scope and private-root prefix require28545; candidate configuration is not allocation permission.

| Consumer | Source of RPC |
| --- | --- |
| Availability check / Anvil bind | Canonical URL port / validated RPC_PORT |
| Readiness / deploy / role / seed | Same RPC_URL, authenticated child/listener gate |
| Registration CLI/report | Required canonical numeric-loopback `--rpc-url`; report rpcUrl |
| runtime.json | runtime.urls.rpc |
| runtime.env | RPC_URL and BE05_LIVE_RPC_URL |
| worker.env / indexer JSON | RPC_URL / rpcUrl; both must match persisted runtime |
| frontend.env | VITE_RPC_URL |
| Up report | Actual canonical RPC_URL |
| Existing status / verify / restart | Validated exact-run persisted URL; never default/terminal/global override |

Fixed candidate API3300/PG55432/Vite5173 are validated across metadata/env. Protected RPC18545/API13300/PG55442 cannot enter Issue40 allocation. No API handler, database schema, contract or production frontend file changed.

## Before-fix evidence (actual expected failures)

- `before-status.txt`: exact baseline source/tree, Node24.15.0/npm11.12.1, UTC and command. Two regressions FAIL exit1: both unset and18545 new-shell overrides still made mocked requests to18545/3300/5173 from a stopped/malformed run. Global fetch was replaced before invocation; no protected network request occurred.
- `before-bind-race.txt`: original baseline `wait_rpc` returned0 and chain31337 ready after candidate child bind failed exit1. Unrelated fixture listener was32981, actual HTTP requests0; mock fetch saw its URL. Desired-refusal assertion FAIL exit1. Raw fixture source is preserved as non-executable `before-bind-race-reproduction.txt` (original invocation `node /tmp/tv3-40-before-rpc.mjs`); this is forensic source, not a suggested future runtime command. Temporary executable scripts were removed.
- `before-registration{,-metadata}.txt`: exact baseline source hash and actual command; proposed explicit-URL propagation regression FAIL exit1 because old CLI required8 argv values and rejected10. No DB service was contacted; a PostgreSQL loader shim recorded interactions.

## After-fix verification

Node24.15.0/npm11.12.1; actual external Bash/Foundry/PostgreSQL version output in `toolchain.txt`. Dependencies installed from this baseline lockfile using `npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/tv3-issue40-npm-cache` (exit0), not borrowed node_modules/runners.

| Check | PASS | FAIL | SKIP | Actual exit |
| --- | ---: | ---: | ---: | ---: |
| Final focused tests,11 files | 108 | 0 | 0 | 0 |
| Final bash/node syntax checks | — | 0 | — | 0 |
| Root `npm run typecheck` | — | 0 | — | 0 |
| Root `npm run build` | — | 0 | — | 0 |

`focused-tests-publication.txt`, `syntax-publication.txt`, `root-typecheck-publication.txt` and `root-build-publication.txt` are after the final code edit. Earlier104/104 and107/107 outputs are retained separately; three cases preserve safe restart grace, and the final case refuses protected/inconsistent DB URLs before registration connection. Issue40 registration requires the exact private55432 DB URL; PostgreSQL loader shims intercept all fixture DB interactions, so no real candidate/protected DB was contacted. No failed final check or skipped regression was hidden. Final tests include nested CLI cases;108 is Node's total tests count including those cases, not108 top-level scenarios.

Exact command (also raw in logs and wired into the existing CI unit step):

```sh
node --test tests/be09-{rpc,registration,runner-allocation,metadata,status-safety,safety,ownership}.test.mjs docs/evidence/be09-20261106/{local-status,toolchain-preflight,readiness,live-test-classification}.test.mjs
```

Fixtures use only private temporary directories and owned child processes. Final listener fixtures bind in60000–64999, excluding all protected/candidate endpoints before bind; negative status/probe cases use mocked fetch. Valid persisted-URL probe unit tests inject a guard and fetcher, not real allocation/listeners; their success is not live ownership proof. A stopped verify fixture is rejected before live-test spawn, DB or report writes; no full verify campaign ran. Existing ownership assertions remain: old-run down cannot kill newer API/Vite, own-run down terminates only its authenticated processes.

No lifecycle, real candidate/protected bind/probe, live MetaMask, governance/BE06/BE08/BE09 campaign, Windows control/toolchain/task/transport modification or deployment was performed. Frontend lint/build was not rerun: no production frontend/TypeScript/build configuration changed. Root compile and targeted tooling checks cover this diff. LSP references was attempted; no `.mjs` language server was available.

## Review surface

- Modified runtime tooling: `scripts/be09-local.sh`, `be09-register.mjs`, `be09-verify.mjs`, `be09-provenance.mjs`.
- New helpers: `scripts/be09-rpc.mjs`, `be09-safety.mjs`, `be09-metadata.mjs`, `be09-readiness.mjs`.
- New tests: `tests/be09-{rpc,registration,runner-allocation,metadata,status-safety,safety}.test.mjs`; migrated existing `tests/be09-ownership.test.mjs` and historical executable tests `local-status`, `readiness`, `toolchain-preflight`.
- Existing CI step includes the focused tests; no workflow dispatch/full campaign was requested.
- [Restoration B runbook](../../issue40-restoration-b.md): exact command form and fourteen future steps. Actual Windows executable/version proof and literal control values must be supplied/approved before runtime, not invented in this source packet.

## Remaining gates / PR64 separation

TV2 backend/source and TV4 independent safety/source reviews of full descendant; receiver owner confirmation of allocation/controller/canonical checkout+state+PGDATA+socket/control; approved Windows control source/toolchain/config; fresh ownership/availability/route evidence; preregistration; explicit execution permission. Remain **ISSUE40 OPEN / HOLD — RUNTIME SKIP** until all are granted. Legacy metadata lacking the new identity/seal cannot be treated as trustworthy live state; artifacts stay retained, no inference/migration-by-default.

PR64 remains a separate checkout/head `a9539786467f4246472f728b841622ba925738d2`. Both exact-head workflows46145093559 and46145093593 completed SUCCESS. During final publication TV4 independently **APPROVED** exact a953978 at2026-11-28T12:55:04Z, [review6097871067](https://github.com/SE2026-21-1/dao-budget-simulator/pull/64#pullrequestreview-6097871067); GitHub reviewDecision=APPROVED, PR still OPEN/unmerged when observed. Approval supersedes the old changes request in the reviewed scope, not runtime permission for Issue40. No further PR64 source/evidence edits, merge, accepted MetaMask rerun or historical503 disposition claim. Historical503 stays MISSING/UNKNOWN.

The packet inventory `SHA256SUMS.txt` excludes itself. `SOURCE_SHA256SUMS.txt` binds files outside this packet and is itself included in the packet inventory. Hygiene/historical byte verification is recorded separately; raw outputs retain original whitespace.
