# QA07 — summary-pinned final reads, 25/11/2026

## Review and disposition

Responds to [TV3 review6053667048](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#pullrequestreview-6053667048), [inline P2 thread4691843432](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#discussion_r4691843432). Code fix **bbe6fa47cc9d9f9c49a60330bc48d910724fb517**, parent **0a5cc5cfda29a92df4ab4498e1cd72cd57023088**, base Dev896f93ea282d76fa72339a97ea12339240c16da4. **23 focused regressions PASS/0FAIL/0SKIP, exit0; isolated real-worker/browser QA07 PASS, exit0.** Ready for TV3 re-review, not reviewer-approved.

TV3 explicitly accepted the earlier context/revision equality correction in review6041875677. The new finding is different: equality after independent latest reads can fail when a normal worker publication advances, even while the summary snapshot is still cached and canonical. The reviewer reproduction is the before-change evidence; it was not rerun merely to confirm the reported failure. Old evidence on16e4a7d/0a5cc5c retains its exact original source/results and does not prove this new pinning fix.

## Actual API contract and fix

`indexer/api/server.ts:467-473,511-541` requires the paired `asOfBlock` and `asOfBlockHash`; cached lookup is also bound to current revision/source scope, canonicality and TTL. `snapshotRevision` is a returned invariant, **not a supported query parameter**. A normal monotonic publication need not invalidate the older materialized snapshot. Reorg/revision invalidation or expiry must retain their actual409/503 failure, not fall back to latest.

`readReconciledSnapshot(get, summaryContext, proposalId)` passes precisely the summary H/hash to both Detail and Transfers, retaining the proposalId filter on Transfers. HTTP200 plus `assertReconciledSnapshot` still enforce chain/deployment/H/hash/revision/timestamp/dataKind; changing sync freshness is not compared. Runner IDs/request/operation, receipt/event, SQL disbursement, amounts/balances, canonical contract reads and recovery/cursor checks remain intact.

`assertRenderedSnapshot` contains the same hash/revision assertions previously inline. The runner still reads the actual two `<code>` elements of `.snapshot-info` before calling it; no frontend product files or displayed app state were changed.

## Regression scope

Command: `node --test tests/smoke/qa07-snapshot.test.mjs` using Node24.15.0. Result **23PASS/0FAIL/0SKIP, exit0**. Existing17 context/revision controls remain; six additions:

- Deterministic API-contract fixture materializes SummaryH52, advances the publication toH53 before Detail andH54 before Transfers. Both pinned responses keep the original summary context.
- Separate negative controls remove only the H/hash pair from Detail or Transfers while retaining other filters. Each selects the newer publication and must be rejected by the actual equality oracle. This checks that omitting either pin cannot silently pass.
- Rendered UI matching hash/revision positive, revision-only mismatch at the same hash negative, and hash-only mismatch at the same revision negative, using the same assertion called by the runner.

These unit fixtures are synthetic oracle tests, **not** a worker/PostgreSQL or MetaMask campaign. No source-text tests, timing sleeps or relaxed assertions were introduced. Existing CI smoke command already includes this test file.

## Real worker interleaving proof

The runner now deliberately mines only empty blocks after capturing the executed UI and original summary. It awaits a **real CLI-worker publication at a higher H** before the two final pinned GETs. No worker pause, direct SQL mutation or fabricated API envelope is used. This proves the supported old-snapshot read in an actual PostgreSQL/API stack, not just the deterministic unit fixture.

```sh
export PATH=/home/ptdung/.nvm/versions/node/v24.15.0/bin:/home/ptdung/.foundry/bin:$PATH
export QA07_PLAYWRIGHT_MODULE=/tmp/tv4-qa07-tools-20261125/node_modules/playwright/index.mjs
export QA07_CHROME_BIN=/usr/bin/google-chrome
node --import tsx scripts/check_qa07_e2e.mjs \
  --postgres-bin /tmp/tv4-qa07-tools-20261125/node_modules/@embedded-postgres/linux-x64/native/bin \
  --output /tmp/tv4-qa07-pin-20261125/runner
```

Executed source in `manifest.sourceCommit`: **bbe6fa47cc9d9f9c49a60330bc48d910724fb517**. Started2026-11-25T07:54:40.678Z; finished07:55:39.661Z. Runtime Node24.15.0/PostgreSQL18.4/Forge+Anvil1.8.5/Chrome157.0.8103.38/Playwright1.56.1. Locked dependencies, unchanged contract artifacts and pinned submodules reused from the prepared isolated checkout; no product/dependency/source-toolchain change. Evidence published afterward is a docs-only commit, not a rerun of that later HEAD.

| Observation | Actual context |
|---|---|
| Summary + rendered UI + pinned Detail/Transfers | H44, hash `0x5d7157544e98ab9816229857ea193e6f6debe49f04667d799b68fafc8d3a9043` |
| New worker publication before final API reads | H46, hash `0x087519cab297fd81037052e318ecbb12048275af3d4883a78106809b3cd796b3` |
| Revision at both publications and all reconciled surfaces | `1b29709b-4677-4004-ba52-1ab898da3999` |
| Chain / deployment name | 31337 / qa07-e2e |

`reconciliation.pin` records the actual H44/hash pair; `latestContextBeforeReads` recordsH46. Detail/Transfers keepH44 while their current sync metadata correctly reports publicationH46/headH48. The screenshot/DOM show the original UIH44/revision before forced advancement; no claim that UI simultaneously displayed latestH46.

Request `0x24f2d3608a62fc9dd213e3acf00d85e08f75b447fadc483786ab72f0d363cfde`; proposal `91216092070794758675590806356839295805269358363299180189798307128332391855752`; operation `0x0e65f658bcd4ea8bc70bd0a8362674b85b97574971704eeaa04fcb3554cf1128`; execute `0xefec17a160f486d1f70d8835bff8e2cc2afa51a48c02b8fce396c92b5e5a9fc6`. SQL still has exactly one11,000BUD disbursement linked to that original H44/hash/execute transaction. Treasury1,000/recipient11,000BUD; paid=true/operationDone=true/GovernorExecuted. Real503 recovery and old-cursor409 assertions remain PASS. BrowserErrors=[], no cleanup/error field; command exit0. Actual `08-executed-reconciled-ui.png` was visually inspected. UI ancillary-topic/degraded warnings remain, not a warning-free pipeline claim.

## Immutable evidence packet and limits

[raw.tgz](raw.tgz), SHA256 **7d73e96bfbe6d5b15aa67598fda7aeea2b443bb54b6104eb5d78ab505d0e3f5f**. Internal SHA256SUMS **59/59 payloads verified** before packaging: exact helper/runner/test bytes, review/thread, regression/runner logs and exit codes, complete report/raw worker+API-stack process logs,20PNG+DOM captures. It does not alter or reconstruct the older H52 extension packet.

Harness SHA256 `bfe0e6e958ad7bda9a7f1c77e1e94a268b3b083ff2fd6355f8d11f4816f0219b`; snapshot helper `319d46807661d098a5b578b9a7de2e685116cc329d2880ed023fc7d8991446b9`. Full runtime/product source hashes and manifest/artifact bindings remain in report.json.

Scope is a real rendered browser with an **owned unlocked Anvil EIP-1193 adapter, NOT MetaMask**, testnet or TV3 receiver acceptance. No #19/#36 governance campaign rerun. No product frontend/backend/contract, BE08, workflow, load/timeout/retry/backoff/K change; TV2 BE08 approval6053195381 and TV1 scoped security approval remain attributed to their reviewed source, with this QA-only delta not widening either approval. #41 local pipeline already accepted7155604461; #19 documentary, #40 lifecycle, #42 new receiver API-only evidence and #20/#44 owner/testnet/group gates remain. No auto-resolution, dismissal, self-approval, merge, promotion, tag, server revival or Sepolia broadcast.
