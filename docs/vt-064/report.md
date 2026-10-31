# BT cá nhân 3 - BC-03 - VT-064

**Phan Thanh Dũng - 23001850 | SE2026-T16 | Thành viên**

Dự án: DAO Budget Simulator. Repository: https://github.com/SE2026-21-1/dao-budget-simulator

Baseline chức năng: `1bb182144d516c13d6bb32fc30d2778af71a8169`. Bản có sẵn được kiểm lại: `cdc8740c5b1123d612962ffad467657bd4f8444b`. Nhánh bàn giao: https://github.com/SE2026-21-1/dao-budget-simulator/tree/personal/23001850-vt-064-submission

Cam kết: “Tôi chịu trách nhiệm về toàn bộ code, test và nội dung bài làm; tôi đã khai báo việc sử dụng AI.” Đây là bản dự thảo có AI hỗ trợ, người nộp cần tự kiểm tra code, reflection và cam kết trước khi nộp Classroom. Chưa merge hoặc có review của nhóm.

## 1. Specification và phạm vi vertical slice

Problem statement: người vận hành cần nhập nhiều bản nháp yêu cầu chi BUD từ JSON. Một dòng sai không được làm mất dòng đúng; báo cáo kết quả phải phản ánh dữ liệu đã lưu thật. Slice chạy được là CLI và kho file bản nháp offline. Dữ liệu này chưa phải proposal được Governor xác nhận, không phải sự kiện chain và không được ghi trực tiếp vào read model PostgreSQL.

| Mã | Acceptance criterion kiểm thử được |
|---|---|
| AC1 | File JSON tối đa 1 MiB, mảng 1-1000 dòng. ID khớp `[a-z0-9][a-z0-9_-]{0,63}`, recipient EVM lower-case 20 byte, amount là chuỗi canonical uint256 dương theo base units, description không trắng và dài tối đa 1024 ký tự. Trả index và lý do của từng dòng bị từ chối. |
| AC2 | Dòng không hợp lệ ở đầu, giữa hoặc cuối được bỏ qua độc lập; mọi dòng hợp lệ không trùng ID trước/sau nó được lưu nguyên dữ liệu. Mảng rỗng bị từ chối; mảng toàn sai có imported rỗng. |
| AC3 | Mỗi file được công bố atomically, trùng ID không ghi đè. Hai task cùng ID chỉ có một winner; dữ liệu file phải khớp report của winner. |
| AC4 | Lỗi persistence trả exit 1 và PERSISTENCE_FAILED trên stderr, không stdout success; báo đúng index lỗi và các dòng đã commit. Dòng trước lỗi còn nguyên; lỗi hạ tầng dừng phần chưa ghi. |
| AC5 | Không thay chain read model, checkpoint, API đọc hoặc giao dịch ví. Bộ hồi quy BE07 cũ vẫn pass. |

Invariant quan trọng nhất: mỗi phần tử `{index,id}` trong imported tương ứng file đã công bố với đúng recipient, amount, description; rejected không được xóa hoặc ghi đè dữ liệu hợp lệ. “Giữ dòng đúng” áp dụng cho lỗi dữ liệu; khi ổ đĩa hỏng thì không thể hứa lưu các dòng chưa thực hiện.

NFR1: kiểm chứng 80 tác vụ đồng thời, p95 không quá 2,5 giây; báo workload và giới hạn thay vì suy rộng thành SLA. NFR2: giới hạn đầu vào, lỗi có thể tái lập, không dùng RPC/secret cho slice. NFR3: duplicate/race không overwrite; destination do người vận hành tin cậy cung cấp. Sync file + hardlink đảm bảo publish nguyên vẹn ở filesystem hỗ trợ; chưa cam kết phục hồi sau mất điện vì chưa fsync thư mục.

## 2. AI-assisted plan và review bằng repository

Kế hoạch gốc được lưu trong `docs/vt-064/spec.md`: tạo drafts.ts, cli.ts, import.test.ts, npm scripts, benchmark và tài liệu. Baseline cùng patch gốc `b61cec8`/`69ca712` có trên GitHub. Spec và code nằm cùng commit gốc, nên lịch sử commit đơn độc không chứng minh thứ tự soạn; red.log là evidence bổ sung, không phải bằng chứng tuyệt đối.

Lần kiểm lại này gọi coding agent với context chỉ gồm kiểu Draft, biểu thức validate, contract import/save, giới hạn CLI và hai đường dẫn module, không truyền lịch sử hội thoại. Prompt và output trước sửa được ghi ở `verification/plan.md`; commit test/plan GitHub `aca614da8c4842eadecd87434ddc98f9f41813ec`. Agent đề nghị kiểm tra canonical strings, property test, lỗi lưu và tái dùng dependency/harness. Các quyết định review cụ thể:

| Đề xuất | Evidence và quyết định |
|---|---|
| Sửa regex vì `$` có thể nhận newline cuối chuỗi | Probe Node 24.22.1 trả false cho amount `1\n` và ID `a\n`; T14 kiểm 15 tổ hợp suffix/field cũng pass. Bác bỏ patch speculative, giữ validator. |
| Tái dùng thư viện property testing có sẵn | package.json/lock không có fast-check; import.test.ts đã có seeded generator. Sửa plan: mở rộng generator và metamorphic property, không thêm dependency, không tuyên bố shrinking. |
| Dùng tsx CLI như scripts hiện hữu | `verification/runner-red.log` ghi EPERM khi tsx tạo IPC. Đổi riêng hai import scripts sang `node --import tsx`; `runner-green.log` pass. Patch GitHub `969acb370f1a10ebd1f75728afa6d91b035a453d`. |
| Mở POST và dùng transaction như storage | API chỉ GET tại server.ts:685-686; storage.ts:274-286 transaction cho canonical chain batch. Giữ import độc lập offline, không chèn proposal giả hoặc rollback toàn bộ do một dòng người dùng sai. |

Rủi ro context thiếu: AI chỉ nhìn module không biết draft khác proposal được ký và có thể đề xuất ghi tắt vào bảng chain. Reviewer đối chiếu repository để giữ ranh giới này. Assistant điều phối đã có hướng dẫn repository và bối cảnh hệ thống; chỉ lần lập plan cô lập nói trên được xác nhận là module-only, không tuyên bố mọi tương tác AI đều chỉ có module context.

## 3. Risk-based test strategy và thiết kế dữ liệu

Risk trọng tâm VT-064 là thay đổi nhỏ phá behavior cũ không liên quan: hạn chế production diff vào module import và npm scripts, chạy BE07 như canary. Unit T14 dùng save spy để kiểm validation không chạm lưu trữ. Integration dùng filesystem thật và fault injection T08; CLI E2E chạy process Node thật, kiểm exit/stdout/stderr/file. Chưa cần wallet/browser E2E hoặc POST API test trong slice này; chúng cần khi nối draft vào luồng proposal thật. Không dùng DB giả để tuyên bố DB integration đã pass.

| ID | Risk / AC | Level | Precondition / input | Expected result | P |
|---|---|---|---|---|---|
| T01 | AC1/2, giữ dòng đúng | Integration | good, amount=0, null, good | Hai file đúng; lỗi index 1,2 | 0 |
| T02 | AC1, dữ liệu/path sai | Integration | ../, 0, 01, overflow, address/description sai | Từ chối, không tạo file | 0 |
| T03 | AC2, tổ hợp chưa nghĩ tới | Property/integration | 40 batch seed 0x23001850, dài 1-24 | Tập ID/file và dữ liệu khớp oracle | 0 |
| T04 | AC1/2 | Integration | Toàn sai, [], 1001 dòng | imported rỗng hoặc INVALID_INPUT | 1 |
| T05 | AC3, overwrite | Integration | ID đã có, amount khác; thêm ID mới | File cũ nguyên, ID mới được lưu | 0 |
| T06 | AC3, race/shared state | Integration | Hai task cùng ID, amount 30/40 | Một winner, một duplicate; disk khớp winner | 0 |
| T07 | AC4, false success | Failure path | Destination là một file | ImportFailure, imported rỗng | 0 |
| T08 | AC4, mất commit trước lỗi | Integration | Ghi đầu thành công, save thứ hai ném lỗi | Chỉ file đầu tồn tại; report đúng | 0 |
| T09 | AC1, input bound | CLI/integration | JSON sai, >1 MiB, /dev/zero Linux | Exit 1, INVALID_INPUT | 1 |
| T10 | AC1/4 | CLI E2E | Mixed batch rồi blocked destination | Exit/report và file khớp, không success giả | 0 |
| T11 | AC5, regression khác module | Regression | BE07 suite không sửa | 15/15 pass | 0 |
| T12 | NFR1 | Load harness | 80 task, một file/task, ID riêng | 80 hoàn tất; p95 <=2500 ms | 1 |
| T13 | AC2, phụ thuộc thứ tự | Property/integration | 16 batch seed 0x06401850; chèn invalid rồi đảo | Hai hướng cùng tập file/dữ liệu hợp lệ | 0 |
| T14 | AC1, canonical suffix | Unit/property | 5 suffix CR/LF/Unicode x 3 trường | 15 dòng bị từ chối; save không gọi | 1 |

Property chính: với batch có ID hợp lệ duy nhất, tập persisted bằng tập dòng được gắn nhãn valid khi sinh; chèn dòng invalid và đảo batch không đổi tập persisted. T03 chọn amount 1, 10^18, 2^256-1; negatives chọn 0, leading zero và 2^256. T13 oracle dùng nhãn/identity của generator, không gọi lại production validate. Seed/sample/order được ghi khi assert fail; T14 duyệt tích Descartes hữu hạn. Đây là property-based testing tự triển khai, không có shrinker; chưa chứng minh toàn bộ không gian dữ liệu hay mọi permutation.

## 4. Test-first evidence, diff review và mutation

Fail ban đầu trong red.log là module chưa tồn tại, không phải assertion logic. Để kiểm chứng behavior-level red, checkout b61cec8 trong worktree tách biệt, dùng test đã review: `node --import tsx --test --test-name-pattern="mixed import retains" tests/indexer/import.test.ts`. `verification/red-replay.log`: exit 1 vì actual imported là chuỗi a/b, expected `{index,id}`. Patch 69ca712 thêm index và bảo toàn rejected trong failure report; nguồn hiện tại giữ nguyên patch này. Đây là replay lịch sử, không giả là một lỗi mới được phát hiện trước khi patch gốc ra đời.

Đợt bổ sung: commit test/plan aca614d trước runner patch 969acb3. runner-red ghi lỗi IPC EPERM; sau sửa scripts, `npm run test:vt064` pass 9/9. Phân biệt rõ lỗi hạ tầng runner với behavior red ở trên. Review diff xác nhận chỉ đổi cách nạp tsx cho hai import commands; validator, storage/API/contract cũ không bị sửa trong lần bổ sung. `typecheck.log`, `build.log` exit 0; `regression.log` BE07 15/15 pass.

Mutation bắt buộc được thực thi lại ở local experiment branch `experiment/23001850-vt064-verify-false-success`, commit `12c53e2f515256da9fa70c15a6428badb7f317b8`: catch mkdir lỗi vẫn thêm `{index,id}` vào imported và continue. T07 fail exit 1, assertion “Missing expected rejection”; nghĩa là suite bắt được success giả. `verification/mutation.patch` và mutation-replay.log được commit vào nhánh nộp để tái lập; commit mutant local không được merge/publish như code nộp. Kiểm tra ancestor trả 1; drafts.ts nhánh nộp giữ throw ImportFailure. Không dựa vào hash mutant 7bc4ac6 trong PDF cũ vì lần này không truy xuất được object đó. Một mutant bị kill không chứng minh toàn bộ lỗi persistence đều được bắt.

## 5. Coverage, flaky risks và tải

Coverage trên Node v24.22.1/Linux x64 bằng `node --import tsx --experimental-test-coverage --test-coverage-include='indexer/import/*.ts' --test tests/indexer/import.test.ts`: drafts.ts line 100%, branch 100%, functions 90,91%; cli.ts line 90,91%, branch 75%; tổng line 97,71%, branch 96,36%, functions 92,31%. Các dòng usage 8-10 chưa cover; cleanup callback/I/O hiếm chưa được fault-inject đầy đủ. V8 coverage có thể tính nhánh theo cách không phản ánh mọi lỗi filesystem, vì vậy oracle disk, negative paths và mutation quan trọng hơn một tỷ lệ đẹp.

Flaky review: (1) race/order: mỗi test có temp dir riêng, T06 không chọn cố định winner; ba lần chạy lại case race đều pass. T13 kiểm hai thứ tự trong thư mục riêng. (2) random: seed cố định, IDs duy nhất, không Date.now; báo sample để tái lập, chưa có shrinking. (3) time/network: slice không gọi mạng/sleep, benchmark dùng monotonic clock và warm-up 8. BE07 có HTTP loopback/timeout thật; lần này pass nhưng timing CI khác vẫn là residual risk, không thay timer để ép xanh.

Benchmark dùng scripts/benchmark_vt064.mjs: 80 tác vụ Promise cùng thư mục, mỗi tác vụ một draft, fsync file, đọc lại và đối chiếu dữ liệu. p95 nearest-rank = mẫu thứ 76/80, tính từ mốc khởi chạy chung nên gồm queueing và read-back; không phải chỉ thời gian write. Ba lượt standalone chạy tuần tự, mỗi lượt temp dir mới:

| Lượt | Hoàn thành / lỗi | p95 (ms) | Mục tiêu | Kết quả |
|---|---|---|---|---|
| 1 | 80/80; 0 | 74,422 | <=2500 ms | Đạt trong harness |
| 2 | 80/80; 0 | 68,251 | <=2500 ms | Đạt trong harness |
| 3 | 80/80; 0 | 71,762 | <=2500 ms | Đạt trong harness |

Dữ liệu giả lập recipient 0x111...111, amount 1-80, ID task0-task79; có 8 file warm-up. Giới hạn: 80 tác vụ cùng process trên filesystem local, không phải 80 người dùng HTTP, PostgreSQL/RPC/ví hoặc batch 1000 dòng/task. Không suy rộng thành hiệu năng toàn ứng dụng. Log thô và environment ở verification/load-1.json đến load-3.json.

## 6. Traceability, review và reflection

| AC / risk | Test cases | Test/source file | Commit | Kết quả |
|---|---|---|---|---|
| AC1 / validation | T01,02,04,09,10,14 | tests/indexer/import.test.ts | 69ca712 + aca614d | PASS; coverage-green.log |
| AC2 / giữ valid | T01,03,04,13 | tests/indexer/import.test.ts | b61cec8 + aca614d | Tập file chính xác, 9/9 suite |
| AC3 / duplicate/race | T05,06 | tests/indexer/import.test.ts | 69ca712 | PASS + 3 lần lặp race |
| AC4 / persistence | T07,08,10 | tests/indexer/import.test.ts; mutation.patch | 69ca712; mutant local 12c53e2 | PASS sạch; mutant bị kill |
| AC5 / regression | T11 | tests/indexer/be07.test.ts | baseline 1bb1821 | 15/15 PASS trên nguồn kiểm lại |
| NFR1 / p95 | T12 | scripts/benchmark_vt064.mjs | 69ca712 | 3 lượt 80/80; p95 <2500 ms |
| Runner portability | T01-10,13,14 | package.json | 969acb3 | EPERM trước, 9/9 sau |

Lệnh chạy và replay ở docs/vt-064/README.md; log mới ở verification/, log cũ vẫn giữ để phân biệt lịch sử. Hai output AI chưa đáng tin ngay: đề xuất sửa regex chưa có phản ví dụ, và test chỉ đếm imported có thể pass khi không ghi file nào. Đã bác bỏ patch regex, thêm oracle đọc disk và mutation. Người nộp cần tự review diff/giải thích hardlink, partial report, generator và boundary tests. Nhánh không được merge trước review nhóm.

## Reflection - bản nháp cá nhân (cần người nộp đối chiếu)

Ban đầu tôi xem import hàng loạt là đọc JSON rồi lưu từng dòng. Đối chiếu repository cho thấy cần phân biệt bản nháp với proposal đã được chain xác nhận. Vì vậy, tôi chọn slice offline và giữ nguyên API đọc. Quyết định này giảm phạm vi thay đổi nhưng chưa giải quyết việc đưa bản nháp vào luồng ký giao dịch.

Confidence tăng khi bằng chứng kiểm được bằng code. Test hỗn hợp đọc lại file trước và sau dòng lỗi. Property test sinh nhiều batch, rồi chèn dữ liệu sai và đảo thứ tự để kiểm tra tập kết quả. Oracle đối chiếu dữ liệu thật thay vì chỉ đếm số dòng thành công. Khi cố ý bỏ qua lỗi tạo thư mục, test failure-path thất bại đúng kỳ vọng. Suite sạch và BE07 cùng pass giúp giảm lo ngại hồi quy ngoài module.

Tôi cũng học được cách bác bỏ AI. Agent đề nghị sửa regex nhưng probe và test suffix không tái hiện lỗi. Sửa theo lời đề nghị đó sẽ tạo diff không có lý do. Lỗi IPC của runner cần được tách khỏi lỗi nghiệp vụ; đổi cách nạp tsx giúp chạy test nhưng không chứng minh importer đúng. Replay trên phiên bản cũ làm rõ contract index đã được bảo vệ.

Ba lượt tải đều đạt mục tiêu cho tám mươi tác vụ local, nhưng chưa chứng minh trải nghiệm của tám mươi người dùng mạng. Tôi chưa kiểm mất điện, NFS hoặc filesystem không hỗ trợ hardlink. Test tiếp theo có giá trị cao nhất là luồng draft sang giao dịch Governor bằng ví thật, chờ indexer công bố rồi đối chiếu API với chain. Test đó cần xác minh quyền phê duyệt không bị đi tắt và lưu receipt để truy vết. Trước khi nộp, tôi phải tự giải thích và chịu trách nhiệm về từng phần bằng chứng.
