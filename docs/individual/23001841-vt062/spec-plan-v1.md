# VT-062 — Spec và plan ban đầu (v1)

Sinh viên: Đào Ngọc Cường — 23001841  
Team: SE2026-T16 · Vai trò: Nhóm trưởng · Công việc trước đây: TV2/backend  
Dự án: BC-03 — DAO Budget Simulator · Biến thể VT-062  
Ngày lập: 2026-10-30  
Baseline dự kiến: origin/feature/tv3-frontend, commit ae8c3533e14a01f74ba4ea7b00c74365e1651be1.

> Đây là bản plan đầu tiên, lưu riêng trước vòng review source chi tiết ở plan-review-v2.md. Nó là đề xuất cần kiểm chứng, không phải lịch sử triển khai hay xác nhận review của sinh viên.

## Problem statement

Khi ví đã trả transaction hash cho một yêu cầu tạo proposal nhưng frontend không nhận được receipt (ví dụ RPC timeout), người dùng có thể bấm gửi lại. Giả thuyết v1 là ứng dụng có thể tạo thêm giao dịch và dữ liệu; review source sau đó xác nhận điều chắc chắn là frontend gọi ví thêm lần nữa. Với payload hoàn toàn giống nhau, Governor dùng cùng proposalId và từ chối giao dịch thứ hai trước ProposalCreated; xem plan-review-v4.md. VT-062 cần làm lần retry cùng bản nháp tiếp tục theo dõi hash đã gửi, không tạo H2.

## Acceptance criteria

- **AC1 — Hash đã biết:** Sau khi send trả H1, frontend giữ H1 và nội dung/request ID của bản nháp nếu bước chờ receipt gặp lỗi tạm thời; không hiển thị giao dịch thành công khi chưa có receipt thành công.
- **AC2 — Retry cùng yêu cầu:** Người dùng thử lại cùng bản nháp trong cùng phiên component sẽ chờ receipt của H1; số lần gọi ví gửi giao dịch cho bản nháp vẫn bằng một.
- **AC3 — Kết quả receipt:** Khi lần chờ tiếp theo nhận receipt thành công của H1, UI trả/hiển thị proposal ID từ receipt, gọi callback xác nhận đúng một lần và không gửi H2.
- **AC4 — Chưa có hash:** Nếu người dùng từ chối ký hoặc send lỗi trước khi có hash, lần thử lại được phép gọi ví gửi lại; không được chờ một hash không tồn tại.
- **AC5 — Tách biệt request:** Request ID của proposal gốc được giữ nguyên trong bản nháp và được đọc đúng từ response API. Một request khác không được báo nhầm là kết quả của H1 đang chờ.

## Non-functional constraints

1. Kiểm thử retry phải xác định thời điểm bằng deferred Promise/barrier, không dùng sleep cố định, RPC công cộng, ví cài trên máy hoặc thời gian chain thật; mỗi test tự tạo/reset state để không phụ thuộc thứ tự chạy.
2. Harness tải tổng hợp sẽ chạy 60 tác vụ retry đồng thời và yêu cầu p95 ≤ 2,0 giây từ lần gọi retry tới lúc fake receipt được giải quyết. Số này đo logic ứng dụng với dependency giả; không phải SLA receipt/chain thật.
3. Frontend tiếp tục yêu cầu ví người dùng ký trực tiếp. Không thêm API ghi, không chuyển khóa/ký giao dịch vào backend, không đưa secret vào fixture hoặc log.

## Invariant quan trọng nhất

Với cùng một bản nháp D, sau khi send(D) đã trả hash H1 và chưa có kết quả receipt cuối cùng:

sendCount(D) = 1, mọi lần retry gọi waitForReceipt(H1), và afterReceipt chỉ chạy một lần sau receipt thành công.

## Phạm vi bảo đảm, ngoài phạm vi và giả định

**Phạm vi đề xuất:** một người dùng, một trang/component còn mounted, cùng bản nháp chưa đổi và request ID đang hiển thị; hash đã được ví trả về nhưng receipt wait gặp lỗi tạm thời. Đây là bảo vệ retry ở lớp ứng dụng trước khi ví tạo giao dịch thứ hai.

**Ngoài phạm vi:** deduplicate giữa nhiều trình duyệt/thiết bị, khôi phục hash sau reload/tab đóng, bảo đảm transaction được mine trong 2 giây, đổi logic trả tiền trong contract, chống ghi trùng raw event ở indexer, hoặc thêm endpoint ghi. Contract Treasury có thể ngăn trả tiền lần hai theo request ID nhưng không ngăn hai ProposalCreated event; unique event key của indexer không ngăn ví người dùng gửi thêm transaction.

**Giả định:** lỗi chờ receipt là lỗi quan sát trạng thái, không chứng minh giao dịch H1 thất bại. Nếu send chưa trả hash (chẳng hạn từ chối ký), đây là lần gửi mới. Request ID hiện được tạo theo vòng đời trang và phải còn nguyên trong cùng phiên. Receipt revert/cancel đã được biết là kết quả terminal, không phải timeout tạm thời.

## Phân hoạch tương đương (equivalence partitioning)

| Partition | Tình trạng quan sát được | Dữ liệu đại diện | Lý do |
|---|---|---|---|
| EP1 | Chưa có hash vì ví từ chối/lỗi gửi | Error trước khi send resolve | Đại diện đường pre-submit; retry phải có thể gọi ví lại. |
| EP2 | Đã có H1, receipt wait lỗi tạm thời | H1, deferred Promise reject Error("RPC timeout") | Đường rủi ro trọng tâm: trạng thái chain không rõ, không được gửi lại. |
| EP3 | Đã có H1, receipt wait còn pending | H1 + barrier chưa mở | Kiểm tra double-click/concurrent entry trong khi cùng task đang xử lý. |
| EP4 | Đã có H1, receipt thành công | Receipt có transactionHash = H1 và ProposalCreated log đại diện | Kiểm tra terminal success và callback một lần. |
| EP5 | Đã có H1, receipt báo revert/cancel | Receipt status revert hoặc replacement bị hủy | Kết quả terminal phải phân biệt với lỗi quan sát tạm thời. |
| EP6 | Giao dịch trước đã thành công, người dùng bắt đầu action mới | H2 khác H1 | Kiểm tra trạng thái hoàn tất không khóa nhầm yêu cầu mới. |

Không sinh ngẫu nhiên thêm nhiều hash hoặc delay: các lớp được phân biệt bởi việc hash đã tồn tại hay chưa và kết quả receipt là pending/tạm lỗi/thành công/terminal. H1/H2 cố định làm oracle và log dễ đọc.

## Test cases tối thiểu

| ID | Requirement/risk | Level | Precondition / input | Expected result | Priority |
|---|---|---|---|---|---|
| VT062-T01 | AC1/AC3 — gửi mới thành công | Unit | send → H1, receipt thành công H1 | Một lần send, một lần wait(H1), một callback, trạng thái success | P1 |
| VT062-T02 | AC2 — retry sau lỗi wait có hash | Unit | Lần 1 send → H1; deferred wait(H1) reject timeout; lần 2 wait(H1) resolve | Không gọi send lần 2; cả hai wait dùng H1; trả receipt H1 | P0 |
| VT062-T03 | NFR01 — retry khi wait đầu vẫn pending | Unit | H1 đã có; barrier giữ wait đầu; gọi run lần hai trước khi mở barrier | Không có send thứ hai hoặc waiter cạnh tranh; trạng thái không báo success sớm | P1 |
| VT062-T04 | AC4 — từ chối ký trước hash (negative) | Unit | Lần send đầu reject lỗi user 4001; retry send thành H1 | Lần đầu không wait; retry gửi đúng một lần và nhận receipt | P1 |
| VT062-T05 | AC3 — xác nhận hai lần không nhân đôi callback | Unit | Sau timeout, retry nhận receipt H1 | afterReceipt đúng một lần, proposal ID từ receipt H1 | P0 |
| VT062-T06 | AC1 — lỗi wait chưa được coi là thành công (negative) | Unit | send → H1; wait reject; không retry | Hash H1 vẫn hiển thị; phase không success; callback chưa chạy | P0 |
| VT062-T07 | EP5 — receipt revert terminal | Unit | send → H1; receipt status revert | Hiển thị revert, không gọi callback success; phân biệt với timeout retryable | P1 |
| VT062-T08 | EP5 — wallet thay bằng cancellation | Unit | send → H1; wait báo cancellation/replacement không cùng action | Không nhận nhầm receipt thành success của H1; hành vi retry theo phân loại terminal được xác định rõ | P1 |
| VT062-T09 | EP6 — action mới sau success | Unit | Action D1 thành công H1, sau đó action D2 | D2 gửi H2; không tiếp tục theo dõi H1 | P2 |
| VT062-T10 | AC5/mutation — request ID response mapping | Integration/API | Proposal row có request_id = 0x…01, proposal_id khác; đọc endpoint proposal | JSON trả requestId đúng bằng request_id, không lấy proposal_id; dùng assertion này cho mutation field mapping | P1 |
| VT062-T11 | Request identity — nội dung form còn nguyên | UI/component | Cùng trang, H1 đã gửi, wait lỗi tạm thời | Title/body/recipient/amount/request ID không bị reset trước retry | P1 |
| VT062-T12 | NFR02 — 60 tác vụ retry | Load/harness | 60 task độc lập, barrier đồng bộ; fake wait trả receipt thành công | Không có task nào gọi send lần hai; p95 ≤ 2,0 giây theo ranh giới đã nêu | P1 |

T04/T06/T07/T08 là negative cases; T02 là failure-path case. T03 điều khiển concurrency bằng barrier, không bằng thời gian chờ.

## Implementation plan (đề xuất ban đầu)

1. Làm rõ trong hook sự khác nhau giữa lỗi trước hash và lỗi chờ receipt sau hash; giữ hash/action đang chờ cho cùng yêu cầu.
2. Khi retry cùng bản nháp, bỏ qua callback gửi ví và gọi lại wait với H1. Chỉ chuyển success/callback sau receipt thành công; làm sạch pending state sau terminal result thích hợp.
3. Đảm bảo bản nháp/request ID không đổi trong retry và không gắn một action khác vào hash cũ; nếu chưa thể chứng minh được key action an toàn, khóa thay đổi form tới khi H1 được giải quyết.
4. Thêm unit tests theo deferred Promise. Không thêm dependency nếu Vitest hiện có đủ khả năng kiểm thử hook.
5. Bổ sung assertion API requestId tối thiểu để phục vụ test mutation bắt buộc; không thay đổi API production nếu test hiện có đủ oracle.
6. Thực hiện mutation tạm: đổi map field response requestId từ row.request_id sang field sai; T10 phải fail. Phục hồi source và chứng minh pass.
7. Sau khi được xác nhận RED mới thay production code; chạy frontend test/build/lint liên quan. Chưa làm API performance/60-user SLA thật trong lượt RED.

## File dự kiến

- Tài liệu: docs/individual/23001841-vt062/spec-plan-v1.md, review v2, AI Usage Log.
- Test chính: frontend/src/chain/useTransaction.vt062.test.ts.
- Có thể thêm assertion vào tests/api/server.test.mjs cho response requestId (không thêm route ghi).
- Production patch ở giai đoạn sau, dự kiến frontend/src/chain/useTransaction.ts; có thể cần frontend/src/pages/CreateProposalPage.tsx và frontend/src/components/TransactionStatus.tsx để giữ/hiển thị retry state. Không sửa contract/indexer storage.
- Evidence: docs/evidence/vt062/.

## Phân bổ test level

- **Unit (trọng tâm):** hook state machine, send count, hash, wait count, callback count, pending/error/success và deferred concurrency. Đây là oracle trực tiếp cho duplicate send, không cần RPC.
- **Integration/API:** một test với database disposable đã có để kiểm requestId response mapping, phục vụ yêu cầu mutation field. Không dùng API để khẳng định wallet retry.
- **E2E:** không cần cho RED tối thiểu; browser wallet thật/RPC sẽ khiến test phụ thuộc provider, mạng và chain timing. Nếu bổ sung smoke sau, dùng Anvil loopback và injected provider; ghi rõ đó không phải extension/testnet acceptance.
- **Không cần:** contract duplicate-payment test mới (đã là lớp khác), indexer raw-log dedup test mới (đã có test BE03), test API write (API read-only), hoặc test timer/sleep.
