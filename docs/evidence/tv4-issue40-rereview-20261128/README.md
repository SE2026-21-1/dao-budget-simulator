# TV4 independent Issue40 source re-review — 2026-11-28

**TV4 SOURCE REVIEW APPROVED — EXACT DESCENDANT 7526e045753707599e98d08d69f1b64380027291**
**TV4 SOURCE REVIEW ACCEPTED — ISSUE40 RUNTIME HOLD**

[Published disposition](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7240899580) tags TV3 and TV2. F40-1/F40-2 are FIXED at this SHA. Issue remains OPEN; no allocation or runtime permission is granted. Project NOT UPDATED: existing authentication/connector limitation; no settings/token change.

## Provenance and scope

- Approved baseline `e8e443c6986a17c46e9ac4fba41c4fe3fa88eff0`, tree `4e69dbc53de4c8c5a90a0fbeb32d1c423e3adb6c`.
- Prior reviewed child `ba386dd6fa63eb55f2f9cc9e1c79696de5c9df26`, tree `9ef02abba03a1612a9b6ecfd2ac443214df326aa`.
- Current child `7526e045753707599e98d08d69f1b64380027291`, direct parent `dbedc9137ece2634d6439654c482f4fa5fe03d44`, tree `0c2e643f4b73fb72023f9a733973343deb83a40e`.
- Separate clean detached checkout `/tmp/dao-tv4-issue40-fixes-review`; clean tracked state after tests. No reviewer production edit, current Dev substitution, PR64 source import, merge or broad evidence-branch integration.
- Reviewed complete delta: diagnostic implementation, PostgreSQL startup block, both focused test files and CI unit hook. Other original 18 manifest-bound source/test/runbook files are byte-hash unchanged; current 23-path source manifest is recorded separately. [Prior full source audit and reproduced failures](../tv4-issue40-source-review-20261128/README.md) remain historical; do not rerun old bug-asserting reproductions against the fix.
- Root dependency pins/lockfile unchanged. Prepared with `npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/tv4-20261128/issue40-npm-cache` (30 packages, exit0), recursive submodule initialization (5 pinned entries, exit0). Exact pins and actual tool output are in [review.json](review.json).
- Actual reviewer Node24.15.0/npm11.12.1/Bash5.2.21/Foundry1.8.5. No actual PG18.4, Anvil or Windows lifecycle operation.

## Independent checks and an explicitly retained verification limit

| Current-source command group | Tests | PASS | FAIL | SKIP | Exit |
|---|---:|---:|---:|---:|---:|
| Existing 7 tests/be09 files +4 historical executable test files |108|108|0|0|0|
| be09-diagnostic-ownership.test.mjs |11|11|0|0|0|
| be09-postgres-startup.test.mjs |7|7|0|0|0|

These are **126 distinct tests in three nonoverlapping commands**, not 126 plus the extra one-case diagnostic isolation. Actual commands, UTC timestamps, exits and unmodified stdout/stderr are in [focused-regressions.txt](focused-regressions.txt). Each test retains its source assertions, iterations, fixture concurrency and internal timeouts; command grouping changes only cross-file scheduling.

**Initial combined 126 invocation exceeded the wrapper45s deadline.** Its partial stdout was not retained by that capture wrapper; no test count or successful combined conclusion is inferred. The timeout cause is not attributed. The completed split commands above are the independent proof. Do not call the combined command or CI PASS. Exact head had no GitHub Actions run at review time. [review.json](review.json) retains this deadline and the additional one-case isolation without adding it to the total.

`bash -n scripts/be09-local.sh` and `node --check` for diagnostic +2 new tests PASS, exit0; [syntax.txt](syntax.txt). No TypeScript/frontend source delta; no unrelated root/frontend build or accepted full campaign rerun.

## Integrity

| Producer packet | Publishing source used for source hashes | Source | Payload | Inventory SHA256 |
|---|---|---:|---:|---|
| [F40-1](https://github.com/SE2026-21-1/dao-budget-simulator/tree/dbedc9137ece2634d6439654c482f4fa5fe03d44/docs/evidence/tv3-f40-1-20261128) |dbedc9137ece2634d6439654c482f4fa5fe03d44|3/3|11/11|e11636fede91362e65743c39354b21c533252eeecd87edcc7ef9a49f9e39b491|
| [F40-2](https://github.com/SE2026-21-1/dao-budget-simulator/tree/7526e045753707599e98d08d69f1b64380027291/docs/evidence/tv3-f40-2-20261128) |7526e045753707599e98d08d69f1b64380027291|3/3|10/10|2f56e7f3d695d0552f616466144ba4b2a49b4a8e8ad20a19828bebda952f827f|

Actual payload bytes and inventory coverage checked, no missing/extra entry. F40-1 CI hash correctly belongs to dbedc913, not the later hook update at 7526e04. Raw before-fix failures/exit1 and after-fix results are retained, including the separately identified initial F40-1 harness error; no historical result is rewritten.

New independent history check: all **790/790** ba386dd evidence entries retain identical Git blob IDs and modes in dbedc913; all **802/802** dbedc913 entries retain those identities in 7526e04 (813 total current evidence files). This is object-identity verification, **not a new byte reread of the 766 sealed historical files**. The earlier actual766/766 byte comparison and its checksums remain in the immutable [prior reviewer packet](https://github.com/SE2026-21-1/dao-budget-simulator/tree/fc16e6d88366507af4d6016bef42b51a6b82a0fd/docs/evidence/tv4-issue40-source-review-20261128). Three migrated historical executable test sources remain distinct from sealed historical results.

[SOURCE_SHA256SUMS.txt](SOURCE_SHA256SUMS.txt) binds the current23 source paths; verify from exact candidate checkout, not this evidence branch. [SHA256SUMS.txt](SHA256SUMS.txt) seals this reviewer packet only.

## Findings disposition

| Finding | Result and independent proof |
|---|---|
| F40-1 P1: diagnostic requests before API ownership | **FIXED** in be09-diagnose.mjs/main. Exact-run metadata validated before I/O; API ownership before each HTTP and sticky skip after loss. Missing/reclaimed/mismatched API: zero intercepted HTTP requests; owned API without frontend: health+summary retained; loss after health: summary skipped. PG ownership separately checked before connections; invalid DB override cannot redirect. Direct CLI/write-failure/runner failure paths covered. Runner failure remains exit1 with local logs; direct CLI exit0 means report written, not readiness PASS. |
| F40-2 P2: pg_ctl wait failure bypasses identity capture | **FIXED** in be09-local.sh/command_up. Preserve pg_ctl status, attempt existing guarded capture on both paths, return original failure to unchanged EXIT cleanup. Owned Node postmaster shim: automatic guarded SIGINT, capture true, stopped true, no explicit harness recovery; original1/37 retained. Wrong argv/data/missing PID are untouched; pg_ctl0 with wrong identity still fails. No ownership relaxation. |
| Previous RPC/ownership/metadata/canonical-path conditions | Source-bound guards unchanged; current108 caller assertions PASS. No new actionable blocking finding established. Restoration B remains design/source accepted, runtime untested. |

## RPC propagation and retained guards

| Consumer group | Current source disposition |
|---|---|
| Validation / port availability / Anvil bind / readiness | Canonical literal loopback URL, Issue40 RPC28545 only, reject protected/colliding/malformed/explicit-empty input before side effects; ordinary unset-only18545 behavior retained. Child identity and exact owned loopback listener required before readiness. |
| Deploy / role-check / seed / registration | Same canonical RPC URL; required registration --rpc-url and strict flags/URL validation before DB write; role/fromBlock/registration identity assertions preserved. |
| runtime.urls.rpc / runtime.env / RPC_URL / BE05_LIVE_RPC_URL / runtime reports | Same bound URL; source/run allocation and sealed artifact bindings validated. No protected endpoint fallback. |
| worker.env / indexer JSON rpcUrl | Same URL and validated worker configuration; no fresh terminal/global override. |
| frontend.env / VITE_RPC_URL | Same canonical URL, included in exact-run consistency checks. |
| Existing status / verify / live-test / worker restart | Persisted exact-run metadata before corresponding I/O, source/helper/fingerprint/manifest/seed/provenance/config checks; stopped/reclaimed endpoints fail closed. Bounded worker restart grace never bypasses nonworker ownership/source/allocation. |
| Readiness failure diagnostic | Newly validates exact run; each HTTP independently requires API ownership; PostgreSQL ownership is separately guarded and no frontend/full tuple is required just to retain local diagnostics. |

Bind-race guards retain PID, PPID, start ticks, boot ID, executable, exact argv, listener inode/fd ownership and exact loopback checks before RPC/deploy/seed. Current108 exercises failed bind, unrelated same-chain listener, wildcard/wrong loopback, altered identity, reused PID and stopped/reclaimed endpoints without forbidden probes. These checks are **not atomic protection against every check/use race or malicious same-owner tampering**.

Canonical checkout/state/run/PGDATA/socket and PID/bootstrap records remain exact-run bound. Symlink/traversal/cross-run/stale identity/data-directory mismatch fail closed; no kill by port/name or terminal-supplied pg_ctl. Authenticated TERM/KILL and PostgreSQL SIGINT only; partial bootstrap can clean up with sufficient bootstrap ownership without full runtime metadata. Unknown processes remain untouched; old-run cleanup leaves newer API/Vite alone. F40-2 closes the new postmaster-before-identity failure window without relaxing those checks.

## Restoration B and runtime boundary

[Unchanged runbook](https://github.com/SE2026-21-1/dao-budget-simulator/blob/7526e045753707599e98d08d69f1b64380027291/docs/issue40-restoration-b.md): clean exact reviewed Windows checkout/lockfile; actual Node/npm executable/version; private foreground Vite command/env/config hash/cache/logs; owned PID/PPID/start/executable/listener and raw HTTP200 baseline; stop only temporary control to yield5173; explicitly authorized WSL foreground serve; capture actual serve exit and owned cleanup; restore exact temporary control with new process identity/raw HTTP200; stop it and return original Disabled/no-listener baseline.

No shared Scheduled Task enabling, shared launcher/restart-loop, shared transport change, wrapper/tee/down/kill exit substitution, Scheduled Task recovery claim, or wallet/API acceptance claim. Declared Windows Node24.21.0/npm11.19.0 registration is not actual runtime executable/version proof.

Fixtures use real owned high-port60000–64999 listeners/proc identities and owned process signals, intercepted HTTP/DB attempts, and a Node PostgreSQL shim. **No actual PostgreSQL, Windows/WSL lifecycle, receiver#42, candidate/protected port, system5432, shared task or transport operation.** Existing inventory/readiness/BE09 offline acceptance is not reopened; receiver#42 closure is not permission to use its resources.

## Remaining gates / TV3 next action

[TV2 latest handoff](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7240864664) still says same-head independent review pending, not TV2 source approval. TV3 may prepare the missing authorization packet, **not execute lifecycle**:

1. TV2 independent source approval of the same full `7526e045753707599e98d08d69f1b64380027291`; do not substitute old BE09/design approval.
2. Receiver owner confirmation; actual four-port allocation RPC28545/API3300/PG55432/Vite5173; controller ownership; canonical checkout/state/run/PGDATA/socket.
3. Approved temporary Windows control command/env/config/toolchain with actual executable/version evidence; fresh ownership/availability/route evidence; preregistered attempt; explicit execution permission.

Actual allocation **NOT GRANTED**, runtime authorization **NOT GRANTED**, lifecycle **SKIP**, issue **OPEN/HOLD**. No actual runtime run ID/manifest/transcript/termination evidence is created. No Issue20/Sepolia/PR64/MetaMask/503/staging/main/release work in this re-review.
