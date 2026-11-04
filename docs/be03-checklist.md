# BE03 — checklist và kết quả TV2

## Nghiệm thu tích hợp mới — 24/10/2026 UTC: PASS

**PASS tích hợp raw BE03 trên chain mới → RPC thật → PostgreSQL test riêng.**
Kết quả mới thay thế trạng thái BLOCKED về môi trường/receipt của các lần trước;
các phần từ “Lịch sử tái review” bên dưới được giữ nguyên như lịch sử tại thời
điểm ghi, không phải trạng thái hiện tại. Xem [báo cáo nghiệm thu](evidence/be03-integration-20261024/report.md),
[verification](evidence/be03-integration-20261024/verification.json),
[manifest mới](evidence/be03-integration-20261024/manifest.json) và
[kết quả chạy thật](evidence/be03-integration-20261024/integration.json).

- [x] Forge **1.8.5** trong Ubuntu/WSL, Solc **0.8.37+commit.f401782d**,
  optimizer 200, Osaka; rebuild bắt buộc **83 source**, **98 artifact + 1 build-info**.
  Cả 99 JSON giữ nguyên SHA-256 so với artifact người dùng đã build.
- [x] Xác minh đủ output theo cache, compiler/settings/ABI/source metadata;
  ghi rõ CRLF → LF và test preprocessor của Foundry. Các submodule và submodule
  lồng nhau đúng SHA khóa; khác biệt checkout chỉ là line endings, không đổi nội dung.
- [x] Anvil/Cast **1.7.1 Windows** đã kiểm tra Osaka, Node **24.15.0**,
  PostgreSQL **18.4**; binary hashes/phiên bản có trong evidence. Không gọi Forge Windows.
- [x] Deploy qua `scripts/deploy_local.mjs` trên instance unforked mới H=0;
  manifest/ABI/bytecode/constructor/roles/source được kiểm tra bởi helper repository.
- [x] Propose H=20 → WithParams H=21 → vote thường H=24 → queue H=25 → execute H=26.
  Proposal Executed, Treasury trả **1000 BUD**, paidRequests=true.
- [x] Receipt WithParams mới `0x8b10edb9e325f80ae20340ef2826a8490cc1b477924a62f063f74ca2a191678c`:
  đủ sáu field, reason Unicode, params `0x123400ff`, weight `400000000000000000000`.
- [x] K=2: head 21/22/23 → checkpoint 19/20/21; số WithParams trong PG **0/0/1**.
  Execute cũng chưa nhập ở head 26 và được nhập khi head=28.
- [x] Kill worker thật tại barrier trước COMMIT: checkpoint 26 và snapshot không đổi;
  CLI restart nhập một batch đến 29. Kill sau COMMIT trước stdout: checkpoint 32;
  restart nhập 0 batch, snapshot không đổi.
- [x] Hai CLI restart idle và `--redecode` giữ event ID/raw/payload/checkpoint;
  không mất hoặc trùng event. Có receipt Transfer thật trong cả hai batch thử crash.
- [x] Cùng **H=32, head=34, K=2**: 31 header, **30/30 receipt log thuộc 4 source**
  khớp raw PG; 14 log nghiệp vụ decode khớp full compiler ABI; 0 decode_error,
  0 missing/duplicate/raw mismatch/supported decode mismatch.
- [x] Build/typecheck PASS; BE03+decoder **47/47**, PostgreSQL **16/16**, guard
  provenance **4/4**, không skip. Lần PG 15/16 ban đầu được lưu và lỗi chờ test
  đã sửa: vẫn bắt buộc SQL thấy advisory lock cùng PID blocker thật.
- [x] Dừng Anvil (RPC không còn truy cập) và cluster PG riêng (`pg_ctl status` exit 3).
  Giữ data/log test để điều tra; không dùng DB/manifest/address cũ.

**Giới hạn decode được ghi nhận:** 16 log quản trị bootstrap ngoài ABI subset
của BE03 được giữ nguyên `unknown_topic`, khớp full artifact ABI. Vì vậy CLI
`--sync` và `--redecode` trả **exit 2**, `decodeComplete=false`, checkpoint giữ
`DECODE_INCOMPLETE`. PASS trên là nghiệm thu raw/checkpoint và các event nghiệp
vụ đã hỗ trợ; không khẳng định decoder hỗ trợ mọi topic quản trị. Không thêm
ABI ngoài scope để làm xanh báo cáo. TV1/TV4 peer review vẫn là việc riêng chưa thực hiện.

Hai sửa chữa phục vụ nghiệm thu: `scripts/governance_local.mjs:129` kiểm source
CRLF/LF theo đúng compiler input và ghi normalization trong provenance;
`tests/indexer/checkpoint-storage.test.ts:187` thay giới hạn 100 poll nhanh bằng
thời hạn 5 giây, vẫn yêu cầu advisory lock thật. Không sửa contract, thư viện,
compiler/config hoặc warnings. Evidence tích hợp trên được ghi trước khi đóng
gói commit/PR; không làm BE04. Bước đóng gói và kiểm tra candidate ghi riêng tại
[verification đóng gói](evidence/be03-packaging-20261024/verification.json).

## Lịch sử tái review và kiểm tra — 24/10/2026

**Đủ để bàn giao review mã nguồn; nghiệm thu chain mới → RPC → PostgreSQL vẫn
BLOCKED, chưa có receipt VoteCastWithParams mới.** Review không phát hiện lỗi cụ
thể cần sửa runtime/migration/test. Không coi kết quả triển khai trước là phép
kiểm mới. Xem [review chi tiết](evidence/be03-review-20261024/review.md) và
[verification mới](evidence/be03-review-20261024/verification.json), gồm source
hash, lệnh, exit code, SQL và cleanup.

- [x] Xác minh nhánh `feature/tv2-be03`, HEAD `1a4c262f387fa7480020da17dde5d608a5193eaf`,
  working tree BE03 chưa commit; review đủ bảy bất biến được yêu cầu.
- [x] Kiểm tra mới: build/typecheck PASS; BE03 **22/22**, PostgreSQL BE03
  **16/16**, decoder **25/25**, đều 0 skip. Không chạy lại toàn bộ BE02.
- [x] Tách rõ `--redecode` offline kiểm metadata chain/deployment/scope trong
  DB; canonical RPC hash chỉ được xác minh bởi `--sync`.
- [x] Kiểm riêng Forge/Cast/Anvil: Forge bị Application Control chặn cả ngoài
  sandbox; Cast/Anvil 1.7.1 chạy được, Cast đọc chainId **31337** từ Anvil mới.
- [x] Thử script deploy trên node mới: exit **1**, thiếu artifact GOV; cả năm
  artifact cần thiết đều chưa có. WSL chưa cài, Docker không có trên PATH;
  không dispatch CI hoặc thay chính sách bảo mật.
- [x] Node mới vẫn H=0, không giao dịch/manifest/deployment address mới; đã dừng
  các node probe và PostgreSQL test. RPC không còn truy cập, pg_ctl exit 3.
- [ ] Receipt mới WithParams và luồng propose/vote/queue/execute → RPC → PG;
  biên K=2, resume/dedup và đối chiếu receipt cùng H trên chain mới: **BLOCKED**.
- [ ] TV1/TV4 peer review và môi trường/artifact có provenance hợp lệ để chạy
  tiếp; không yêu cầu BE04/projection/API trong nghiệm thu BE03.

## Lần triển khai trước — bằng chứng lịch sử

Ngày ghi báo cáo trước: **24/10/2026**, Windows/Asia Bangkok. Nhánh ban đầu
`feature/tv2-be02`, SHA `4c568d6af1c5ca1a6ca203e61bd5558b5b4d6ed7`, working tree
sạch. Đã fetch origin và kiểm tra BE02 là ancestor của Dev. Nhánh riêng
`feature/tv2-be03` tạo từ `origin/Dev` tại
`1a4c262f387fa7480020da17dde5d608a5193eaf`; không merge và không tạo commit.
Remote `https://github.com/SE2026-21-1/dao-budget-simulator.git`.

Không có AGENTS.md trong repo/thư mục cha. Đã đọc README, BE01/BE02,
indexer/database/contracts, migration/script/test liên quan và verification
TV4 `docs/evidence/tv4-20261022/verification.json`, handoff/ABI/receipt trên Dev.
Không tìm thấy file audit WithParams riêng trong checkout; tái hiện trực tiếp
từ compiler ABI. Không dùng đường dẫn `<audit>` như đường dẫn thật.

## BE02 trước BE03

- [x] Test riêng tạo log **synthetic từ compiler ABI** BudgetGovernor, nhận
  UNKNOWN_TOPIC trước sửa (topic `0xe2babfbac5889a709b63bb7f598b324e08bc5a4fb9ec647fb3cbc9ec07eb8712`).
- [x] Thêm registry `VoteCastWithParams(address indexed voter,uint256 proposalId,uint8 support,uint256 weight,string reason,bytes params)`.
- [x] Đối chiếu shared ABI và OZ IGovernor/Governor v5.4.0 đã khóa: params
  không rỗng phát WithParams, params rỗng phát VoteCast; BudgetGovernor kế thừa.
- [x] Giữ đủ sáu field, uint256 max/weight >2^53 dạng chuỗi, reason Unicode và
  params bytes; giữ nguyên raw. Regression PASS sau sửa.
- [x] BE02 unit/RPC/CLI **64/64**, DB **21/21**; không thay fixture BE01/SC01.
- [x] Kiểm tra recovery raw WithParams trước đây unknown → decoded trong DB,
  giữ raw_event_id/rpc_log và cả params. Đây vẫn là log synthetic, không gọi
  nó là receipt thật.

## BE03 đã triển khai

- [x] Scope theo chain/deployment và fingerprint toàn tập source/địa chỉ/block/ABI.
- [x] Từ chối thiếu source trong manifest, đổi scope/K và checkpoint legacy chưa có scope.
- [x] Phân biệt checkpoint absent với H=0; lần đầu từ deployment block, resume H+1.
- [x] K mặc định 2, miền kiểu/số hợp lệ; biên head−K, K=0, head<K, chưa có safe block.
- [x] Tái dùng readBatch, header validation, transaction, khóa chain, dedup/conflict.
- [x] Header/raw/trạng thái decode/checkpoint commit nguyên batch; batch rỗng tiến H.
- [x] Một RPC source lỗi hoặc thiếu scan evidence không tiến checkpoint.
- [x] Lỗi giữa các insert và lỗi deferred tại COMMIT rollback đầy đủ, không báo thành công.
- [x] Writer cũ bị CAS dưới advisory lock chặn; không ghi lùi hoặc nhảy qua coverage.
- [x] Restart luôn kiểm hash H, kể cả idle; mismatch/RPC không xác minh được dừng, giữ DB.
- [x] Unknown và decode error lưu raw/trạng thái riêng, còn thấy ở report khi idle restart.
- [x] `--redecode` phục hồi từ immutable raw trong transaction, không di chuyển H.
- [x] Migration 001 giữ nguyên; 002 chỉ thêm source scope và decode status còn thiếu.
- [x] Tài liệu migrate, cấu hình, start/restart, mismatch, decode recovery, test.

## Kiểm chứng và loại bằng chứng

| Lệnh | Kết quả | Phạm vi |
|---|---|---|
| `npm run build` | PASS | TypeScript runtime |
| `npm run typecheck` | PASS | Runtime và tests |
| `npm run test:be02` | PASS 64/64, 0 skip | Synthetic compiler ABI/RPC, child CLI |
| `npm run test:be02:db` | PASS 21/21, 0 skip | PostgreSQL 18.4 riêng, BE01 migration/constraints |
| `npm run test:be03` | PASS 22/22, 0 skip | K/scope/range/hash/resume bằng RPC giả lập |
| `npm run test:be03:db` | PASS 16/16, 0 skip | PostgreSQL thật, HTTP RPC synthetic, concurrency, crash/CLI restart |
| `node scripts/check_be01.mjs` | PASS | 123 JSON / 45 proposal / 105 block / 190 nguồn log synthetic |
| `git diff --check` | PASS | Whitespace; kiểm tra thêm file mới |
| `forge --version`, `forge build` qua binary tải tạm | FAIL do môi trường | Windows Application Control chặn thực thi, cả ngoài sandbox |
| Anvil mới → deploy/vote/queue/execute/WithParams → RPC → PG | SKIP/BLOCKED | Chưa build/deploy được repo hiện tại; không có bằng chứng tích hợp mới |

Đầu phiên không có forge/cast/anvil trên PATH và không có artifact Governor.
Submodule đã được khởi tạo đúng SHA khóa. Npm không có package Foundry 1.8.5
ghi trong tài liệu; tải thử Anvil/Forge **1.7.1** vào dist tạm, không đổi
package.json dependencies/lockfile hoặc compiler config. Anvil --version chạy,
Forge bị Application Control chặn. Không hạ compiler 0.8.37/osaka, không đổi
test để né lỗi. Chưa khởi chạy Anvil node hoặc gửi transaction mới.

Receipt/ABI/manifest local của TV4 là **bằng chứng đã lưu trên Dev**, khác với
test synthetic hiện tại và khác tích hợp mới. Không kiểm tra/khẳng định instance
RPC trong handoff cũ đang hoạt động; không tái sử dụng địa chỉ đó để gửi tx.
Không dùng DB có sẵn hoặc gửi giao dịch testnet.

## Crash/restart và SQL

Hai test dùng worker thực, PostgreSQL riêng, HTTP RPC synthetic và CLI thật.
IPC barrier đặt trong PostgresStorage ngay trước COMMIT hoặc sau COMMIT trước
return/callback/stdout; parent đợi IPC rồi kill, không sleep ngẫu nhiên.

| Điểm kill | SQL sau kill, trước restart | SQL sau CLI restart |
|---|---|---|
| Trước COMMIT | 0 header, 0 event, không checkpoint | 2 header, 1 event, H=101 |
| Sau COMMIT, trước báo kết quả | 2 header, 1 event, H=101 | 2 header, 1 event, H=101; 0 batch mới |

SQL join checkpoint với indexed_blocks cùng deployment/number/hash trả
`block_number=101`, `block_hash=header_hash=0x…0065`, `events=1`. Hash này là
**synthetic**, không phải hash Anvil. Toàn bộ stdout chưa có thông báo thành
công tại barrier. Test còn làm COMMIT thất bại bằng deferred constraint trigger
trên checkpoint; SQL không có header/event/checkpoint và không có callback báo
commit. Các trigger test được drop trong finally.

Lần cuối trước khi gom log: cluster
`%TEMP%/dao-be03-pg-99ff891faf0f40a493676c7e6c8cf664`, đã `server stopped`.
Các lần chạy có UUID riêng, không dùng database cũ. Báo cáo cuối và log gom tại
[verification.json](evidence/be03-20261024/verification.json); crashEvidence
được in trực tiếp từ SQL assertion trong log DB. Runner giữ data/server log để
điều tra và dừng cluster trong finally; child/RPC có teardown, worker mất IPC tự
thoát. Không có tiến trình Anvil do lần này để lại.

## Chưa kiểm chứng và phụ thuộc

- [ ] Tích hợp mới từ contract hiện tại với Anvil/receipt thật, gồm WithParams,
  confirmations, restart và đối chiếu raw/checkpoint tại cùng H. TV4 cần môi
  trường chạy được Foundry/solc theo pin; TV1/TV4 xác nhận manifest/ABI/deployment.
- [ ] TV1 review ABI/contract semantics và TV4 xác nhận chính sách K/manifest
  cho môi trường bàn giao thực tế. Tài liệu audit/receipt cũ không thay peer review.
- [ ] BE07: common ancestor và rollback reorg tự động; hiện chỉ phát hiện/dừng.
- [ ] Các task sau: projection/API/rebuild/compare/benchmark; không làm trong BE03.

BE03 đã triển khai và kiểm chứng runtime bằng RPC synthetic + PostgreSQL thật,
bao gồm crash/resume/idempotency. **Chưa nghiệm thu toàn luồng on-chain mới**.
Không commit, push, mở PR, merge hoặc bình luận GitHub trong lần này.
