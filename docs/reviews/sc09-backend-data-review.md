# SC09 — TV1 review snapshot/state và dòng tiền TV2

**SC09 DATA REVIEW ACCEPTED — SCOPED TO REVIEWED SOURCE.**

TV1 source/evidence review ngày **28/11/2026**, exact integrated Dev
`f15f19252957d9ca37b424facdbb13afc8da0b05`. Không phát hiện Critical/High/Medium
blocker mới trong FR13/FR15/read-model accounting đã đọc. Đây là disposition review
của TV1; PR tài liệu vẫn cần peer review TV2/TV4. Không tự đóng SC09, mở lại BE06/
BE08 hoặc tuyên bố full backend/testnet acceptance từ một HTTP 200.

## Source và gap analysis

| Nguồn | SHA / trạng thái | Cách dùng |
|---|---|---|
| Current Dev được review | `f15f19252957d9ca37b424facdbb13afc8da0b05` | Source contracts/indexer/SQL/API của SC09 |
| Main | `ad8c6cf17cced35c8ced5d6fcc5178b3f65892e4` | Chưa promote/release |
| Sepolia preparation pin | `e17ef61a8a51518005c38b0808cdc06fe7a68bbf` | TV4 owner/operator đã xác nhận; không tự chuyển pin |
| Historical BE06 local evidence | `e4c3ce4300dfb3e90a4e933508b2a403887aaaee` | Local Anvil + PG18.6, H67/hash riêng, không relabel current run |
| Accepted backend integration | `6766e5ee2d8c466542687cbeb09677c4d11e5463` | [TV4 #18 acceptance](https://github.com/SE2026-21-1/dao-budget-simulator/issues/18#issuecomment-7093896813) |
| Historical bounded QA06 | `ff484fbe95519cf2079e3dabda43e456a2c55fe6` | [TV1 4-property peer review](https://github.com/SE2026-21-1/dao-budget-simulator/issues/17#issuecomment-6766961290), không fresh run |
| What-if PR #62 | `d4a0fb563e66be951760167a6f62b246821dc17c` | Draft, chưa merge; đọc engine/adapter riêng |

Tài liệu gốc [phân công TV1](../requirements/TV1_Cong_viec_Smart_Contracts.md#sc09-review-dữ-liệu-và-viết-tài-liệu-contract)
và [FR13–FR16](../requirements/DAO_Budget_Simulator_Requirements_Nhom_4.md)
đã được đọc. Bản `.docx` gốc không có trong tracked checkout; dùng bản Markdown
transcription được repository cung cấp, không tự sửa requirement.

Gap ban đầu của `docs/contracts.md` tại reviewed Dev:

| Gap | Deliverable xử lý |
|---|---|
| Header còn SC06 phase1/base0b43364; thiếu source/evidence separation | Current source, deployment pin và historical evidence được tách rõ |
| Kiến trúc mới có một dòng, thiếu giải thích Governor → Timelock → Treasury | Năm-contract matrix, architecture/sequence/state Mermaid, report và slides |
| Final roles có nhưng chưa bootstrap/actor matrix; warning operation audit đã lỗi thời | Đối chiếu script hiện tại/accepted security, sửa warning, thêm before/after matrix |
| Chưa chỉ rõ inequalities ở snapshot/deadline/ETA | Source OZ + named boundary tests, không browser clock |
| Dữ liệu H/dedup chỉ được nhắc chung | Review matrix bên dưới, source lines, same-H/reorg/accounting evidence |
| Description/requestId còn ghi đề xuất dù UI đã triển khai | Đối chiếu `transactions.ts`, phân biệt UI content validation với on-chain action checks |
| What-if, invariant limits, source-scoped test counts chưa đầy đủ | Tài liệu phân biệt Draft engine, Foundry VM, synthetic adapter và on-chain receipts |
| Chưa có phần báo cáo/slide SC09 hiện hành trong Dev | `docs/report/tv1-smart-contracts.md`, `docs/slides/tv1-smart-contracts.md` |

Không sửa code TV2, smart contracts, ABI, dependency pins hoặc sealed evidence.
Delta e17ef61 → f15f192 chỉ thêm/sửa QA07 observer/capture/tests và evidence; các
contracts, ABI, indexer, SQL và deployment modules trong scope này giữ nguyên.

## Ba nghĩa của snapshot

1. **Proposal snapshot S:** timestamp ERC-6372 chốt delegated voting power; không
   phải block H của indexer. Governor đọc votes tại S sau khi chain clock đã qua S.
2. **Indexer checkpoint H:** block number/hash của raw prefix đã commit đầy đủ;
   có thể mới hơn projection publication. H có timestamp từ header đã xác minh.
3. **API snapshot/publication:** tập read-model/cache immutable gắn chainId,
   deployment, H/hash/timestamp, source scope và snapshotRevision. TTL/revision
   không thay voting snapshot. Freshness/TTL dùng wall clock, proposal state dùng
   timestamp tại H, không dùng giờ hiện tại của server hoặc browser.

## FR15 review matrix

PASS ở bảng này nghĩa là source mechanism đã được đọc và evidence tương ứng đã
được đối chiếu; không là một live campaign vừa chạy lại. Bằng chứng mới của lượt
SC09 là review/check tài liệu và kiểm integrity offline, không deployment/rebuild.

| Requirement | Source file/function | Existing evidence | Result | Limitation |
|---|---|---|---|---|
| Chọn H đã có K descendants | [`sync/safeBlock`](../../indexer/syncer.ts#L29), [`rebuildDatabase`](../../indexer/be06/rebuild.ts#L278) | BE06 historical raw+projection đúng H67; current CI BE06 log | PASS | K2 không là consensus finality; owner phải pin đúng chain instance |
| H/hash/timestamp/canonical parent chain | [`readHeader/readBatch`](../../indexer/reader.ts#L15), [`canonical`](../../indexer/projection/chain.ts#L22) | Header/log coordinate tests; same-H exports và reorg evidence accepted #18 | PASS | Tin RPC trả dữ liệu thật; không Merkle/state-root proof |
| Historical eth_call không latest | [`reconcile.call`](../../indexer/projection/chain.ts#L46), [`callAt`](../../indexer/be06/rebuild.ts#L100) | EIP-1898 blockHash+requireCanonical; mismatch/unavailable-state regression source | PASS | Provider phải hỗ trợ historical state; lỗi thì không advance publication |
| Proposal state đúng thời điểm H | [`evaluate`](../../indexer/projection/model.ts#L424), [`reconcile`](../../indexer/projection/chain.ts#L32) | Empty-block snapshot/deadline/Ready tests; current BE06 job có các phase này | PASS | Logs đơn thuần không đủ; không có event tự động Active/Succeeded/Defeated/Ready |
| Snapshot/deadline/quorum/vote tallies | [`buildModel`](../../indexer/projection/model.ts#L155), [`checkProposal/quorumAt`](../../indexer/projection/chain.ts#L88) | Raw ProposalCreated + VoteCast; Governor state/votes/quorum cross-check | PASS | S/D lấy từ canonical ProposalCreated, không gọi riêng proposalSnapshot/deadline trong reconcile; quorum read từ Governor tại H, không gọi đây là independent supply oracle |
| Treasury balance tại cùng H | [`balanceOf`](../../indexer/projection/chain.ts#L78) so với Transfer ledger | Historical 13.000−12.000=1.000 BUD và hai chain cross-check | PASS | Đúng configured fee-free BUD; history phải từ deployment, không bắt đầu giữa ledger |
| Atomic publication/state/rows | [`projectTransaction/publish`](../../indexer/projection/projector.ts#L69) | `projection-storage.test.ts`: SQL failure/RPC mismatch giữ publication cũ | PASS | Raw batch và projection là hai transactions riêng; API phải dùng projection H |
| API H/hash/revision nhất quán | [`scopeAndPublication`](../../indexer/api/server.ts#L186), [`materialize/getSnapshot`](../../indexer/api/server.ts#L310) | API tests fixed-H/cache/cursor/recovery; accepted backend #18/#19 | PASS | Không arbitrary historical RPC API; cached old H có TTL, mất cache trả409, không giả dựng history từ projection mới |
| Same-H rebuild độc lập DB | [`rebuildDatabase`](../../indexer/be06/rebuild.ts#L278), [`exportWithin/compareDatabases`](../../indexer/be06/compare.ts#L153) | Hai compare equal tại H67/hash ngay cả khi head73; mismatch probe exit2 | PASS | Reference phải đang publish đúng H; source/target khác nhau và target rỗng; không sửa reference |
| Reorg/recovery không serve orphan/stale aggregate | [`recover`](../../indexer/recovery.ts#L22), [`project`](../../indexer/projection/projector.ts#L37), [`page`](../../indexer/api/server.ts#L589) | Accepted #18: gate trước RPC kế tiếp, shallow/deep reorg, 503/409, idempotent replay | PASS | API dựa canonical headers do worker biết; không tự query chain mỗi HTTP request hoặc đảm bảo phát hiện fork tức thời |

### Kiểm source cụ thể và các rủi ro đã đối chiếu

`readBatch` quét các source từ deploymentBlock riêng; kiểm removed=false,
blockHash, transactionIndex/hash membership, parent/hash/timestamp và log order;
đọc lại batch-end header trước lưu. Raw batch + checkpoint commit cùng transaction
với chain advisory lock. Restart kiểm checkpoint hash cả khi không có block mới.

`projectTransaction` lấy cp/header đã lưu, re-decode raw bytes trong prefix `<=H`,
so payload đã stored, build model và reconcile tất cả proposals tại **cùng hash**.
Canonical check trước/sau, bounded concurrent reads tối đa4 và drain khi lỗi.
Quorum cache chỉ tồn tại trong một reconciliation, key snapshot tại cùng H;
không cache xuyên H/reorg. Historical RPC lỗi hoặc state/votes/balance mismatch
không commit model mới. Publisher xóa/chèn bảng theo FK order và cập nhật
projection checkpoint trong transaction đó, nên API không thấy bảng mới với H cũ.

API lấy read snapshot bằng PostgreSQL REPEATABLE READ; kiểm raw/projection scope,
revision, complete header prefix và deployment metadata. Summary đọc
`treasury_totals`; transfer history từ transfers và LEFT JOIN disbursements.
Các trang/cursor ràng buộc H/hash/revision/scope, kiểm validity khi đọc lại.
Unpinned requests có thể chọn publication mới hơn: TV3 phải giữ context và truyền
cặp `asOfBlock/asOfBlockHash` hoặc cursor khi đối chiếu nhiều endpoints.

Recovery commit `recovering` + revision mới + invalidate caches trước ancestor
RPC search. Shallow fork xóa orphan suffix và toàn latest derived model, replay
rồi project mới được ready. Deep fork → rebuild_required, giữ diagnosis data;
không tiếp tục cộng vào các bảng cũ khi replay chưa hoàn tất. HTTP503 trong gate
này là hành vi có chủ đích, không là bằng chứng nguyên nhân request503 lịch sử.

## FR13 — ledger không tính hai lần

| Requirement | Source | Existing evidence | Result | Limitation |
|---|---|---|---|---|
| Dedup chainId/txHash/logIndex, giữ blockHash | [`001_initial.sql`](../../database/migrations/001_initial.sql#L64), [`INSERT_EVENT`](../../indexer/storage.ts#L38) | Raw ingestion/restart/duplicate source tests và accepted BE03/#18 | PASS | Equal retry là no-op; khác bytes/coordinates rollback, không overwrite silently |
| Decode chính xác BUD Transfer/Treasury event | [`decodeLog`](../../indexer/decoder.ts#L28), [`classify`](../../indexer/projection/model.ts#L128) | ABI round-trip và malformed/trailing/indexed-count regression | PASS | ABI registry theo role/version; unknown/malformed business logs chặn projection |
| Một payment nối đúng nhiều logs | [`buildModel` disbursements](../../indexer/projection/model.ts#L347) | `successful lifecycle links same-tx operation/request/Transfer and counts one payment` | PASS | Same tx **và** blockHash, amount/recipient/request/action/order; ambiguity phải fail |
| Chỉ cộng Transfer vào in/out | [`model totals`](../../indexer/projection/model.ts#L392), [`treasury_totals`](../../database/migrations/003_be04.sql#L32) | BE06 4 transfers/2 disbursements vẫn đúng13.000in/12.000out | PASS | BudgetDisbursed/CallExecuted/ProposalExecuted không là financial rows thêm |
| API summary/history thống nhất | [`materialize`](../../indexer/api/server.ts#L395) | Published SQL totals + transfers LEFT JOIN link, same-H API tests | PASS | Đếm transfers và disbursements là hai loại entity, không cộng hai counts thành total spent |
| Request uniqueness; revert không tạo chi | [`paid set`](../../indexer/projection/model.ts#L347), SQL disbursement unique key | Projection shared request; BE06 zero-request duplicate revert/underfunding phase | PASS | Chain log reader không tự fetch receipt cho mọi log; canonical honest RPC không trả persistent success logs từ reverted execution |
| Top-up/direct BUD transfer, zero/self | [`Transfer branch`](../../indexer/projection/model.ts#L149), SQL FILTER/CASE | `unrelated BUD, self and zero transfers do not change treasury totals`; real top-up/retry | PASS | Inbound BUD không cần BudgetDisbursed; outbound amount>0 phải có linked disbursement |
| Exact monetary representation | [`decoder.jsonValue`](../../indexer/decoder.ts#L5), NUMERIC domain, bigint model | Exact uint256 raw replay/API tests | PASS | Number chỉ cho enum/count/bounded index, không amount/weight/proposalId |

Một execute thành công có thứ tự Transfer → BudgetDisbursed → CallExecuted →
ProposalExecuted. Model chỉ tạo một transfer flow; Treasury event nối request,
Governor/Timelock events nối governance. `mark/used` chống event khớp nhiều lần;
`linked` chống Transfer được dùng cho hai disbursements; paid set chống request
trả hai lần. Self-transfer giữ history nhưng net0. Một khoản 1.000 từ Treasury
10.000 cho recipient khiến balance9.000, không thành hai khoản1.000.

PostgreSQL `evm_uint256` là NUMERIC không rounding typmod, CHECK integral/range;
JSON dùng chuỗi nguyên, model dùng bigint. Proposal requestId không UNIQUE;
disbursement có unique chain/treasury/requestId và link đúng transfer. Ledger
rebuild dựa raw prefix đầy đủ; không seed tài khoản/quỹ từ database cũ.

## Same-H evidence đã đọc và integrity

[BE06 bundle](../evidence/be06-20261024/summary.md), implementation
`e4c3ce4300dfb3e90a4e933508b2a403887aaaee`, Anvil31337 + isolated PG18.6:

- H67/hash `0x284bf374a1854c73a1819ec5dbad08cfe155d93319daa8a52f8fcca3b4f3edc7`,
  K2. Reference và hai targets: 6 proposals, 9 votes, 3 operations, 4 transfers,
  2 disbursements; in13.000/out12.000/balance1.000 BUD.
- [Compare trước advance](../evidence/be06-20261024/compare-h67.json) và
  [sau head73, vẫn tại H67](../evidence/be06-20261024/compare-after-head-73-at-h67.json)
  đều equal/0 mismatches; reference/rebuild normalized JSON equal. Transfer block70
  không xuất hiện trong target H67. Đây là một historical chain, không trộn hash
  của H67 trong campaign khác chỉ vì cùng block number.
- [Mismatch probe](../evidence/be06-20261024/mismatch-probe.json) đã ghi Canceled
  → Defeated bị phát hiện ở normalized và chain cross-check; historical runner
  ghi compare exit2. SC09 chỉ đọc record này, **không chạy mutation mới**.
- Original source33 hashes và14 payload checksums được đối chiếu offline,
  source khớp Git e4c3ce4; không đòi chúng bằng
  current source đã thay đổi qua các đợt integration. Bundle giữ16 historical
  unknown ancillary topics; không xóa warnings hoặc relabel decodeComplete=true.

[Backend #18 đã được TV4 nghiệm thu](https://github.com/SE2026-21-1/dao-budget-simulator/issues/18#issuecomment-7093896813)
trên Dev6766e5e; BE06 H67 của campaign CI đó có hash khác, giữ nguyên attribution.
Current f15f192 [BE06 job140997956463](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/46151182866/job/140997956463)
log đã đọc: actual checkout f15f192; unit5/0/0, DB1/0/0; live script đi qua exact
snapshot/deadline/empty result/Ready/reverted execute/funded retry, kết thúc job
success và upload artifact15265597023. Chưa tải full artifact của run mới này;
không bịa H/hash hoặc normalized compare bytes từ job status.

## Evidence security và test counts

Không cộng counts lồng nhau hoặc khác source thành một tổng nghiệm thu.

| Kết quả | Exact source và evidence đã đối chiếu | Diễn giải |
|---|---|---|
| Foundry182 PASS/0 FAIL/0 SKIP, 9 suites | f15f192; [contract job140997955872](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/46151182866/job/140997955872), actual log | CI, không SC09 local rerun; Timelock40 và invariant properties nằm trong182 |
| SC06 current/versioned32 PASS/0 FAIL/0 SKIP | Cùng job; strict archive5ba9371/currentf15f192 live generation/offline/mutations | Không sửa archive để khớp source mới hoặc dùng historical positive làm fallback |
| Timelock integration40 PASS/0 FAIL/0 SKIP | Cùng current CI log; earlier e17ef61 local log riêng | Hai fuzz256; không cộng vào182 lần nữa |
| Governance bounded INV01–04:4 properties | Current CI 100runs/5.000calls/0reverts; [TV1 historical peer review](https://github.com/SE2026-21-1/dao-budget-simulator/issues/17#issuecomment-6766961290) ff484fb | Bounded model, counter cuối không aggregate; không formal/unbounded proof |
| Historical QA05:188 PASS/0 FAIL/0 SKIP,10 N/A | [Disposition tại faf10c7](https://github.com/SE2026-21-1/dao-budget-simulator/blob/faf10c7da67f53f1d918b5150c862e21af1b0d44/docs/evidence/tv4-20261114-qa05-disposition.json), 184cases tại3d539f141c5deca3ba3c3b2369fe8c891fcb64d7 +4cases tại03b86960e692ccbb87f265ca07ba84fe90864ff1 | Historical author/accepted scoped disposition; **không188 Foundry tests tại Dev**, không198 PASS; Ready(single) N/A dưới clean-bootstrap assumptions |

Historical QA05 source index/raw archive và generator hashes được kiểm integrity
offline, không replay/exploit mới hoặc import historical personal branch vào Dev.
Bounded oracle: ghost balances/delegates/checkpoints/ledger, expected trước SUT;
5 EOA voters, 4 passive recipients,16 requests,max24 proposals. `afterInvariant`
đòi successful execute, nhưng lifecycle helper có thể tạo progress có chủ đích;
không random-only liveness, authorized role epochs hoặc signatures/ERC1271 proof.
Unit signature cases riêng không mở rộng invariant model.

Accepted deployment security tại [b186844 / review6037012460](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#pullrequestreview-6037012460)
giữ scope vì 10 transitive remote modules/contracts/pins không đổi tới reviewed
Dev. Source audit không thay actual Sepolia manifest/roles/receipt acceptance.

## Findings, limitations và phối hợp

Không có actionable production defect mới trong source/evidence review này.
Không chạy targeted runtime checks vì không có finding mới cần reproduction.
Các gap tài liệu ở đầu đã được sửa trong deliverables SC09; không sửa backend TV2.

Giới hạn còn phải giữ:

- Same-H correctness phụ thuộc RPC/canonical-history completeness, configured
  contract identity và archived state availability. Backend không kiểm cryptographic
  state-root proofs, không independent quorum oracle ở mọi production query.
- Unsupported Solidity strings như NUL không được PostgreSQL JSONB biểu diễn:
  decoder giữ raw với decode_error, business projection fail-closed; không gọi
  đây là hỗ trợ mọi arbitrary description bytes hoặc âm thầm bỏ event.
- API read snapshots có TTL; caller không pin context có thể đọc hai publications.
  Migration001–004 có compatibility path; current rebuild áp dụng001–005. Không
  lấy legacy-mode behavior làm bảo đảm mới của recovery state machine.
- [Issue #19 completed](https://github.com/SE2026-21-1/dao-budget-simulator/issues/19#issuecomment-7240299717)
  với **HISTORICAL HTTP503 — DOCUMENTED RESIDUAL LIMITATION**; original packet/logs
  missing trong searched scope, root cause UNKNOWN. Không điều tra hoặc tuyên bố
  đã sửa nguyên nhân. Current-run HTTP200 không giải thích request lịch sử.
- What-if PR62 chưa merge/production integrate; synthetic adapter tests khác live
  RPC và Foundry VM differential. UI/backend không được dùng result giả định để
  cấp quyền execute. [Tài liệu chi tiết](../contracts.md#what-if-budget-trạng-thái-giả-định-khác-state-thực).
- Issue20 owner/operator/source preparation đã confirmed; public map/custodians/
  funder/actual-map gas và authorization còn pending, testnet SKIP. Issue40 riêng.

**TV2 @daongocuong** review matrix snapshot/ledger/API và xác nhận người đọc hiểu
phải giữ context. **TV4 @dung0611** review role/security/invariant/evidence scope và
reproducibility docs. **TV3 @LangXiTrum2005** có thể kiểm tính dễ hiểu của diagrams/
boundaries; không yêu cầu chạy MetaMask hoặc backend campaign đã accepted.

Deliverable/check results và SHA256 source bindings:
[verification.json](../evidence/sc09-20261128/verification.json).
SC09 documentation complete sau publish PR; peer acceptance vẫn pending reviewer
confirmation và xử lý blocking feedback nếu có. Không tự approve/merge/close issue.
