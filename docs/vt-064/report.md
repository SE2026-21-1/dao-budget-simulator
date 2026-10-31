# BT cá nhân 3 — BC-03 — VT-064

**Phan Thanh Dũng — 23001850. Nhóm SE2026-T16; vai trò thành viên.** Repository: https://github.com/SE2026-21-1/dao-budget-simulator. Baseline: `1bb182144d516c13d6bb32fc30d2778af71a8169`. Branch: https://github.com/SE2026-21-1/dao-budget-simulator/tree/personal/23001850-vt-064-bulk-import. Cam kết: “Tôi chịu trách nhiệm về toàn bộ code, test và nội dung bài làm; tôi đã khai báo việc sử dụng AI.”

## 1. Spec → AI plan → review

Vấn đề: cần import hàng loạt **bản nháp** yêu cầu chi BUD, giữ bản ghi đúng dù đầu vào lẫn bản ghi sai. Scope thực hiện là CLI + thư mục lưu bản nháp offline; **không** import proposal on-chain, không mở API ghi, không được xem dữ liệu nhập là sự kiện canonical. `docs/vt-064/spec.md` ghi prompt/plan trước khi viết code. Invariant: mọi ID trong `imported` phải có file tồn tại nguyên vẹn cùng dữ liệu, và một dòng sai không được xóa/ghi đè dòng đúng.

AC1: Nhận file JSON <=1 MiB, 1–1000 dòng; mỗi dòng có ID an toàn, địa chỉ EVM lower-case, amount canonical uint256 dương theo đơn vị nhỏ nhất và description khác rỗng; trả chỉ số lỗi. AC2: Dòng sai ở đầu/giữa/cuối không chặn các dòng đúng; giữ giá trị chính xác. AC3: Ghi atomically từng file, duplicate không ghi đè. AC4: Hỏng persistence phải exit 1, không có stdout success; nêu chỉ số lỗi và ID đã commit. AC5: Không đụng chain read model, API GET, checkpoint, ví. NFR: 80 tác vụ đồng thời, p95 <=2,5 giây tại workstation; input bounded, no network/secret và báo lỗi có thể tái lập.

Hai phương án AI có vẻ hợp lý nhưng bị bác bỏ: POST `/api/import` chèn thẳng `proposals` trái kiến trúc chain-derived (`database/migrations/001_initial.sql:102–120`, `indexer/storage.ts:38–61` và API GET-only `indexer/api/server.ts:1–10`); giao dịch SQL all-or-nothing sao chép từ checkpoint (`indexer/storage.ts:270–289`) làm một dòng sai phá AC2. Kế hoạch sau review: `indexer/import/drafts.ts` có validate + file save độc lập; `indexer/import/cli.ts` xuất report/exit; `tests/indexer/import.test.ts` test trước; benchmark script + README. Context chỉ module liên quan cho hai reviewer agent; assistant chính vốn đã có repo instructions/progress, không thể tuyên bố mọi lần tương tác AI đều chỉ có module context. Rủi ro thiếu context: nếu chỉ nhìn bảng `proposals`, AI có thể hiểu nhầm đó là kho draft cho phép ghi; review repository cho thấy nó được projection từ chain.

## 2. Strategy và test cases

Unit/property: seed `0x23001850`, 40 batch dài 1–24, xen kẽ ID không an toàn, amount sai, address sai và amount biên 1/10^18/(2^256−1); oracle so **tập ID và nội dung file thật** với tập valid đã tạo, không chỉ check độ dài. Integration dùng temp filesystem thật để thử duplicate/race/mkdir fail/giữa batch; CLI E2E khởi chạy Node process thật kiểm exit/stdout/stderr/file. Không cần wallet E2E hay POST API test vì slice không đổi chain/UI/API; cần chúng khi nối draft vào giao dịch thật.

| ID | Risk / AC | Level | Input / precondition | Expected | P |
|---|---|---|---|---|---|
| T01 | AC1/2 | integration | good–bad(0)–null–good | hai file đúng, lỗi index 1/2 | 0 |
| T02 | AC1/path | unit | `../`, address sai, 0/01/overflow | từ chối, không thoát thư mục | 0 |
| T03 | AC2 | property | 40 batch seed cố định | tập file bằng tập valid, byte/data khớp | 0 |
| T04 | AC2 | integration | toàn invalid, mảng rỗng | 0 file hoặc reject input | 1 |
| T05 | AC3 | integration | trùng ID, amount khác | file cũ không đổi, ID mới được ghi | 0 |
| T06 | AC3 | integration | hai task cùng ID | một thắng, một conflict | 0 |
| T07 | AC4/mutation | integration | destination là file | ImportFailure, không success giả | 0 |
| T08 | AC4 | integration | store fail sau file thứ nhất | file đầu còn, ID sau không được tính | 0 |
| T09 | AC1 | CLI/unit | JSON sai, >1 MiB, `/dev/zero` Linux; >1000 qua function | exit 1/INVALID_INPUT, không file | 1 |
| T10 | AC1/4 | CLI E2E | good+bad, rồi blocked dir | stdout thành công đúng hoặc stderr fail | 0 |
| T11 | AC5 | regression | BE07 suite hiện hữu | 15/15 pass, không sửa code cũ | 1 |
| T12 | NFR | load | 80 task cùng lúc, file thật | 80 hoàn thành, p95 so 2500 ms | 1 |

## 3. Fail → patch → pass và mutation

Nhánh riêng bắt đầu từ baseline trên. Test được viết trước module: `docs/vt-064/red.log` ghi Node 24.15.0 exit 1 `ERR_MODULE_NOT_FOUND` cho `indexer/import/drafts.js`; đây là thất bại vì chức năng chưa có, **chưa** chứng minh logic chống mất dòng. Sau patch (commit `b61cec8`), `green.log`: 7/7 pass. Review phát hiện thiếu accepted indexes: test bổ sung fail đúng hành vi trong `review-red.log`, rồi commit sửa `69ca712` làm 7/7 pass; `npm run typecheck` và `npm run build` exit 0. BE07 15/15 pass trên patch ban đầu (không sửa BE07 ở patch review). Diff đã review: chỉ tạo `indexer/import/*`, test/script/docs và hai npm scripts; không sửa storage/API/contract. CLI thật được gọi trong T10 và smoke trực tiếp nhập good–bad–good cho ra hai file đúng. Reviewer phải kiểm lại file/commit trước merge.

Mutation tách ở nhánh `experiment/23001850-vt064-false-success`, commit `7bc4ac6`: thay catch mkdir lỗi bằng `imported.push(draft.id); continue`, tức công bố thành công dù không có file. Chạy đúng test T07 trả exit 1 `Missing expected rejection` (`docs/vt-064/mutation.log`); trở về nhánh nộp, 7/7 pass. Không merge mutation. Trường hợp fail sau một write (T08) xác minh file đầu và report partial. Mutation này chỉ chứng minh một lỗi cụ thể bị bắt, không chứng minh tất cả lỗi I/O.

## 4. Coverage, flakiness và tải

Node `--experimental-test-coverage` sau review: `drafts.ts` line 100%, branch 100%; `cli.ts` line 90,91%, branch 75%; tổng hai file line 97,71%, branch 96,36% (`coverage.log`). Chưa cover usage sai và một số nhánh I/O khó tái hiện; tỷ lệ không thay thế oracle file và mutation. Flaky (1) timing/hiệu năng: dùng monotonic clock, warm-up 8; benchmark một máy/một lượt không là SLA. (2) race/order/random: T06 chấp nhận bất kỳ winner nhưng buộc report người thắng khớp file; mỗi test temp dir riêng; T03 seed cố định, báo batch phản ví dụ. Không dùng network hay sleep để quyết định đúng/sai.

`scripts/benchmark_vt064.mjs`: 80 task import đồng thời, mỗi task lưu và đọc lại 1 file với ID riêng trong cùng thư mục. `load.json` sau review: 80/80, 0 lỗi, p95 167,685 ms < 2500 ms trên Linux x64/Node 24.15.0. Đây là tải **in-process local filesystem**, không phải 80 người dùng qua HTTP, PostgreSQL, RPC hay ví; không tuyên bố hệ thống chung đạt NFR này.

## 5. Traceability và giới hạn bàn giao

| AC / risk | Cases | Test file / source | Commit | Result |
|---|---|---|---|---|
| AC1/validation | T01,T02,T09,T10 | `tests/indexer/import.test.ts` | b61cec8 + 69ca712 | 7/7 PASS |
| AC2/retention | T01,T03,T04 | `tests/indexer/import.test.ts` | b61cec8 + 69ca712 | PASS |
| AC3/conflict | T05,T06 | `tests/indexer/import.test.ts` | b61cec8 + 69ca712 | PASS |
| AC4/false success | T07,T08,T10 | `tests/indexer/import.test.ts` | b61cec8 + 69ca712; mutant 7bc4ac6 | PASS; mutation killed |
| AC5/old behavior | T11 | `tests/indexer/be07.test.ts` | baseline 1bb1821 | 15/15 PASS |
| NFR/local load | T12 | `scripts/benchmark_vt064.mjs` | b61cec8 + 69ca712 | 80/80, p95 167,685 ms |

CLI chỉ tạo **draft offline**, không có CRUD/UI/API integration, không có database deployment hoặc E2E wallet; không review/merge thay nhóm. README chạy test ở `docs/vt-064/README.md`. Hai điểm AI code/test cần cảnh giác: (a) bắt mọi lỗi filesystem thành duplicate sẽ báo sai permission (thực tế chỉ `EEXIST` từ `link` mới là duplicate); (b) test chỉ so `imported.length` có thể pass khi không file nào được ghi, nên oracle phải đọc disk + mutation. AI Usage Log là phụ lục riêng.

## 6. Reflection (bản nháp cá nhân để người nộp đối chiếu)

Ban đầu tôi nghĩ import hàng loạt chỉ cần đọc JSON, lọc dòng lỗi rồi lưu phần còn lại. Đọc repository làm nhận định thay đổi: bảng proposals là projection on-chain, không phải nơi ghi bản nháp. API ghi vào đó có thể hiển thị đề xuất chưa được Governor xác nhận. Tôi giới hạn sửa đổi thành import offline; file ấy chưa thể dùng để biểu quyết hoặc giải ngân.

Confidence tăng nhờ ba quan sát. Trước patch, test không chạy vì module chưa tồn tại; điều này chỉ chứng minh thiếu chức năng. Sau patch, test hỗn hợp xác nhận dòng đúng hai phía dòng sai vẫn có file nguyên vẹn. Bộ sinh dữ liệu seed cố định kiểm vị trí lỗi và amount biên bằng cách đọc file, không chỉ đếm report. Reviewer phát hiện test race chưa gắn người thắng với file, còn CLI đọc đầu vào không giới hạn trước khi kiểm kích thước; tôi sửa và chạy lại. Khi cố ý sửa catch lỗi persistence để báo thành công giả, test failure-path thất bại ở kỳ vọng phải từ chối; bỏ mutation thì suite xanh. Kiểm tra BE07 cũ theo dõi rủi ro hỏng behavior không liên quan, dù chưa là hồi quy toàn dự án.

Tôi chưa chứng minh khôi phục sau mất điện, ghi trên NFS, hoặc tính đúng proposal ký bằng ví thật. Tám mươi tác vụ cùng tiến trình và ổ đĩa chỉ đo slice này, không cam kết p95 cho người dùng HTTP. Test tiếp theo cần nhóm review: chuyển draft thành giao dịch Governor bằng ví extension, chờ indexer xuất bản snapshot, đối chiếu cùng request trên chain và API. Cần xác minh file offline không đi tắt quyền phê duyệt và ghi receipt/revision để tái lập.
