# TV4 — Tổng kết công việc đã thực hiện và tác dụng

Ngày tổng kết: **20/10/2026**. Vai trò: kiểm thử bảo mật và vận hành.
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
- Tích hợp token SC02 vào Dev; Treasury/Governor/Timelock thật và bảng role đã chốt.
- Deploy/seed/check-roles toàn hệ thống, manifest thật và env.example khớp script thực tế.
- Attack/invariant governance; TC01–TC14 và INV01–INV04 có evidence nghiệm thu đầy đủ.
- Indexer/API thật, resume/reorg/rebuild cùng H, benchmark và phép đo freshness.
- Frontend dùng fixture chung, ví/form/giao dịch thật, UI/E2E và kiểm tra bàn phím.
- Deploy testnet và demo một proposal giải ngân thành công, một proposal thất bại.

**Bước tiếp theo:** lấy review cho PR #5; TV1 bàn giao PR SC02 và contract tiếp theo;
TV3/TV2 chốt fixture/API. TV4 dùng test matrix để triển khai và nghiệm thu các
bài thực tế khi đủ đầu vào, không đánh dấu hoàn thành bằng mock hoặc fixture.
