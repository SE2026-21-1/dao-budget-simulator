# TV3 — F40-1 diagnostic ownership fix

**F40-1 FIX IMPLEMENTED — PENDING TV2/TV4 INDEPENDENT RE-REVIEW**

**Issue40 OPEN / HOLD — RUNTIME SKIP. F40-2 remains OPEN and unchanged.** This packet is isolated source/regression evidence, not an actual lifecycle run, allocation or permission. No actual runtime ID/manifest/foreground termination/recovery evidence was created. Synthetic metadata files exist only inside explicitly labelled, removed unit fixtures.

## Reviewed lineage and scope

- Reviewed parent: `ba386dd6fa63eb55f2f9cc9e1c79696de5c9df26`; tree `9ef02abba03a1612a9b6ecfd2ac443214df326aa`.
- Approved baseline ancestor: `e8e443c6986a17c46e9ac4fba41c4fe3fa88eff0`.
- Existing branch/worktree: `tv3/issue40-rpc-isolation-20261128`, `/home/chung2k5/dao-issue40-rpc-isolation-20261128`; local and remote head matched the reviewed parent, initial worktree clean.
- Read [TV4 independent finding7240016843](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7240016843), [TV3 handoff7239660067](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7239660067), current comments, full runner/diagnostic/readiness/ownership paths and the exact-lineage AGENTS guidance. No current-Dev/PR64 source was imported. LSP references was attempted; no `.mjs` language server was available, so callers were located textually.
- Changed source: `scripts/be09-diagnose.mjs` (`main` only; pure `assess` unchanged), new `tests/be09-diagnostic-ownership.test.mjs`, and the existing `.github/workflows/ci.yml` focused unit command. Content hashes are in `SOURCE_SHA256SUMS.txt`; the publishing commit supplies the full descendant SHA without a self-referential SHA here.
- The runner, readiness and ownership helper bytes are identical to the reviewed parent. In particular, F40-2 PostgreSQL startup/identity-capture/cleanup paths were not changed. No production frontend/backend/contracts/schema, lockfiles or toolchain changes.

## Root cause and minimal boundary fix

At parent runner lines310–320, readiness failure led to local-log capture and `owned postgres 55432 && metadata validate`, followed by the real diagnostic CLI. Diagnostic `main` lines77–89 performed health/summary HTTP with no live API ownership check. Valid sealed metadata/URL equality did not establish who currently owned API3300. The readiness helper's correct refusal was bypassed by this separate consumer.

The fix is at the diagnostic boundary, covering both the unchanged runner failure path and direct CLI invocation:

1. Validate canonical exact-run source/allocation/artifact/env/config through existing `validateRun` before diagnostic side effects; do not require `assertRunLive` or frontend ownership.
2. Call existing `assertOwnedProcess({runDir,label:'api',port:3300})` (port derived from the validated API URL) before **each** health/summary fetch. This reuses PID/PPID/start ticks/boot ID/executable/exact argv and socket inode/fd/IPv4-loopback ownership, not a new authentication mechanism.
3. If any API guard fails, mark that and all remaining HTTP diagnostics explicitly skipped; do not fetch again, fallback or signal. A guard valid for health is not reused blindly for summary.
4. Validate private PostgreSQL ownership with the same helper and port55432 before constructing clients and again before each connection. A different `BE09_DIAGNOSTIC_DATABASE_URL` cannot select an unowned database; it produces explicit DB diagnostic SKIP instead. With valid PG but absent API, DB-only diagnostics remain available; with neither, direct CLI writes an offline report without HTTP/DB attempts. The runner already keeps local logs when PG ownership fails and does not invoke the CLI.
5. Preserve read-only database identity/assessment queries, original HTTP response reporting for owned API, and safe client teardown after partial connection failure. `databaseDiagnostic=ATTEMPTED` is not a claim that DB queries or conditions passed. Direct CLI exit0 means a report was written, not that skipped/UNKNOWN conditions or lifecycle passed.

No runner control flow or cleanup was changed. The actual failure branch still returns1 after diagnostics, including diagnostic output errors; copied API/worker logs remain available and no later frontend start is reached.

## Actual before-fix reproduction

`before-fix.txt`: Node24.15.0/npm11.12.1, UTC2026-11-28T14:08:17Z, exact parent/source/test hashes and command:

```sh
node --test --test-name-pattern='F40-1 API identity missing:' tests/be09-diagnostic-ownership.test.mjs
```

This uses real initialize/seal/validate metadata, the verbatim extracted runner failure branch and the real diagnostic CLI. Readiness failure and private PG ownership are simulated; API identity is actually absent. Network/DB interceptors are installed before consumer invocation. Observed **HTTP attempts2, intercepted DB connection attempts2, runner exit1, signal attempts0, unexpected starts0, real network/DB connections0**. Desired assertion HTTP attempts=0 actually failed (`2 !== 0`), **0PASS/1FAIL/0SKIP, exit1**. This is the F40-1 proof, not an inferred failure or a successful source check.

`harness-initial-error.txt` is retained separately: the first harness attempt failed to simulate PG ownership for the standalone safety CLI, so the runner stopped before diagnostics (HTTP0/DB0). Its failed DB-only assertion was a harness error, not F40-1 evidence. The shell PG simulation was corrected before the actual reproduction; no production source was changed until the2HTTP-attempt failure above had been observed. No failed output was deleted or relabelled PASS.

## Actual after-fix checks

All final checks were run after the last source/test edit. Commands, UTC, raw combined test stdout/stderr, nested consumer stdout/stderr and actual exit codes are in adjacent logs.

| Check | PASS | FAIL | SKIP | Exit |
| --- | ---: | ---: | ---: | ---: |
| Same direct reproduction with desired assertion | 1 | 0 | 0 | 0 |
| Issue40 focused suite + F40-1 file (12 files) | 119 | 0 | 0 | 0 |
| Bash runner / changed JS test+helper syntax | — | 0 | — | 0 |
| `git diff --check` | — | 0 | — | 0 |
| Parent historical evidence exact-byte check | 790 | 0 | 0 | 0 |

The119 total includes the existing108 unchanged tests and11 new cases, including nested existing CLI cases. No old assertion was removed, weakened or skipped. Existing `assess` callers/readiness tests pass. No TypeScript/frontend delta: no unrelated compile/frontend/full campaign was run.

Final focused command (also in CI hook):

```sh
node --test tests/be09-{rpc,registration,runner-allocation,metadata,status-safety,safety,ownership,diagnostic-ownership}.test.mjs docs/evidence/be09-20261106/{local-status,toolchain-preflight,readiness,live-test-classification}.test.mjs
```

### F40-1 outcomes

| Scenario | HTTP attempts | Intercepted DB connections | Runner exit |
| --- | ---: | ---: | ---: |
| Parent: missing API identity, simulated owned PG | 2 | 2 | 1 |
| Fixed: missing API identity, simulated owned PG | 0 | 2 | 1 |
| Fixed: API exited and listener reclaimed | 0 | 2 | 1 |
| Fixed: API start-ticks mismatch | 0 | 2 | 1 |
| Fixed: genuinely owned high-port API fixture, no frontend | 2 | 2 | 1 |
| Fixed: neither API nor PG ownership, runner | 0 | 0 | 1 |
| Fixed: neither ownership, direct offline-report CLI | 0 | 0 | N/A |
| Fixed: ownership lost after health, direct CLI | 1 | 2 | N/A |
| Fixed: diagnostic report-write failure, runner | 0 | 2 | 1 |

Direct CLI missing API also produces0HTTP, with2 permitted intercepted DB attempts. An inconsistent DB override produces0DB attempts. All production-consumer signal attempts and unexpected service starts are0. No actual candidate/protected network or database connection occurs.

## Fixture boundaries and limits

The new file exercises the actual failure block, not only `waitOwnedHttp`. It builds real sealed unit metadata and executes real `metadata validate` plus real diagnostic consumer. PG ownership is deliberately simulated (including exact run/port assertions); PostgreSQL is a loader shim, never a real server. Negative cases intercept fetch/DB before every external connection. Owned/reclaimed/mismatched API cases create only test-owned Node listeners in60000–64999, capture real process identities, and use the real existing `/proc` ownership helper. Only the allocated-port argument is mapped3300→fixture high port; persisted production URLs remain3300 and fetch remains intercepted. No candidate3300 bind/query occurs. The positive case asserts real guard success and retained health/summary200 plus read-only DB assessment, rather than disabling all HTTP to pass negative tests.

Fixture listeners are not the production API and their outputs are not API acceptance. Test-owned fixture cleanup signals occur after assertions; the zero signal count describes the diagnostic/runner-under-test, not fixture teardown. No receiver process is touched. No frontend process or identity is created, and tests reject a full-tuple/frontend guard. After health, identity mutation makes summary guard fail, proving no continuation after detected mismatch.

The unchanged runner failure return1 and retained byte-exact copied logs are asserted for every failure-branch case; direct CLI output failure and runner diagnostic-output failure are covered separately. Existing cleanup ownership tests still run; the extracted failure block itself introduces no cleanup or service-start action. Tests do not represent the whole startup pipeline or F40-2 timeout recovery.

This remains snapshot-based local checking, not an atomic PID/socket capability or protection against same-owner tampering. Ownership can change after a successful check; the patch does not claim to eliminate that local check/use window. No new CLI ownership-assertion flag or bypass is provided.

## Historical integrity and re-review

`historical-integrity.txt` compares **790/790** parent `docs/evidence` files (**57,882,497bytes**) against immutable parent Git blobs with no exclusions; previous sealed packet, accepted readiness/historical outputs and prior before/after logs are unchanged. It also proves runner/readiness/safety source hashes unchanged, leaving F40-2 untouched. PR64 and receiver42 evidence/state were not edited or re-reviewed.

Request TV2/TV4 independent review of the publishing full descendant, the diagnostic boundary, actual failure-branch regression and retained ownership behavior. Do not call F40-1 reviewer-accepted yet. **F40-2 remains OPEN**, to be handled separately; no BE08 Dev, Sepolia, MetaMask, Windows task/control/transport, firewall, portproxy or WSL configuration work occurred. Endpoint allocation, approved descendant and explicit runtime authorization remain missing: **Issue40 OPEN / HOLD — RUNTIME SKIP**.

`SOURCE_SHA256SUMS.txt` binds the3 source/test/CI paths outside this packet. `SHA256SUMS.txt` seals11/11 payloads with exact directory coverage, no extra/missing/duplicate paths, and excludes itself (12 total packet files). No old packet inventory was regenerated.
