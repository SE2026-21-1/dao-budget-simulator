# TV1 independent review PR65 — governance và OpenAPI contract

Ngày review: 2026-11-28 (UTC). Reviewer: TV1 / @nvdungmim.

**TV1 GOVERNANCE/API CONTRACT REVIEW APPROVED — SCOPED TO EXACT REVIEWED SHA.**
Không có finding P0/P1/P2 hoặc blocker trong phạm vi này; có một P3 không chặn.
Đây không phải approval thay TV3/TV4, full project acceptance hoặc SC10/testnet PASS.

## Source và phạm vi

- PR: https://github.com/SE2026-21-1/dao-budget-simulator/pull/65
- Author: @daongocuong; branch `feature/tv2-openapi-swagger-20261128`.
- HEAD: `8838cfd250583d87a608dbcf44c387b37e3dad22`.
- Base Dev / merge-base: `f15f19252957d9ca37b424facdbb13afc8da0b05`.
- GitHub merge candidate: `6f2efec65f8b3cb690d4ed2ff51b1ec066a4ac6f`.
- Merge candidate parents đúng HEAD/base; tree candidate và HEAD giống hệt nhau
  (`git diff --exit-code HEAD 6f2efec...` exit0). Base là ancestor HEAD, ahead1/behind0.
- Một commit: `feat(api): serve OpenAPI spec and offline Swagger UI`.
- Trước review chưa có review submission hoặc inline thread; conversation có Netlify bot.
- Isolated detached checkout HEAD chính xác, không checkout đè SC06/SC09/What-if.

10 file thay đổi: `.github/workflows/ci.yml`, `docs/api.md`,
`indexer/api/documentation.ts`, `indexer/api/openapi.json`, `indexer/api/server.ts`,
`package.json`, `package-lock.json`, `tests/api/contract.mjs`,
`tests/api/documentation.test.mjs`, `tests/api/server.test.mjs`.

Đây có runtime routes và dependency production `swagger-ui-dist@5.36.0`, không
phải documentation-only. `server.ts` chỉ thêm import và early docs dispatch sau
origin/method guards. Existing six handlers không đổi. Regression assertions cũ
không bị xóa/làm yếu; helper mới validate response lấy từ spec HTTP thực sự phục vụ.
Solidity, shared ABI, governance configuration, deployment scripts, projection,
SQL, decoder/recovery và frontend không có diff với base.

Các source references dưới đây thuộc reviewed HEAD, trừ OpenZeppelin ở gitlink
`c64a1edb67b6e3f4a15cca8909c9482ad33a02b0` và SC09 ghi SHA riêng.
Requirements: `docs/requirements/DAO_Budget_Simulator_Requirements_Nhom_4.md`
BR01–BR07 (50–62), FR13 (179), FR15 (191), FR16 (197).

## Review matrix

| Scope | Result | Evidence | Giới hạn |
|---|---|---|---|
| Governance parameters | PASS | `contracts/GovernanceToken.sol:15`, `BudgetToken.sol:9`, `BudgetGovernor.sol:42`; `api/server.ts:280,311,418`; spec summary example | Demo, không universal constants; summary từ verified deployment metadata |
| Proposal lifecycle | PASS | `projection/model.ts:424`; OZ Governor `state:141`; `docs/api.md:236` | Source/boundary test inspection; không rerun Foundry |
| Voting snapshot S | PASS | GOV timestamp clock; OZ GovernorVotes `_getVotes:56`; `tests/unit/BudgetGovernor.t.sol:472,495,506` | S là timestamp, không phải block H/current balance |
| Voting power/quorum | PASS | OZ CountingSimple:56,64; VotesQuorumFraction:62; model:229,424; chain:88 | Runtime BE04 trusts historical Governor quorum; không gọi đó là independent supply oracle |
| Same-H consistency | PASS | `projection/chain.ts:32,46`; `projector.ts:69`; `api/server.ts:187,311,463`; API tests | API không trực tiếp probe RPC; phụ thuộc canonical history worker đã biết |
| Cursor pagination | PASS | `api/server.ts:76,83,463,585,590`; `docs/api.md:126`; 7 API tests và review probes | P3 boilerplate description ở hai endpoint không nhận cursor |
| Treasury accounting | PASS | `model.ts:347,392`; migration003 view:32; `server.ts:399,414`; docs:174 | Local DB fixtures synthetic; real Anvil phases là CI evidence |
| Numeric precision | PASS | `decoder.ts:5`; server canonicalUint:33; spec DecimalUint/parameters; max-uint probe | JSON schema syntax không enforce mọi relational/range constraint |
| Identifiers | PASS | Proposal/action hash recomputation bằng shared Treasury ABI; schema Address/Hash32 | Không đồng nhất decimal proposalId với bytes32 IDs hoặc tx hash |
| Response schemas | PASS | 23 examples + 7 DB tests + 8 review probes; `tests/api/contract.mjs:6` | Không proof mọi dữ liệu có thể tồn tại trên EVM |
| Error semantics | PASS | `server.ts:141,463,677`; status-specific allOf schemas; DB/docs tests | Health503 là data envelope; API503 là error envelope; health không409 |
| Backward compatibility | PASS | Complete base/head diff, unchanged subtree check, assertions retained | Runtime dependency/packaging review của TV4 vẫn riêng |
| SC09 consistency | PASS | PR66 immutable `513dc8213472ab030d220af8af458334bd61e45e`: contracts, backend review, report | PR66 pending peer review, không thay implementation làm authority |
| Independent targeted checks | PASS | 1 docs + 7 DB + 8 review tests; typecheck/build exit0 | Initial DB attempt 0 pass/7 fail ở before-hook được giữ log |
| Exact-source CI | PASS | Main/fallback successful, raw BE05 checkout merge SHA tree-equal HEAD | Author/CI execution, không phải TV1 tự chạy Anvil campaign |

## Governance, snapshot và ledger đã đối chiếu

GOV fixed supply 1.000 (A400/B300/C200/D100), BUD20.000, bootstrap seed10.000 BUD,
18 decimals; Governor threshold50 GOV, voting delay60s/period300s, quorum20/100;
demo Timelock120s. Spec dùng decimal strings và verified metadata, không enum cố
định các tham số demo. Token symbol/18 decimals/timestamp clock đúng deployment
contract đã cấu hình. Không coi summary metadata là thay cho historical quorum.

Pending khi t<=S, Active khi S<t<=D. Sau D cần For+Abstain>=quorum và For>Against;
hòa hoặc thiếu quorum là Defeated. Weight lấy delegated votes tại S, không balance
hiện tại hoặc số người vote. Support0/1/2=Against/For/Abstain. Quorum null khi S
chưa là quá khứ tại H; sau S đọc Governor.quorum(S) tại canonical H. Demo quorum
200 GOV; probe tính lại từ supply*numerator/denominator và so example. Queued vẫn
là Governor state khi operation Ready (t>=ETA). Không tự execute; revert không
thành Executed/Failed và có thể top-up/retry. Public cancel của creator chỉ Pending.

S khác H, raw checkpoint có thể cao hơn projection publication H. BE04 replay
raw prefix và reconcile state/votes/quorum/BUD balance bằng EIP-1898 blockHash,
requireCanonical, rồi publish rows/checkpoint atomically. BE05 REPEATABLE READ
materializes immutable read cache tại publication H/hash/revision. Unpinned chọn
publication, không latest RPC/head. Pin phải đủ cặp H/hash. Old-H chỉ khả dụng
khi cache còn hợp lệ; không silently dùng state mới dán nhãn H cũ. Sync là tình
trạng pipeline hiện tại nên có thể mới hơn H đang xem. Recovery gate/revision
và canonical indexed headers invalidate caches. K xác nhận không là finality.

List limit20 (1–100), keyset numeric descending; proposals dùng created
block/txIndex/logIndex/proposalId, votes/transfers dùng block/txIndex/logIndex.
HMAC-SHA256 cursor bind endpoint, chain/deployment, H/hash/revision/source scope,
filters, limit, last tuple và expiry. TTL900s configurable60–86400. Không tự tạo
cursor; synthetic fixture token không là live credential. Last/empty page null.

Ledger dedup chainId+txHash+logIndex, giữ blockHash. Transfer BUD là financial row;
BudgetDisbursed nối request/proposal/operation và đúng same-tx/block/action/amount,
không tạo khoản trừ thứ hai. SQL view chỉ sum transfers, self net0. Quỹ10.000 chi
1.000 còn9.000; CI H55 xác nhận 2 transfers (funding+payment), 1 disbursement,
balance9.000. Proposed/queued không reserve hoặc spend. Revert không có success
logs. Direct inbound transfers có nullable requestId/proposalId; zero/self hợp lệ.

Amounts/weights/supply/quorum/proposalId/block/timestamp/indices dùng decimal text;
Number chỉ enum support, bounded decimals/limit/count. ProposalId uint256 decimal,
request/operation/descriptionHash và tx/block hashes là bytes32 hex, address20bytes.
Preserve exact UTF-8 description, Unicode/whitespace; recompute descriptionHash,
proposalId và decode canonical disburse example bằng shared ABI đều PASS.
DecimalUint response pattern là syntactic; request uint256 upper bound được
canonicalUint kiểm thực tế. Schema không là cross-field financial proof.

## Sáu endpoints

| GET endpoint | Parameters ngoài scope chainId/deploymentId | 200 schema | Actual source | Result |
|---|---|---|---|---|
| `/api/summary` | paired H/hash | SummaryResponse | server:733, materialize:311 | PASS |
| `/api/proposals` | paired H/hash,state,proposalId,limit,cursor | ProposalsResponse | server:701,717,759; page:590 | PASS |
| `/api/proposals/{id}` | path id,paired H/hash | ProposalResponse | server:710,734 | PASS |
| `/api/proposals/{id}/votes` | path id,paired H/hash,limit,cursor | VotesResponse | server:692,710; page:623 | PASS |
| `/api/treasury/transfers` | paired H/hash,direction,proposalId,limit,cursor | TransfersResponse | server:703; transfer query:399; page:590 | PASS |
| `/api/health` | scope only | HealthReady / HealthUnavailable503 | server:141,694 | PASS |

Required fields/additionalProperties:false, nullable votes.quorum/operation/title/
body/tx hashes/transfer links, composition oneOf/allOf/$ref và context:null được
đối chiếu source và runtime. Empty list200 khác absent detail/votes404. Health
ready/degraded200, unavailable503 (DB-up detailed hoặc DB-down minimal). Không409.

400 INVALID_ARGUMENT cho missing/unknown/repeated/unsupported query hoặc enum/limit;
INVALID_PROPOSAL_ID cho malformed/overflow ID; INVALID_CURSOR cho token lỗi;
CURSOR_CONTEXT_MISMATCH cho binding sai. 403 INVALID_ARGUMENT khi origin bị chặn.
404 deployment và proposal đúng endpoint. 409 INVALIDATED/UNAVAILABLE cần bỏ context
cũ, retryable=false. 503 DATA_NOT_READY retryable=true, khác health503. 400/403/404
retryable=false. HTTP data-read failures không phải smart-contract execution errors.
Không suy diễn nguyên nhân HTTP503 lịch sử Issue19.

## Commands và kết quả thực chạy

Node v24.15.0; PostgreSQL16.15 portable có sẵn. Không tải thêm PostgreSQL/Docker,
không dùng DB đang phục vụ nhóm. Fresh cluster loopback/random port/new owned DB;
wrapper dừng đúng instance sau test, cả success và failure.

| Command | Exit | Result |
|---|---:|---|
| `git fetch origin Dev refs/pull/65/head refs/pull/65/merge` | 0 | Exact refs fetched |
| `npm ci --ignore-scripts --no-audit --no-fund` | 0 | 48 packages; lockfile không đổi |
| `npm run typecheck` | 0 | PASS |
| `npm run build` | 0 | PASS |
| `npm run test:api:docs` | 0 | 1 pass/0 fail/0 skip |
| `npm run test:api` — initial PG16 attempt | 1 | 0 pass/7 fail/0 skip, shared before-hook migration Query read timeout |
| `npm run test:api` — fresh PG16 with disposable fsync off | 0 | 7 pass/0 fail/0 skip |
| `node --import tsx --test <review-dir>/targeted.test.mjs` | 0 | 8 pass/0 fail/0 skip; 23 response examples validated |
| `git diff --check <base>...HEAD` | 0 | PASS |
| `git diff --exit-code HEAD <merge-candidate>` | 0 | Same tree |
| `git diff --exit-code <base>...HEAD -- contracts shared/abi indexer/projection database config scripts/deploy_sepolia.mjs scripts/governance_sepolia.mjs` | 0 | Protected scope unchanged |

**Final independent suites: 16 pass/0 fail/0 skip.** Initial attempt retained,
không gộp/xóa 7 hook failures để tuyên bố mọi invocation đều xanh. Migration query
timeout6s là evidence thực; reduced durability trên DB tạm loại timeout ở lần sau,
nhưng chưa profile để kết luận nguyên nhân kernel/storage. Không sửa test/assertion/
timeout hoặc production configuration. Wrapper reproduction source và từng log
được lưu. Tắt install scripts tránh thực thi @scarf telemetry/esbuild scripts;
installed platform esbuild binary đã đủ cho checks. Không gọi đây là independent
standard install-scripts/production-only/Docker/browser verification.

Review-only probes gồm: all examples, independent example hash/calldata/quorum,
7 states/4 operation/null variants, max uint and malformed numeric/type/ID/state,
nullable transfer/zero/self, health-vs-error503/retryability, 6 parameter allowlists,
runtime rejection unknown/repeated keys/wrong filters/IDs/non-list cursor. Synthetic
variants không phải receipts, không chứng minh all relational invariants trên chain.

## CI evidence đã đọc

- Main: https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/46154892017
  completed SUCCESS; 10 jobs success, 1 expected release-publish skipped.
- Fallback: https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/46154892109
  completed SUCCESS; 1 job success.
- Raw BE05 log: https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/46154892017/job/141009272541
  log lines104/131/176 checkout merge candidate, tree-equal reviewed HEAD; lines353–366
  7 pass/0 fail/0 skip PostgreSQL18.4; lines378–386 docs1/0/0; lines605–610 ABI2/0/0
  (fuzz256 runs); lines622–631 local Anvil lifecycle H24–67, ending balance1.000.
- Anvil H55 balance9.000; H63 underfund revert unchanged balance; H67 top-up/retry
  balance1.000. Đây CI-generated local-chain evidence, không TV1 tự chạy và không Sepolia.
- Artifact15266524913 được job upload; review đọc raw log, không download/revalidate
  toàn bộ live artifact hoặc BE06/BE08 acceptance. Không dùng workflow state alone
  làm proof 7 PostgreSQL tests.

`github-status.json` lưu sanitized API metadata/job steps. `ci-log-extract.json`
lưu excerpt kèm original returned-log SHA256/UTC và line indices; không sửa logs.
`verification.json` và `SHA256SUMS` ràng buộc source/log/probe snapshots. Offline
hashes là integrity evidence của lần review, không độc lập chứng minh blockchain origin.

## Finding F65-TV1-01

- Severity: P3 / Low, **non-blocking**.
- Source: `8838cfd250583d87a608dbcf44c387b37e3dad22`.
- Location: `indexer/api/openapi.json:35,465`;
  JSON pointers `/paths/~1api~1summary/get/description` và
  `/paths/~1api~1proposals~1{id}/get/description`.
- Expected: mô tả summary/detail không pin thì chọn current publication;
  chỉ list/votes/transfers nhận cursor và có thể chọn cursor snapshot.
- Actual: copied sentence nói “or the cursor's snapshot” ở cả summary/detail,
  nhưng parameter lists không có cursor, server allowlist:717–724 từ chối cursor.
- Impact: consumer đọc prose có thể gửi cursor để cố giữ H giữa endpoints và nhận400.
  Paired asOfBlock/asOfBlockHash vẫn hoạt động đúng; route/response không hỏng.
- Evidence: review probe8 gửi hai requests với cursor, đều400 INVALID_ARGUMENT,
  validates đúng endpoint400 schema; source allowlist xác nhận. Không cần live DB.
- Minimal fix cho TV2: bỏ clause cursor ở hai descriptions, giữ clause trên
  paginated endpoints. Không yêu cầu đổi server hoặc thêm cursor vào hai routes.
- Disposition: không chặn scoped approval; không có P0/P1/P2 mới.

## Giới hạn và peer handoff

TV3 xác nhận consumer types, rendering, pin H/hash/revision và pagination UX.
TV4 review dependency/security/license/install telemetry, runtime/production-only
asset packaging và Docker/Compose. Không approve thay hai reviewer đó.
Không rerun full Foundry/attack/invariant/BE06/BE08, MetaMask hoặc Issues40/42;
không đọc secrets, không Sepolia RPC/sign/broadcast. Không sửa PR65/66 hoặc
contracts/pins/deployment source. SC09 PR66 HEAD vẫn `513dc821...`;
Sepolia proposed source vẫn `e17ef61a8a51518005c38b0808cdc06fe7a68bbf`.
Issue20 authorization/budget/account map độc lập, không được mở bởi review này.
Main SC06 checkout vẫn clean `83301112...`; What-if vẫn clean `d4a0fb56...`.

Evidence được lưu trên local branch riêng `docs/tv1-pr65-governance-review-20261128`,
không đưa vào branch TV2, không tạo PR evidence. Formal GitHub review lưu bản
handoff công khai có exact SHA/results/limitations; không merge/dismiss review.

Formal review submitted and read back: [APPROVED](https://github.com/SE2026-21-1/dao-budget-simulator/pull/65#pullrequestreview-6098730888),
reviewer @nvdungmim, exact commit `8838cfd250583d87a608dbcf44c387b37e3dad22`, UTC 2026-11-28T15:31:09Z.
