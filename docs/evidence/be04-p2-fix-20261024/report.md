# Báo cáo sửa hai lỗi P2 BE04

Ngày 24/10/2026. Audit base/working-tree commit: `9ea62ec93e0ec309d85d5d21dcd1ab9b4f5345ed`; base BE03: `4b9f060e8e2bdef7849b09d55ddeaf6a90545d4d`. Nhánh local: `fix/be04-audit-p2-20261024`. Remote BE04/BE03 vẫn lần lượt ở đúng hai SHA trên. Các thay đổi chưa commit; không push hoặc cập nhật PR.

## 1. Khôi phục `--redecode` — P2, lỗi kế thừa BE03

Nguyên nhân là truy vấn trong `PostgresStorage.redecode()` chỉ lấy row có `decode_status IS DISTINCT FROM 'decoded'`. Khi `decoded_payload` hoặc `event_name` bị sửa mà status còn `decoded`, lệnh bỏ qua row. Đây là lỗi trong BE03 storage, khiến hướng dẫn phục hồi BE04 không có tác dụng.

Trong [storage.ts](../../../indexer/storage.ts) (`redecode()`, dòng 333; transaction/lock và scan đến dòng 368), `redecode()` nay khóa cùng chain và checkpoint, đọc toàn bộ raw row đến H bằng `FOR UPDATE`, chọn ABI theo đúng role **và address**, rồi giải mã lại từ `topics`/`data`. Chỉ các cột decode khác kết quả raw mới được cập nhật. `markDecodeState()` và cập nhật row cùng commit; lỗi SQL rollback toàn bộ. Raw identity, tọa độ block/transaction/log, topics/data, `rpc_log` và block/hash checkpoint được giữ nguyên. Row sau H không bị xử lý.

`processed` được định nghĩa trong JSON CLI và docs là số raw event trong deployment được giải mã lại (đến H nếu đã có raw checkpoint; nếu chưa có checkpoint thì gồm mọi raw row hiện có), kể cả row không đổi. Đây là số row đã quét, không phải số row được cập nhật.

Regression trong [projection-storage.test.ts](../../../tests/indexer/projection-storage.test.ts) (dòng 313–469) và [be04-live-receipt.test.mjs](../../../tests/indexer/be04-live-receipt.test.mjs) (dòng 7–70) chứng minh:

- Trên mã cũ, payload sai `999`, event name sai và nhãn còn `decoded` cho kết quả `processed=0`; test mong đợi phục hồi. Test pre-fix: **7 pass, 3 fail, 0 skip** trên worktree SHA cũ.
- Trên mã sửa, raw `Transfer` được phục hồi về `value=10000`, event name/status/error đúng. Một raw row giả lập sau H vẫn giữ nguyên; `processed=2` chỉ đếm hai row tới H.
- Unknown topic và malformed data trở lại lần lượt `unknown_topic/UNKNOWN_TOPIC` và `decode_error/DECODE_ERROR`, không bị đổi thành decoded. `last_error_code` vẫn `DECODE_INCOMPLETE`.
- Trigger cố ý làm SQL lỗi sau khi row đầu được sửa chứng minh transaction rollback giữ nguyên cả row và checkpoint.
- Chạy lại giữ nguyên payload/status/raw/checkpoint; CLI xuất `processedMeaning` và đếm đúng raw rows đến H.

BE04 PostgreSQL suite sau sửa: **10/10 pass, 0 skip**. Regression trước/sau được ghi riêng, không thay evidence audit cũ. Log pre-fix và post-fix: [redecode-before-fix.log](redecode-before-fix.log), [be04-db-final.log](be04-db-final.log).

## 2. Chờ transaction receipt — P2, lỗi runner BE04

Runner chính thức [check_be04_live.mjs](../../../scripts/check_be04_live.mjs) (dòng 111–119) dùng helper chờ receipt; trước sửa chỉ gọi `eth_getTransactionReceipt` một lần rồi assert ngay; một kết quả `null` làm dừng ở proposal đầu. Lỗi cũ được lưu tại [CI failure](pre-fix-ci-live-failure.log) (run `40072313274`) và [local runner failure](pre-fix-live-runner.log).

Thêm [receipt.mjs](../../../scripts/receipt.mjs) (dòng 27; status assertion dòng 70): polling mỗi 100 ms với deadline đơn điệu 60 giây; chỉ `null` được retry. RPC error trả lỗi riêng đã lọc nội dung provider nhưng chứa bước giao dịch/hash; timeout cũng có bước/hash. Helper không gửi lại transaction. Receipt status được so với kỳ vọng: transaction thường yêu cầu `0x1`, transaction cố ý revert yêu cầu `0x0`. `governance_local.mjs` tái sử dụng cùng helper. Các test điều khiển RPC bao phủ null rồi có receipt, timeout cả null lẫn RPC treo, RPC error không lộ secret, receipt revert đúng/sai kỳ vọng.

Runner chính thức [check_be04_live.mjs](../../../scripts/check_be04_live.mjs) hiện còn kiểm tra hai case audit trước chưa có trong runner chính: hai proposal cùng recipient/amount với `requestId=0` và execute thiếu tiền, nạp thêm quỹ rồi retry. Test receipt được thêm vào `npm run test:be04`.

Lần chạy cuối dùng cluster PostgreSQL 18.4 mới, chạy bằng UID thường và chỉ bind loopback, cùng Anvil 1.8.5 unforked mới; **10/10 phase pass**, 24 transaction receipts được kiểm tra. Evidence chính là `be04-live-final-run.json` (manifest, source hashes, receipt, state/projection từng H) và `be04-live-final-run-sql.log`; dump đầy đủ được giữ trong thư mục audit cục bộ, không đóng gói vào PR. Các checkpoint raw/projection đều cùng H/hash; tại cuối:

- H=`67`, hash=`0x7b66ac580f1eac86167d0bdc26a7534fe8c15b852fa38d671bf23b488014c836`, projection revision=`33fb82ad-8298-4174-ba36-06b23bb3a2a0`.
- Tally/quorum/trạng thái được đối chiếu với contract qua block hash. Các mốc phase: H `24, 28, 31, 41, 44, 48, 51, 55, 63, 67`. Bao gồm Pending tại snapshot, Active sau snapshot và đúng deadline, tính quorum, kết quả sau deadline, cancel, Waiting/Ready tại ETA và trạng thái sau execute.
- Proposal duplicate `requestId=0`: chỉ proposal đầu có disbursement/Transfer; proposal kia vẫn Queued/Ready. Execute trùng có receipt `0x0`, 0 logs.
- Treasury thiếu tiền: 9.000 BUD trước execute 11.000 BUD; receipt `0x0`, 0 logs, `paidRequests=false`, balance và ledger không đổi, proposal còn Queued/Ready tại H=63. Nạp 3.000 BUD rồi retry có receipt `0x1`, 4 logs, proposal Executed/Done.
- SQL final: raw/projection checkpoint cùng H/hash; 6 proposals, 9 votes, 3 operations, 4 BUD Transfers, 2 disbursements; total in `13,000 BUD` trừ total out `12,000 BUD` bằng balance `1,000 BUD`. `BudgetDisbursed` chỉ liên kết, không làm tăng tổng Transfer.

Evidence live cuối, manifest, receipts và source hashes: [be04-live-final-run.json](be04-live-final-run.json); kết quả SQL: [be04-live-final-run-sql.log](be04-live-final-run-sql.log).

## Thay đổi trong working tree

- Sửa: `indexer/storage.ts`, `indexer/cli.ts`, `scripts/check_be04_live.mjs`, `scripts/governance_local.mjs`, `tests/indexer/projection-storage.test.ts`, `package.json`, `docs/be03.md`, `docs/be04.md`.
- Thêm: `scripts/receipt.mjs`, `tests/indexer/be04-live-receipt.test.mjs`.
- Giữ nguyên runner audit chưa commit `scripts/audit_be04_live.mjs`; không dùng làm runner nghiệm thu chính.
- Không sửa contract, migration, ABI, dependency hoặc lockfile. Không commit/push.

## Kiểm tra

| Trạng thái | Lệnh/phạm vi | Kết quả |
|---|---|---|
| PASS | `npm ci` | 30 package theo lockfile, 0 vulnerability. |
| PASS | `npm run typecheck`; `npm run build` | Exit 0. |
| PASS | `npm run test:be02` | 64/64, 0 skip. |
| PASS | `npm run test:be03` | 22/22, 0 skip. |
| PASS | `npm run test:be04` | 27/27, 0 skip; gồm 4 receipt waiter tests. |
| PASS | BE01 migration 001 + `001_initial_checks.sql` trên DB mới | SQL constraints/domain/foreign key checks pass. |
| PASS | BE02 PostgreSQL suite trực tiếp | 21/21, 0 skip. |
| PASS | BE03 PostgreSQL suite trực tiếp | 16/16, 0 skip; có crash trước/sau COMMIT và restart. |
| PASS | BE04 PostgreSQL suite trực tiếp | 10/10, 0 skip. |
| FAIL AS EXPECTED | Cùng regression BE04 chạy trên SHA trước sửa | 7 pass, 3 fail, 0 skip. |
| PASS | `forge build`; `FOUNDRY_PROFILE=ci FOUNDRY_FUZZ_SEED=0x20261021 bash scripts/ci.sh` | 142/142 contract tests, 0 skip; ABI/SC01 check pass. Không có Solidity thay đổi; artifact metadata xác nhận compiler đúng. |
| PASS | Official `scripts/check_be04_live.mjs` trực tiếp | Anvil 1.8.5 unforked + PostgreSQL 18.4 mới; 10 phase, 24 receipt, H=67; assertions receipt/state/ledger pass. |
| PASS | SQL đối chiếu DB live và provenance | Raw/projection H/hash trùng; tổng Transfer khớp balance; deployment/source/ABI/compiler metadata và 14/14 working-tree source hashes được lưu. Full SQL dump được giữ trong audit cục bộ, không đưa vào PR. |
| PASS | `git diff --check`; `node --check` ba script | Exit 0. |
| BLOCKED | Docker wrappers `test:be02:db:linux`, `test:be04:db`, `test:be04:live` | Docker không có trong WSL. Thay bằng suite DB trực tiếp trên PostgreSQL 18.4 mới; official live runner chạy trực tiếp thành công. |
| BLOCKED | PowerShell wrapper `test:be03:db` | `powershell: not found`; suite PostgreSQL BE03 chạy trực tiếp thành công. |
| NOT RUN | GitHub CI sau sửa | Không push/update PR theo giới hạn thao tác. PR #23 remote vẫn ở SHA audit; CI fail cũ được giữ làm bằng chứng pre-fix. |

Môi trường: WSL2 Ubuntu 26.04.1, UID thường 1000; Node `v24.15.0`, npm `11.12.1`; Forge/Anvil `1.8.5`; Solc `0.8.37+commit.f401782d`, Osaka, optimizer 200; PostgreSQL nguyên bản `18.4`, cluster audit mới chỉ loopback `127.0.0.1:55474`. Submodule revisions và toàn bộ lệnh/exit code: [run-metadata.json](run-metadata.json). Source/ABI/compiler provenance: [source-provenance.json](source-provenance.json); cả 14 source hash runner ghi nhận khớp working tree cuối; ABI, compiler, bytecode và manifest deployment có trong provenance.

## Evidence mới

Evidence cần thiết cho lần sửa được đóng gói trong thư mục này; các file CI/live trước sửa được giữ kèm để đối chiếu. Bản dump SQL và các lượt chạy trung gian vẫn được giữ ngoài repository trong môi trường audit; PR chỉ chứa log SQL tóm tắt cùng receipt/projection evidence.


Cluster PostgreSQL và worktree pre-fix do lượt sửa tạo đã được dừng/xóa sau khi lưu dump và log; evidence giữ tại thư mục này. `npm run test:be04:live` Docker wrapper và các wrapper DB phụ thuộc Docker/PowerShell vẫn BLOCKED do thiếu runtime tương ứng; các suite trực tiếp trên PostgreSQL cô lập và runner live chính thức trực tiếp đã PASS.
