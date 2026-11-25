# QA07 snapshot revision P2 — TV4, 25/11/2026

## Disposition

Fix `16e4a7d32c48cd3b8f3de242a23dbe564bca59d2` responds to [TV3 review6041875677](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#pullrequestreview-6041875677). **17 regression PASS / 0 FAIL / 0 SKIP, exit0; isolated QA07 browser runner PASS, exit0.** Reviewer acceptance remains pending. This is a new run, not replacement evidence for historical H52, #19, #36 or receiver acceptance.

## Cause and actual contract

Prior PR60 `59426fb50607583b1bec77ec9d998a8fd0410cf5` compared chain/deployment/H/hash but not revision. Revisions can invalidate a snapshot without changing H/hash. The server derives `context.snapshotRevision` from the published checkpoint revision and requires it to equal the deployment revision (`indexer/api/server.ts`, `loadScope`); materialized snapshots/cursors bind revision too. A current summary, detail and transfers used for final reconciliation must share that publication identity. Timestamp and dataKind also describe the publication; `sync` describes current freshness and may legitimately move between reads.

`assertReconciledSnapshot` now compares chainId, deploymentId, asOfBlock, asOfBlockHash, snapshotRevision, asOfTimestamp and dataKind. It rejects a missing/empty summary revision, rather than allowing equally absent fields to compare equal. Existing proposal/request/operation IDs, SQL disbursement, amounts, canonical contract reads, transaction receipts and lifecycle assertions remain in the runner.

Frontend really renders revision: `SnapshotInfo.tsx` emits Hash and Revision in two code elements; `ProposalDetailPage.tsx` uses the verified action context. Runner reads those actual DOM elements, compares revision/hash to summary, captures screenshot/DOM and saves `reconciliation.uiSnapshot`. No product frontend change, page-state fabrication or API-envelope injection was used.

## Before and after

- Before editing, a throwaway Node24 script read the exact original runner and executed its final reconciliation loop using `node:vm` with genuine-shaped contexts. Changing **only detail revision1→2**, then **only transfers revision1→2**, at the same chain31337/deploymentqa07-e2e/H52/hash produced no rejection. Both `ACCEPTED_MISMATCH_BUG_REPRODUCED` results and original runner bytes are in the packet. This is synthetic oracle reproduction, not historical H52 execution.
- After: `node --test tests/smoke/qa07-snapshot.test.mjs`, exit0, 17 PASS/0 FAIL/0 SKIP. Two revision mismatch negatives preserve all other fields; same-revision positive accepts changing sync freshness. Separate negatives retain chain/deployment/H/hash/timestamp/dataKind protection; incomplete revisions cannot reconcile. CI's existing smoke command includes this file.
- No full governance/MetaMask campaign was rerun. Only the isolated QA07 runner requested in the review executed its existing local lifecycle.

## Isolated runner

Source recorded by `manifest.sourceCommit`: **16e4a7d32c48cd3b8f3de242a23dbe564bca59d2**. Product and tooling both use the clean PR60 worktree. Two concurrently prepared evidence Markdown files were untracked during execution; they are not product inputs and were not relabeled as part of the executed commit. Root/frontend locked dependency installations were reused by symlink; recursive submodules initialized at their pinned revisions; `forge build` succeeded with existing compiler/lint warnings. No runtime dependency manifest/lockfile was changed.

```sh
export PATH=/home/ptdung/.nvm/versions/node/v24.15.0/bin:/home/ptdung/.foundry/bin:$PATH
export QA07_PLAYWRIGHT_MODULE=/tmp/tv4-qa07-tools-20261125/node_modules/playwright/index.mjs
export QA07_CHROME_BIN=/usr/bin/google-chrome
node --import tsx scripts/check_qa07_e2e.mjs \
  --postgres-bin /tmp/tv4-qa07-tools-20261125/node_modules/@embedded-postgres/linux-x64/native/bin \
  --output /tmp/tv4-qa07-p2-evidence-20261125/runner
```

External QA packages: Playwright1.56.1 and `@embedded-postgres/linux-x64@18.4.0-beta.17` (binary PostgreSQL18.4). An initial attempted package version18.4.0 did not exist; installation was corrected from the package registry version list before execution, not by changing any assertion.

Observed runtime: Node24.15.0, PostgreSQL18.4, Forge/Anvil1.8.5, Chrome157.0.8103.38, Playwright1.56.1. Started2026-11-25T06:40:01.464Z; finished06:41:08.130Z. Owned fresh PostgreSQL, unforked Anvil31337/K2, worker CLI, HTTP API, Vite and headless Chrome. Report PASS/command exit0; no browser errors or cleanup errors. Runner uses only its owned local unlocked-account adapter. **Browser rendered surface verified; adapter wallet behavior is NOT MetaMask extension, receiver or testnet acceptance.**

| Reconciled value | Observed |
|---|---|
| chain / deployment | 31337 / qa07-e2e |
| H / hash | 44 / `0x4ece7b0bbce90ac3b07a97746a2be7649d736cdcd41de07fb8d76ca01daa4355` |
| summary/detail/transfers/UI revision | `bda1997c-aeef-44eb-a33a-120f2d58ff86` |
| requestId | `0x48806c4ba8272d4fa074cebdb1d390a6dc78467fb69dd9b3fa2c650d58a5b26c` |
| proposalId | `46574786748714453867495474378662277656317242029920099159730211778675426798807` |
| Treasury / recipient | 1,000 / 11,000 BUD |

The actual screenshot `runner/08-executed-reconciled-ui.png` was visually opened: Executed, full ID, real H44/hash and revision appear on the detail surface. The UI pipeline also reports degraded/ancillary-topic warnings; no claim of warning-free pipeline or universal decoder completeness. Original report retains those distinctions. Reorg recovery still checks real503 and old-cursor409, plus canonical retry; desktop/mobile keyboard/screenshots remain included.

## Received-byte evidence

[Raw packet](raw.tar.gz), SHA256 **`1d048b4c3f6d948e3de9a1e68daf511e20ec0532eb7c93901b83c052f40ca274`**. Internal `SHA256SUMS`: **59/59 files verified** before packaging; includes original/fixed runner, oracle/test bytes, before.log, regression log/exit, runner command output/exit, full report, raw worker/PG/Anvil/Vite logs and 20 screenshots with DOM exports. Archive manifest protects payloads, not authorship of observations. Do not execute the archived historical runner as a new acceptance run.

Harness SHA256 `30ad78c6d550ec920fe961c39917c19e242bf1cda59dd66e84ab53526f8ed9ae`; snapshot helper `98ace5e16afbd72ff431dc15b17a41fcfd7af404c1c58f2c620bf36a1afcc925`; keyboard helper `19aeec782b4b5db62e7486682c1f8e42bd20dc2cdd37265f6901e1ef45384dff`. Full product sourceHashes and manifest/artifact provenance remain in report.json.

## Remaining gates

Request TV3 re-review of this exact QA-only delta after evidence publication; do not resolve/dismiss their review. BE08/performance implementation and sealed trace remain TV2's pending scope, with previous native timeout fixed. [#19 independent ZIP review](../2026-11-25-issue19-tv4-review.md) and [receiver/backend/security/owner gates](../2026-11-25-tv4-review-gates.md) retain their own source/scope. #6/#7 In review, #19/#20/#41/#44 not Done; #40/#42 receiver conditions remain. TV1 security approval atb186844 is not reopened for unchanged security sources. No merge, force-push, promotion, tag, release, staging/server rollout, secret access or Sepolia broadcast.
