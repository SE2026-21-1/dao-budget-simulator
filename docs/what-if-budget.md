# What-if Budget Simulator (TV1)

## Phạm vi và nguồn thiết kế

Core off-chain độc lập để thử các kế hoạch giải ngân BUD giả định, không RPC.
Adapter opt-in bổ sung chỉ đọc snapshot đã pin; không wallet, giao dịch, deployment
hoặc thay đổi API/UI. Kết quả luôn mang nhãn
`hypothetical-budget-result-v1`; không phải receipt hoặc chứng cứ blockchain.

Base triển khai: `Dev` tại `3d0f6ca3f971ae6861b1a18160329bdfabe7ab8e`.
`main` lúc bắt đầu: `ad8c6cf17cced35c8ced5d6fcc5178b3f65892e4`.
PR #60/#61 còn mở, không nhập source chưa merge từ hai PR này. Hạ tầng OpenStack/
Anvil có sẵn trên Dev nằm ngoài phạm vi; không chạy workflow triển khai của nó.
Không tìm thấy AGENTS.md áp dụng hoặc engine what-if đã có. `fixtures/api/simulation.json`
là timeline tổng hợp BE01, không phải engine và không được dùng làm dữ liệu chain thật.

Đối chiếu trực tiếp `contracts/Treasury.sol`, `BudgetGovernor.sol`, `BudgetToken.sol`
và `GovernanceToken.sol` tại base:

- Mỗi proposal chứa đúng một action `Treasury.disburse(bytes32,address,uint256)`.
- Recipient khác zero và khác chính Treasury; amount > 0.
- `paidRequests` gắn với requestId, không gắn riêng proposalId. Hai proposal được
  phép có cùng requestId nhưng chỉ một lần trả thành công.
- Thiếu quỹ không tiêu requestId. Revert không thay balance hoặc trạng thái paid.
- BUD demo là ERC20 cố định supply, không phí, 18 decimals. Engine dùng `bigint`
  theo base units; không giả lập token có phí/callback hoặc lỗi ngoài mô hình.
- GOV dùng timestamp checkpoints. Engine này không tính votes/quorum, deadline,
  ETA, cancellation, signature hoặc quyền thật của Governor/Timelock.

`executionAllowed` là giả định explicit do người lập kịch bản cung cấp. Nó không
chứng minh proposal có thể execute trên chain. Không tự lấy eligibility từ trạng
thái API, không tự đổi nó sau top-up. Chỉ retry lỗi thanh khoản được mô hình hóa.

## Thiết kế triển khai

`simulator/types.ts` định nghĩa scenario và trace; `validation.ts` kiểm tra/chuẩn
hóa input; `engine.ts` chạy tuần tự bằng state cục bộ; `scenarios.ts` xây thứ tự;
`comparison.ts` so các kế hoạch explicit, không sinh hoán vị; `formatting.ts`
chuyển đổi amount chính xác. Test dùng Node test runner + tsx sẵn có, TypeScript
strict của root. Không thêm dependency hoặc import implementation TV2/TV3.

Input gồm Treasury address, initial balance, tập request đã trả ban đầu, danh sách
proposal và các bước theo thứ tự. Proposal ID là nhãn opaque của simulator; có thể
dùng chuỗi ID Governor từ API nhưng engine không tự tính proposal hash.

Execution trace ghi từng attempt (kể cả retry) với balance trước/sau và nguyên nhân.
Thành công tiêu quỹ và requestId cùng lúc; thất bại giữ nguyên cả hai. Top-up chỉ là
giả định funding ngoài Treasury, không mint BUD và không xác nhận tài khoản nào đủ
quỹ. Balance từng thời điểm nằm trong uint256; tổng dòng tiền có thể lớn hơn uint256.

So sánh chỉ chạy các kế hoạch người dùng chỉ định với giới hạn kích thước cố định.
Không khẳng định mọi hoán vị đều hợp lệ theo governance/timelock thật.

## Public API và schema

Import từ `simulator/index.ts` khi dùng tsx, hoặc `dist/simulator/index.js` sau build.
Các interface là readonly; hàm validation trả bản copy độc lập, lowercase address
và requestId. Output không tham chiếu state đầu vào. Caller không nên sửa result.

| API | Chức năng |
| --- | --- |
| `validateDefinition(input: unknown)` | Kiểm Treasury, balance, proposals và initial paid requests |
| `validateScenario(input: unknown)` | Thêm kiểm từng step/reference; không chạy transition |
| `simulateBudget(scenario)` | Chạy đúng thứ tự steps, trả `SimulationResult` |
| `withExecutionOrder(definition, ids)` | Một permutation đầy đủ, mỗi proposal đúng một lần |
| `compareExecutionOrders(definition, orders)` | So các permutation explicit cùng một definition |
| `compareScenarios(definition, plans)` | So các timeline có top-up/retry cùng definition |
| `parseBaseUnits(text)` | Chuỗi nguyên canonical của API → bigint uint256 |
| `parseBUD(text)` / `formatBUD(amount)` | Decimal BUD chính xác ↔ base units, không locale/rounding |
| `parseScenarioJSON(text)` | Wire JSON có amount dạng chuỗi nguyên → scenario validated |
| `stringifySimulation(value)` | Scenario/result/comparison → JSON, bigint thành chuỗi nguyên |

Input `TreasuryScenario`:

| Trường | Kiểu / quy tắc |
| --- | --- |
| `treasuryAddress` | Địa chỉ hex 20 bytes, nonzero; dùng để từ chối self-payment |
| `initialBalance` | bigint, `0 <= value <= UINT256_MAX` |
| `initialPaidRequestIds` | Optional bytes32[], không trùng sau lowercase; chỉ omission là rỗng |
| `proposals` | Mảng `{ proposalId, request, executionAllowed }` |
| `proposalId` | Chuỗi exact, 1–128 ký tự UTF-16, không whitespace đầu/cuối; không trùng |
| `request` | Đúng một `{ requestId, recipient, amount }`; không có action batch |
| `requestId` | `0x` + 64 hex; zero hợp lệ; các proposal có thể dùng chung |
| `recipient` | Hex address nonzero, khác Treasury; mixed-case phải đúng checksum |
| `amount` | bigint, `1 <= value <= UINT256_MAX` |
| `executionAllowed` | Boolean bắt buộc, không suy ra từ proposal ID/state API |
| `steps` | Mảng union `{ kind: 'execute', proposalId }` hoặc `{ kind: 'top-up', amount }` |

Input không nhận field lạ. Unknown proposal trong step làm cả scenario invalid,
không chạy được một prefix rồi mới lỗi. Không yêu cầu timeline phải thử mọi proposal;
những proposal không được thử có nhóm `unattemptedProposalIds`. Retry là lặp execute
step trong timeline; không phải duplicate definition của proposal.

Wire JSON dùng cùng shape nhưng mọi initial balance/amount là chuỗi nguyên base units,
ví dụ `"1000000000000000000"` = 1 BUD. JS number, `"1.0"`, `"01"`, `"1e18"`, signed
strings không hợp lệ tại boundary này. Chuyển input hiển thị `"1.25"` bằng `parseBUD`
trước; không dùng `Number`, `parseFloat`, `Math.round` hoặc nhân số dấu phẩy động.
`parseBUD` không nhận dấu, grouping, khoảng trắng hoặc hơn 18 chữ số thập phân.

Output luôn có `kind`, `treasuryAddress`, `initialBalance`, `finalBalance`,
`totalDisbursed`, `totalTopUps`, `paidRequestIds`, `trace`, summary từng proposal và
ba nhóm executed/failed/unattempted. Paid IDs gồm cả initial paid requests; executed
IDs chỉ gồm thành công trong lượt mô phỏng, theo thứ tự thành công. Summary theo
thứ tự definition. `failedProposalIds` là những proposal đã thử nhưng chưa bao giờ
thành công, không phải mọi attempt thất bại. Proposal thành công rồi bị retry vẫn
là executed; `lastOutcome` có thể là `proposal-already-executed`.

Mỗi trace có `kind`, `stepIndex` (0-based), `amount`, `outcome`, `balanceBefore`,
`balanceAfter`. Execute trace còn có `proposalId`, `requestId`, `recipient`. Không có
transaction hash/block/log giả; một lần giải ngân là một transition, không cộng
thêm ERC20 Transfer và BudgetDisbursed thành hai khoản chi.

## Quy tắc thực thi và lỗi

Thứ tự kiểm execute: supplied eligibility → proposal đã execute trong simulation →
request đã trả → balance đủ → commit payment. Đây là state machine giả định sau
khi governance preconditions được thỏa mãn, không sao chép toàn bộ Governor.

| Outcome | Thay đổi balance / paid state |
| --- | --- |
| `executed` | Trừ đúng amount, thêm requestId và đánh dấu proposal thành công |
| `not-eligible` | Không đổi; supplied assumption là false |
| `proposal-already-executed` | Không đổi; retry sau thành công |
| `request-already-paid` | Không đổi, kể cả khi proposal khác dùng cùng requestId |
| `insufficient-budget` | Không đổi; có thể retry sau top-up |
| `applied` (top-up) | Cộng amount; không đổi paid IDs hoặc eligibility |
| `balance-overflow` (top-up) | Không đổi; tiếp tục bước sau |

Input invalid ném `ScenarioValidationError` với `code` và `path`. Các code:
`INVALID_JSON`, `INVALID_SHAPE`, `INVALID_UINT256`, `INVALID_ADDRESS`,
`INVALID_REQUEST_ID`, `INVALID_PROPOSAL_ID`, `DUPLICATE_PROPOSAL_ID`,
`DUPLICATE_PAID_REQUEST_ID`, `INVALID_EXECUTION_ORDER`, `UNKNOWN_PROPOSAL`,
`LIMIT_EXCEEDED`. Đây là lỗi simulator, không phải decoded Solidity revert.
Execution failure trong scenario hợp lệ là outcome trong trace, không là exception.

Ledger luôn thỏa:

```text
initialBalance + totalTopUps = finalBalance + totalDisbursed
```

Chỉ top-up `applied` vào totalTopUps; chỉ `executed` vào totalDisbursed. Cumulative
flow là bigint không giới hạn uint256 vì tiền có thể vào/ra nhiều lần; balance và
amount từng bước vẫn giới hạn uint256. Engine không kiểm global fixed supply 20.000
BUD hoặc số dư của funder; caller phải lựa chọn giả định thực tế phù hợp.

## Ordering, comparison và giới hạn công việc

`withExecutionOrder` yêu cầu một permutation đầy đủ; omission, unknown, duplicate,
sparse array đều invalid. Partial plans/retry dùng `steps` explicit. Không sort ID,
không dùng clock/random/network, không tự retry hoặc top-up để làm đẹp kết quả.

Comparison lấy phương án đầu làm baseline; trả full result từng phương án, tập
proposal mới thành công/không còn thành công và signed deltas (alternative − baseline)
của totalDisbursed, totalTopUps, finalBalance. Nếu top-up khác nhau, không được diễn
giải toàn bộ chênh lệch là do ordering. So sánh không sửa state dùng chung giữa variants.

Giới hạn hiện tại: 1.000 proposals, 10.000 steps, 10.000 initial paid IDs mỗi scenario;
1–16 variants mỗi comparison; JSON tối đa 2.000.000 ký tự. Engine và comparison chạy
trên mảng bounded, không sinh `n!` hoán vị. Validators là một phần public API,
không được bỏ qua khi nhận dữ liệu không tin cậy. Chỉ truyền object dữ liệu thường,
không truyền Proxy/getters có side effects.

## Kiểm thử và giới hạn nghiệm thu

Node >=24 (CI pin 24.15.0), TypeScript 5.9 strict, dependency lock của root:

```sh
npm ci
npm run test:simulator
npm run typecheck
npm run build
```

Workflow riêng `.github/workflows/simulator.yml` chỉ chạy các check trên; không đổi
workflow triển khai TV4 hoặc kích hoạt RPC. Unit tests kiểm validation, số lớn,
request chia sẻ, eligibility, ordering, retry, top-up overflow, comparison, JSON và
18 decimals. Invariants dùng 500 scenario sinh deterministic với seed `0x20261126`,
kiểm conservation/uniqueness/atomicity/replay và prefix consistency. Có coverage guard
cho nhánh thành công/thất bại; đây không phải formal verification hoặc Foundry fuzz runs.

Không claim engine dự báo thành công on-chain. Không mô hình hóa votes, quorum,
threshold, snapshot, clock, ETA, cancellation, operationId, roles thật, signature,
gas, concurrent activity, reorg, consensus finality hoặc token ngoài BUD chuẩn.
Receipt chain/SC06 archives không được tạo/sửa bởi simulator. Một scenario phải được
TV2/TV3 gắn context snapshot đã pin riêng trước khi dùng như công cụ khám phá.

## Bàn giao TV2/TV3

Initial phase không đổi `frontend/src/data/api.ts`, `TreasuryPage.tsx` hoặc backend.
TV3 có thể xây view riêng với nhãn “giả định”, input amount strings, reorder và trace.
TV2/TV3 cần thống nhất adapter tại cùng chain/deployment/H/hash/snapshotRevision;
chuyển balance API bằng `parseBaseUnits`, lấy paidRequests đáng tin cậy và chọn rõ
proposal nào được giả định đủ điều kiện. Không suy “chưa paid” từ lịch sử phân trang
chưa đầy đủ. Giữ nguyên description/calldata/hash thật nếu hiển thị chúng; simulator
không tự tạo hay chứng thực những trường này. Không nối nút simulate với transaction
submission. UI bundling/types và peer review integration là công việc tiếp theo.

[Xem ví dụ có thể chạy](what-if-budget-examples.md).

## Kết quả kiểm chứng tại bàn giao local

Source engine/tests được kiểm trên `defacb2` (các commit tiếp theo chỉ CI/docs).
Không push/PR hoặc GitHub Actions run nào được tạo cho branch này trong lượt triển khai.

| Lệnh / kiểm tra thực chạy | Kết quả |
| --- | --- |
| `npm run test:simulator` | 109 PASS / 0 FAIL / 0 SKIP; gồm một test chạy 500 scenario, không gọi đó là 500 Node tests |
| `npm run typecheck` | exit 0, gồm simulator và tests trong root strict TS |
| `npm run build` | exit 0; xuất `dist/simulator/index.js` cùng build root hiện có |
| Hai shell snippets trong tài liệu examples | 2/2 chạy exit 0, assertions đạt |
| `FOUNDRY_PROFILE=ci FOUNDRY_FUZZ_SEED=0x20261021 bash scripts/ci.sh` | exit 0; fmt/build, 180 Foundry PASS / 0 FAIL / 0 SKIP, ABI/calldata/hash checker đạt |
| Foundry fuzz / invariants trong lượt CI local trên | Các fuzz tests 256 runs; mỗi invariant suite 100 runs / 5.000 calls / 0 reverts |
| Regression config/decoder/reader/CLI/syncer/projection/BE06 và API được gọi chung | 158 PASS / 7 FAIL / 0 SKIP; bảy FAIL ở API before hook vì thiếu isolated DB environment |
| `actionlint .github/workflows/simulator.yml`; `git diff --check` | exit 0 |

Lệnh regression chung đã gọi:

```sh
node --import tsx --test \
  tests/indexer/config.test.ts tests/indexer/decoder.test.ts \
  tests/indexer/reader.test.ts tests/indexer/cli.test.ts \
  tests/indexer/syncer.test.ts tests/indexer/projection.test.ts \
  tests/indexer/be06.test.ts tests/api/server.test.mjs
```

Bảy API tests **chưa kiểm chứng nghiệp vụ**: guard yêu cầu `BE05_TEST_ISOLATED=1`
và một PostgreSQL mới đúng scope; không có DB như vậy trong lượt này. Không bật flag
để bỏ qua guard, không kết nối DB đang phục vụ, không sửa API/DB tests để làm xanh.
Nếu cần kiểm API đầy đủ, dùng runbook `npm run test:api:db` với PostgreSQL test riêng.
Không cần API/DB/RPC cho engine; CI differential bổ sung dùng Foundry test VM. Warnings hiện có của compiler/
Foundry được giữ nguyên; không khẳng định warning-free hoặc full product acceptance.

Kết quả bổ sung sau bàn giao đầu: [API regression và kiểm chứng mới](what-if-budget-verification.md). Bảng trên giữ nguyên kết quả của lượt cũ, không ghi đè FAIL lịch sử.

[Adapter snapshot chỉ đọc, trust boundary và tích hợp](what-if-budget-snapshots.md).
