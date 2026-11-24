# TV4 — Tổng kết công việc đã thực hiện và tác dụng

Ngày tổng kết ban đầu: **20/10/2026**; cập nhật **21/10/2026** ở mục5–6 và **22/10/2026** ở mục7. Vai trò: kiểm thử bảo mật và vận hành. Các mục lịch sử giữ đúng source commit; kết quả candidate mới được ghi riêng.
Repository: [DAO Budget Simulator](https://github.com/SE2026-21-1/dao-budget-simulator).
Nhánh bàn giao: `feature/tv4-operation` → `Dev`, qua [PR #5](https://github.com/SE2026-21-1/dao-budget-simulator/pull/5).

Tài liệu này giải thích các thay đổi đã thực hiện, giá trị của chúng và bằng
chứng đã kiểm tra. Không dùng tài liệu hoặc CI xanh để thay cho nghiệm thu các
thành phần chưa được triển khai.

## Trạng thái hiện hành — 24/11/2026

Fix chung `033e63d3d70408ee87563e8dc809f67fbde67c72` nối signed raw bytes với
broadcast/receipt identity, lưu hash bền vững trước send và fail-stop khi RPC trả
hash delegation khác funding. Không sửa lại receipt-binding đã được TV1 xác nhận.
[Báo cáo, regression trước/sau, matrix và source fingerprints](evidence/tv4-20261124-submission-identity.md):
44bootstrap/provenance/Sepolia,14BE08,4release,127frontend PASS;1live SKIP;
typecheck/build/lint exit0, warnings và Docker-permission limit ghi rõ.
Đã cập nhật runbook journal/reconciliation và kịch bản demo/failure chung;
chưa claim browser rerun, testnet, Project update hoặc release acceptance.
PR60 tiếp tục qua TV1/TV2/TV3 và final-head CI; không pushDev/bypass review.

## Trạng thái theo bằng chứng — 23/11/2026

[Báo cáo nghiệm thu, raw archive, lệnh/exit/SHA và giới hạn](evidence/tv4-20261123-acceptance.md)
là đầu mối hiện hành; các mục21/11 trở về trước bên dưới là lịch sử.

- Tích hợp #61 vào #60 bằng `5c899976ac4de97434737493815e7ccbdcd13984`:
  giữ TC10, thay ba file BE08 bằng same-ID lifecycle oracle, không miễn trừ5giây.
  Local14BE08/40Timelock/4release, typecheck/build PASS; native BE08 release gate
  cũng PASS,13.080request/0lỗi/p95 299,207ms,20freshness samples dưới30s.
- Exact push CI5c89997 và PR merge-refb4b505d có22success/2publish skipped.
  TV2 request-changes chưa tự dismiss; TV1 approval chỉ contract/TC10.
- [Backend #18 đã TV4 nghiệm thu và đóng](https://github.com/SE2026-21-1/dao-budget-simulator/issues/18#issuecomment-7093896813):
  Dev6766e5e, raw artifact/digest/26source hashes/recovery/rebuild/performance
  đã đối chiếu; corrected gate bổ sung lifecycle tail không làm đổi backend product.
- [Fresh approved-source UI](evidence/tv4-20261123-approved-ui.json) chạy product
  Dev6766e5e qua `--project-root`: keyboard/focus1366/390, full adapter workflow,
  receipt0/retry1 và actual503/409 PASS; không gán tooling candidate thành product.
- [MetaMask thật](evidence/tv4-20261123-real-extension.json) đã chạy riêng trên
  cùng Dev: wrong-network, từ chối popup ký giữ draft/nonce, propose/vote/queue,
  receipt0 thiếu quỹ rồi nạp2.000/retry receipt1, SQL/API/UI canonical H52.
  Hai actor extension do driver reset; official unpacked, không user/Web Store
  hoặc testnet. [Live views](evidence/tv4-20261123-live-views.json)10render,
  frontend live API1PASS/0skip; [runbook](qa07-e2e.md) có mode bàn giao không inject ví.
- [#19 consolidated ZIP](evidence/tv4-20261123-wallet-review.md) đã kiểm độc lập,
  tiếp nhận happy-path lịch sử có giới hạn, không còn blocker thiếu ZIP/ảnh.
- [Account-switch gap](evidence/tv4-20261123-account-switch.json) giữ PARTIAL:
  actual revoke đã khóa signer cũ; site-authorized B/no-send cùng draft chưa đủ.
  Runbook có fixture/observer/evidence checklist tối thiểu cho TV3, không yêu cầu
  lặp lại governance đã chạy hoặc gọi UI automation failure là product bug.
- [#36 browser/live UI đã đóng](https://github.com/SE2026-21-1/dao-budget-simulator/issues/36#issuecomment-7097573123),
  không đóng #19/#41 theo đó. [TV1 receipt-binding Medium đã sửa/test](evidence/tv4-20261123-sepolia-receipt-fix.json):
 21synthetic/14BE08/typecheck/build exit0, funding0descendants không thể mượn receipt
  cũ để ghiK2. Latest TV1 request-changes vẫn cần independent re-review;0broadcast.
- [#40/#42 ZIP đã kiểm bytes](evidence/tv4-20261123-bundles.md): không còn blocker
  thiếu exports/checksums. Giữ thiếu APIrestart máyTV3 và final receiver/Windows
  lifecycle outputs, không đòi chạy lại campaign đủ evidence.
- [Sepolia preparation](sepolia-deployment.md): tái tạo riêng sáu file chung remote
  đã review,13local tests và publicread-only probe PASS; không nhập original
  #21/#55/personal ancestry. Owner/SHA/map/signers/budget/authorization và current
  TV1 delta review còn thiếu;0broadcast, không testnetPASS.
- Bỏ SSH rollout không bỏ contract Sepolia scope. Sau yêu cầu xóa staging mới,
  đã xóa project `dao-staging-se2026-t16` và default SG, xác minh không còn;
  public network/image/flavor dùng chung giữ nguyên. [Retirement evidence](evidence/tv4-staging-retirement-20261123.json).
  Không provisioning, không đổi workspace cá nhân hoặc database/process đang phục vụ.
- [Ma trận FR/BR/NFR hiện hành](test-plan.md#6-traceability-đầy-đủ-frbrnfr--tcinv--evidence)
  giữ10Ready(single) N/A và bounded invariant đã chốt. #7/#36/#40/#41/#42/#44
  còn scope riêng; không promote main hoặc tạo release cuối.


## Tích hợp và review — 21/11/2026

PR [#58](https://github.com/SE2026-21-1/dao-budget-simulator/pull/58) đã merge vào `Dev` qua merge commit `6766e5ee2d8c466542687cbeb09677c4d11e5463` từ head `227a0c9b4967ca5c78ca609600fa8e2845891418`. TV1 và TV2 đều APPROVED đúng head, review threads đã resolve; GitHub trả `reviewDecision=APPROVED` và các check CI thành công. PR #59 đã merge trước đó tại `3a1221d`.

PR [#57](https://github.com/SE2026-21-1/dao-budget-simulator/pull/57) còn OPEN/`CHANGES_REQUESTED`; không thuộc phạm vi CI/container hiện tại và không tích hợp.
PR [#60](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60) gửi hai regression TC10 đảo thứ tự execute/bytes32(0) từ commit `32c6e7c64dc9a481d499ab3f350127278f5e373b`, target `Dev`. Foundry/governance, các checks BE01, BE02, BE04–BE08, PostgreSQL, frontend và Container/Compose đều PASS trên head `9d1d05f305bd5ed51c8bbdc670523a9eb1dbac45` trong [run PR](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/44924767566) và [run push](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/44924760670); publish job được skip theo release condition. Vẫn chờ TV1 review/approval; review chưa có và issue #7/#16 vẫn mở, không dùng PR này để nhận full acceptance.

Lượt này chỉ merge PR #58; PR #60 chưa merge. Không merge/sửa PR hoặc branch personal/individual, không đổi `main`/`master`, không push trực tiếp vào `Dev`, force-push hay bypass review/CI. Checkout cá nhân đang dirty được giữ nguyên; kiểm tra local chạy trong worktree riêng `/tmp/dao-budget-simulator-tv4-completion`.

### BE08 retry assertion correction — 22/11/2026

Push workflow [44929254569](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/44929254569) failed at `rpc_outage` on head `826657ad43e032009ab799dba215ccf331ba9771`; the PR-event run [44929259785](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/44929259785) passed on the same SHA. The failure artifact recorded interleaved retries for distinct `eth_call` IDs. This is valid bounded fan-out: `indexer/projection/chain.ts` checks proposals with at most four concurrent readers. The test helper incorrectly treated attempts as contiguous and mistook an in-flight retry for reuse after completion; `HttpRpc` allocates each logical call ID before awaiting.

Updated `scripts/be08_rpc_outage.mjs` to group by logical call ID, preserve method/params and backoff checks, and reject attempts beyond four. Added an interleaving regression in `tests/indexer/be08-rpc-outage.test.mjs`. Local `npm run test:be08` passed **11/11**; replaying the actual CI artifact summarized 18 logical calls (17 with four attempts, one boundary call with one). Push and PR workflows on fix commit `e7eb2bae638b45b9eeec532adf0b431871c6d02c` both PASS: [run PR](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/44931330317), [run push](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/44931324667); release publication skipped by condition. This does not close full TC11/reorg acceptance.

| Yêu cầu / lỗi | Khắc phục và kiểm chứng thực chạy |
| --- | --- |
| #58 legacy reorg 001–004 xóa toàn prefix khi không có ancestor | Trả `REBUILD_REQUIRED`, giữ header/raw/checkpoint/publication, invalidates snapshot cũ. Suite PostgreSQL 18.4 riêng **19/19 PASS**, gồm whole-prefix replacement nằm trong cửa sổ và restart giữ evidence; cluster đã dừng. |
| #58 SC06 provenance source mới | Archive v1 giữ byte gốc, kiểm tại source lịch sử `5ba9371f735982c5ca7148a3cf4af07068525029` trong clone riêng; source bị thay bị từ chối. Sinh v2 bằng Anvil thật tại source tích hợp, kiểm live/offline và **32/32 positive/negative PASS**. |
| #58 oracle quorum độc lập | Replay GOV mint/burn và quorum-update theo timestamp, đối chiếu historical supply/numerator/call; full canonical checker từ chối mutation riêng 200→1.001 GOV. Không thay checksum lịch sử hoặc dùng kết quả `quorum()` làm chính oracle. |
| #59 OCI/token/version | Public registry và attestation bundle không cần login/token hay thêm quyền; giữ pin digest và signer repo/workflow. Local version regressions **2/2 PASS**, từ chối 1.8.50. [Forced fallback CI thật](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/44672742183) **SUCCESS**, gồm attestation/extraction/cả ba version và contract gates. |
| #57 image minimum disk | So với disk flavor thật khi local boot, hoặc size volume chính xác. **5/5 real-provider synthetic HTTP plan regressions PASS**, fmt/validate PASS; [CI đúng SHA](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/44673183743) SUCCESS. Không phải cloud plan/apply thật. |
| HTTP 409/503 không JSON giữ lease ký cũ | Giữ HTTP status trong `ApiError` dù body HTML/rỗng; consumer giữ dữ liệu hiển thị nhưng thu hồi quyền ký. |
| Deposit/delegate báo thành công từ receipt không liên quan | Kiểm token target, sender, emitter và outcome amount/recipient/delegatee trước success; regression sai/thiếu event và receipt không liên quan. |
| Failed rollout/rollback làm mất previous release | Chỉ tiến history khi activation thành công, restore khi cutover lỗi. Shell regression failed deploy/rollback rồi retry A; **6/6 operation tests PASS**, shell syntax PASS. |

Frontend trên Node24.15.0: **127 PASS / 1 opt-in live SKIP**, lint exit0 còn
8 React warning, TypeScript/Vite build PASS còn chunk warning >500kB.
Backend typecheck PASS. Chromium production preview fixture tại 390px:
scrollWidth=viewport=390, không console error, nạp quỹ disabled.
Browser này không dùng live API, ví extension hoặc staging.

Các lượt lỗi được giữ đúng nghĩa: binary PostgreSQL npm không có `createdb`,
đã tạo database qua `pg`; Terraform `override_data` không điền được Optional-only
outputs nên thay bằng real-provider/synthetic-HTTP tests, không đổi guard cho mock;
harness rollback đầu timeout; sau sửa control pipe lifecycle, lượt chạy mới đạt
6/6. Không tính lượt lỗi hoặc frontend live SKIP thành PASS.

## Kiểm chứng sau merge — `Dev` `6766e5ee2d8c466542687cbeb09677c4d11e5463`

- Trước khi thêm hai ca TC10 mới, `FOUNDRY_PROFILE=ci FOUNDRY_FUZZ_SEED=0x20261021 bash scripts/ci.sh` đạt **180/180**, không lỗi/skip; `SC01 OK`. Sau khi thêm, `forge fmt --check tests/integration/TimelockGovernance.t.sol` và toàn bộ integration file đạt **40/40** trong worktree candidate cô lập.
- Node24.15.0: `npm run typecheck`, `npm run build` and suites `test:be02`, `test:be03`, `test:be04`, `test:be06`, `test:be07`, `test:be08` passed before deployment removal. `node --test scripts/cd/release.test.mjs`: **4/4 PASS**. Push and PR workflows on `80dc9ff68074c83ecf84e94f35ba0e7a0fc282a0` passed, including container build and Compose smoke ([push 44934756293](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/44934756293), [PR 44934759771](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/44934759771)); Foundry fallback passed in runs 44934756477/44934759604. Publish skipped by condition.
- Frontend: lint exit0 với 8 warning hiện hữu; Vitest **127 PASS / 1 opt-in live SKIP**; build PASS, chunk 753.81 kB có cảnh báo kích thước.
- [Post-merge TV4 CI](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/44922740231): **10 jobs success**, publish job skipped theo điều kiện release. [Forced Foundry fallback](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/44922740366): success. Cả hai trên SHA `6766e5e`.
- Chrome headless đã render UI local fixture ở 1280×900; đây chỉ là kiểm tra hiển thị offline, không dùng API thật hoặc extension wallet.
- Local `npm run test:api` dừng tại isolation guard vì không có `BE05_TEST_ISOLATED=1`/URL database mới; phân loại **BLOCKED/NOT RUN**, không phải test assertion failure. Máy không có PostgreSQL binaries hoặc Docker daemon. Không đặt biến giả để vượt guard; các job PostgreSQL/API thực tế đã PASS trong GitHub CI.

**Gate còn mở:** #19/#41 cần ví extension thật, #20 thiếu signer/gas/broadcast được ủy quyền và receipt testnet, #36/#40/#42 cần evidence từ môi trường nhận tương ứng; #44 chưa release-ready. CI/Compose smoke không thay thế live/testnet acceptance.


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
