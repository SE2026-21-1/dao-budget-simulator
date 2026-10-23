# TV4 — Tổng kết công việc đã thực hiện và tác dụng

Ngày tổng kết ban đầu: **20/10/2026**; cập nhật **21/10/2026** ở mục5–6, **22/10/2026** ở mục7–8 và **23/10/2026** ở mục9. Vai trò: kiểm thử bảo mật và vận hành. Các mục lịch sử giữ đúng source commit; kết quả mới được ghi riêng.
Repository: [DAO Budget Simulator](https://github.com/SE2026-21-1/dao-budget-simulator).
Nhánh bàn giao: `feature/tv4-operation` → `Dev`, qua [PR #5](https://github.com/SE2026-21-1/dao-budget-simulator/pull/5).

Tài liệu này giải thích các thay đổi đã thực hiện, giá trị của chúng và bằng
chứng đã kiểm tra. Không dùng tài liệu hoặc CI xanh để thay cho nghiệm thu các
thành phần chưa được triển khai.

## 1. Tình trạng push và tích hợp

Các thay đổi kỹ thuật đã được commit và push lên GitHub:

| Commit | Nội dung | Tác dụng |
| --- | --- | --- |
| `9dad716` | Thiết lập CI Foundry và checklist TV4 ban đầu | Tự động kiểm tra phần contract/ABI hiện có và ghi rõ các tiêu chí còn thiếu. |
| `0344fdb` | Thay tài liệu phân công TV4 từ DOCX sang Markdown, xóa DOCX khỏi nhánh TV4 | Đọc trực tiếp trên GitHub, xem diff và review thay đổi tài liệu dễ hơn. |
| `b2c32a0` | Tích hợp `Dev`, bổ sung test matrix, kiểm tra BE01/PostgreSQL và báo cáo review SC02 | Dùng chung đầu vào SC01/BE01; bổ sung kiểm tra dữ liệu và kế hoạch nghiệm thu có thể theo dõi. |
| `59816aa` | Pin các GitHub Actions dùng runtime Node24, lưu bằng chứng SQL thực tế | Xử lý cảnh báo runtime Node20 deprecated bằng phiên bản Actions được hỗ trợ, không che cảnh báo. |

Đã xử lý conflict tại `README.md` và `foundry.toml`, giữ nội dung bàn giao
SC01/BE01 và cấu hình fuzz/invariant của TV4. Lần kiểm tra PR sau commit
`59816aa`: **MERGEABLE/CLEAN**, không còn conflict; PR vẫn **Open**, chưa merge.
Đã yêu cầu `nvdungmim` và `daongocuong` review. Yêu cầu review không có nghĩa
là đã nhận approval của thành viên khác.

## 2. Các thay đổi và tác dụng cụ thể

### 2.1. Chuẩn hóa môi trường và kiểm tra Foundry

File chính: [`foundry.toml`](../foundry.toml), [`scripts/ci.sh`](../scripts/ci.sh),
[`scripts/check.py`](../scripts/check.py),
[`OperationAbiCompatibility.t.sol`](../tests/unit/OperationAbiCompatibility.t.sol).

- Dùng Foundry 1.8.5, Solidity 0.8.37, OpenZeppelin 5.4.0, forge-std 1.17.0;
  compiler/dependency được chốt bằng cấu hình, submodule và lockfile.
- Có một lệnh kiểm tra build, format, test và ABI/fixture SC01.
- Bộ kiểm tra TV4 đối chiếu calldata bằng fuzz và topic sự kiện BudgetDisbursed.
- Khi tích hợp Dev, bỏ bản `scripts/check_sc01.py` và selector test cũ bị phục hồi
  trùng; cập nhật hướng dẫn sang checker chuẩn `scripts/check.py`. Báo cáo
  SC01 lịch sử vẫn giữ lệnh cũ kèm chú thích, không sửa thành kết quả chưa từng chạy.

**Tác dụng:** giảm khác biệt giữa máy thành viên và CI; phát hiện thay đổi làm
mất tương thích encode calldata/event với frontend/indexer. Đây chưa phải kiểm
thử quyền chi tiền, quorum hoặc Timelock.

### 2.2. Bổ sung CI cho dữ liệu và database BE01

File chính: [workflow CI](../.github/workflows/ci.yml),
[`scripts/check_be01.mjs`](../scripts/check_be01.mjs) của TV2,
[runner PostgreSQL Bash mới](../scripts/check_be01_database.sh),
[migration](../database/migrations/001_initial.sql) và
[SQL checks](../database/tests/001_initial_checks.sql) của TV2.

| Kiểm tra | Cách thực hiện | Tác dụng |
| --- | --- | --- |
| Foundry/SC01 | Chạy profile `ci`, build/format/tests và checker ABI | Phát hiện lỗi compile, format hoặc lệch ABI/fixture đang có. |
| Fixture BE01 | Node.js 24.15.0 chạy checker trên JSON đã lưu | Phát hiện ID/hash, phân trang, phiếu, state, dòng tiền, cursor hoặc timeline không nhất quán. |
| PostgreSQL | Container mới dùng image `postgres:18.4`, chạy migration và SQL constraints | Kiểm tra schema/ràng buộc trên PostgreSQL thật, không suy ra database đạt chỉ từ JSON. |
| Evidence CI | Mỗi job lưu log, commit SHA và thông tin phiên bản trong artifact 14 ngày | Gắn kết quả kiểm tra với đúng phiên bản mã để review và truy lại khi có lỗi. |

Runner database không có network hoặc port host; chỉ mount SQL read-only,
không nhận địa chỉ database đang có. `ON_ERROR_STOP=1` làm bước kiểm tra thất
bại khi SQL lỗi. Trap xóa đúng container và anonymous volume do runner tạo
kể cả khi có lỗi; không xóa database/container của người dùng.

**Giới hạn:** runner này kiểm tra migration và constraints, không chạy indexer,
HTTP server, xử lý reorg hoặc rebuild. Máy local hiện không có quyền Docker;
phần SQL đã được chạy thật trên GitHub Actions, không báo thành SQL local PASS.

### 2.3. Lập test matrix QA04

Tài liệu: [`test-plan.md`](test-plan.md), theo dõi tại
[issue #7](https://github.com/SE2026-21-1/dao-budget-simulator/issues/7).

Đã lập kế hoạch bao phủ **TC01–TC14, INV01–INV04, FR01–FR16, BR01–BR07 và
NFR01–NFR08**. Mỗi bài có setup/reset độc lập, người phụ trách module và TV4
acceptance owner, thao tác, kết quả quan sát cụ thể, bằng chứng và blocker.

Kế hoạch bao gồm biên snapshot/deadline/ETA, chi thiếu quỹ rồi retry, trùng
requestId, quyền deployer, payload trái phép, rebuild cùng block H; invariant
ít nhất 100 chuỗi × 50 thao tác và phải có execute thành công. Các tiêu chí
hiệu năng, độ mới dữ liệu, UI 390px/1366px, bàn phím và clone sạch cũng được ánh xạ.

**Tác dụng:** cả nhóm biết yêu cầu nào có bằng chứng, bài nào còn thiếu, ai phải
bàn giao gì. **Đây là kế hoạch; không phải 14 TC và 4 INV đã chạy đạt.** Các đường
test tương lai được ghi rõ là dự kiến, không tạo stub để giả hoàn thành.

### 2.4. Review token SC02 của TV1

Source review: nhánh `feature/tv1-sc02`, commit
`9a890a2084f10876e580d24589fa6cb0829c11f3`.
Báo cáo: [`sc02-review.md`](sc02-review.md).
Evidence: [`sc02-local-smoke.json`](evidence/sc02-local-smoke.json).

- Review fixed supply, constructor/phân bổ, 18 decimals, đường mint, delegation,
  clock timestamp, checkpoint và transfer/allowance.
- Chạy độc lập **24 token tests: GOV 15, BUD 9**, ba fuzz tests × 256 trường hợp,
  seed `0x20261020`.
- Deploy GOV/BUD thật trên Anvil riêng; kiểm tra supply, phân bổ 400/300/200/100,
  votes ban đầu, self-delegate và historical lookup.
- Smoke `approve/transferFrom` giữa ví đã delegate: voting power hiện tại đổi,
  phiếu snapshot cũ không đổi. Undelegate về zero không xóa phiếu quá khứ.
- Chuyển 10.000 BUD từ ví funding tới **EOA nhận thử token**: mỗi bên còn/nhận
  10.000, không phí, tổng cung không đổi. Đây không phải Treasury thật.
- Lưu source SHA, địa chỉ local và metadata receipt; dừng chain tạm và xóa
  checkout review sau khi hoàn tất. Không sửa hoặc merge nhánh TV1.

**Tác dụng:** xác minh đầu vào token cho deploy/UI, làm rõ nghĩa vụ của TV4:
bốn ví demo được kiểm soát, khác zero và đôi một khác nhau; self-delegate rồi
chờ checkpoint thành quá khứ; chỉ funding Treasury khi constructor thật đã chốt.
Chưa phát hiện lỗi chặn trong phạm vi hai token; kết luận này không phải chứng
nhận an toàn của cả hệ thống governance.

### 2.5. Tổ chức phối hợp và bằng chứng

| Issue | Người được gán | Nội dung và tác dụng |
| --- | --- | --- |
| [#6 — QA01](https://github.com/SE2026-21-1/dao-budget-simulator/issues/6) | `dung0611` | Theo dõi CI, review và khả năng chạy lại; không bỏ quên các mục clone sạch hoặc module CI chưa được bàn giao. |
| [#7 — QA04](https://github.com/SE2026-21-1/dao-budget-simulator/issues/7) | `dung0611` | Bàn giao test matrix, liên kết yêu cầu với test/evidence và blocker. |
| [#8 — SC02](https://github.com/SE2026-21-1/dao-budget-simulator/issues/8) | `nvdungmim` | Yêu cầu TV1 mở PR token vào Dev và chốt constructor/clock/roles cho các bước triển khai tiếp theo. |
| [#9 — Fixture frontend](https://github.com/SE2026-21-1/dao-budget-simulator/issues/9) | `LangXiTrum2005` | Phối hợp TV2 dùng fixture BE01 chung thay mock riêng, để UI/API đối chiếu cùng ID, số tiền, cursor và block. |

Đã cập nhật README, [checklist TV4](tv4-checklist.md) và hướng dẫn database.
Việc tạo issue/bàn giao không có nghĩa các thành viên đã thực hiện xong nội
dung được gán. TV4 không viết thay toàn bộ test hoặc module của TV1/TV2/TV3.

## 3. Bằng chứng kiểm tra đã có

| Phạm vi | Kết quả đã quan sát | Nguồn |
| --- | --- | --- |
| TV4 local | 2 test ABI passed, fuzz 256; checker SC01 passed | `FOUNDRY_PROFILE=ci bash scripts/ci.sh`; checklist TV4 |
| BE01 local | 123 JSON, 45 proposal, trang 20/20/5, timeline/regression passed | `node scripts/check_be01.mjs`; test matrix |
| SC02 riêng | 24 token tests và Anvil token-only smoke passed | Báo cáo SC02 và receipt metadata ở trên |
| CI commit `b2c32a0` | Foundry + BE01 passed; Node v24.15.0, PostgreSQL 18.4; migration COMMIT, SQL checks passed rồi ROLLBACK | [Run 39457911277](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39457911277), [stdout SQL nguyên bản](evidence/be01-ci-b2c32a0.txt) |
| CI commit `59816aa` | Hai job passed ở cả push và pull_request sau nâng Actions runtime | [Run PR 39458458293](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39458458293), [run push 39458450726](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39458450726) |

Các kết quả trên thuộc đúng phạm vi/source commit ghi kèm, không cộng token
tests của nhánh SC02 thành test suite đã tích hợp vào TV4.

## 4. Những việc chưa được coi là hoàn thành

- Peer review/approval và merge PR #5; clone sạch chạy đủ demo trên máy thành viên khác.
- Peer review SC04/SC05/deployment/role graph; local đã có Governor và TimelockController thật, không còn chờ contract giả.
- Deploy/seed/check-roles/manifest **testnet**; local QA02/QA03 đã có script và evidence thực, không thay testnet.
- Đủ biến thể/reset/peer review cho TC01–TC14 và INV toàn hệ thống; đã có governance attack/bounded oracle, không còn chỉ Treasury-only.
- BE checkpoint/confirmations/resume/reorg/projections/API/rebuild, benchmark và freshness; BE02 raw reader/storage đã tích hợp.
- Frontend dùng fixture chung, ví/form/giao dịch thật, UI/E2E và kiểm tra bàn phím.
- Deploy testnet và demo một proposal giải ngân thành công, một proposal thất bại.

**Bước tiếp theo:** nhận review PR #5/#12/#13 và deploy/check-roles; TV2 checkpoint/projections/API/rebuild, TV3 wallet/form/shared fixtures; chốt testnet/RPC/faucet/Osaka. Không dùng địa chỉ smoke đã dừng hoặc receipt nhánh reset để cấu hình chain đang chạy.

## 5. Bổ sung bàn giao ngày 21/10/2026

### Mã đã tích hợp và giá trị

| Commit / PR | Thay đổi | Tác dụng |
|---|---|---|
| `496a2f3` | Merge Dev `1f40748`, gồm token và Treasury | TV4 dùng production contract thật, cập nhật đường checker `scripts/check.py`, không phục hồi test ABI trùng. |
| `5cb8b7e` | Merge BE02 `4c568d6` | Có reader RPC hữu hạn, ABI decoder và raw PostgreSQL storage để kiểm tra tích hợp. |
| `7a0ab33` | Treasury stateful QA, runtime smoke, Linux BE02 runner và CI | Oracle độc lập nhiều role epochs; proof giao dịch thật và decoder; CI không dừng ở JSON/SQL constraints. |
| [PR #12](https://github.com/SE2026-21-1/dao-budget-simulator/pull/12) | TV4 mở bàn giao từ branch TV2, request TV2/TV1 review | Không sửa lịch sử nhánh TV2, không tự nhận approval hoặc merge Dev. |

### Kết quả đã quan sát

- Foundry **58 passed, 0 failed, 0 skipped**. Ba invariant checks Treasury-only trong campaign100×50, seed `0x20261021`, 5.000 handler calls; [stdout](evidence/tv4-foundry-20261021.txt).
- Node **24.15.0**, typecheck/build và BE02 **63/63** unit/RPC/decoder tests; BE01 vẫn123 JSON,45 proposal,20/20/5. [Stdout backend](evidence/tv4-be02-20261021.txt).
- PostgreSQL **18.4** native cluster mới trên loopback: **21/21** storage/CLI tests, không skip; đã dừng/xóa sau chạy. Không dùng database đang có, không đổi permission Docker.
- [Smoke Treasury thật](evidence/sc03-local-smoke.json):19 receipt (13 thành công/6 revert), phân quyền, chi trùng, thiếu tiền/nạp/retry, revoke/re-grant/renounce; ledger12.000 vào/12.000 ra. BE02 decode7 Transfer/3 BudgetDisbursed local thật. [Review và lệnh tái hiện](sc03-review.md).
- [Push CI39539691342](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39539691342) và [PR CI39539695150](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39539695150) tại source `7a0ab33`: **cả ba job success**. [Docker stdout](evidence/be02-ci-7a0ab33.txt) xác nhận PostgreSQL18.4, binding127.0.0.1,21 tests không skip và cleanup container/volume; [metadata](evidence/tv4-ci-7a0ab33.json).

[Tổng hợp local](evidence/tv4-local-verification-20261021.json) phân biệt native SQL, Docker CI, Treasury-only và các prerequisite còn thiếu. Ba invariant checks được Foundry nhóm vào một campaign, không nhân 5.000 calls thành15.000.

Các kết quả mới không phải TC01–TC14/INV01–INV04 đã nghiệm thu toàn bộ. EOA spender trong smoke chỉ là tài khoản thử nghiệm trên Anvil tạm, không là deployment role cuối. Chưa fault-inject failure/interruption của Docker runner; log hiện chứng minh cleanup sau đường chạy thành công.

## 6. Sau TV1 push SC04: QA02/QA03/QA05/QA06 local

| Source / task | Đã thực hiện | Tác dụng |
|---|---|---|
| `70c2b33` / [PR #13](https://github.com/SE2026-21-1/dao-budget-simulator/pull/13) | Merge SC04 `f57fcfd` và mở PR nguồn vào Dev | TV4 có Governor thật; giữ82 unit/security tests/ABI của TV1, không sửa source sản phẩm hay tự approval. |
| `fcd01e5` / [QA02 #14](https://github.com/SE2026-21-1/dao-budget-simulator/issues/14) | `deploy_local.mjs`, `governance_local.mjs`: real graph, final roles trước funding, seed/delegate/checkpoint, manifest/receipts/source/compiler/ABI | Người khác khởi động Anvil rỗng và deploy lại không cần khóa bí mật; QA02 demo1000 BUD không phụ thuộc UI hoặc fake Timelock. |
| `fcd01e5` / [QA03 #15](https://github.com/SE2026-21-1/dao-budget-simulator/issues/15) | `check_roles.mjs`: pinH, source/constructor/runtime/token links/config/full role history | Phát hiện cả extra holder ngoài demo mapping; CLI trả1 khi sai, chặn funding, không chỉ xác nhận một holder đúng. |
| `fcd01e5` / [QA05 #16](https://github.com/SE2026-21-1/dao-budget-simulator/issues/16) | Smoke actual Anvil: timing/snapshot/quorum/cancel/whitelist/direct bypass/replay/oversubscription/retry | Có exact receipt/custom error/operation salt và Transfer ledger thật; không gán EOA thành Timelock. |
| `fb7d5c5` / [QA06 #17](https://github.com/SE2026-21-1/dao-budget-simulator/issues/17) |4 governance properties,14 handler actions, independent balances/delegates/allowances/checkpoints/payout oracle; regression multi-snapshot + transferFrom | Kiểm cả trọng số từng voter và chuỗi thất bại→nạp→retry; successful execute trong fuzz sequence, không vacuous seed-only test. |

### Kết quả thực tế

- [Foundry](evidence/tv4-sc04-foundry-20261021.txt): **142passed/0failed/0skipped**,
  82 Governor unit; governance100×50=5000calls,4 checks nhóm1campaign, seed0x20261021.
  Treasury vẫn có campaign riêng. Counter cuối5 successful executes không là tổng100runs;
  positive transferFrom/snapshot mutation được kiểm trong regression, không suy từ cuối
  campaign có0 transferFrom successes.
- [Live governance](evidence/sc04-local-smoke.json): nhánh QA02 riêng5 receipts
  chi1000 BUD, quỹ9000/recipient1000; reset rồi campaign **105receipts49success/56revert**.
  Tranh7.000/6.000, topup3.000/retry cùng operation; ledger13.000in/out, quỹ0/R7000/R2=6000/F7000.
- [Role CLI](evidence/sc04-role-audit.json): **8probes đúng kỳ vọng**; bootstrap
  deliberately cấp thêm spender0x...0999 rồi renounce, checker nhận ra dù không nằm
  trong demo mapping; Treasury0/F20000 chưa funding. Đây là misconfiguration fixture,
  không là khả năng của attacker sau init.
- BE02 **HttpRpc/readBatch thật**:108headers block2–109,61raw/45decoded/16unknown/0decodeErrors,
 0discarded. Unknown access-control/init topics giữraw; GOV raw-only do registry chưa hỗ trợ.
- [Backend regression](evidence/tv4-sc04-backend-20261021.txt): Node24.15.0,
  typecheck/build,63unit tests và fixture BE01 đạt. SQL/Docker chạy ở CI, không
  giả SQL local cho chain governance.
- [CI implementation push39543232800](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39543232800)
  và [PR39543238043](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39543238043),
  sourcefcd01e5: cả3job success, gồm governance smoke thật và PostgreSQL cô lập.
  Trạng thái source mới nhất xem PR #5/[metadata CI](evidence/tv4-sc04-ci.json).

### Ranh giới

Không tự đánh full TC01–TC14/INV/NFR/E2E hoặc SC05/testnet đạt. Oracle bounded
5voter/4recipient/16request/24proposal; chưa ERC1271/signature/aggregate100runs hoặc
arbitrary-strategy liveness. Source unit signatures đã chạy không thay oracle coverage.
Checker holder audit toàn lịch sử độc lập với universe hữu hạn trong invariant.
API/projections/K-confirmations/reorg/rebuild và frontend wallet/form còn phụ thuộc
TV2/TV3. Mạng testnet/RPC/faucet/Osaka chưa chốt; scripts cố ý **local-only**, không
phát giao dịch testnet hay giả receipt. Chờ peer review/merge, không đóng issue chỉ vì CI xanh.

## 7. Bổ sung TV4 ngày 22/10: frontend và governance raw SQL

### Phần đã triển khai

| Hạng mục TV4 | Thay đổi và giá trị |
|---|---|
| Tích hợp TV3 | Nhập frontend nguồn `47f91d50b7a9104c027dbf05e7a862ddb69d31d0`; giữ attribution TV3. Dùng canonical `fixtures/api`, bỏ bản copy JSON/template thừa; sửa loading theo request, wrap amount mobile, thêm skip-link và live page indicator. |
| CI | Thêm job frontend lint/typecheck/production build, log/SHA/artifact14ngày. Contracts gọi runner governance→PostgreSQL thật; không lấy build làm browser E2E. |
| Raw integration | `scripts/governance_storage.mjs` nối actual reader/scanner/PostgresStorage/CLI trên canonical chain trước khi smoke dừng; so SQL raw/header/payload và ledger cùngH, giữ unknown topics. |
| Phục hồi cục bộ | Fault SQL giữa batch, xác nhận rollback và prior commits; explicit finite-range CLI continuation, full rerun qua process mới; replay DB trống thứ hai với semantic digest giống nhau. Không triển khai thay checkpoint/reorg/projection của TV2. |
| Bàn giao | `scripts/export_local_handoff.mjs` audit read-only rồi xuất manifest/role report/five compiler ABIs/four BE02 descriptors. Từ chối ghi đè; TV2 phải lấy deployment_id thật sau INSERT metadata. |

### Bằng chứng đã chạy

- [Tổng hợp](evidence/tv4-20261022/verification.json): phiên bản, lệnh/stdout,
  source hashes, điều kiện clone candidate và các blocker.
- [Browser Chromium150](evidence/tv4-20261022/frontend-browser.json):11scenario
  fixture thật; pagination20/20/5, exact ID/filter/precision, loading/error/retry,
  not-found và form disabled;4màn hình390/1366, keyboard skip/Tab/Enter;3PNG.
- [Governance→PostgreSQL18.4](evidence/tv4-20261022/governance-storage.json):
  H109,108headers/61raw/45decoded/16unknown/0decodeErrors; ledger13.000in/out,
  2paidrequests; fault/rollback và rerun/replay đạt, digest canonical=rebuild.
- Clean baseline clone rồi overlay candidate source, không copy node_modules/out/cache:
  clean install, frontend lint0warning/error và build đạt; Foundry142/142,
  fuzz256/invariant100×50 seed0x20261021. BE02 typecheck/build63/63 và
  native PostgreSQL18.4 migration/SQL/storage21/21,0skip; BE01 fixture đạt.
- [Bundle local thật](evidence/tv4-20261022/local-handoff/handoff.json):
  chain khác với smoke, H19 tại numeric loopback8559, seed chuẩn; deploy/export
  và rootcheckroles exit0. Export vào thư mục có sẵn exit1, bundle không đổi.
- Guard database từ chối thiếu isolated flag, remote host, URL options, DB ngoài
  prefix; DB đã có dữ liệu bị từ chối và header/event counts không đổi.
  Default governance smoke không DB và Treasury smoke vẫn chạy được.

### Giới hạn và người cần phối hợp

Tại mốc ghi evidence mục7, candidate ở working tree trên baseHEAD `5fbf615`, **chưa commit/push/merge**;
HEAD trong manifest không đại diện các script/frontend mới, phải đối chiếu
source hashes trong evidence. Clone tái lập trên cùng máy, compiler global đã
có; chưa phải máy thành viên khác. Native SQL đã chạy và dừng/xóa cluster;
Docker runner mới cùng workflow bốn job **chưa có run GitHub mới**.
Foundry lints hiện hữu được giữ nguyên trong stdout, không che warning.

PR #5 kiểm tra ngày22/10 vẫn open, đã request `nvdungmim` và `daongocuong`,
reviews API trả `[]`; không tự approval hoặc gọi requested review là đã duyệt.
Không có GitHub token/gh cho thao tác ghi trong phiên này.

TV1 review deployment/SC05/ABI; TV2 bàn giao checkpoint/K/reorg/projections/API
và FR15 rebuild nghiệp vụ; TV3 bàn giao ví/form/giao dịch. Sau đó TV4 mới đóng
QA07/UI→chain→API cùngH, TC11–TC13 đầy đủ. Testnet còn thiếu mạng/RPC/faucet,
funded signer và xác nhận EVM/compiler; không dùng Anvil time-warp hoặc địa chỉ
fixture để giả testnet. QA08/QA10 toàn bộ vẫn mở theo checklist.

Bundle chỉ dùng khi đúng chain/checkout/build còn tồn tại; chain reset hoặc
commit/build thay đổi thì deploy/export lại. Không dùng receipt smoke đã dừng
cho consumer hoặc mở cổng tài khoản Anvil unlocked ra Internet.

## 8. Sửa Foundry job sau push `33c5297`

[Push run39725731638](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39725731638/job/119649060315)
đã qua build/format/Foundry tests và Treasury smoke; lỗi ở bước governance
PostgreSQL: `Actual PostgreSQL server must be loopback`. Frontend, BE01 và
BE02 của run này đều success. Không rerun bản lỗi chỉ để xác nhận báo cáo.

Nguyên nhân: guard nhầm lớp mạng, kiểm `inet_server_addr()` phía PostgreSQL.
Docker đã publish `127.0.0.1:<port>` đúng nhưng địa chỉ server trong container
là bridge IP. Sửa `scripts/governance_storage.mjs` để kiểm TCP peer của client;
URL numeric loopback, isolated flag, ownership, prefix và schema rỗng vẫn bắt buộc.
Report ghi client/server address riêng; không sửa contract hoặc bỏ bước smoke.

[Bằng chứng sửa](evidence/tv4-20261022/docker-loopback-fix.json):
PostgreSQL18.4 thật tại `127.0.0.2`, TCP forward từ `127.0.0.1`, Anvil thật;
client peer `127.0.0.1` khác server address `127.0.0.2`, toàn bộ smoke SQL,
rollback, CLI restart/raw replay đạt. Đây là local forwarding proof, không
gọi native test thành Docker run. Negative guards remote/options/missing flag,
nonempty DB không đổi dữ liệu và database không đúng owner vẫn bị chặn.

Log CI lỗi và smoke/guards đi kèm giữ riêng evidence lịch sử mục7; CI bản sửa
cần được quan sát sau commit/push, không suy CI xanh từ smoke local.

## 9. Bổ sung TV4 ngày 23/10: shutdown an toàn và regression biên

**Lỗi thực sự:** gửi SIGTERM riêng tới Node smoke làm parent thoát nhưng Anvil
vẫn trả RPC. `finally` đơn thuần không chạy khi Node xử lý signal mặc định.
Sửa bằng lifecycle chung cho hai smoke: handler SIGINT/SIGTERM, cleanup idempotent,
stop/reap child, bounded SIGKILL escalation, đăng ký storage temp dirs/indexer CLI.
Evidence được stage rồi rename atomic chỉ sau cleanup thành công; interruption
không ghi PASS hoặc thay nội dung evidence cũ. Provenance gồm hash helper mới.

**Regression bảo mật:** năm ca thêm vào `GovernanceAttacks.t.sol` dùng contract
thật và final roles, không giả Timelock/Governor để chi:

- Nhiều transfer/delegate/approved transferFrom đúng snapshotS; voteS+1 dùng
  checkpoint cuốiS, thay đổiS+1 không viết lại trọng số.
- Direct schedule/cancel/execute/disburse với các điều kiện khác hợp lệ phải
  bị chặn đúng `AccessControlUnauthorizedAccount`, gồm former deployer.
- Cùng operation thiếu đúng1giây ởETA−1 không chi; tạiETA chi được.
- Hủy Pending không tiêu thụ request; proposal khác cùng action/request chi được.
- Thiếu tiền rollback toàn bộ; creator không hủy Queued, nạp lại retry chính
  operation cũ mà không vote/queue lại.

[Evidence23/10](evidence/tv4-20261023/verification.json) và stdout đi kèm ghi
147Foundry tests đạt, seed0x20261021, hai campaign100×50;8process interruption
tests dùng Anvil thật;63RPC/config/decoder/CLI và21PostgreSQL storage tests không
skip; frontend lint/build và browser production fixture390/1366 đạt.
Governance SQL smoke xác nhận receipt, rollback batch, CLI restart và raw replay
DB mới tại cùngH. PostgreSQL18.4 native cô lập, không đổi quyền Docker daemon.
Raw replay vẫn không phải projection/state rebuild hoặc reorg/checkpoint.

GitHub xác nhận PR #5/#12/#13 đã merge ngày23/10; CI baseline `877141c`
[run39726637732](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/39726637732)
success. Không lấy run baseline làm bằng chứng cho source mới của mục9; run của
revision bổ sung được kiểm riêng khi push. Workflow thêm process interruption gate.

Fetch mới nhất cho thấy TV2 `4c568d6` vẫn finite raw storage; TV3 `26ecca7` chỉ
chỉnh thiết kế, form vẫn disabled. Không nhập thay đổi thiết kế ngoài phạm vi để
gọi đó là E2E. Yêu cầu bàn giao đã tạo và assign owner cùng TV4:

| Issue | Đầu ra cần nhận |
|---|---|
| [#18](https://github.com/SE2026-21-1/dao-budget-simulator/issues/18) | TV2 checkpoint/K/reorg/projection/API và same-H rebuild/benchmark. |
| [#19](https://github.com/SE2026-21-1/dao-budget-simulator/issues/19) | TV3 wallet/form/governance transactions và lỗi network/signature/receipt. |
| [#20](https://github.com/SE2026-21-1/dao-budget-simulator/issues/20) | TV1 review deploy/roles, chốt testnet/EVM/RPC/funded signer; thành viên khác clone chạy lại. |

Không tìm thấy cấu hình testnet được chốt hoặc funded signer; không ký/gửi
giao dịch, không tạo manifest/testnet txHash giả. Không tự approval hoặc merge
revision mới. QA07/QA08/QA10 toàn bộ vẫn bị chặn bởi các bàn giao trên.

