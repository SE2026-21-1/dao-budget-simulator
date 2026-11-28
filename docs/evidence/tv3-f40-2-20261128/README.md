# TV3 — F40-2 partial PostgreSQL startup cleanup

**F40-2 FIX IMPLEMENTED — PENDING TV2/TV4 INDEPENDENT RE-REVIEW**

**Issue40 OPEN / HOLD — RUNTIME SKIP.** This is isolated source-flow/unit evidence, not PostgreSQL or receiver lifecycle acceptance. No actual runtime run ID/manifest, foreground serve or recovery evidence was created.

## Lineage and scope

- Parent: `dbedc9137ece2634d6439654c482f4fa5fe03d44`; tree `0adba3342af64ebb104e83be902478dccb8211b9` (F40-1 implementation already present).
- Existing branch: `tv3/issue40-rpc-isolation-20261128`; local and fetched remote matched parent, initial worktree clean. Approved baseline ancestor remains `e8e443c6986a17c46e9ac4fba41c4fe3fa88eff0`; no Dev/PR64 source import.
- Finding: [TV4 review7240016843, F40-2](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7240016843). A nonzero `pg_ctl -w start` does not imply its postmaster exited. The old bare command under errexit exited before PID/identity capture, so the existing cleanup could not authenticate a legitimately capturable process.
- Only runtime change: `scripts/be09-local.sh`, PostgreSQL startup block within `command_up`. New `tests/be09-postgres-startup.test.mjs`; existing CI focused hook includes it. `SOURCE_SHA256SUMS.txt` binds these3 paths; publishing commit supplies full descendant identity.

## Minimal fix

Save the original `pg_ctl` exit status rather than exiting immediately. On both success and failure, attempt the existing PID-marker write and `capture_identity postgres` using the exact private PGDATA and expected executable. No new ownership mechanism is introduced.

If capture succeeds after a failed start, return the original status; the unchanged real setup EXIT trap and `stop_owned_services` revalidate identity and send the existing guarded PostgreSQL SIGINT. If capture fails, report it, preserve any nonzero startup status and leave unverified processes untouched. A successful pg_ctl result with failed authentication still fails closed with exit1. Failure never reaches listener readiness, createdb/migrations, deployment or later services.

Canonical run/PGDATA, postmaster PID/data-directory line, PID/PPID/start ticks/boot ID/executable/argv checks and signal-time revalidation are unchanged. No terminal pg_ctl stop, bare PID kill, fallback endpoint, ownership relaxation or cleanup redesign. Existing capture retry bounds remain; if a PID file is absent or ownership cannot be proved, no speculative signal is attempted.

## Actual before-fix reproduction

`before-fix.txt` records UTC2026-11-28T14:21:52Z, Node24.15.0/npm11.12.1, parent/tree/source/test hashes, command and raw stdout/stderr:

```sh
node --test --test-name-pattern='F40-2 timeout with capturable' tests/be09-postgres-startup.test.mjs
```

Real bootstrap initialization + verbatim extracted PostgreSQL startup block + actual setup EXIT trap/cleanup, with a timeout pg_ctl shim and directly owned Node postmaster fixture. No socket or DB is created. The fixture writes canonical postmaster.pid; expected postgres executable is a private symlink to that exact Node binary.

Observed: pg_ctl/startup exit1, capture missing, automatic cleanup left fixture alive. Explicit **harness-only** recovery then used real `captureProcess` and guarded SIGINT to prove the survivor was legitimately capturable. This recovery is not credited to old production code. Desired assertion that startup captured identity **actually FAILS**,0PASS/1FAIL/0SKIP, test exit1. No expected FAIL was recorded without execution.

## After-fix verification

All checks below were run after the final source/test edit. Raw commands, UTC, nested shell stdout/stderr, observed process outcomes and actual exit codes are adjacent.

| Check | PASS | FAIL | SKIP | Exit |
| --- | ---: | ---: | ---: | ---: |
| Same reproduction, desired assertions | 1 | 0 | 0 | 0 |
| Full focused Issue40 suite,13 files | 126 | 0 | 0 | 0 |
| Bash runner + new JS syntax | — | 0 | — | 0 |
| `git diff --check` | — | 0 | — | 0 |
| Historical parent evidence bytes | 802 | 0 | 0 | 0 |

126 includes previous119 unchanged tests (including F40-1) and7 new startup cases. No old assertion removed/weakened/skipped. No TypeScript/frontend delta, unrelated compile or full campaign run.

| Startup model | Result |
| --- | --- |
| Timeout exit1, capturable postmaster | Identity captured; actual EXIT cleanup SIGINT; startup remains1; no continuation |
| Timeout exit37, capturable postmaster | Same guarded cleanup; original37 preserved |
| Failure with unrelated argv | No identity/signal; process survives; original37 preserved |
| Failure with mismatched postmaster PGDATA | No identity/signal; process survives; original37 preserved |
| Failure with missing postmaster.pid | No identity/signal; process survives; original37 preserved |
| Success0 with owned postmaster | Identity captured; source-block continuation retained; fixture teardown separate |
| Success0 with unrelated postmaster | Fail closed1; no identity/signal; unverified process survives |

After fixed timeout tests, `explicitHarnessRecovery=false`; the production EXIT cleanup, not test recovery, stops the fixture. Unknown fixture teardown is performed only by its direct creator after survival assertions, not by PID-file lookup.

Focused command (also wired into existing CI unit hook):

```sh
node --test tests/be09-{rpc,registration,runner-allocation,metadata,status-safety,safety,ownership,diagnostic-ownership,postgres-startup}.test.mjs docs/evidence/be09-20261106/{local-status,toolchain-preflight,readiness,live-test-classification}.test.mjs
```

## Fixture limits and integrity

The startup fixture executes the actual checked-out startup/capture block up to, but not including, the subsequent port-readiness check, and installs the actual checked-out setup EXIT trap. Cleanup, bootstrap source validation, process capture and SIGINT are real existing implementations. `pg_ctl` is a model returning0/1/37; the postmaster is Node, not PostgreSQL. No database/socket/network connection, real PG launch, candidate/protected bind/query, Windows/WSL/task/transport action, actual lifecycle or governance/BE06/BE08/BE09 campaign occurred. A successful fixture does not attest real PostgreSQL timing or readiness. Runtime HOLD is unchanged.

Private-state fixture files are explicitly synthetic unit inputs and removed after each test; no fake runtime evidence is published. Signals reach only authenticated/directly created test processes. Snapshot identity/check-use races and same-owner tampering are not claimed eliminated; late/missing/noncanonical metadata or inaccessible executable remain fail closed.

`historical-integrity.txt`: **802/802 parent docs/evidence files unchanged (57,915,307bytes), no exclusions**, including both old sealed packets and all previous reproduction logs. F40-1 diagnostic implementation/test and existing safety helper hashes are unchanged; their regressions pass in the full suite. No old packet/source inventory was regenerated, no PR64 or receiver42 evidence/state touched.

New packet source hashes and payload checksums are separate from historical bindings. Source review/acceptance, actual endpoint allocation, receiver ownership/canonical paths/control configuration, fresh preregistration and explicit runtime execution permission remain required. Please independently review this descendant; neither finding is self-declared reviewer-accepted and no lifecycle PASS is claimed.
