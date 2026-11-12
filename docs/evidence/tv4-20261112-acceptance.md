# TV4 — review và nghiệm thu tích hợp 12/11/2026

Phan Thanh Dũng — MSV 23001850 — SE2026-T16.

**Kết luận: CHƯA SẴN SÀNG MERGE/RELEASE.** Bản ghép local không xung đột và các kiểm tra chức năng dưới đây đạt; campaign NFR02/03 thất bại tại freshness dưới tải. TV3 chưa công bố commit của cây Swiss Fintech ghép mới; browser máy nhận/extension và testnet chưa nghiệm thu. Không merge, auto-merge, self-approve hoặc đóng các issue chưa hoàn thành.

## 1. Nguồn đã kiểm và an toàn worktree

| Danh tính | SHA / trạng thái |
|---|---|
| Base thực tế `origin/Dev` (chữ hoa; không có `origin/dev`) | `87738d3f792c3a283a52b5c18c306809d6cfcfd4` |
| PR #21, `feature/tv4-operation` → `Dev` | `a7e0a7fbce0a2541d315e4d6b2bbb910b1d2d0fd`, open |
| PR #49, `docs/tv1-sc07-sc09-handoff` → `feature/tv4-operation` | `422023ac3d08b6a22809fc5693ee0b69974ce87c`, open |
| TV3 công bố, `feature/tv3-frontend` | `4cba99a0ecb54a9ad8fc29ec5c08419e61e80c44` |
| TV3 Modern Swiss Fintech + consumer/session ghép | **Chưa commit/push, không có SHA nghiệm thu**; TV3 báo tại [#36](https://github.com/SE2026-21-1/dao-budget-simulator/issues/36#issuecomment-6795801683) và [PR21](https://github.com/SE2026-21-1/dao-budget-simulator/pull/21#issuecomment-6795806681) |
| Bản ghép thử, `integration/tv4-20261112` | `f20f8f04e4083f161d5e6a8141e8d5aa06308aa2` |
| `Dev` cuối sau merge | **Chưa có merge**; remote vẫn `87738d3…` khi đối chiếu cuối |
| Source đang chạy trên testnet | **UNKNOWN**, không có manifest triển khai |

Đã fetch origin, kiểm PR/reviews/comments/checks/dependencies và hai Projects qua phiên GitHub `dung0611`. Đối chiếu remote lần cuối vẫn đúng bốn SHA công bố trên. PR21 tác giả chính là tài khoản đăng nhập: không tự approve. API công khai sau đó hết quota; không diễn giải 401/403 là branch protection không tồn tại.

Worktree gốc có **33 modified + 7 untracked**, không staged. Giữ nguyên toàn bộ, không checkout/reset/clean/force-push. Hai worktree riêng: `/tmp/dao-tv4-20261112` cho ghép/kiểm và `/tmp/dao-tv4-report-20261112` cho nhánh báo cáo `docs/tv4-acceptance-20261112` từ Dev. Không nhập VT-064/importer/PDF cá nhân; PR31 không thuộc campaign này.

Đã đọc hướng dẫn repo được nạp, README, phân công TV4/TV1, requirements, workflow, deploy-local/role gates và testnet preflight. Không có CONTRIBUTING ở root cây Dev; CONTRIBUTING trong submodule không phải quy trình đóng góp của dự án. Requirement hiện hành NFR02 là **100 proposal/1.000 vote, 10 client, 60 giây, p95 <1 giây**, không phải 80 user/2,5 giây. Bulk import ngoài diff PR21/49 nên không nhận nghiệm thu importer.

## 2. Review thực tế và khoảng trống nghiệm thu

### PR49 — không phát hiện blocker trong documentation scope

Đọc diff bốn Markdown files, contract/test assertions và nguồn evidence SC07/SC09. SC05 roles/pre-renounce/pre-funding, SC06 provenance, boundaries S/D/ETA, thiếu quỹ/retry/shared request, ownership TV1/TV4 và giới hạn local/testnet được mô tả phù hợp. 139 relative-link destinations tồn tại. Không coi số PASS lịch sử là lượt chạy mới. [Review COMMENT đã đăng](https://github.com/SE2026-21-1/dao-budget-simulator/pull/49#pullrequestreview-5870963265); không phải approval/release.

### PR21 / TV3 — chưa phát hiện patch bug có đủ bằng chứng để sửa production source

Đã đối chiếu wallet provider/account/chain qua async calls; event-version thắng delayed connect; snapshot lease bị thu hồi khi 409/503; giữ hash khi outcome verification/refresh lỗi; kiểm Governor emitter, receipt target và expected proposal ID. ABI/frontend/backend và raw ledger không đếm đôi Transfer/BudgetDisbursed được kiểm bằng source, SC06 mutations và live smoke.

PR21 chỉ **port chọn lọc** TV3, không merge toàn bộ nhánh `4cba99a`. `governanceActions.ts` và static vectors được giữ; không suy receiver PASS trên TV3 thành PR21 PASS.

| Mức ảnh hưởng | Vị trí / điều kiện tái hiện | Kết quả / xử lý |
|---|---|---|
| High — acceptance failure, root cause chưa xác định | `scripts/be08_worker_probe.mjs:104–123`; dataset100/1000, 10 HTTP clients. Load sample5: eventH1182, API cònH1179 sau30.105,566ms, `present=false` | NFR03 không đạt trong lượt này; campaign NFR02/03 FAIL. Worker không có worker_error, sau đó publishH1182 và shutdown0. Host4logicalCPU, loadavg đầu7,29/cuối12,11: có contention nhưng chưa chứng minh environment-only. Giữ threshold, raw và [theo dõi #18](https://github.com/SE2026-21-1/dao-budget-simulator/issues/18#issuecomment-6818151100); không tạo issue trùng. TV2/TV4 cần phân tách contention/publication/materialization trên campaign cô lập trước chốt. |
| High — thiếu source nghiệm thu TV3 | [TV3 #36 comment](https://github.com/SE2026-21-1/dao-budget-simulator/issues/36#issuecomment-6795801683); fetch chỉ thấy4cba99a, bản Swiss Fintech mới chưa commit | TV3 cần commit/push đúng cây ghép đã giữ receipt canonical-refresh, outcome+ID và WalletSession/snapshotguard, công bố SHA; sau đó nghiệm thu browser/live trên SHA đó. Không đụng dirty checkout TV3. |
| Medium — coverage/consumer gap, không khẳng định patch regression | `frontend/src/pages/ProposalDetailPage.tsx:14–15` ở PR21 lấy detail từ collection. TV3 reconciliation detail/votes/linked transfers và `frontend/src/data/api.live.test.ts` chưa nằm trong PR21 | Chốt source dự định với TV3 rồi chạy consumer/live suite trên đúng SHA; không gán live1/0 của4cba99a cho PR21. Giữ #36/#19/#41 partial/blocked. |
| Medium — báo cáo metric của campaign lỗi cần đọc raw | `scripts/benchmark_api.mjs:416–427,482–483`: throw khi freshness rejected trước load finalization; console in0/0/p95null | Raw thực có8.302success/0HTTPerrors. Diagnostic nearest-rank p95=282,919140ms **không phải acceptance**; không đổi FAIL thành PASS. Ghi rõ trong #18 và raw diagnosis, không dùng console0 làm thống kê. |

Không có production-source fix được tạo trong lượt này; không nới assertion/threshold, skip test hoặc sửa PR của người khác. Đã xử lý được lỗi môi trường ICU bằng thư viện tách riêng, không sửa hệ thống hoặc fake symlink ABI.

## 3. Kiểm thử thực chạy trên bản ghép S

**S = `f20f8f04e4083f161d5e6a8141e8d5aa06308aa2`.** Linux x64, Node24.15.0, Foundry/Anvil1.8.5, Solidity0.8.37/Osaka; PostgreSQL18.4 trên cluster mới, loopback, không DB phục vụ. Cài từ hai lockfiles và pinned submodules. Tất cả kết quả mới dưới đây thuộc S, không phải SHA cuối Dev hoặc SHA docs-report.

| Hạng mục / lệnh | Môi trường / SHA | Kết quả | Evidence trong archive |
|---|---|---|---|
| `npm run typecheck && npm run build` | Node24.15 / S | PASS | `unit-frontend.log`, `be07/typecheck.txt`, `be07/build.txt` |
| `test:be02`, `test:be03`, `test:be04`, `test:be06`, `test:be07` | Node24.15 / S | 100+25+28+5+15 = **173 PASS**,0fail/skip | `unit-frontend.log`, `be07/unit.txt` |
| Frontend lint/test/build | Chromium build / S | **65 PASS**; lint exit0 với8warnings; build PASS, bundle646,89kB warning | `unit-frontend.log` |
| `FOUNDRY_PROFILE=ci FOUNDRY_FUZZ_SEED=0x20261021 bash scripts/ci.sh` | Foundry1.8.5 / S | **202 PASS**,0fail/skip; bounded100×50, compiler/lint warnings giữ nguyên; ABI/fixture checkPASS | `contracts-and-loader-error.log` |
| `node --import tsx --test tests/sc06-chain.test.mjs` | Node24.15 / S | **32 PASS**, canonical+negative mutations | Structured command record; source tests pinned at S |
| `npm run test:bootstrap`; interruption suite; request-order runner | Fresh owned Anvil / S | **15+8 PASS**, TC10 **4/4** deployments/order variants | `bootstrap-interruption-tc10.log`, `qa05-request-orders.json` |
| Native SQL/storage/checkpoint/projection/API/BE06 | PG18.4 / S | SQL constraintsPASS; **57 DB/API PASS**,0skip | `native/report.json`, `native/logs/` |
| Dedicated `npm run test:be07:native` | PG18.4 mới riêng / S | All10commands exit0; **19 BE07 DB PASS**,0skip; 57DB và173unit chạy lạiPASS; live recoveryPASS | `be07/commands.json`, `be07/be07-db.txt`, `be07/be07-live.json`, `be07/tested-source.json` (empty patch) |
| Native governance→ingestion→API, reorg/RPC-loss, BE06 two-target rebuild | Anvil/PG/API / S | PASS; recovery503/cursor409; orphanRows0/replacementRows1; same-H/hash compares | `native/live.json`, `native/governance-storage.json`, rebuild exports/compares |
| `test:tv4:native … --benchmark` | 100/1000,10clients / S | **FAIL** tại `http_load`, freshness sample5 timeout30s; NFR02/03 chưa đạt, outage stage sau load NOT_RUN | `native/benchmark.json`, `benchmark-diagnosis.json`; tổng native command exit1 |
| UI dashboard/list/detail/create ×390/1366, keyboard skip-link | Managed Chromium, fixture/read-only / S | PASS layout; không horizontal overflow, skip-link focus `main-content`; không runtime error quan sát | `ui-proof.json`, `ui/*.png` |
| Sepolia identity/opcode probe | PublicNode11155111, không deployment | Limited PASS,0broadcast; testnet acceptance BLOCKED | `testnet-probe.json` |

Không cộng các lượt unit/DB lặp lại thành test cases mới. Native tổng FAIL vì benchmark, dù các suite độc lập PASS. 57DB +19BE07 =76 distinct DB cases trong campaign; không gọi skip là acceptance.

### Lỗi môi trường/lệnh giữ trong evidence

- Lượt native đầu dừng ngay `postgres --version` vì thiếu `libicui18n.so.60`; **mọi DB suite NOT_RUN**, không phải DB/product failure. Tải Ubuntu `libicu60_60.2-3ubuntu3.2_amd64.deb`, extract `/tmp/dao-tv4-icu60`, chỉ đặt `LD_LIBRARY_PATH` cho lệnh test. Package SHA256 `f01f61f57e63dc905e02e6441d10370fe0c79e43e70e6f5fe24b342fd2633209`; PG sau đó báo18.4.
- Lệnh SC06 ban đầu thiếu `--import tsx`, fail resolve `indexer/abi-registry.js` từ TS. Chạy lại đúng lệnh workflow với loader:32PASS. Không quy lỗi lệnh này cho sản phẩm.
- Python HTTP probe trả403; curl cùng RPC thành công. Không dùng lỗi transport để gọi chain sai.
- Probe UI ban đầu chọn nhầm link `/proposals/new` làm detail; đã sửa selector, thực chạy lại detail ID cụ thể ở cả390/1366. `ui-proof.json` cuối chứa đúng bốn routes, không nhận hai lần create là detail.

### Lệnh native tái lập

```bash
export PATH=/home/ptdung/.nvm/versions/node/v24.15.0/bin:$PATH
export LD_LIBRARY_PATH=/tmp/dao-tv4-icu60/usr/lib/x86_64-linux-gnu
npm run test:tv4:native -- \
  --postgres-bin /tmp/dao-tv4-pg-20261112/node_modules/@embedded-postgres/linux-x64/native/bin \
  --output /tmp/tv4-native-20261112-icu --benchmark
BE07_PG_BIN=/tmp/dao-tv4-pg-20261112/node_modules/@embedded-postgres/linux-x64/native/bin \
BE07_EVIDENCE_DIR=/tmp/tv4-be07-20261112 npm run test:be07:native
```

Các output trên đã tồn tại; khi tái lập phải chọn output/cluster mới. Không dùng DATABASE_URL/RPC_URL của hệ thống phục vụ. Native benchmark và cluster cleanupPASS; dedicatedBE07 pg-stop.txt xác nhận shutdown. Frontend smoke service sở hữu và managed browser đã dừng; không kill dịch vụ người khác.

## 4. Testnet và giao dịch

Giữ quyết định cấu hình đã có: **Ethereum Sepolia11155111, K=2**, RPC `https://ethereum-sepolia-rpc.publicnode.com`, explorer `https://sepolia.etherscan.io`, voting60/300/timelock120s. Read-only batch mới thấy head **H12117470**, hash `0xce1860f08f60dc0dbe428bd92a47cda1bd858cde16ceb95502c08340ffe2e121`; CLZ(1)=255. Head/call dùng `latest` trong batch, không khẳng định chung block. Đây chỉ identity/limited opcode probe, không chứng minh compiled bytecode/gas/ABI compatibility.

**0 testnet transactions**, không signer/secret, không mainnet. Không có địa chỉ contract/deployment artifact hoặc FE/BE deployed SHA đủ chứng minh trên Sepolia. Do đó không có receipt/explorer transaction để ghi và không tự nhận Executed/Defeated testnet đã chạy.

Thiếu: signer owner + public account/role map, secure signing và gas test được cấp phép; remote deploy/check-roles path được TV1 review; revision được chấp nhận; manifest chain/address/deploymentBlock/ABI/source/compiler/roles; một Executed và một Defeated bằng thời gian thật. Không gỡ guard localAnvil31337. [#20 vẫn Blocked](https://github.com/SE2026-21-1/dao-budget-simulator/issues/20#issuecomment-6818101258).

Giao dịch **local** mới trong native/live.json, không có explorer: execute1.000BUD `0x9da24dc65c761483556969f1084d8e0f9f3a5782d2b84e4162be7394e60b9759`; retry sau nạp `0xb0ccc657a55d7862744c8b982d5b28102582af70d9c9cc7c0a95ccf3fc2276c5`, được API/SQL đối chiếu tạiH67/hash `0xb41227e63125e21db9d061f42539759f8b714ce58a10e6cf23d4ea6965618ac0`. Raw giữ receipt/status và hash của từng campaign, không trộn với testnet hoặc receiverH24.

## 5. GitHub, merge order và quyền chốt

- [PR49 review](https://github.com/SE2026-21-1/dao-budget-simulator/pull/49#pullrequestreview-5870963265): COMMENT, scope documentation không blocker.
- [PR21 cập nhật nghiệm thu](https://github.com/SE2026-21-1/dao-budget-simulator/pull/21#issuecomment-6818174486): đúng head/base/rehearsal, PASS/FAIL/gates riêng; không tự approve.
- [#18 failure](https://github.com/SE2026-21-1/dao-budget-simulator/issues/18#issuecomment-6818151100), [#20 testnet](https://github.com/SE2026-21-1/dao-budget-simulator/issues/20#issuecomment-6818101258), [#36 TV3](https://github.com/SE2026-21-1/dao-budget-simulator/issues/36): đã bổ sung evidence/đầu ra còn thiếu; giữ mở.
- [Project nhóm#1](https://github.com/orgs/SE2026-21-1/projects/1) và [Project TV4#2](https://github.com/orgs/SE2026-21-1/projects/2): cập nhật fields `Bằng chứng / SHA`, `Phụ thuộc / cần xác nhận` cho#21/#18/#36/#20; giữ Inreview/PARTIAL hoặc Blocked đúng scope. Không đổi Done từ CI xanh.
- Candidate CI đã quan sát: PR21 head a7e0a7f có19/19 successful checks (9PR+9push+1BE08); PR49 head422023a có10/10. UI PR21 hiển thị1/1 approval và1 unresolved comment. Approval TV1 cũ chỉSC/SC06 tạiff484fb; TV2/TV3 COMMENT không là approval toàn head mới. Không giải quyết thread thay reviewer hoặc dùng admin bypass.

**Thứ tự đề xuất, chưa được phép thực hiện:**

1. PR49 `422023ac3d08b6a22809fc5693ee0b69974ce87c` → `feature/tv4-operation`.
2. Fetch lại PR21 (head sẽ đổi sau bước1), đối chiếu delta/CI/review và failure NFR; chỉ khi người dùng chốt revision mới mới mergePR21 → Dev.
3. PR báo cáo `docs/tv4-acceptance-20261112` → Dev; docs-only, không mang source/merge thử vào Dev bằng đường khác.

Lượt ghép thử local làm Dev→PR21→PR49 để dựng cây cuối; đây không thay thứ tự PR trên GitHub. Cây cuối không xung đột. Merge commit cuối Dev vẫn chưa tồn tại; không dùng S hoặc CI head cũ để khẳng định Dev sau merge đã đạt.

Trước merge cần người dùng chốt **PR49/head422023a + PR21/head đã fetch lại + baseDev + PR báo cáo/head của nó**. Hiện đề nghị **chưa chốt mergePR21** vì failure campaign và source TV3 còn thiếu. Không bật auto-merge. Sau approval mới fetch/checkhead/base/checks/review/conflict, retest affected delta, merge theo phương thức repo cho phép và nghiệm thu đúng SHA Dev sau merge; testnet chỉ kiểm khi thực có deployment mới.

## 6. Bộ bằng chứng

- [Manifest máy đọc được](tv4-20261112-acceptance.json).
- [Raw archive](tv4-20261112-raw.tar.gz), SHA256 **`4e4735edde53d471374620c4cce66b4c50c0ee41a6696b1ebf9d929091292f70`**.
- Raw có native reports/logs/receipts/rebuild, failed benchmark + diagnosis, dedicatedBE07 source/commands/output, Foundry/backend/frontend/process logs, screenshots/UI proof và read-only testnet response. Không có `.env`, runtime.env, private key/seed/token. Không đưa credentials vào comment/report.

Bản báo cáo này là evidence của S và các nguồn đã ghi; commit docs chứa báo cáo không được gọi là commit runtime đã kiểm hoặc bản triển khai testnet.
