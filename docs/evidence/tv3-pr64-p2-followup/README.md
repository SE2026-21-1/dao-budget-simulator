# PR #64 — P2 reusable observer follow-up

This packet is mock/unit tooling evidence, NOT a new live wallet run. The independently accepted live packet remains bound to commit `08c693ec433e6dd66be2293bdb2e8d07938ab471`, product `e17ef61a8a51518005c38b0808cdc06fe7a68bbf`, and historical observer SHA-256 `2f710068ccdd3dc20e55611fc458240c6169b8afa2c1de94ee8d5b632cebe952`. No historical bytes, inventories, reports, run/source bindings or observer hashes were replaced.

## Source identity and cause

- Reviewed/source-before SHA: `08c693ec433e6dd66be2293bdb2e8d07938ab471`.
- Fixed source identity: SHA-256 of `scripts/qa07_provider_observer.mjs` = `d93cad7afa618a7ad6dfb6ea83c7a8755873e56a47e47f07e611ec7fecd12490`. The publishing commit containing this packet is the new Git source revision; using the content hash here avoids a self-referential commit hash.
- Original `copy()` at line 9 JSON-serialized params at line 33 before `Reflect.apply` at line 39. BigInt prevented the original call. Fulfilled response line 41 and event line 52 also serialized outside isolation. Sink exceptions were silently discarded, including rejected promises.
- Full reviewed paths: request wrapper, synchronous throw/asynchronous rejection, fulfilled response, four event listeners, record/sink, snapshot and `qa07_live_capture.mjs` external append writer. Existing observer and QA07 snapshot tests were read. LSP references was attempted; no `.mjs` language server was available, so imports/callers were located textually. The only runtime caller is the capture harness; it was syntax-checked, not launched against a wallet.

## Fix contract

`record()` evaluates metadata and JSON copying inside its own boundary. A failed attempt produces an explicit `observation-failure` marker, not a fabricated request/result/event. Response/error records reference the attempted request sequence; the in-memory `observation.failures` list records stage, related sequence and failure type. No raw failed payload/error is inspected to construct failure metadata.

`wrapped()` invokes the original exactly once with the original provider receiver and exact args object; no sanitization or retry reaches the provider. Caller results retain identity; provider errors retain identity, code/message/data. Existing synchronous-throw and promise-success behavior is retained. Event payloads and application registration/removal are untouched.

External sink access, synchronous throw and promise rejection are isolated. Sink receives an observation copy, not the authoritative in-memory entry. Unavailable sinks, failed writes and unresolved deliveries make `observation.complete` false. The capture writer now returns its append promise so its observer sink can observe write rejection, while preserving stderr/exit-code reporting.

`observation.complete` describes attempted recording/delivery only; it does NOT prove provider coverage, a no-send interval, external ordering/durable drain ACK, or tamper resistance. Consumers must also inspect installation/wrapping coverage and reconcile external JSONL against the final snapshot. Failure status is retained in memory even if the sink cannot write it; losing the page before retrieving the snapshot can lose this status. No complete no-send evidence may be claimed for an incomplete observation.

## Actual reproduction and verification

All commands, UTC timestamps, raw output and actual exit statuses are in adjacent `.txt` files. Node `v24.15.0`, npm `11.12.1`, Linux/WSL; project scripts used without dependency changes.

| Check | PASS | FAIL | SKIP | Exit |
| --- | ---: | ---: | ---: | ---: |
| Before-fix P2 regression (expected failure) | 0 | 1 | 0 | 1 |
| Observer regressions (20 new + 4 existing) | 24 | 0 | 0 | 0 |
| QA07 snapshot unit tests | 23 | 0 | 0 | 0 |
| Frontend wallet/provider/transactions/governance/API/WalletPanel (7 files) | 66 | 0 | 0 | 0 |
| Frontend lint | — | 0 | — | 0 |
| Root typecheck | — | 0 | — | 0 |
| Frontend production build | — | 0 | — | 0 |
| Capture harness syntax | — | 0 | — | 0 |
| Historical payload checksums | 55 | 0 | 0 | 0 |

Before: `originalProviderCalls=0`, `sameProviderError=false`, BigInt TypeError. After: `originalProviderCalls=1`, `sameProviderError=true`, exact provider-owned refusal. New cases cover BigInt request success/rejection, BigInt/circular/throwing-toJSON results, synchronous/asynchronous provider-owned errors with non-serializable data, throwing/rejecting/missing/getter/one-record sink failures, four provider events and listener removal, inaccessible request metadata, pending/late rejected delivery, and JSON-safe sequence/response behavior. Existing account-switch and coverage tests remain intact.

Lint emitted 8 warnings in unchanged `frontend/src/chain/wallet.tsx`; build emitted the >500 kB chunk warning. No test was weakened/skipped; no live MetaMask, governance campaign, backend repair, deployment or Issue #40 work was performed.

## Retained acceptance and limits

TV4 accepted selected-provider interval seq52–77, 78 contiguous records, same-session extension identity and 94 product hashes. Historical readiness 13/13 and live 42/42 checksums were rechecked, not regenerated. Historical observer identity remains the old hash above, not the fixed tooling hash.

Late legacy providers without announce/init may remain uncovered; no universal legacy coverage is claimed. External asynchronous delivery still has no comprehensive ordering/drain ACK protocol; final snapshot reconciliation remains required. `stillWrapped` alone is not tamper-proof monitoring.

TV2 current-run backend remains accepted only for the reviewed negative-only read path. Historical HTTP 503: **ORIGINAL PACKET/LOGS MISSING IN SEARCHED SCOPE / ROOT CAUSE UNKNOWN**. Group lead/reviewers own disposition. PR #64 remains subject to independent TV4 re-review; Issue #19 remains open/partial. This packet does not close the finding or approve/merge the PR.

`SHA256SUMS.txt` seals the new packet files, excluding itself. Historical inventories are separate and unchanged.
