# AI Usage Log — BT3 / VT-062

Sinh viên: Đào Ngọc Cường — 23001841 · Team SE2026-T16  
Ngày: 2026-10-30 UTC · Trạng thái: ghi nhận hoạt động AI trong lượt khảo sát/spec/test RED; chưa có review/chấp thuận của sinh viên.

## Prompt thực dùng

Nguồn prompt là yêu cầu của sinh viên trong cuộc hội thoại này. Các phần trực tiếp dùng cho phạm vi:

> “Cho phép người dùng gửi lại cùng một yêu cầu mà không tạo dữ liệu hoặc giao dịch trùng.”

> “Risk trọng tâm: test phụ thuộc thời gian, network hoặc thứ tự chạy nên bị flaky.”

> “Kỹ thuật bắt buộc: equivalence partitioning.”

> “AI viết test trước implementation; tôi phải kiểm tra test fail đúng lý do trước khi sửa code.”

> “Nếu chọn hướng frontend, test trọng tâm: lần gửi đầu trả hash H1; lần chờ receipt đầu thất bại có kiểm soát; người dùng thử lại qua luồng sản phẩm đang có; expected không gọi gửi thêm giao dịch, tiếp tục theo dõi H1 và trả đúng kết quả.”

> “Lưu plan ban đầu rồi review bằng repository thật. Sửa hoặc bác bỏ ít nhất hai điểm có evidence cụ thể.”

> “DỪNG TẠI ĐÂY. Chờ tôi xác nhận đã kiểm tra nguyên nhân RED trước khi sửa production code.”

## Output AI đã dùng

1. Đọc source thật và chọn slice frontend sau khi xác nhận hook bỏ hash ở lần gọi tiếp theo và trang mở nút khi phase error. Chọn TV3 dù vai trò cũ là TV2 vì API/indexer/contracts không thể ngăn frontend ký/gửi transaction mới sau H1; ghi rõ giới hạn lớp.
2. Tạo spec/plan v1 và review v2 với các phân hoạch EP1–EP6, 12 case tối thiểu, ranh giới guarantee và kế hoạch mutation response requestId.
3. Tạo frontend/src/chain/useTransaction.vt062.test.ts trước mọi production patch. Test dùng hash/receipt fixture cố định, waitForReceipt mock, deferred Promise và reset state mỗi test; không dùng RPC, timer ngủ hoặc DB.
4. Chạy test trên baseline ae8c3533e14a01f74ba4ea7b00c74365e1651be1. Test retry thất bại ở assertion sendCount=1; actual sendCount=2. Hai test control pass. Production source không đổi.
5. Lưu command/output trong docs/evidence/vt062/. Đã cài đúng Node 24.15.0 và frontend dependencies theo lockfile trong clone cô lập; không thêm dependency.

## Hạn chế AI được nhận diện trước khi review của sinh viên

- Unit harness mô phỏng React hook state và chứng minh nhánh logic của hook; nó không render CreateProposalPage trong browser và không tự chứng minh nút UI/extension wallet.
- API requestId mapping test là yêu cầu mutation bổ trợ, không phải oracle cho việc ví có gửi thêm transaction hay không.
- Hiệu năng 60 task dùng fake receipt chỉ là benchmark logic ứng dụng. Không được trình bày là độ trễ RPC, chain, API production hoặc SLA thật.

Chưa ghi reflection cá nhân thay sinh viên. Chưa ghi rằng sinh viên đã đọc source, xác nhận nguyên nhân RED hoặc chấp thuận patch.

## Bổ sung sau audit đường kiểm thử UI

Sau khi thấy unit harness hook chưa render trang/nút, AI đã tạo plan-review-v3.md và bổ sung một test trang CreateProposalPage. Vì package ban đầu không có DOM emulator, AI đề xuất duy nhất happy-dom 21.0.4; sau network approval, dependency được cài theo lockfile. UI test dùng MemoryRouter, mock API/wallet/transaction và deferred receipt Promise; không có RPC/chain thật. Nó submit form, gây lỗi RPC timeout có kiểm soát rồi bấm lại nút đang bật. Oracle fail là sendGovernor expected 1, actual 2. 16 test khác pass trong full frontend suite; thêm unit hook test thứ hai cũng fail tại send count.

Ghi chú dependency ban đầu “không thêm dependency” áp dụng cho unit harness đầu tiên; plan-review-v3 sửa quyết định đó để đáp ứng yêu cầu test qua luồng sản phẩm.

## Correction sau khi đọc OpenZeppelin Governor cùng revision

AI ban đầu mô tả khả năng indexer ghi thêm proposal cho exact same payload. Kiểm tra submodule source cùng commit cho thấy Governor tính lại cùng proposalId và revert lần propose trùng trước ProposalCreated. Log này sửa kết luận: test RED chứng minh transaction send thứ hai, không chứng minh proposal row thứ hai. Nếu payload đổi nhưng reuse requestId, proposalId có thể khác; đó là giới hạn đã ghi trong plan-review-v4.md.

## Lượt patch → GREEN sau xác nhận RED của sinh viên

**Prompt thực dùng:** Sinh viên xác nhận: “Tôi xác nhận log RED thất bại đúng tại assertion: `expect(uiHarness.sendGovernor).toHaveBeenCalledTimes(1)` Actual: 2 lần gọi.” Sinh viên yêu cầu tiếp tục patch → GREEN, chuyển clone sang `~/projects`, chốt commit test-only trước production, giữ identity của draft/payload/account/chain/deployment, xử lý timeout/revert/cancel, chạy lại hai test RED/suite/lint/build, lưu evidence và không làm mutation/tải/PDF/push/PR/merge trong lượt này.

**Output AI và thao tác thực dùng:**

1. Chuyển clone bằng `mv` sang `/home/cuongdz/projects/dao-budget-vt062-individual` khi đường đích chưa tồn tại. Lệnh chuyển thành công nhưng `git status` gắn sau lệnh tại working directory `/tmp` trả exit 128 vì `/tmp` không phải repository; kiểm tra lại tại đường đích xác nhận clone nguyên vẹn.
2. Chốt commit `9a87741ae4728edb4092ece6d8d9e4c90f7650b7` chỉ gồm hai test RED và `happy-dom` trong package/lock. Git chưa cấu hình author; commit đầu bị từ chối, sau đó dùng `Codex <codex@users.noreply.github.com>` cho riêng lệnh commit. Không mạo nhận sinh viên viết test AI.
3. Sửa `useTransaction.ts` giữ hash + key sau khi ví trả H1; cùng key retry wait(H1), key khác của trang proposal bị chặn. `CreateProposalPage.tsx` tạo key từ account, chain, deployment và exact payload. `transactions.ts` phân loại receipt revert/cancel/replace là terminal, timeout vẫn retryable. Callback của caller không truyền key giữ hành vi mới action như trước.
4. Giữ nguyên hai assertion RED. Bổ sung tests cho identity đổi payload/account, pending concurrency, terminal outcomes, repriced và tác động hook dùng chung. Một lỗi trong test mới (`beforeEach` vô tình trả mock function) đã được AI phát hiện khi chạy và sửa. Build đầu exit 2 vì parameter property không tương thích `erasableSyntaxOnly`; đổi thành field tường minh và build qua.
5. Chạy lại: hai file RED gốc 10/10 test qua, frontend suite 29/29 qua, lint exit 0 (8 warning `wallet.tsx` sẵn có), build exit 0. Lưu output và exit code ở `docs/evidence/vt062/green-*.txt`; source commit `8a4cb6474775d210d6126b9faa3fab87b4bc2d07`, diff ở `green-code-and-tests.diff`. Checkout gốc được đối chiếu status/HEAD không đổi.

**Độ tin cậy cần người review:** JSON key cần được đối chiếu với payload thật và lựa chọn ví khi thử tích hợp; tests hiện dùng mock ví/RPC. Phân loại replacement dựa trên callback viem được unit-test bằng fake client; chưa xác nhận bằng extension wallet hoặc Anvil. Sinh viên đã xác nhận nguyên nhân RED theo log; chưa có tuyên bố sinh viên đã review/hiểu/chấp thuận patch GREEN.

Mutation response field, tải 60 task, coverage, flaky experiments và PDF chưa thực hiện theo giới hạn lượt này. Không viết reflection cá nhân thay sinh viên.

## Lượt review diff → mutation → coverage → flaky checks

**Prompt thực dùng:** Sinh viên yêu cầu tiếp tục tại clone cá nhân, kiểm branch/HEAD/status và review production/test/spec, tạo test API/PostgreSQL thật cho mutation `requestId` từ `proposal_id` thay vì `request_id`, chứng minh good-pass/mutant-fail/restored-pass trên DB/snapshot mới, đo line/branch coverage, kiểm ít nhất hai flaky risks bằng lặp/shuffle, lưu evidence và không push/PR/merge/tải 60/PDF. Sinh viên nhắc rõ “Không ghi rằng tôi đã review/chấp thuận patch.” Tin nhắn tiếp theo “countinue” được hiểu là tiếp tục công việc đang làm, không đổi phạm vi.

**Output AI đã dùng và kết quả thực:**

1. Xác minh đầu lượt HEAD `b7528d3`, branch cá nhân và status sạch; đọc diff production, tests, spec/plan v1–v4 cùng mapper `indexer/api/server.ts:381`. Ghi review ở `evaluation-review.md`; phát hiện finding có điều kiện F1 về receipt success thiếu Proposal ID và nút có thể mở lại. Chưa sửa production hoặc tuyên bố sinh viên review patch.
2. Viết test riêng `tests/api/vt062-request-id.test.mjs` và runner `scripts/check_vt062_api_native.mjs`. Fixture dùng requestId bytes32 cố định khác proposalId decimal, calldata disburse/descriptionHash/proposalId hợp lệ; migration 001–005, deployment, raw event, checkpoint và publication; HTTP server + PostgreSQL 18.4 thật. Test assert list/detail chính xác từ fixture và snapshot count 0 trước request. Commit test `4c5ab03` do Codex tạo. Root `npm ci --offline` exit 0.
3. Good code pass, mutant worktree thay đúng một expression ở mapper và fail tại assertion `list.requestId` (actual proposalId decimal, expected bytes32), restored code pass với cluster mới. SHA mapper, diff, logs và cleanup ở `docs/evidence/vt062/mutation/`. Mutation được áp ngược rồi tháo worktree; không có mutation trong branch nộp.
4. Cài devDependency `@vitest/coverage-v8@4.1.12` đúng phiên bản Vitest đã khóa; thêm test cancel khi RPC reject sau replacement và assertion UI không submit thêm sau success có Proposal ID. Commit `6144f1b` do Codex tạo. Coverage V8 trên ba module production sửa: tổng line 72.94%, branch 51.74%; test suite 30/30 pass. Review chỉ ra nhánh guard/success thiếu event chưa được test dù tỷ lệ hook cao.
5. Thử flaky trên test cuối: 30 lượt logic ×16 test, 6 seeds shuffle ×30 test và ba file VT-062 chạy riêng; tất cả exit 0, raw outcomes lưu riêng. Test dùng deferred/barrier, mock reset, component unmount; API runner đóng server/pool/cluster. Không dùng retry để biến failure thành pass. Frontend lint/build exit 0 với warning baseline được ghi lại.

**Hai điểm AI-generated vẫn cần kiểm thêm:** (a) UI mock `proposalIdFromReceipt` luôn trả 42 ở đường bình thường nên có thể che receipt success thiếu event; F1 đã ghi. (b) Phép đo coverage chỉ include ba frontend module; API mapper được kiểm bằng mutation/PostgreSQL nhưng không có line/branch coverage từ cùng provider. E2E ví/Anvil và tải 60 tác vụ chưa chạy. Chưa ghi reflection cá nhân thay sinh viên và chưa nói sinh viên đã review/chấp thuận patch.
