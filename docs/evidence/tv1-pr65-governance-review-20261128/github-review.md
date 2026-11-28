TV1 GOVERNANCE/API CONTRACT REVIEW APPROVED — SCOPED TO EXACT REVIEWED SHA

Reviewed HEAD: `8838cfd250583d87a608dbcf44c387b37e3dad22`
Base Dev: `f15f19252957d9ca37b424facdbb13afc8da0b05`
CI merge candidate: `6f2efec65f8b3cb690d4ed2ff51b1ec066a4ac6f` (parents verified; tree identical to reviewed HEAD). One PR commit, 10 changed files. Latest check: open, mergeable, mergeable_state=clean.

I independently inspected the complete diff, OpenAPI schemas/examples/parameters/errors, docs routes and response-validation tests against the contracts, pinned OZ5.4.0, shared ABI, BE04 projection/reconciliation, BE05 publication/cache/cursor logic, relevant SQL/recovery and SC09 documentation at immutable `513dc8213472ab030d220af8af458334bd61e45e`.

| TV1 scope | Result / evidence |
|---|---|
| Governance parameters | PASS — demo supply/distribution, 18 decimals, threshold50 GOV, quorum20/100, timestamp60/300/120s agree; configuration fields are not hardcoded demo enums. Summary uses verified deployment metadata. |
| Lifecycle and historical voting | PASS — Pending t<=S; Active S<t<=D; For+Abstain quorum and For>Against; snapshot delegation/weights rather than current balance. Ready belongs to a Timelock operation while proposal remains Queued. Revert does not mark Executed or create a Failed API state. |
| Same-H and cursor | PASS — distinguish voting S, raw checkpoint, projection publication H/hash and revision-bound immutable API cache. EIP-1898 reconciliation, paired pins, recovery invalidation, signed opaque cursor/endpoint/filter/limit/scope/expiry binding match source. API is not a live RPC state proof or arbitrary historical-state service. |
| Treasury and numeric/ID semantics | PASS — Transfer-only ledger; BudgetDisbursed correlates payment without another debit; proposals do not reserve funds. Nullable inbound links and zero/self transfers fit the schema. Exact decimal text for monetary/uint quantities; proposalId is not a bytes32 request/operation/transaction hash. |
| Six response/error contracts | PASS — required/nullable fields, oneOf/allOf/$ref, seven proposal states, support0/1/2, empty pages vs404, endpoint-specific400/403/404/409/503 and retryability. Health503 has a health data envelope and no409 response. |
| Backward compatibility | PASS — Solidity/shared ABI/config/projection/SQL/decoder/deployment/frontend unchanged. Server adds only docs import/dispatch after existing origin/method guards; previous regression assertions retained. This PR adds runtime routes and a production dependency, so it is not docs-only. |

Independent execution in an isolated exact-HEAD worktree, Node24.15.0:
- `npm ci --ignore-scripts --no-audit --no-fund`: exit0; lockfile unchanged. Install scripts intentionally disabled, including @scarf telemetry. This is not an independent standard-install/production-only packaging acceptance.
- `npm run typecheck`: exit0.
- `npm run build`: exit0.
- `npm run test:api:docs`: exit0, **1 PASS / 0 FAIL / 0 SKIP**.
- `npm run test:api` against a new isolated PostgreSQL16.15 database: first attempt exit1, **0 PASS / 7 FAIL**, all caused by the shared migration before-hook `Query read timeout` before case assertions. Logs retained. A fresh disposable cluster with fsync/synchronous_commit/full_page_writes disabled completed unchanged source/assertions/timeouts: exit0, **7 PASS / 0 FAIL / 0 SKIP**. This is local test storage configuration, not a production recommendation; the initial timeout was not conclusively profiled.
- Review-only targeted schema/HTTP probes: exit0, **8 PASS / 0 FAIL / 0 SKIP**, including **23 response examples**, independent descriptionHash/proposalId/calldata recomputation, 200-GOV example quorum from supply/fraction, exact uint256 text, state/operation/null variants, malformed fields, parameter allowlists and wrong endpoint cursor rejection. Synthetic variants are not blockchain receipts.
- Diff whitespace/protected-subtree checks and merge-candidate tree comparison: exit0.

Final independent suites: **16 PASS / 0 FAIL / 0 SKIP**, with the unsuccessful initial DB invocation disclosed above.

CI evidence (separate from my local execution):
- [Main CI](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/46154892017): completed SUCCESS, 10 successful jobs and 1 expected publish job skipped.
- [Fallback CI](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/46154892109): completed SUCCESS, 1 successful job.
- I read the [raw BE05 job log](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/46154892017/job/141009272541), not just workflow status. It checks out the exact tree-equivalent merge SHA above; PostgreSQL18.4 HTTP regression **7/7**, docs **1/1**, operation/event ABI **2/2** (fuzz256). The existing CI local-Anvil run records exact S/deadline/Ready phases, H55 one payment leaving9000 BUD, H63 underfunded revert preserving that balance, and H67 funded retry leaving1000 BUD. These are CI local-chain results, not independently rerun campaigns or Sepolia evidence. The complete uploaded live artifact was not separately revalidated.

**F65-TV1-01 — P3 Low, NON-BLOCKING:** `openapi.json:35,465` says summary/detail can select “the cursor's snapshot”; both endpoints omit cursor from their parameters and reject it with400. Source allowlists and review probe reproduce this. @daongocuong please remove that clause on these two non-paginated endpoints; clients should pin their H/hash pair. No server change is needed. No P0/P1/P2 blocker found in this scope.

TV3 still owns consumer types/rendering/pinning/pagination UX acceptance. TV4 still owns independent dependency/security/license/install-telemetry and runtime/production-only/Docker packaging review. This approval does not replace either review or approve the entire project. I did not rerun full Foundry/attack/invariant/BE06/BE08, MetaMask, Issues40/42, or access Sepolia RPC/sign/broadcast. PR66 and the proposed Sepolia source `e17ef61a8a51518005c38b0808cdc06fe7a68bbf` remain unchanged. No PR merge, review dismissal, source edit or push performed.

A detailed Vietnamese report, source hashes, exact local logs/probes, CI log excerpts/checksums and initial failure are retained on a separate local evidence branch `docs/tv1-pr65-governance-review-20261128` under `docs/evidence/tv1-pr65-governance-review-20261128/`; nothing is added to TV2's PR branch. This review is the durable GitHub handoff for the exact SHA above.
