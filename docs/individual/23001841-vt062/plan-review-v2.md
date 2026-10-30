# VT-062 — Review plan bằng repository thật (v2)

Ngày review: 2026-10-30. Người thực hiện khảo sát: coding agent trong phiên này. Sinh viên chưa được ghi nhận là đã review hoặc chấp thuận. Bản đề xuất ban đầu nằm ở spec-plan-v1.md; nội dung dưới đây là kết quả đối chiếu source, không phải plan cũ được dựng lại.

## Phạm vi được chọn

Chọn ứng dụng frontend sau khi ví trả hash nhưng receipt chưa quan sát được. Dù phần việc trước đây của sinh viên là TV2/backend, các module BE03 indexer, BE04 projection và BE05 API chỉ quan sát/ghi chain state; BE05 API là read-only. Không có API ghi hiện tại để “deduplicate” một yêu cầu người dùng, và thêm API ghi hoặc ký giao dịch backend sẽ đi ngược kiến trúc. Contract Treasury có paidRequests theo request ID để chặn thanh toán thành công lần hai, nhưng việc đó không ngăn proposal/transaction thứ hai được tạo. Unique (chain_id, transaction_hash, log_index) của raw_events ngăn một log bị nhập hai lần, không ngăn người dùng gửi transaction mới. Vì vậy lớp frontend là nơi có thể tiếp tục theo dõi H1 trước khi gọi lại ví.

Nguồn đã đối chiếu: AGENTS.md ở candidate baseline (mô tả wallet-signed writes đi thẳng tới contract, API chỉ đọc); docs/requirements/DAO_Budget_Simulator_Requirements_Nhom_4.md §6 và §9; docs/be03.md; database/migrations/001_initial.sql; contracts/Treasury.sol; frontend/src/chain/useTransaction.ts; frontend/src/pages/CreateProposalPage.tsx; frontend/src/chain/transactions.ts.

## Phát hiện và sửa/bác bỏ điểm trong v1

| Điểm trong v1 | Bằng chứng source/repo | Quyết định sau review |
|---|---|---|
| Giả thuyết “retry có thể gửi transaction mới” | frontend/src/chain/useTransaction.ts: sau send resolve, hook lưu submitted hash rồi await waitForReceipt; catch chỉ lưu error/phase; lần gọi kế tiếp bắt đầu bằng setHash(null) và gọi send lại. frontend/src/pages/CreateProposalPage.tsx: nút tạo proposal chỉ bị khóa khi transaction.busy hoặc đã có submittedId; phase error không busy, submittedId vẫn null, nên người dùng có thể bấm lại. | **Giữ và xác nhận hypothesis**; đây là lỗi hành vi cụ thể, không phải suy ra từ test cũ. |
| Có thể bảo đảm retry bằng backend BE03/API vì TV2 là vai trò cũ | docs/be03.md và migration 001 cho thấy BE03 chống trùng log theo event identity. AGENTS.md và requirements §6/§9 nói API chỉ đọc; requirements §6 tách FR13 ingest khỏi FR16 API. Treasury.sol chỉ đánh dấu paidRequests khi disburse, nên hai proposal có thể tồn tại dù chỉ một lần trả tiền thành công. | **Bác bỏ hướng backend/indexer** cho CR này. Không sửa database, API production hay contract trong lát cắt hiện tại; nêu rõ đây không chứng minh bảo đảm ở hai lớp đó. |
| Kịch bản retry giữ cùng request ID qua mọi lần mở lại | frontend/src/pages/CreateProposalPage.tsx khởi tạo requestId bằng useState(newRequestId). State sống qua lần rerender trong cùng mount nhưng không có persistence sau reload; requestId mới được tạo khi trang được mount lại. | **Thu hẹp AC/phạm vi**: bảo đảm cùng draft trong cùng mounted session sau khi H1 đã được trả về. Khôi phục qua reload/máy khác là ngoài phạm vi, không tuyên bố global idempotency. |
| “Mọi lỗi receipt đều retry cùng H1” | frontend/src/chain/transactions.ts: waitForReceipt throw khi receipt revert hoặc replacement làm thay đổi action; đây là terminal/semantic outcomes, khác RPC timeout. Hook hiện không có kiểu lỗi riêng để phân loại. | **Sửa plan**: test tạm thời tập trung lỗi quan sát/RPC sau hash; test riêng revert/cancel không được báo success. Patch sau RED phải giữ phân biệt terminal với timeout, không lặp vô hạn một giao dịch revert. |
| T10 requestId response mapping là một phần của retry behavior | indexer/api/server.ts dựng payload JSON có requestId từ row.request_id; API không quyết định có gọi ví lần nữa hay không. tests/api/server.test.mjs dùng PostgreSQL test riêng, không phải hook harness. | **Hạ T10 thành kiểm tra bổ trợ cho yêu cầu mutation field**, không dùng nó thay oracle T02. Chỉ chạy khi có database disposable; không dùng kết quả API để tuyên bố retry UI đúng. |
| Có thể test hook bằng test React DOM thông thường mà không phụ thuộc thêm package | frontend/package.json có Vitest nhưng không khai báo jsdom/happy-dom/testing-library; test hiện có là unit cho helper/provider. | **Sửa test level**: viết unit harness tập trung hook, mock waitForReceipt và React hook state, dùng deferred Promise; ghi rõ harness không phải browser/React E2E và không thêm dependency trong RED phase. |

## Plan sau review

- Problem/AC chính giữ ở AC1–AC4; AC5 chỉ là kiểm tra requestId API bổ trợ cho mutation.
- Test RED chính: unit test trên useTransaction, first send trả H1, controlled wait đầu reject timeout, gọi lại cùng hành động, oracle là sendCount = 1 và waitForReceipt nhận H1 lần nữa. Test được viết trên source chưa sửa.
- Không dùng timer/sleep/RPC/DB trong RED chính. Mọi hash/receipt là fixture VT-062 riêng.
- 60-task measurement ở giai đoạn sau chỉ được báo là synthetic local harness, bắt đầu khi gọi retry và kết thúc khi fake receipt được mở; concurrency phải thực đo bằng barrier/task counter. Không suy SLA chain hoặc API thật từ số này.
- Mutation bắt buộc sau khi người dùng xác nhận RED: T10/API test với request_id khác proposal_id; tạm đổi mapping requestId để chứng minh assertion phát hiện, phục hồi đúng mapper rồi rerun pass.
- Không cần E2E ví thật để chứng minh invariant của hook; browser smoke có thể bổ sung riêng nếu môi trường sẵn có, nhưng không thay test unit xác định.
- Chỉ sau khi sinh viên xác nhận lý do RED mới thay production code. Candidate patch nhỏ nhất dự kiến giữ pending hash cho lỗi chờ receipt sau khi send đã trả hash; retry cùng draft tiếp tục wait H1, còn lỗi trước hash vẫn gọi send. Kết quả revert/cancel phải được coi là terminal. Nếu việc gắn pending hash với cùng draft không được chứng minh, khóa chỉnh sửa draft đến khi H1 được giải quyết.

## Phạm vi phối hợp

Nguồn sửa dự kiến nằm ở TV3/frontend, nên cần TV3 review hook và trạng thái màn hình. TV2/backend review ranh giới event/API và assertion requestId; TV1/contract review giới hạn paidRequests nếu đề xuất wording nói về giải ngân. Không gửi thông điệp hoặc khẳng định thành viên khác đã review trong lượt này. Phạm vi không bao gồm triển khai BE09/BE10; candidate branch có tài liệu BE01–BE07 và nhắc BE08 benchmark, không tìm thấy phân công/tài liệu BE09 hoặc BE10 trong nhánh này.

## Baseline/branch

Checkout mở ban đầu có nhiều thay đổi tracked/untracked; không dùng nó để viết test. Clone cô lập trong /tmp giữ source commit ae8c3533e14a01f74ba4ea7b00c74365e1651be1 (origin/feature/tv3-frontend), nơi tồn tại luồng form/wallet/hook và frontend Vitest. Branch cá nhân được tạo trong clone cô lập: individual/23001841-vt062-idempotent-retry. Checkout chính giữ nguyên.
