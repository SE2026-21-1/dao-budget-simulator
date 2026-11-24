# TV4 — BE08 final-trace review, 24/11/2026

## Source and review boundary

Account verified by authenticated GitHub API: `dung0611`; author Phan Thanh Dũng. No repository/ancestor AGENTS.md was present; applicable `/home/ptdung/.codex/AGENTS.md` was empty. Read repository execution guidance, BE08 runbook, full reviews, inline threads and latest PR/issue comments before editing. No language server was configured.

Initial fetch: Dev `896f93ea282d76fa72339a97ea12339240c16da4`; PR61 head `42518f76ab102e65f286e8c74fc66fdf4409a841`, initial API base `6766e5ee2d8c466542687cbeb09677c4d11e5463`; PR60 head `b186844d1ff19ef26dfd83a060e7584bb6e0c419`, base Dev896f93e. Original checkout was clean and remained untouched; work occurred in two fresh dedicated worktrees.

TV2 reviews [PR61](https://github.com/SE2026-21-1/dao-budget-simulator/pull/61#pullrequestreview-6037801610) / [PR60](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#pullrequestreview-6037802801) require sealing the worker producer and draining recorder handlers before final validation. The earlier same-ID boundary/stdout fixes were accepted as fixes to previous findings, not approval of the whole PR.

## Counterexample → cause → fix

Window `[1000,10000]ms`: logical ID71, `eth_call`, params `[{"to":"0x71"},"latest"]`; four503 at1000/1150/1300/1450ms. Initial summary accepts four attempts. A fifth HTTP200 at10300ms, same ID/method/params, arrives after that snapshot and before worker close. Boundary variant uses9700/9850/10000/10150ms for its first four503; the fifth remains forbidden. Distinct ID76 with the same method/params is a new valid request, not a retry of71.

Actual cause: `completedOutageIds` marks four503 as exhausted; `outage()` summarizes once after API synced and can label PASS while the worker/recorder remain live. The recorder retains the later attempt correctly; the missing final validation—not dropped counters or a product retry change—causes false acceptance.

Fix [72d08940d63b99ec4d8e4d49f463251d7a0c714c](https://github.com/SE2026-21-1/dao-budget-simulator/commit/72d08940d63b99ec4d8e4d49f463251d7a0c714c) on PR61; exact three-file cherry-pick `--no-commit`, then selective attributed commit [375149a5d7e622bce7ad19b3eae39c9cb09536f1](https://github.com/SE2026-21-1/dao-budget-simulator/commit/375149a5d7e622bce7ad19b3eae39c9cb09536f1) on PR60. No unrelated branch history. Probe/oracle/test/docs bytes were compared equal across the two worktrees.

`outage()` now leaves AWAITING_FINAL_TRACE. `close()` waits for clean worker close, seals proxy acceptance, and drains every tracked async handler, including handlers whose client socket already closed. Shutdown+drain share the existing10s budget; timeout fails. Final summarization deletes the old passing summary and validates the complete same-ID lifecycle. Failure marks outage/freshness FAIL and rejects close, including repeated close. Existing benchmark `finally` converts close rejection to report/cleanup FAIL and process exit1; native/CI checks that command result. JSON-RPC IDs, method/params, four-attempt policy, retry/backoff and boundary assertions are unchanged.

## Observed verification

Node24.15.0 / Foundry1.8.5 / solc0.8.37 / PostgreSQL18.4; no production/testnet RPC.

| Check | Observed result / evidence |
|---|---|
| Before-fix finalization regression, original42518f7 probe | 0PASS/4FAIL, exit1; two late-fifth cases report `Missing expected rejection`. [Exact log](regression-before.txt). Initial fixture interleaved IDs71/72; expanded to71–75 for the final minimum-five-cycle acceptance guard without changing the counterexample. |
| After-fix deterministic finalization regression | 4PASS/0FAIL, exit0; late fifth/boundary negatives plus bounded/interleave positives; [log](regression-after.txt). Synthetic child shutdown and recorder traces, not a native worker campaign. |
| `npm run test:be08`, PR61 | 18PASS/0FAIL/0SKIP; [log](pr61-be08.txt). |
| `npm run test:be08`, PR60 port | 18PASS/0FAIL/0SKIP; [log](pr60-be08.txt). |
| PR60 bootstrap/provenance/Sepolia + release/operations after `forge build` | 51PASS/0FAIL/0SKIP:44security/provenance +4release +3migration/manifest; [named assertions](pr60-preservation-ready.txt). |
| PR61 local native `--benchmark` | **FAIL/exit1**, normal-RPC load publication wait exceeded30000ms before outage. 12other suites PASS, including typecheck/build,195unit,contracts,BE07DB/live; idle10samples completed. No timeout/assertion relaxation or blind rerun. Resource saturation is not established as root cause. |
| Initial local prerequisite failures | First native attempt lacked packaged ICU soname symlinks; repaired only the owned `/tmp` package from its shipped symlink map before the real run. Initial PR60 security invocation lacked compiler artifacts; subsequent invocation built them first. Those initial attempts are not PASS. |
| PR61 [CI45392235901](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45392235901) | SUCCESS; API head72d0894, actual PR checkout **7962c6dd42ce0536f57e727ea1361c3b62a75951**, parents Dev896f93e +72d0894. 10jobs success,1publish SKIP; [forced fallback45392235983](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45392235983) success. |
| PR61 CI BE08 artifact14918713778 | Downloaded actual report/benchmark: PASS, sourceUnchangedThroughRun=true;28791successful HTTP/0errors,p95=30.690716ms;10idle+10load freshness samples; worker exit0; final outage14cycles/56attempts,finalizedAt2026-11-24T12:24:48.557Z. This is CI PostgreSQL service/Anvil proof, not local-native PASS. |
| PR60 code+H52 head7221c131f558a6566c715c371e58899acb05dccc | [Push45392564172](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45392564172) and [PR45392582636](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/45392582636) SUCCESS; fallback push45392564162/PR45392582709 SUCCESS. Later documentation-head results are recorded in the final review replies, not assumed from these runs. |
| `git diff --check` | Exit0 on PR61 and PR60 port; final documentation whitespace check accompanies its own commit. |
| Local Docker | Daemon permission denied; no permission changes, not a runtime PASS. CI Container/Compose job actually succeeded. |

PR60 local native and final documentation-head CI are separately bound in the final PR60 thread reply. These captured results do not erase the failed PR61 native run.

## Preserved scope / remaining gates

Compared against b186844: signing/deploy/journal helpers, Sepolia regressions (signed-submission identity, receipt binding and zero-descendant funding), BE07 clock source, verify-release.yml, operations.test.mjs and TimelockGovernance.t.sol are byte-unchanged. TV1 [security APPROVED b186844](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#pullrequestreview-6037012460) and older TC10 approval retain only their stated scopes. No new security/contract approval is requested for unchanged sources. TV2 must re-review the BE08 finalization delta and delivery scope; TV3 consumer/harness scope remains separate.

[Issue41 original H52 worker/SQL extraction and hashes](../tv4-20261124-h52/provenance.md), evidence commit7221c13, was delivered in [comment7131321571](https://github.com/SE2026-21-1/dao-budget-simulator/issues/41#issuecomment-7131321571). Receipt/API already accepted by TV2; worker/SQL acknowledgement and TV4 scoped sign-off remain. No historical evidence regeneration.

Original local PR61 native report/benchmark/tested-source/patch bytes:
[pr61-native-failure.tgz](pr61-native-failure.tgz),302334bytes,
SHA-256 `88ff8b34dd6998476195bc59d0ceb8bb5869d513104b6efc4c8ee476588fec71`.

No approve/dismiss/resolve/merge, force-push, Dev/main promotion, release publication, Sepolia broadcast, secret-key access, server rollout/provisioning or personal/individual/evaluation-area changes. Project1 affected items remain In review/Blocked; peer acceptance and owner/receiver/account-switch/testnet gates remain distinct.
