# TV4 — Kế hoạch kiểm thử và ma trận nghiệm thu

Ngày đối chiếu ban đầu: 21/10/2026; kết quả tích hợp cập nhật 24/10 ở mục0. Nguồn chuẩn: [requirements v1.0](requirements/DAO_Budget_Simulator_Requirements_Nhom_4.md), [phân công TV4](TV4_Cong_viec_Testing_Deployment.md), [SC01](contracts.md), [database](database.md), [API](api.md), [review SC03](sc03-review.md) và [indexer](indexer.md). Không tự nâng proof cục bộ thành nghiệm thu toàn hệ thống.

TV1 sở hữu unit/fuzz contract và sửa contract; TV2 sở hữu SQL/indexer/API tests và sửa backend; TV3 sở hữu component/wallet/UI tests và sửa frontend. **TV4 là acceptance owner của mọi TC01–TC14, INV01–INV04**, sở hữu integration/E2E/attack/invariant, deploy/check-roles và tổng hợp evidence; không nhận thay unit tests của ba module. TV1 review deploy/attack, TV2 review replay/benchmark, TV3 review E2E.

## 0. Trạng thái nghiệm thu cập nhật — 24/10/2026

Các cột trạng thái/nhãn “chưa” trong bảng lịch sử21–23/10 được đọc theo ngày
và source đã ghi; bảng dưới cùng [report mới](evidence/tv4-20261024-acceptance/report.md)
là trạng thái hiện tại. Setup/kỳ vọng TC/Q/INV vẫn giữ nguyên, không giảm
tiêu chí để khớp dữ liệu đã chạy.

| Evidence mới | Phạm vi đã quan sát | Giới hạn |
|---|---|---|
| E-TV4-24-C | [contracts](evidence/tv4-20261024-acceptance/contracts.txt):147PASS, seed0x20261021, hai campaign100×50; [backend](evidence/tv4-20261024-acceptance/backend.txt):64+22+27+5 unit/model/CLI và8process PASS | Bounded oracle; không cộng nhiều run làm coverage mới |
| E-TV4-24-DB | [native](evidence/tv4-20261024-acceptance/native/report.json):BE01 SQL,51DBtests,real governance/storage vàliveAPI/BE06 PASS | Native18.4 không là Docker; source hashes ghi theo lần chạy |
| E-TV4-24-R | [live](evidence/tv4-20261024-acceptance/native/live.json):hai target H67/post-H/mismatch; [TC12](evidence/tv4-20261024-acceptance/tc12-complete/report.json):đúng tám proposal H49 và sáu boundary, mỗi case hai DB mới, normalized/chain compare equal | Recovery/historical-RPC failure và cursor sau reorg chưa nghiệm thu |
| E-TV4-24-UI | [browser](evidence/tv4-20261024-acceptance/browser.json):12checks,4route×390/1366,UI→chain→API→UI,receipt/network/refusal/HTML-safe/cancel/deposit | EIP-1193 forward tới Anvil thật; chưa wallet extension/testnet |
| E-TV4-24-P | [benchmark](evidence/tv4-20261024-acceptance/benchmark.json):100proposal/1000vote thật,10×100GOV,10client/60s,8133success/0error,p95133,652ms | NFR02 local/mix đã ghi; không thay AD-064753user/testnet |
| E-TV4-24-X | [reorg](evidence/tv4-20261024-acceptance/reorg.json):hash mismatch dừng ingestion nhưng API200/hash orphan; [freshness](evidence/tv4-20261024-acceptance/freshness-sample.json):một sample374,39ms | TC11/NFR03/NFR04 toàn hệ thống chưa đạt; BE07 chưa bàn giao |
| E-TV4-24-CLONE | [clean](evidence/tv4-20261024-acceptance/clean/report.json):candidate d2617d0, không overlay/cache dự án;330tests/build/smoke/native `--benchmark` PASS,8636success/0error,p95127,602ms | Cùng máy, compiler/toolchain sẵn; không thay independent-machine approval |
| E-TV4-24-SECRET | [Gitleaks triage](evidence/tv4-20261024-acceptance/gitleaks-triage.json):49commit,283finding redacted, toàn public digest/address/placeholder,0credential xác nhận | Raw exit1 được giữ; pattern scan không bảo đảm mọi secret |

| TC | Trạng thái mới và căn cứ |
|---|---|
| TC01 | PASS local UI A400+B300 For, chi1000BUD, quỹ9000; E-TV4-24-UI/DB |
| TC02 | Contract negatives và live low-quorum/projection/API PASS cục bộ; không tự coi mọi UI variant hoàn tất |
| TC03 | Unit và projection quorum/tie/abstain/result PASS; phạm vi theo E-TV4-24-C/DB |
| TC04 | Unit/smoke vàliveAPI tạiS/D/empty-block boundaries PASS; không suy toàn bộ reset/UI variants |
| TC05 | Snapshot/transfer/delegate/approved-transferFrom negatives và bounded oracle PASS; cần peer review phạm vi |
| TC06 | Final-role, former-deployer và valid-operation bypass negatives PASS qua attack/smoke; không phải testnet |
| TC07 | ETA−1/ETA, early UI guard, execute/replay negatives PASS cục bộ |
| TC08 | Whitelist/calldata/native-value/threshold và frontend uint256/precision tests PASS; description policy vẫn cần nhóm review |
| TC09 | Live insufficient funds→fund→same-operation retry, SQL/API ledger PASS |
| TC10 | Shared/zero request, duplicate revert và linkage model/live PASS; không cộng Transfer+BudgetDisbursed |
| TC11 | **KHÔNG ĐẠT** reorg rollback/invalidation;16DB crash/checkpoint tests PASS chỉ chứng minh phần atomic/resume |
| TC12 | PASS tám proposal H49 cùng H/hash, Pending quorum=null, Queued Waiting/Ready, totals9000/10000/1000; S/S+1/D/D+1/E−1/E dùng từng cặp DB mới và normalized/chain compare equal. Historical-RPC failure/cursor sau reorg chưa chốt |
| TC13 | PASS12browser checks bằng transport local và6behavior tests; extension/video/đủ mọi variant chưa nghiệm thu |
| TC14 | Contract role/creator-Pending negatives và UI noncreator-disabled/creator-cancel PASS; approval/testnet còn thiếu |

INV01–INV04 có governance oracle và successful execute trong sequence, không
prank Timelock để chi; đây vẫn là bounded local evidence. NFR02 đạt trên máy
đã ghi. NFR03 chỉ có sample acceptance-driver; NFR04 còn BE07/backoff/reorg.
NFR05 có clone sạch candidate cùng máy E-TV4-24-CLONE, còn máy thành viên khác; NFR06 có ảnh/keyboard local,
không chứng nhận mọi trình duyệt. NFR07 chưa chốt vì peer review/CI revision
mới và lỗi reorg còn mở. NFR08 local role audit và history secret-scan/triage có proof, testnet chưa có.

## 1. Ranh giới bằng chứng theo phiên bản

| Mã bằng chứng | Nguồn thực sự / điều đã quan sát | Không được suy ra |
|---|---|---|
| E-SC01-H | [sc01-validation.md](sc01-validation.md): báo cáo 14/10, build, selector test và ABI/fixture đạt bằng dependency/compiler có sẵn; không phải clone sạch. Tên test/checker cũ trong báo cáo là lịch sử; đường hiện hành là `tests/unit/OperationAbiCompatibility.t.sol`, `scripts/check.py`. | Không chứng minh Treasury, Governor, Timelock, role hoặc giải ngân. |
| E-SC01-C | TV4 đã chạy đợt tích hợp: `FOUNDRY_PROFILE=ci bash scripts/ci.sh` đạt 2 ABI compatibility tests (fuzz 256) và checker SC01. Chỉ phạm vi ABI/calldata/event topic/fixture. SHA và run của bản bàn giao được ghi trên [PR #5](https://github.com/SE2026-21-1/dao-budget-simulator/pull/5). | Không đánh dấu TC01 hoặc NFR07 toàn hệ thống đạt. |
| E-BE01-H | [be01-checklist.md](be01-checklist.md), [fixture README](../fixtures/api/README.md): nguồn TV2 báo cáo PostgreSQL 18.4 migration/constraint đạt ở lần BE01 trước; fixture 123 JSON, 45 proposal, 20/20/5, timeline/regression. Log PostgreSQL nguồn ở đường TEMP ngoài repo trong checklist, không phải artifact CI hiện tại. | SQL constraints không phải resume/reorg/rebuild worker. Hash giao dịch trong fixture đều tổng hợp. |
| E-BE01-C | TV4 đã chạy `node scripts/check_be01.mjs`: 123 JSON, 45 proposal, 20/20/5, timeline và regression đạt. Checker **offline**, không RPC, không HTTP server, không indexer. Node local 22.23.3 chỉ là smoke bổ sung; chuẩn BE01/CI pin 24.15.0. | Không chứng minh FR13–FR16 runtime, p95, freshness hay migration trên máy hiện tại. |
| E-SC02-H | Nguồn `docs/sc02-tokens.md` tại SC02 `9a890a2084f10876e580d24589fa6cb0829c11f3`: tác giả báo 24 token tests, ba fuzz ×256; toàn suite nguồn 25 kể cả selector SC01. Đây là kết quả nguồn lịch sử. | Không lấy số 25 làm suite TV4 hiện tại. SC02 đã tích hợp ngày 21/10; kết quả mới ghi tại E-TV4-21. |
| E-SC02-C | TV4 kiểm chứng độc lập: [sc02-review.md](sc02-review.md), [sc02-local-smoke.json](evidence/sc02-local-smoke.json). Detached SHA trên: 24 token tests đạt, seed `0x20261020`, ba fuzz ×256; Anvil token-only deploy/receipt, supply/allocation/clock, delegation, historical lookup, transferFrom, undelegation và BUD transfer đạt. | BUD được chuyển tới **EOA nhận thử**, không phải Treasury. Chưa kiểm TC05 qua Governor, quorum hay INV04 toàn hệ thống. |
| E-BE01-CI | [Run 39457911277](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39457911277), commit `b2c32a06be39cfacb749cb9d305e462d8929bce0`: cả hai job thành công. Artifact ghi Node `v24.15.0`; PostgreSQL 18.4 cô lập chạy migration COMMIT và SQL checks `BE01 checks passed`, ROLLBACK; [stdout SQL nguyên bản](evidence/be01-ci-b2c32a0.txt). | Chứng minh fixture và ràng buộc SQL, không chứng minh worker/API/reorg/rebuild hoặc full NFR07. |
| E-SC03-C | [Review SC03](sc03-review.md), [19 receipt local thật](evidence/sc03-local-smoke.json) tại `7a0ab33`: 13 status1/6 status0, quyền/chi trùng/thiếu tiền/retry/role transitions và ledger. BE02 decode 7 Transfer/3 BudgetDisbursed thật. | Spender là EOA thử nghiệm trên Anvil tạm; không phải Governor→Timelock hoặc deployment cuối. |
| E-TV4-21 | [Kết quả local](evidence/tv4-local-verification-20261021.json), [stdout Foundry](evidence/tv4-foundry-20261021.txt): 58 passed, 0 failed/skipped; 3 Treasury-only invariant checks trong campaign100×50, seed `0x20261021`, oracle lịch sử độc lập. | Không nghiệm thu INV02/INV04, proposal/operation replay hoặc full governance chỉ bằng Treasury-only campaign. |
| E-BE02-C | `7a0ab33`, Node24.15.0: typecheck/build, 63 unit/RPC/decoder và 21 PostgreSQL18.4 storage/CLI tests đạt, không skip. Local dùng native cluster mới, đã dừng/xóa; [stdout backend](evidence/tv4-be02-20261021.txt). | Synthetic RPC+SQL không phải full receipt→projection/API. Native cluster không chứng minh Docker runner; xem E-TV4-CI-21. |
| E-TV4-CI-21 | [Push CI 39539691342](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39539691342), [PR CI 39539695150](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39539695150): cả ba job thành công tại source `7a0ab33`; [metadata](evidence/tv4-ci-7a0ab33.json), [stdout Docker DB](evidence/be02-ci-7a0ab33.txt) ghi21/21, binding loopback và cleanup container/volume. | Không nâng NFR07 hoặc whole-system acceptance thành PASS; lỗi/interruption cleanup chưa có fault-injection evidence riêng. |
| E-SC04-L | [SC04 review](sc04-governor.md#tv4-kiểm-chứng-độc-lập-sau-tích-hợp-sc04--21102026), [real receipt](evidence/sc04-local-smoke.json), source `fcd01e5`: final-role real OZ Timelock/Governor; nhánh QA02 riêng5 receipt chi1000 BUD; campaign105 receipt (49 success/56 revert), snapshot/quorum/cancel/whitelist/delay/replay/budget retry. BE02 HttpRpc/readBatch:108 headers,61 raw/45 decoded/16 unknown/0 decode errors tạiH109. | Nhánh demo đã reset, không cộng vào ledger campaign13.000in/out. Không DB projection/API/UI/reorg/testnet hay toàn bộ biến thể TC. GOV chưa có registry BE02, chỉ raw receipt. |
| E-SC04-ROLE | [8 CLI probes](evidence/sc04-role-audit.json): deploy/audit đúng exit0; sai address/config/nonempty/overwrite/remote và holder lạ thật exit1. Bootstrap cố ý grant spender0x...0999 rồi renounce; audit full history chặn funding (Treasury0/F20000). | Fault injection lúc bootstrap còn admin không phải attacker capability sau final init. Manifest local không thay testnet; K2 là handoff policy, BE02 chưa tự enforce. |
| E-GOV-INV | Source `fb7d5c5`, [Foundry stdout](evidence/tv4-sc04-foundry-20261021.txt):142 passed/0 fail/skip,82 Governor unit,4 governance properties nhóm1 campaign100×50=5000calls; seed0x20261021,14actions, ghost allowances/checkpoints, in-sequence execute + sticky oracle. [Attack regression](../tests/attacks/GovernanceAttacks.t.sol): khác snapshot/approved transferFrom/allowance denial/shared request/budget retry,3successful execute. | Model5voter/4recipient/16request/24proposal; chưa signatures/ERC1271, aggregate100run coverage hoặc arbitrary-strategy liveness. Counter/state samples stdout là chuỗi cuối, không tổng100runs; transferFrom positive chứng minh bằng regression, không suy từ chuỗi cuối có0transferFrom success. |
| E-RAWSQL-22 | 22/10, [governance-storage.json](evidence/tv4-20261022/governance-storage.json): canonicalH109,108 headers/61 raw/45 decoded/16 unknown/0 decode errors lưu native PostgreSQL18.4 cô lập; exact headers/raw/payload/RPC, SQL BUD ledger13000in/13000out và2 paid requests khớp chain cùngH. Trigger lỗi header thứ hai rollback batch, giữ prior committed batches; scanner/CLI rerun idempotent; DB trống thứ hai raw replay cùng semantic digest `dcbccb018fe122d966cf0a6f2c42e32215ff873c01f6f62bd42184e5da7c1086`. | Không checkpoint/resume/reorg/K-confirmations/projection/state rebuild/FR15. CLI restart/rebuild exit2 kỳ vọng vì unknown init topics; GOV registry chưa hỗ trợ, dùng ABI cung cấp. |
| E-UI-22 | 22/10, [frontend-browser.json](evidence/tv4-20261022/frontend-browser.json):11 scenarios Chromium150 thật trên canonical root `fixtures/api`:20/20/5, exact ID/whitespace, filter7Executed/7Active, detail`61,000000000000000001 BUD`, empty/notfound, disabled form, loading3dynamic chunks/recovery, dev error/retry/disable, production bỏ qua injection; keyboard skip/Tab/Enter,4screens390/1366 không horizontal overflow;3PNG kèm báo cáo. | Browser fixture proof, không HTTP API/projection/wallet/form submit/UI→chain→API hoặc mọi variant TC13. |
| E-CANDIDATE-22 | Frontend snapshot nguồn `47f91d50b7a9104c027dbf05e7a862ddb69d31d0`, không git merge/commit/push; baseHEAD vẫn `5fbf615`, candidate chưa commit, source hashes tại [work summary](tv4-work-summary.md). Node24.15.0 lint0warnings/build đạt. Clean candidate clone baseline rồi overlay source, không copy node_modules/out/cache: clean installs, frontend lint/build, `scripts/ci.sh`142/142, fuzz256/invariant100×50 seed `0x20261021` đạt. | Cùng máy, compiler global sẵn; không independent other-machine acceptance. Native SQL mới khác Docker runner cấu hình workflow; không claim GitHub CI run mới22/10. Foundry lints hiện hữu không suppress. |
| E-TV4-23 | [Evidence23/10](evidence/tv4-20261023/verification.json):147 Foundry tests đạt,0fail/skip; seed0x20261021 và hai campaign100×50. Năm attack regression mới kiểm final checkpoint đúngS, exact role error khi operation hợp lệ, ETA−1/ETA, canceled-request reuse và queued budget retry/cancel. Tám process tests kiểm SIGINT/SIGTERM, signal lặp, escalation/reap/closed RPC và staged evidence; Node24.15.0/PG18.4 thật chạy63+21backend tests, smoke SQL rollback/restart/raw replay cùngH; frontend lint/build và browser production fixture đạt. | Bounded oracle không chứng minh arbitrary-strategy liveness. Native PG không phải Docker; raw replay không là checkpoint/reorg/projection rebuild. Browser fixture không là ví/API E2E. Testnet, independent other-machine acceptance và peer approval mới vẫn chờ [#18](https://github.com/SE2026-21-1/dao-budget-simulator/issues/18)/[#19](https://github.com/SE2026-21-1/dao-budget-simulator/issues/19)/[#20](https://github.com/SE2026-21-1/dao-budget-simulator/issues/20). |

SC04 và các bàn giao BE03–BE06/wallet đã có trên nhánh tích hợp24/10. Proof21–23/10 bên trên giữ đúng nguồn lịch sử; trạng thái hiện tại và hạn chế release nằm ở mục0. Không dùng raw replay thay reconstruction, fixture thay chain, hoặc CI của source cũ thay CI revision mới.

Quy ước: BẰNG CHỨNG CỤC BỘ không tự nâng TC/FR/NFR toàn hệ thống thành PASS. Các setup/kỳ vọng dưới đây là tiêu chí đầy đủ; nhãn trạng thái cũ phải đọc cùng mục0. Unit nguồn, final-role smoke, bounded invariant, browser và testnet là các phạm vi riêng.

## 2. Fixture độc lập, clock, reset và cấu hình

### F0 — khởi đầu chuẩn cho mỗi ca/biến thể

- Local chain riêng `chainId=31337`; `U=10^18`; mọi lượng bên dưới tính token, encode bằng số nguyên ×U. Không dùng Number/float cho tiền hoặc uint256.
- Account định danh local xác định: A=`0x00000000000000000000000000000000000000a1`, B=`0x00000000000000000000000000000000000000b1`, C=`0x00000000000000000000000000000000000000c1`, D=`0x00000000000000000000000000000000000000d1`; X (attacker/người bất kỳ)=`0x00000000000000000000000000000000000000e1`; Z (deployer)=`0x00000000000000000000000000000000000000e0`; F (funding)=`0x00000000000000000000000000000000000000f0`; R/R2 (recipient)=`0x00000000000000000000000000000000000000f1`/`0x00000000000000000000000000000000000000f2`. Đây là account fixture **dự kiến**, không địa chỉ deployment/receipt đã có. Unit dùng prank ví EOA; E2E dùng account local được kiểm soát và ghi mapping vai trò→địa chỉ thật trong manifest, không ký bằng địa chỉ tùy ý. Mỗi account có 100 native token local để trả gas; không tính gas vào ledger BUD.
- Deploy contract thật, lưu địa chỉ thực từ receipt (không gán Treasury vào EOA). GOV fixed supply 1.000U; A/B/C/D=400/300/200/100U; các ví khác GOV=0. BUD mint một lần 20.000U cho F rồi F transfer 10.000U vào Treasury: Treasury=10.000U, F=10.000U, R/R2/X/Z/A/B/C/D=0 BUD. Quét bao gồm Transfer cấp quỹ đầu tiên. Treasury không native balance dùng cho khoản chi.
- Sau deploy/seed, tại `t0−2`, A/B/C/D self-delegate, trừ override ghi rõ từng ca. Mine tại `t0−1`, rồi tạo proposal tại `t0=1800000000`; checkpoint đã **thành quá khứ** trước propose. GOV/Governor cùng ERC-6372 `mode=timestamp`. Không coi receipt delegate cùng timestamp là checkpoint quá khứ; gọi getPastVotes ở current/future phải bị từ chối. Governor threshold dùng checkpoint quá khứ theo implementation đã build (OZ chuẩn dùng `clock()−1`).
- Ngưỡng 50U; quorum 20% past totalSupply=200U; voting delay=60s, period=300s; minDelay timelock=120s. Mọi proposal mặc định A tạo, target duy nhất Treasury, value=0, calldata duy nhất `disburse(requestId,R,1000U)`. Với nhãn ca/biến thể `L`, requestId=`keccak256(UTF8("tv4:"+L))`; không dùng lại giữa ca ngoài TC10. Description mặc định nguyên văn `{"version":1,"title":"Chi ngan sach DAO","body":"Khoan chi mo phong cho nghiem thu TV4."}`. Mọi biến thể phải ghi toàn bộ bytes gửi thật; title/body/Unicode và request generator sản phẩm vẫn chờ chốt (§8).
- Proposal mới Pending, vote totals=0, `hasVoted=false`, request chưa paid, operation chưa schedule; không giữ chỗ ngân sách. `S=proposalSnapshot=t0+60=1800000060`, `D=proposalDeadline=S+300=1800000360`. Phải đọc lại S/D từ contract và assert giá trị, không chỉ tính ở test.
- Chuỗi thành công chuẩn G(L,amount,recipient): propose tại t0; A/B For tại S+1/S+2 =>700U For; tại D+1 state Succeeded; X queue qua Governor tại `q=D+1` (local test cho phép cùng timestamp sau eth_call), đọc operationId/salt/predecessor thật và `E=proposalEta=q+120=1800000481`; X execute qua Governor tại E. E2E có block timestamp thực khác thì dùng q/E thực, assert E≥q+minDelay. Không impersonate Governor/Timelock để tạo giải ngân hợp lệ.

### Biên thời gian bắt buộc

| Clock được mine chính xác | State/hành vi kỳ vọng cho OZ 5.4.0 timestamp; phải đối chiếu Governor thật |
|---|---|
| S−1, S | Pending; vote revert; tại S vẫn chưa truy vấn checkpoint S như quá khứ được. Creator còn được cancel Pending. |
| S+1 | Active, đọc past votes ở S được; vote được với trọng số snapshot. |
| D | Active, vote lần đầu còn được. Queue chưa được. |
| D+1 | Succeeded hoặc Defeated theo tally; vote revert. |
| E−1 | Queued/Waiting, execute revert. |
| E | Queued với operation Ready; execute được nếu đủ các điều kiện khác. Thành công mới chuyển Executed. |

Test dùng **timestamp của block chứa giao dịch**, không timestamp trước khi gửi rồi để automine tăng ngoài ý muốn. Mỗi biên khôi phục fixture riêng để phiếu trước đó không làm nhiễu. Ready không là proposal state; revert không sinh Failed/Expired. Nếu Governor tích hợp khác các biên trên, coi là điểm cần review TV1 và cập nhật mọi consumer đồng bộ, không sửa oracle theo kết quả để cho qua.

### Reset và manifest là điều kiện chạy

- **R0 (contract):** redeploy/seed F0 cho từng TC và từng biến thể; hoặc snapshot sau F0 rồi revert, tạo snapshot mới sau mỗi lần revert. Reset timestamp, token/delegate checkpoints, paidRequests, operations, proposal/vote totals và native funding. Không dùng state TC trước làm setup TC sau; helper G chỉ tái tạo dữ liệu trong chính fixture đó.
- **R1 (backend):** chain F0 mới + PostgreSQL database cô lập mới từ migration; ghi deployment scope riêng, reset worker/checkpoint/revision và cache. SQL checks transaction/ROLLBACK không thay cho reset chain. Không xóa DB đang phục vụ/người dùng.
- **R2 (UI):** R1 nếu E2E thật, ví local map account đúng; xóa cache/cursor/session theo scope, trả mạng/ví và form về đầu. Kịch bản mock phải gắn nhãn mock, không thay E2E thật.
- Manifest thật bắt buộc có chainId; GOV/BUD/Treasury/Governor/Timelock addresses và deployment block **từng contract** cùng mốc quét sớm nhất; ABI version/hash từ compiler; commit SHA; compiler/EVM/optimizer/dependency lock revision; 18 decimals/supply/phân bổ; threshold/quorum/delay/period/minDelay/clock; K=2; mapping ví/roles; txHash deploy/seed/renounce. Không lưu private key hoặc RPC secret. Local tăng thời gian được; testnet phải chờ thật và dùng đúng commit đã kiểm.
- Check-roles phải exit nonzero khi sai địa chỉ/holder/minDelay/token links, kiểm tra zero address và tất cả ví demo/deployer. Bằng chứng danh sách role phải đối chiếu grant/revoke history từ deploy và `hasRole`, không chỉ kiểm một holder mong đợi rồi kết luận không có holder khác.

| Contract/role | Holder duy nhất sau init |
|---|---|
| Treasury SPENDER_ROLE, DEFAULT_ADMIN_ROLE | TimelockController |
| Timelock PROPOSER_ROLE, EXECUTOR_ROLE, CANCELLER_ROLE | BudgetGovernor; EXECUTOR không mở cho zero address |
| Timelock DEFAULT_ADMIN_ROLE | chính TimelockController |

Z đã renounce admin ở cả Treasury/Timelock; X/A/B/C/D/F/R không có role chi/quản trị. Bất kỳ ví có gas vẫn được queue/execute **qua Governor**; không mâu thuẫn việc chỉ Governor có role trực tiếp ở Timelock.

## 3. Ma trận TC01–TC14

Mỗi mục ghi module owner; **TV4 acceptance owner** áp dụng riêng cho từng mục. Khi bị revert, phải assert không có log chi được commit, recipient/quỹ không đổi và state/request/operation không bị tiêu thụ trái phép; lưu decoded custom error từ ABI thật hoặc revert trace. Tên lỗi riêng trong SC01 chỉ là đề xuất, không được giả làm ABI đã triển khai.

### TC01 — Luồng thành công và dữ liệu đọc

- **Map:** FR02–FR09, FR11–FR13, FR16; BR01–BR05, BR07; NFR01. **Owner:** TV1 contract; TV2 projection/API; TV3 UI; TV4 acceptance.
- **Setup/reset:** R0+R1+R2/F0, G(TC01,1000,R), A/B/C/D past votes=400/300/200/100U; R=0, quỹ=10.000U; bắt đầu Pending t0, không dùng fixture API giả.
- **Hành động:** người xem chưa nối ví xem dữ liệu; A tạo qua form rồi script đối chiếu description bytes/hash/proposalId với ProposalCreated. A/B vote For khi Active; X thử queue trước kết quả (revert), queue D+1 và execute E qua Governor; theo dõi indexer/API/UI tại H đã đủ K.
- **Kỳ vọng quan sát:** VoteCast A400/B300, tally For700/Against0/Abstain0U, quorum200U; Succeeded không tự chuyển tiền. ProposalQueued + CallScheduled có operationId/ETA đúng, trước execute quỹ vẫn10.000U. Receipt execute status1, ProposalExecuted + CallExecuted + `BudgetDisbursed(requestId,R,1000U)` và đúng BUD Transfer Treasury→R1000U; paid=true, operationDone=true, state Executed; Treasury9000U/R1000U/F10000U. Tại cùng H API/UI totalIn10000U,totalOut1000U,balance9000U, một khoản chi không đếm Transfer+BudgetDisbursed hai lần; description/S/D/ETA/txHash và activity khớp chain.
- **Test/evidence:** E-SC04-L `demo1000` đạt contract-only G với A+B700,5 receipt và9000/1000/10000; final roles audit. E-RAWSQL-22 thêm raw chain→SQL/ledger cùngH109 của campaign khác; E-UI-22 thêm public browser fixture, không nối receipt/demo/SQL. **CÒN CHẶN** projection/HTTP API/wallet/form/same-H chain-backed UI; chưa nghiệm thu TC01 toàn bộ. `tests/e2e/GovernanceFlow.t.sol` và API/video E2E vẫn dự kiến. Demo là nhánh F0 đã reset, không trộn ledger campaign.

### TC02 — Thiếu quorum và vai trò Abstain

- **Map:** FR05–FR07; BR01–BR02, BR07; NFR01. **Owner:** TV1; TV3 hiển thị tally; TV4 acceptance.
- **Setup/reset:** R0/F0 riêng mỗi biến thể, A propose1000U/R tại t0, tất cả totals0/quỹ10000U/request unpaid.
- **Hành động/kỳ vọng:** (a) D For100U tại S+1; đến D+1 Defeated vì100<200, queue và execute revert, quỹ10000U/R0/request unpaid. (b) F0 mới: D For100U, C chuyển100 GOV cho X **trước S**, X self-delegate trước S; X Abstain100U sau S, C không vote. For100+Abstain100=200 đạt quorum, Against0 => Succeeded D+1; X queue được. Đối chiếu snapshot C100/X100, không mượn quyền ngoài1000U. (c) F0 mới: C Against200U và D For100U, tổng tham gia300 nhưng For+Abstain100<200 => Defeated; Against không góp quorum. Mỗi VoteCast/tally đúng support0/1/2 và weight.
- **Test/evidence:**82 unit Governor đã chạy lại có quorum/For+Abstain/Against; E-SC04-L có low-quorum/tie/abstain-only và For100+Abstain200. **BẰNG CHỨNG CONTRACT CỤC BỘ**, không còn blocker thiếu Governor; exact F0 variants/UI tally/acceptance TC02 theo hàng trên chưa tự đánh PASS.

### TC03 — Đạt quorum nhưng hòa/thua

- **Map:** FR05–FR08; BR02, BR07; NFR01. **Owner:** TV1; TV4 acceptance.
- **Setup/reset:** R0/F0 từng nhánh; tại t0−2 A chuyển200 GOV cho X và X self-delegate (A còn200U); mine checkpoint trước t0. B300/C200/D100, supply1000/quỹ10000U. A đủ threshold và propose1000U/R.
- **Hành động:** nhánh hòa A For200U, C Against200U; nhánh thua reset rồi A For200U, B Against300U; vote tại S+1 trở đi, đọc state D và D+1, X queue/execute.
- **Kỳ vọng:** quorum đạt200U cả hai; tại D còn Active, D+1 Defeated vì For≤Against; queue/execute revert, không operation được schedule/chi, paid=false, quỹ10000U/R0; UI tách rõ quorum đạt và kết quả thất bại.
- **Test/evidence:** unit `testTieDefeated`/`testLossDespiteQuorumDefeated` đạt trong E-GOV-INV; E-SC04-L có For400=Against400 và queue bị chặn. Còn UI và reset/evidence đầy đủ theo biến thể chuẩn; không dùng fixture BE01 thay runtime hoặc đánh TC03 toàn bộ PASS.

### TC04 — Một phiếu và các biên snapshot/deadline

- **Map:** FR02, FR05–FR07; BR01–BR02; NFR01. **Owner:** TV1, TV3 guard UI; TV4 acceptance.
- **Setup/reset:** R0/F0 và A propose tại t0 cho từng biên, Treasury10000U/R0/request unpaid; X0 GOV. Không giữ phiếu từ biến thể khác.
- **Hành động/kỳ vọng:** A vote tại S−1/S revert, totals0/hasVoted(A)=false. A vote lần đầu S+1 hoặc D thành công weight400U, hasVoted=true; lần hai đổi support hoặc lặp cùng support revert, totals không đổi. Vote lần đầu D+1 revert; tại D queue revert. X vote khi Active với weight0 không làm tăng tally (nếu implementation cho nhận phiếu thì VoteCast0, nếu chặn thì ghi error và xác nhận không tăng); không đặt quyền từ số dư hiện tại. Tại S chỉ Pending, S+1 Active; tại D còn Active, D+1 Succeeded nếu A For400U hoặc Defeated nếu không phiếu. Từng giao dịch có timestamp/receipt/trace; không chỉ kiểm UI nút disable.
- **Test/evidence:** E-SC04-L lưu vote tạiS bị chặn, vote tạiD thành công, queue tạiD/late vote bị chặn, double-vote và zero snapshot weight. Unit Governor bổ sung biên còn lại trong E-GOV-INV. Chưa có UI guards/E2E đầy đủ; không còn blocker thiếu Governor và không lấy token-only proof thay vote window.

### TC05 — Attack chuyển token/đổi delegate sau snapshot

- **Map:** FR02, FR05–FR06; BR01–BR02; NFR01; INV04. **Owner:** TV1 unit token/voting; TV4 attack/acceptance.
- **Setup/reset:** R0/F0; nhánh a A/B/C/D self-delegate; nhánh b D **không delegate trước S** nên D past votes0 dù balance100U. A propose1000U/R, bắt đầu Pending t0, X past votes0, quỹ10000U.
- **Hành động:** a tại S+1 A vote400U For rồi transfer400U A→X, X self-delegate; B đổi delegate sang X sau S, X thử vote cùng proposal. b reset rồi D self-delegate sau S, D vote. Thêm biến thể transferFrom đã approve để bao phủ cùng đường cập nhật votes.
- **Kỳ vọng:** a current votes X700U/A0/B0 nhưng `getPastVotes(A,S)=400U`, B300U, X0; phiếu X không tăng tally (0 hoặc revert theo ABI), B vẫn có quyền snapshot300U nếu vote; cuối For≤1000U, không đếm lại400 của A. b D snapshot0, delegation muộn không thêm100U. Paid=false/quỹ10000U/R0 nếu không execute; DelegateChanged/DelegateVotesChanged/Transfer và VoteCast liên kết đúng timestamps. Không khẳng định chống mua phiếu trước snapshot hoặc Sybil ngoài phạm vi.
- **Test/evidence:** E-SC04-L có receipt snapshot attack A400/B300 chuyển/delegate sang caller700, caller vote0; [`GovernanceAttacks.t.sol`](../tests/attacks/GovernanceAttacks.t.sol) kiểm hai snapshot độc lập, direct transfer/redelegate/undelegate và approved transferFrom/allowance denial với ghost oracle. Lệnh `forge test --match-path tests/attacks/GovernanceAttacks.t.sol -vvvv`. **CỤC BỘ TC05**, còn F0/reset/per-vector acceptance và UI; không dùng token-only proof thay Governor.

### TC06 — Attack gọi thẳng Treasury/Timelock

- **Map:** FR07–FR09; BR03–BR04, BR07; NFR01, NFR08; INV02. **Owner:** TV1 unit access control; TV4 attack/acceptance.
- **Setup/reset:** R0/F0 roles đã renounce đúng bảng; X không role, Treasury10000U/R0/request unpaid, t0 không có proposal/operation. Nhánh trực tiếp execute dùng thêm G tới Queued/Ready hợp lệ sau reset để thử operation thật.
- **Hành động:** X gọi `Treasury.disburse`, Timelock `schedule`/`scheduleBatch` với delay0 và120, `execute`/`executeBatch` trên operation hợp lệ; X thử cấp SPENDER/PROPOSER/EXECUTOR/CANCELLER/admin cho mình và mở executor zero. Sau đó X queue/execute đúng đường Governor như positive control.
- **Kỳ vọng:** tất cả đường trực tiếp/role trái quyền revert với AccessControl error account/role đúng; không CallScheduled/CallExecuted/BudgetDisbursed được commit, không đổi role/paid/quỹ. Với positive control Governor, X hợp lệ dù không role trực tiếp: chi1000U, quỹ9000U/R1000U. Không giả mạo Timelock để tạo positive control.
- **Test/evidence:** E-SC04-L: final-role audit, outsider/former-deployer trực tiếp disburse/schedule/scheduleBatch(delay0/120)/execute/executeBatch(granted operation Ready) và grant/open executor bị chặn; positive execution qua Governor thật. E-SC04-ROLE xác minh complete holder sets và fault fixture. **ĐÃ CHẠY CONTRACT CỤC BỘ**, cần peer review/đủ biến thể matrix trước nghiệm thu TC06; không còn lý do chờ Governor/Timelock local.

### TC07 — Attack execute sớm/lặp

- **Map:** FR07–FR09, FR12; BR03, BR05, BR07; NFR01; INV01–INV02. **Owner:** TV1, TV3 phản hồi receipt; TV4 attack/acceptance.
- **Setup/reset:** R0/F0, G(TC07,1000,R) dừng sau queue q=D+1, operation pending E=q+120, quỹ10000U/R0/request unpaid. Các lần thử nằm cùng ca có chủ ý; biến thể sai description reset riêng.
- **Hành động/kỳ vọng:** X execute E−1 qua Governor revert, state vẫn Queued, operation Waiting, paid=false và không tiền ra. Tại E operation Ready (không state Ready), execute thành công chính xác1000U, state Executed/done/paid=true, quỹ9000U/R1000U. Execute lần nữa E+1 revert, không log chi thứ hai hoặc thay balance/request. Queue/execute với descriptionHash đổi do parse/stringify/khoảng trắng khác phải không điều khiển operation gốc; gốc vẫn retry được bằng nguyên bytes đúng.
- **Test/evidence:** E-SC04-L lưu q/E, operation salt/hash độc lập, exact E−1 revert/E success/replay denial; tampered-description queue bị chặn, unit Governor có execute tampering. Lệnh smoke trong README, raw trace/error/receipts trong JSON. **CỤC BỘ TC07**, chưa gắn UI/API/state display hoặc đầy đủ vector reset; không coi Ready là proposal state.

### TC08 — Attack payload ngoài phạm vi và ngưỡng tạo

- **Map:** FR03, FR07–FR08; BR03–BR04, BR06; NFR01; INV02. **Owner:** TV1 validator on-chain; TV3 form validation; TV4 attack/acceptance.
- **Setup/reset:** R0/F0 từng input; A đủ400U past votes, X0; Treasury10000U/R0/request unpaid, t0 chưa proposal. Nhánh threshold chuyển49U GOV từ A→X và X self-delegate ở t0−2, mine quá khứ trước propose; A còn351U. Thêm nhánh X50U để chứng minh biên threshold hợp lệ; nhánh delegate cùng timestamp chưa có checkpoint quá khứ phải từ chối khi quyền quá khứ<50U.
- **Hành động:** bỏ qua UI, gọi propose chuẩn với 0 hoặc2 actions, mảng độ dài lệch; target BUD/EOA/Timelock thay Treasury; selector transfer/grantRole/updateDelay thay disburse; native value1 wei; calldata quá ngắn/ABI hỏng; recipient zero hoặc Treasury; amount0; payload đổi role/tham số. Gửi từng input độc lập, cùng request bytes32 không dùng làm lý do chặn thay kiểm tra payload.
- **Kỳ vọng:** mỗi input sai revert ở Governor on-chain, không ProposalCreated/operation, không role/config/balance/paid đổi. Threshold49U và checkpoint chưa quá khứ bị từ chối,50U và payload hợp lệ tạo Pending/ProposalCreated đúng; số dư không bị trừ. Mô tả/title UI biên nằm §5 Q-UI, không giả contract có validate độ dài text khi chưa chốt ABI. Không tự cấm requestId zero vì requirements không cấm.
- **Test/evidence:** E-SC04-L có10 malformed/payload restriction transactions và proposer0votes denial;82 unit đã chạy có49/50 threshold, zero request, truncated/dirty/trailing calldata. **CỤC BỘ TC08**; UI title/body/request generation/đủ per-vector acceptance chưa xong, không còn blocker thiếu on-chain whitelist.

### TC09 — Tranh số dư, revert nguyên tử, nạp rồi retry

- **Map:** FR07–FR09, FR11–FR13; BR03–BR05, BR07; NFR01; INV03. **Owner:** TV1 contract; TV2 ledger; TV3 UI; TV4 acceptance.
- **Setup/reset:** R0+R1/F0; P1 chi7000U→R, P2 chi6000U→R2, request khác nhau, A tạo tại t0 (cùng timestamp local có thể nhiều tx); mỗi P có A+B For700U, S/D đọc riêng; cả hai queue sau D, E1/E2 đủ120s. Tổng đề xuất13000U>quỹ10000U vẫn tạo/queue được; F10000U/R/R2=0.
- **Hành động/kỳ vọng:** X execute P1 khi Ready => Treasury3000U,R7000U, P1 Executed/paid1=true. Execute P2 khi Ready thiếu3000U => toàn tx revert, Treasury3000U/R2=0, paid2=false, P2 Queued/Ready, operation2 chưa done; không event chi được commit, **không Failed**. F transfer3000U vào Treasury => F7000U/quỹ6000U; retry **cùng P2/operation2/request2** thành công => Treasury0, R2 nhận chính xác6000U, R giữ7000U, F7000U. Ledger tại H totalIn13000U,totalOut13000U,balance0; revert không tăng tổng chi hay paid. Không recreate proposal để né retry.
- **Test/evidence:** E-SC04-L có đúng competing7000/6000, quỹ10000, topup3000, retry cùng proposal/operation/request và chain ledger13000in/out. Attack regression riêng còn khác snapshots và shared request, không trộn ledger hai fixture. **CHẶN PHẦN API/UI/same-H projection**, không phải chặn Governor operation/state; TC09 chưa full acceptance.

### TC10 — Attack hai proposal cùng requestId

- **Map:** FR03, FR08–FR09, FR13; BR03–BR05; NFR01; INV01. **Owner:** TV1 paid-request unit; TV2 linkage/dedup; TV4 attack/acceptance.
- **Setup/reset:** R0+R1/F0; request chung=`keccak256(UTF8("tv4:TC10"))`; P1 chi1000U→R, P2 chi2000U→R2, descriptions khác nguyên bytes nên proposalId khác; cả hai A+B For700U và queue đúng delay, quỹ10000U. Nhánh khác reset rồi dùng bytes32(0), không mặc định cấm zero.
- **Hành động/kỳ vọng:** execute P1 trước => quỹ9000U/R1000U, paid=true, P1 Executed. Execute P2 sau ETA revert vì request đã trả dù đủ9000U, P2 vẫn Queued/operation chưa done, R2=0, chỉ một Transfer/BudgetDisbursed thành công cho request. Reset rồi đảo thứ tự: P2 thành công2000U, P1 bị chặn => quỹ8000U/R2=2000U/R0. Phân biệt uniqueness proposalId với thanh toán requestId; không vô tình kiểm hai lần cùng operation thay cho TC10.
- **Test/evidence:** E-SC04-L có proposalId/operationId khác nhau cùngrequest:7000 trả,2000 bị RequestAlreadyPaid dù quỹ còn3000. Attack regression còn refill để loại lý do thiếu tiền; invariant bao gồm request0. **CỤC BỘ TC10**, chưa chạy raw-receipt cả hai thứ tự với bytes32zero/reset từng biến thể; linkage/dedup API chưa có, không đánh toàn bộ PASS.

### TC11 — Crash/restart, RPC lỗi và reorg

- **Map:** FR09, FR11, FR13–FR14, FR16; BR05; NFR03–NFR04. **Owner:** TV2 indexer/API/SQL tests; TV4 integration/acceptance.
- **Setup/reset:** R1/F0+G(TC11,1000,R) trên chain local riêng; K=2, database sạch, headers mọi block kể cả rỗng; fix batch range/checkpoint trước batch và cửa sổ hash W đã chốt trong run config. Quỹ chain sau G9000U/R1000U. Thêm nhánh snapshot chain trước G để tạo reorg canonical thay thế không có chi.
- **Hành động:** ngắt worker (i) sau raw logs trước projections, (ii) sau projections trước checkpoint/COMMIT, (iii) sau COMMIT trước acknowledge; restart cùng DB, scan lại batch. Tiêm lỗi RPC trước/giữa batch và decode lỗi. Reorg trong W bằng local fork/revert rồi mine nhánh thay; restart kiểm checkpoint hash, rollback đến common ancestor A rồi quét lại. Ca riêng vượt W phải không tìm được ancestor và yêu cầu rebuild.
- **Kỳ vọng:** trước COMMIT batch rollback cả checkpoint/projection; sau COMMIT replay không trùng/mất. Key chainId+txHash+logIndex duy nhất, lưu blockHash/raw topics/data và kiểm conflict khác payload/hash, không DO NOTHING che reorg. Checkpoint không vượt dữ liệu đã commit hoặc head−2, kể cả block không event. RPC retry có backoff theo config ghi trong evidence, không hot-loop/advance giả. Nhánh bị thay không còn log/vote/payout/count; revision/cursor cũ bị invalid; số dư rebuilt trên nhánh thay=10000U/R0 nếu chi bị orphan. Vượt W: health not_ready/rebuild_required, ngừng phục vụ dữ liệu mới như canonical, không đoán checkpoint hay tiếp tục advance.
- **Test/evidence24/10:** E-TV4-24-DB có16 PostgreSQL crash/checkpoint tests, kill trước/sau COMMIT, K/resume/redecode; live chain storage giữ raw/idempotence. E-TV4-24-X tái hiện reorg thật: CLI exit1 CHECKPOINT_HASH_MISMATCH và DB giữ nguyên, nhưng API vẫn200 với publication hash orphan. **CHƯA NGHIỆM THU TC11:** thiếu BE07 rollback/replay/window/backoff và invalidation; không sửa hash/xóa DB để báo PASS.

### TC12 — DB trống và rebuild cùng H

- **Map:** FR04, FR06–FR09, FR11, FR13–FR16; BR01–BR05, BR07; NFR01, NFR04. **Owner:** TV2 rebuild/historical query tests; TV1 đối chiếu contract; TV4 acceptance.
- **Setup/reset:** R1/F0 mới; chốt H là block có timestamp `t0+1000`, rồi mine thêm2 block để H đủK. Tạo8 proposal A sở hữu, mỗi khoản1000U→R, nhãn/request/description riêng: Executed tạo t0 và chạy G (chi duy nhất1000U); Queued Waiting tạo t0+100, queue t0+950 (ETA=t0+1070); Queued Ready tạo t0+200, queue t0+700 (ETA=t0+820); Succeeded tạo t0+500, chưa queue; Defeated tạo t0+510; Active tạo t0+800; Canceled tạo t0+900 và A cancel t0+901; Pending tạo t0+950. Với Executed/Queued/Succeeded, A/B For tại snapshot+1/+2 (700U); Defeated chỉ D For100U; Active chỉ A For400U trước H; Pending/Canceled không phiếu. S/D từng P lấy create+60/+360 và assert contract; thực hiện các giao dịch theo thứ tự timestamp tăng, không warp ngược. Tại H: quỹ9000U/R1000U/F10000U, chỉ request Executed paid; các proposal khác không giữ chỗ. Ghi H number/hash/timestamp canonical từ DB cũ, freeze cả hai DB tại H (không dùng latest); block rỗng làm chuyển state theo clock.
- **Hành động:** export canonical projection ở H từ DB đang có, tạo **DB mới trống riêng** và chạy rebuild từ manifest/ABI/address/deployment blocks đến H, không đọc DB cũ hoặc seed metadata riêng. So sorted values của proposal (IDs/description bytes/calldata/proposer/recipient/amount/S/D), votes/support/weight, operation/salt/predecessor/ETA/status, requests đã paid, raw canonical logs, Transfer ledger và tổng số. So Governor.state/quorum(snapshot)/proposal fields, Timelock readiness, GOV past votes/supply và BUD.balanceOf bằng eth_call block H/hash.
- **Kỳ vọng:** hai tập có cùng nội dung, không chỉ count/hash tự khai; balance9000U và totalIn10000U,totalOut1000U khi chỉ có chi nêu trên; state tính bằng clock(H), **không** chỉ event cuối, không dùng Date.now/latest. Tại H trước/tại snapshot quorum chưa tra quá khứ phải xử lý rõ; kiểm thêm H ở S/S+1/D/D+1/E−1/E bằng các ca con reset độc lập. Revision mới có thể khác nhưng không làm khác business data; cursor cũ invalid theo hợp đồng. RPC thiếu historical state phải báo DATA_NOT_READY, không fallback latest. DB cũ giữ nguyên cho đến so sánh đạt.
- **Test/evidence24/10:** E-TV4-24-R có hai target H67/hash,post-H exclusion/mismatch probe và [driver TC12](evidence/tv4-20261024-acceptance/run-tc12.mjs) đã chạy đúng tám proposal H49=t0+1000,10vote/3operation/2Transfer/1disbursement; toàn bộ normalized values/chain compare equal, API đủ tám proposal, totals10000/1000/9000 và Pending quorum=null. Sáu case S/S+1/D/D+1/E−1/E cũng dùng reference+target DB mới riêng trên lịch sử chain được ghim hash, không warp ngược. [Kết quả7case](evidence/tv4-20261024-acceptance/tc12-complete/report.json). Lần đầu harness khai sai prefix1 thay vì firstBlock2 bị API503 đúng, FAIL được giữ riêng; sửa harness, không nới readiness. Historical-RPC failure và cursor invalidation sau reorg vẫn chưa nghiệm thu theo TC11.

### TC13 — Ví, form, receipt, HTML và mạng

- **Map:** FR01–FR05, FR07–FR08, FR10–FR12, FR16; BR03–BR04, BR06–BR07; NFR01, NFR03, NFR06. **Owner:** TV3 wallet/component tests; TV2 API error/data tests; TV4 browser E2E/acceptance.
- **Setup/reset:** R2/F0 từng nhánh, chưa nối ví, chain config lấy manifest thật, API snapshot H/hash đủ K; ví A400 past votes và Treasury10000U/R0. Form chưa submit, giữ requestId đã sinh. HTML mô tả dùng text `<img src=x onerror="window.__tv4_xss=1">`; không nạp secret vào browser logs.
- **Hành động/kỳ vọng:** xem public bốn màn hình không ví; nối đúng mạng hiển thị address/chain, balance/delegate/current/snapshot voting power; sai mạng chặn gửi tx tới địa chỉ mạng khác và yêu cầu switch (ghi wallet request log không có sendTransaction sai mạng). Từ chối ký giữ nguyên title/body/amount/recipient/description/requestId và hiển thị user rejected; pending wallet→submitted txHash→confirming→success chỉ sau receipt status1. Receipt status0 là revert + lý do dễ hiểu, không success; cập nhật sync state sau receipt, dùng contract state trước action nếu API trễ. HTML không tạo DOM handler/script hoặc thay sentinel, vẫn hiển thị text an toàn. Propose/vote/queue/execute/cancel trên UI phải đi chain thật theo điều kiện TC khác, lịch sử có transaction và testnet simulation banner. Title 4/5/120/121 và body19/20/2000/2001 kiểm biên theo quy tắc ký tự đã chốt, recipient/amount sai không được gửi như hợp lệ.
- **Test/evidence24/10:** E-TV4-24-UI chạy12checks trên API/Anvil thật:connect,wrong network/refusal giữ form,HTML-safe,propose/vote/queue/execute/cancel/deposit,receipt cancellation/repricing/account-switch vàstatus qua refresh. Bốn route390/1366,skip-link/Enter đã quan sát. EIP-1193 injected không là ví extension; chưa chốt video/hardware wallet và mọi negative/reset variant TC13.

### TC14 — Attack deployer và quyền hủy Pending

- **Map:** FR03, FR07–FR10, FR13; BR03–BR04, BR06–BR07; NFR01, NFR08; INV02. **Owner:** TV1 access/cancel tests; TV2 canceled history; TV3 UI; TV4 attack/acceptance.
- **Setup/reset:** R0+R1/F0 đúng roles/renounce, Z0 role, A tạo Pending t0, quỹ10000U/R0/request unpaid. Mỗi người/mốc/state hủy là fixture riêng; không dùng proposal đã hủy để chứng minh hủy sai thời điểm.
- **Hành động/kỳ vọng:** Z thử grantRole lại admin/spender/proposer/executor/canceller, gọi trực tiếp disburse/schedule/execute và thay minDelay/param trái quyền => revert, roles/config/quỹ không đổi. X/Z hủy Pending do A tạo => revert; A hủy tại S (vẫn Pending) được, ProposalCanceled đúng ID/creator, history giữ description/tx, state Canceled, vote/queue/execute sau hủy đều revert, paid=false/quỹ10000U. A hủy tại S+1 (Active), Succeeded, Queued Waiting, Queued Ready, Executed, Defeated đều revert; không có quyền emergency cancel. Riêng Executed fixture có chi1000U nên baseline9000U/R1000U giữ nguyên sau cancel bị chặn. Kiểm cả overload/entry point cancel công khai của ABI thật, không chỉ nút UI.
- **Test/evidence:** E-SC04-L/E-SC04-ROLE có role graph cuối, deployer mất admin/cannot regain/spend/direct Timelock/updateDelay, creator cancel đúngS và outsider/late denial. Unit Governor chạy lại thêm các state cancel. **CỤC BỘ TC14**, còn peer review/đủ actor×state×boundary variants và API history; không còn blocker thiếu roles/Timelock/Governor local.

## 4. Stateful invariant: không chấp nhận chứng minh rỗng

**Owner:** TV1 unit/fuzz contract; TV4 handler/oracle và acceptance INV01–INV04. Treasury-only campaign cũ giữ nguyên E-TV4-21. Governance thật hiện ở [`tests/invariant/GovernanceInvariant.t.sol`](../tests/invariant/GovernanceInvariant.t.sol) với E-GOV-INV;4 properties nhóm1 campaign100×50=5000calls, không4×5000. Oracle/checkpoints/request/ledger độc lập và successful execute trong action, không chỉ seed setUp. Full acceptance vẫn phụ thuộc model coverage/peer review, không suy rộng sang backend/UI/testnet.

| INV | Oracle độc lập và chuỗi thao tác phải phủ | Map / evidence bắt buộc |
|---|---|---|
| INV01 | Ghost map đếm **giải ngân thành công đã commit** theo requestId; mọi count≤1; receipt/event/recipient balance xác nhận mỗi lần trả. Tạo hai proposalId khác nhau dùng cùng request, xen execute retry/thiếu tiền/nạp quỹ và lặp operation. Không lấy paidRequests của SUT làm oracle duy nhất. | FR08–FR09; BR03, BR05; NFR01/NFR07; TC07/TC09/TC10. Lưu request→proposal/operation→successful receipt, count và trace fail tối thiểu. |
| INV02 | Mọi out BUD hợp lệ phải nối request/proposal/operation, calldata whitelist, For+Abstain≥quorum snapshot, For>Against sau deadline, queue qua Governor và execution timestamp≥ETA. Caller Treasury là Timelock, đường thực tế user→Governor→Timelock→Treasury; role holders không đổi. Handler **không prank Timelock/Governor để chi**. | FR03/FR05–FR08/FR10; BR01–BR04/BR06–BR07; NFR01/NFR08; TC06–TC08/TC14. Lưu ít nhất một trace thành công đầy đủ và âm trái quyền/sớm. |
| INV03 | Từ deployment Transfer BUD canonical: balanceOf(Treasury)=in−out tại cùng block, kể cả seed/nạp thêm/thiếu tiền rồi retry; loại self-transfer khỏi hai tổng, giữ zero transfer không tăng tổng. BudgetDisbursed chỉ nối request, không cộng chi hai lần; GOV/token khác/native không tính vào BUD. | FR08–FR09/FR11/FR13; BR03/BR05; NFR01; TC01/TC09/TC11/TC12. Lưu ledger ghost, Transfer receipts, balance calls cùng H và tổng. |
| INV04 | Với từng proposal, pin supply/past weights tại S; transfer/transferFrom/delegate/undelegate sau S không đổi trọng số đó, mỗi voter≤1 vote; sum(For+Against+Abstain)≤pastTotalSupply(S). Đối chiếu từng voter với snapshot oracle, không chỉ tổng≤1000 để bỏ lọt sai trọng số. | FR02/FR05–FR06; BR01–BR02; NFR01/NFR07; TC04–TC05. Lưu snapshot supply/weight, operations sau S, VoteCast và tally từng proposal. |

**Cấu hình đã chạy:** sourcefb7d5c5, `FOUNDRY_PROFILE=ci FOUNDRY_FUZZ_SEED=0x20261021 bash scripts/ci.sh`:100runs×50depth,5000calls/0handlerreverts và non-vacuity; resolved config trong [tổng hợp](evidence/tv4-sc04-verification.json). Chạy riêng `FOUNDRY_PROFILE=ci FOUNDRY_FUZZ_SEED=0x20261021 forge test --match-path tests/invariant/GovernanceInvariant.t.sol -vv`. Model14actions; cuối stdout5successful/2reverted executes, không phải tổng100runs. Treasury campaign độc lập; unit fuzz256 không thay invariant.

**Tiêu chí coverage đầy đủ:** nhiều actor, delegate/transfer/transferFrom/undelegate, propose hợp lệ/độc hại/trùng request, vote For/Against/Abstain/lặp, warp qua S/D/E, queue/execute/cancel và funding. Cần attempts/success/revert, state visits, successful execution, seed và trace. E-GOV-INV là campaign bounded đã chạy, không còn blocker thiếu SC03–SC05/handler; chưa tự nghiệm thu mọi variant. Không chỉnh balance/paidRequests/ghost bằng cheatcode để giả chi, không lấy positive control ngoài handler thay successful execution trong sequence. Nếu không execute thành công hoặc mọi action revert thì không nghiệm thu, dù invariant báo pass.

**Giới hạn hiện tại, không giảm yêu cầu:** Oracle có allowance/transferFrom, state samples theo code0–7; chưa signatures/ERC1271 hoặc aggregate100runs. Malformed inputs chủ yếu unit82 và smoke; random-only liveness không được khẳng định (cuối stdout unassisted0 và transferFrom success0, positive transferFrom nằm trong regression). Request max16/proposal max24; role invariant chỉ universe hữu hạn, audit đầy đủ dùng checker history riêng. E-GOV-INV là proof bounded model đã chạy, không phải mọi strategy/TC/whole-system INV acceptance đã đóng.

## 5. Bài nghiệm thu dữ liệu và chất lượng bổ sung

Các bài dưới đây bổ sung TC, không đổi mã yêu cầu và không tự tạo framework mới. TV4 acceptance owner cho tất cả; module tests vẫn ở TV tương ứng.
**Trạng thái bổ sung22/10, đọc cùng các tiêu chí lịch sử bên dưới:** Q-READ/Q-UI có E-UI-22 browser fixture thật; còn thiếu45 proposal chain thật, HTTP/cursor/historical API và đầy đủ keyboard/form/wallet. Q-RECOVER có E-RAWSQL-22 raw transaction rollback/idempotence/replay, không production recovery/rebuild. Q-CLONE có E-CANDIDATE-22 clean candidate cùng máy, compiler global sẵn, không independent other-machine/end-to-end acceptance. Q-CI: frontend đã nhập snapshot, governance bounded invariant đã chạy local; Docker raw-storage runner cấu hình workflow nhưng chưa có CI execution mới22/10/peer approval. Không nâng NFR05/NFR06/NFR07 thành PASS; các nhãn “chưa” bên dưới không phủ nhận proof cục bộ mới này.


| Bài / map / module owner | Setup độc lập, hành động và tiêu chí quan sát cụ thể | Reset / evidence / trạng thái |
|---|---|---|
| Q-READ — FR04/FR09/FR11/FR16; NFR01; TV2+TV3 | R1/F0 tạo **45 proposal thật** gồm state theo clock(H); cố định chain/deployment/H/hash/revision. GET list limit20 qua3 trang phải20/20/5, cùng filter không mất/lặp ID, chi tiết/phiếu/treasury/summary cùng H; tìm ID hợp lệ không có báo404 có cấu trúc, ID sai dạng/âm/hex/exponent/>uint256 báo400 theo API spec. Kiểm filter từng state, empty, cursor đổi filter/limit/scope từ chối, cursor invalid/tamper từ chối, H sau checkpoint503, snapshot bị invalid409. Tiền/uint256 chuỗi nguyên, số nhỏ1 wei và fractional BUD không mất chính xác; API không có signing key/endpoint ký. Dashboard totals/dòng tiền, simulation banner và bốn màn hình đúng chain; native/GOV/token lạ không tăng BUD budget. | R1/R2; `docs/evidence/read-api/` **dự kiến** với HTTP dumps/DB/eth_call/ảnh. **CHƯA CHẠY/BỊ CHẶN** API/indexer/UI thật; E-BE01-C chỉ chứng minh fixture45/20/20/5 offline. |
| Q-PERF — NFR02; FR16; TV2 | R1/F0 riêng; trước t0 phân lại1000 GOV thành10 ví mỗi100U: A/B/C/D/X/Z/F/R/R2 và Y=`0x00000000000000000000000000000000000000f3` (Y có100 native local). Self-delegate ở t0−2, mine checkpoint quá khứ; các role và BUD không đổi. A tạo100 proposal ở t0, mỗi chi1U BUD→R nhưng request/description khác; mỗi proposal10 ví vote For100U tại S+1, tổng **100 proposal/1000 vote thật đã index**; H>D+1 đủK, quỹ vẫn10000U vì chưa execute. Load API đọc với **10 clients đồng thời liên tục60s**, mỗi client lặp list/list/summary/detail/votes (40/20/20/20%), ID cố định tồn tại, ghi counts/errors/raw latency; warmup nếu có tách khỏi60s. Ghi CPU/RAM/OS/PostgreSQL/Node/RPC/tool version/manifest/H/dataset. Tính p95 nearest-rank ở vị trí ceil(0.95×N) của mẫu latency đã sắp; báo aggregate và từng endpoint; tiêu chí **p95<1000ms**, không ≤ hoặc thời gian đọc mock. Responses phải hợp lệ, errors báo riêng để lỗi nhanh không làm đẹp p95. | R1, dataset/perf DB riêng không ảnh hưởng demo; tool/lệnh benchmark chốt với TV2 khi server có thật, không khẳng định đã có k6/autocannon. Evidence `docs/evidence/performance/` **dự kiến**; **CHƯA CHẠY/BỊ CHẶN** server/dataset/load runner. |
| Q-FRESH — NFR03; FR13–FR14/FR16; TV2+TV3 | R1/F0, K=2 theo manifest; ghi thời điểm quan sát head≥eventBlock+2 (đã đủ xác nhận) và thời điểm event/projection commit hiển thị API. RPC bình thường: mọi mẫu event đủK được xử lý **trong30s**; không bắt đầu tính từ lúc gửi tx hoặc timestamp H cũ. API sync block không vượt head−2. Cố tình pause worker>30s: UI sync warning khi lagSeconds>30; đúng30s không tự coi vượt ngưỡng; null/health degraded/RPC lỗi hiển thị rõ, không giả synced. Resume rồi bắt kịp warning hết đúng data. | R1/R2 từng delay; evidence timestamps/raw headers/API/UI `docs/evidence/freshness/` **dự kiến**. **CHƯA CHẠY/BỊ CHẶN** worker/API/wallet; health fixture chỉ là ví dụ. |
| Q-RECOVER — NFR04; FR14–FR15; TV2 | TC11 tiêm RPC timeout/429/transport failure ở từng phase, log retry/backoff theo config thật, checkpoint đứng ở batch đã commit; khôi phục RPC bắt kịp không trùng/mất. TC12 rebuild DB mới và so cùng H/hash; vượt cửa sổ reorg dừng dữ liệu mới/rebuild_required. Không xem retry ở JSON checker là RPC recovery. | R1, fault injection riêng, TC11/TC12 evidence **dự kiến**; **CHƯA CHẠY/BỊ CHẶN** worker/rebuild. |
| Q-UI — NFR06; FR01–FR04/FR11–FR12; TV3 | R2/F0 và dữ liệu empty/loading/error/synced có nhãn rõ; browser viewport chiều rộng **390px và1366px**, ghi height/device scale/browser. Bốn màn hình tiếng Việt, không che action/số tiền, label liên kết input; chỉ dùng Tab/Shift+Tab/Enter/Space và bàn phím nhập đủ form, chọn vote/xác nhận/cancel có focus nhìn được; không mắc keyboard trap. Kiểm validation title/body biên TC13 và Unicode sau khi chốt quy tắc ký tự. | Reset viewport/session/form mỗi biến thể; ảnh390/1366 và video keyboard/actions `docs/evidence/ui/` **dự kiến**. **CHƯA CHẠY/BỊ CHẶN** UI runtime tích hợp; module mock tests không thay browser proof. |
| Q-CLONE — NFR05; TV1/TV2/TV3 cung cấp lệnh, TV4 vận hành | Clone mới vào thư mục riêng không dùng cache/out/DB/env của người viết; init submodule đúng lock revision, compiler/Foundry1.8.5/OZ5.4.0/forge-std1.17.0 và Node24.15.0/PostgreSQL18.4 theo repo; cài frontend/indexer đúng lockfile khi có. Theo README duy nhất chạy build/typecheck/tests, chain/DB, deploy/seed/check-roles, demo1000U và TC12. Ghi tool versions, commit, log từng lệnh, role/số dư/receipt thực. Không cần hỏi biến thiếu/thứ tự bí mật. | DB/chain mới riêng; không xóa checkout hoặc dữ liệu người dùng. `docs/evidence/clean-clone/` **dự kiến**; **CHƯA CHẠY/BỊ CHẶN** governance/indexer/UI setup và máy clean; E-SC01-H nói rõ không clone sạch. |
| Q-CI — NFR07; NFR01; module owners + TV4 | Build/format/typecheck/tests đúng module, safety negatives, governance invariant≥100×50 có successful execute, peer review và không lỗi bypass/double-pay mở. | E-TV4-CI-21 đã chạy contracts/Treasury invariant+smoke, BE01 và BE02 thật. Frontend chưa tích hợp; governance/INV02/INV04 và peer approval còn thiếu: **CHƯA NGHIỆM THU NFR07**. |
| Q-CONFIG — NFR08; BR04/BR06/BR07; TV1 ABI/constructor, TV4 deployment | Kiểm `.env.example` khớp cấu hình thật, không secret/khóa ví/RPC secret trong tracked files/history/evidence/log. Quét bằng công cụ/lệnh ghi rõ, review env và URL đã che, không đưa giá trị secret vào report. Xác minh manifest §2, check-roles holder+zero+deployer và minDelay/token links; cố ý manifest/config sai trong fixture riêng phải exit nonzero. Testnet xác nhận EVM/compiler tương thích, địa chỉ/code/chainId/deploymentBlock thật; demo ít nhất một Executed và một Defeated, chờ timestamp thật, có txHash/explorer/receipt và số dư. | R0 cho malformed config, local/testnet manifest tách nhau; `docs/evidence/deployment/` **dự kiến**; **CHƯA NGHIỆM THU** manifest/roles/deploy governance/testnet/secrets scan chứng minh đầy đủ. SC02 smoke chỉ token local. |

## 6. Traceability đầy đủ FR/BR/NFR → TC/INV → evidence

Các mã E chỉ là nguồn cục bộ ở §1. Mọi acceptance dưới đây **chưa đạt toàn bộ**; lý do/evidence còn thiếu nằm tại TC/Q tương ứng, không được chuyển PASS vì có tên bài test.

| Requirement | Coverage có tiêu chí thực thi | Evidence hiện tại / còn thiếu |
|---|---|---|
| FR01 | TC13, Q-UI: public read, address/network, chặn gửi sai mạng | Thiếu wallet/browser E2E thật. |
| FR02 | TC01/TC04/TC05/TC13, INV04: balance/delegate/current/past votes, past checkpoint | E-SC02-H khác E-SC02-C; thiếu Governor/UI snapshot integration. |
| FR03 | TC01/TC08/TC10/TC13: threshold past50, một action, text/requestId/description/hash nguyên bản, ProposalCreated | E-SC01 chỉ encode/fixture; thiếu propose thật và validator âm. |
| FR04 | TC01/TC12, Q-READ/Q-UI:45→20/20/5, filter/ID/detail đủ trường cùng H | E-BE01-C offline; thiếu HTTP/chain/UI. |
| FR05 | TC01–TC05/TC13, INV04: ba support, một phiếu, snapshot/time windows | Token có proof riêng; thiếu Governor VoteCast/receipt. |
| FR06 | TC02/TC03/TC04/TC12, INV02/INV04:100 For fail,100+100 Abstain pass,200 hòa200 fail, sau deadline | E-BE01 mô phỏng; thiếu contract outcomes. |
| FR07 | TC01–TC04/TC06/TC07/TC14, INV02: queue public qua Governor, state/quorum, operationId/ETA | Thiếu queue receipts/timelock. |
| FR08 | TC01/TC06–TC10, INV01–INV03: ETA, đúng recipient/amount, replay | E-SC03-C/E-TV4-21 Treasury đạt cục bộ; thiếu Governor/Timelock execute. |
| FR09 | TC01/TC09/TC11/TC12, INV03, Q-READ: ledger cùng H, thiếu tiền/retry | E-SC03-C có receipt/balance/ledger; thiếu projection/API, reorg/rebuild cùng H. |
| FR10 | TC14/TC13: creator Pending only, Canceled history và mọi operation bị chặn | Thiếu cancel contract/UI/API proof. |
| FR11 | TC01/TC09/TC11/TC12, Q-READ/Q-UI: totals cùng H, không revert/double count,4 màn hình/banner | Thiếu chain→API→UI proof. |
| FR12 | TC07/TC09/TC13: wallet stages, receipt0/1, refusal giữ form, HTML-safe, sync/error | Thiếu wallet/receipt/browser proof. |
| FR13 | TC01/TC09–TC12, INV03: deploy blocks/raw/hash/dedup/linkage | E-BE02-C/E-TV4-CI-21 có scanner/raw storage/CLI synthetic; E-SC03-C decode receipt thật. Chưa full pipeline/projection. |
| FR14 | TC11, Q-FRESH/Q-RECOVER: K=2, batch atomic, restart hash/reorg/window | Chưa worker/runtime proof. |
| FR15 | TC12, Q-RECOVER/Q-CLONE: DB mới từ chain, same-H data/state/balance | Chưa rebuild command/exports/historical calls. |
| FR16 | TC01/TC11–TC13, Q-READ/Q-PERF: read endpoints/health/structured validation/pagination/asOfBlock, không ký | E-BE01 spec/fixture offline; thiếu HTTP server/tests. |
| BR01 | TC01/TC04/TC05/TC12, INV04: delegated snapshot, transfer/delegate sau S bất biến | E-SC02-C token-only; thiếu proposal thật. |
| BR02 | TC02–TC05, INV02/INV04: For+Abstain quorum, For>Against, một vote, ba support | Chưa Governor runtime. |
| BR03 | TC01/TC07–TC10/TC14, INV01–INV03: đúng khoản chi, không double-pay | E-SC03-C/E-TV4-21 có Treasury-only; thiếu governance/payload acceptance. |
| BR04 | TC06/TC08/TC14, INV02,Q-CONFIG: whitelist/native0/quyền | Có Treasury role negatives cục bộ; thiếu Governor whitelist và role graph cuối. |
| BR05 | TC01/TC09/TC10, INV03: balance hiện tại, atomic retry | E-SC03-C có thiếu tiền/retry cùng request; thiếu retry Governor operation và API. |
| BR06 | TC08/TC14, Q-CONFIG: creator Pending-only, không change role/params qua proposal, redeploy khi đổi config | Chưa cancel/role attack trace. |
| BR07 | TC01/TC02/TC06/TC07, INV02: success không tự chi, queue+execute public Governor, ETA | Chưa Governor/Timelock integration. |
| NFR01 | TC01–TC10/TC14, INV01–INV04, Q-CONFIG: on-chain safeguards, DB không quyền ký/override | Chưa full negative/invariant proof. |
| NFR02 | Q-PERF:100proposal/1000vote,10clients/60s,p95<1s,cấu hình máy/cách đo | Chưa API/load results. |
| NFR03 | TC11/TC13,Q-FRESH: K=2, đủ xác nhận→commit≤30s, UI cảnh báo>30s | Fixture health không phải latency runtime. |
| NFR04 | TC11/TC12,Q-RECOVER: retry/backoff/atomic checkpoint/reorg/rebuild | Chưa worker/recovery/rebuild. |
| NFR05 | Q-CLONE: clone sạch/versions/lockfile/README/demo/tests | E-SC01-H không phải clone sạch; thiếu clean-clone run. |
| NFR06 | TC13,Q-UI: tiếng Việt,390/1366,labels/loading/empty/error/keyboard | Chưa browser visual/keyboard proof tích hợp. |
| NFR07 | Safety negatives, CI đúng module, governance invariant≥100×50 không vacuous | E-TV4-CI-21 và Treasury-only invariant đã chạy; thiếu governance/frontend/peer approval, chưa nghiệm thu đầy đủ. |
| NFR08 | TC06/TC14,Q-CONFIG/Q-CLONE: no secrets/env.example/manifest/roles exit code | Chưa whole-system deployment/scan; token smoke không đủ. |

## 7. Gói evidence và điều kiện đóng acceptance

Mỗi TC (đặc biệt **TC05/06/07/08/10/14 từng ca riêng**) phải lưu: mục tiêu attack; setup actors/funds/roles/clock độc lập và reset; source+integration commit SHA/manifest hash; môi trường/tool versions; **lệnh thật đã chạy**; expected và actual; calldata/description bytes/3 IDs khi liên quan; raw trace hoặc receipt (revert eth_call không có txHash phải ghi là call trace, không bịa receipt); decoded error/args; balance/state/paid/operation/roles trước/sau tại block/hash; cơ chế chặn; người chạy và reviewer. File test dự kiến và lệnh kế hoạch không là evidence. Attack negative phải có valid control để không kết luận bảo vệ đúng từ fixture hỏng.

On-chain local/testnet evidence luôn có chainId, addresses, deployment blocks, txHash, blockNumber/hash/timestamp, receipt status và event topics/data; testnet có explorer link. Replay bổ sung H/hash/revision và sorted exports/diff/historical eth_call; performance bổ sung raw samples/cấu hình/công thức p95; UI bổ sung ảnh/video/network/wallet log đã che bí mật; invariant bổ sung seed/runs/depth/action counters/successful execute/counterexample nếu có. Không commit khóa/RPC credentials hoặc dùng transaction hash tổng hợp làm giao dịch thật.

TV4 chỉ đổi trạng thái một TC/INV/Q thành **ĐẠT** khi có actual evidence tái lập gắn đúng commit, đủ positive/negative và oracle độc lập. Nghiệm thu cuối cần mọi FR/BR/NFR có evidence đủ, không lỗi mở cho chi sai hoặc bypass; clone sạch chạy demo/test, testnet ít nhất một giải ngân và một thất bại, DB rebuild cùng H. Không khóa acceptance bằng CI xanh chỉ kiểm ABI/fixtures.

## 8. Quyết định còn mở và phụ thuộc cần bàn giao

| Owner quyết định | Nội dung cần chốt / bằng chứng mở khóa |
|---|---|
| TV1 + TV4 | GOV/BUD/Treasury đã tích hợp. Còn constructor/role graph Governor–Timelock, ABI/errors/cancel, timestamp/quorum và boundary S/D/E; không tự suy ra từ ITreasury hoặc địa chỉ mock. |
| TV1 + TV2 + TV3 | Description JSON v1, đếm Unicode code point hay quy tắc khác cho5–120/20–2000; CSPRNG requestId trước propose và giữ khi retry; xử lý NUL/UTF-8 hỏng mà không đổi bytes/hash; zero requestId không tự cấm. Giữ description nguyên bytes cho queue/execute/rebuild. |
| TV1 + TV2 | Operation salt/predecessor từ Governor tích hợp và receipt thật, không dùng salt tự chọn của BE01 hay mặc định descriptionHash; quy tắc nối BudgetDisbursed↔Transfer để không double count. |
| TV2 + TV4 | BE03–BE06 checkpoint/projection/API/rebuild và benchmark đã được kiểm local; còn BE07 rollback/window/retry/backoff, API/cursor invalidation sau reorg và production freshness. E-TV4-24-X là lỗi tái hiện, không phải giả định. |
| TV2 + TV3 | API consumer đã tích hợp, ghim H/hash/revision và dùng deployment_name thật; cần peer review DTO/cursor/health và không suy lagSeconds=null thành SLA đã đạt. |
| TV3 + TV4 | Wallet/form/EIP-1193 local đã chạy; cần extension thực và đủ keyboard/video/negative/reset variants. Ba receipt/account bugs đã tái hiện và sửa trước/sau. |
| TV4 + TV1 | Cần peer review SC05/deployment và mạng/RPC/signer/gas testnet; clone cùng máy không thay kiểm chứng máy thành viên khác. Không tự approval hoặc dùng time-warp trên testnet. |

Các tham số nghiệp vụ, TC01–TC14, INV01–INV04 và chỉ tiêu NFR trong requirements **không phải quyết định mở** để tùy ý giảm phạm vi. Khi đổi cấu hình demo được nhóm duyệt, cập nhật nhất quán requirements/config/deploy/test/evidence, không thêm shim hoặc báo đạt bằng dữ liệu giả.
