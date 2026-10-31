# Phụ lục A - AI Usage Log

Bản gốc cdc8740 đã có báo cáo và code. Lần này không nhận công sức của người khác: tiếp tục đúng nhánh MSSV 23001850, không dùng nhánh/test của thành viên khác. Log cũ là tài liệu lịch sử; log verification/ là lần chạy mới. Người nộp phải tự review và chịu trách nhiệm.

| Bước | Công cụ / prompt chính | Output dùng, sửa hoặc bác bỏ | Evidence |
|---|---|---|---|
| Đọc spec/repository | Codex + GitHub plugin: yêu cầu VT-064 của người dùng; kiểm PDF đính kèm, nhánh và module import | Phát hiện đã có implementation, giữ baseline 1bb1821 và tiếp tục; không giả lập một dự án khác | cdc8740; spec.md; lịch sử b61cec8/69ca712 |
| Lập plan cô lập trước bổ sung | Coding agent module_plan, fork_turns=none. Prompt đầy đủ bên dưới | Plan kiểm canonical strings, properties, persistence, race, workload. Bác bỏ sửa regex vì probe false; sửa assumption dependency vì không có fast-check | verification/plan.md; commit aca614d |
| Test và patch nhỏ | Codex: bổ sung property tập valid không đổi khi chèn invalid/đảo; chỉ sửa runner khi có EPERM | Thêm T13/T14, giữ production validator. Hai import npm scripts dùng node --import tsx. Không sửa API/chain/storage | import.test.ts; runner-red.log; runner-green.log; commit 969acb3 |
| Replay red logic | Codex: chạy test đã review trên b61cec8 trong worktree độc lập | Assertion actual IDs thiếu indexes; không mô tả replay như red mới trước patch gốc | verification/red-replay.log; 69ca712 diff |
| Mutation | Codex: catch mkdir lỗi vẫn imported.push và continue trên branch/commit tạm; chạy T07 | Test bắt Missing expected rejection; nguồn nhánh nộp không chứa mutant. Patch được lưu để reviewer tự chạy | mutation.patch; mutation-replay.log; local mutant 12c53e2 |
| Verify/review | Codex + Node/npm: coverage, typecheck/build, BE07; 3 lượt tải 80; 3 lần race | 9/9 import, 15/15 BE07, check exit 0; không đổi timer BE07 để ép xanh. Ghi giới hạn filesystem local | verification/*.log; load-1/2/3.json |
| Báo cáo | Codex + PDF skill: trace AC/test/file/commit/result, reflection 250-350 từ, <=8 trang chính | report.md, PDF; reflection 319 từ theo whitespace. Là bản nháp có AI, không chứng nhận người nộp đã hiểu hay nhóm đã review | build_pdf.py; PDF page count |

## Prompt đầy đủ của lần lập plan module-only

Act as coding agent producing a pre-code plan only, no tools, no code edits. Context restricted to import validation module: Draft {id:string,recipient:string,amount:string,description:string}; current validate uses /^[a-z0-9][a-z0-9_-]{0,63}$/ for id, /^0x[0-9a-f]{40}$/ for recipient, /^[1-9][0-9]*$/ for amount plus length<=78 and BigInt<=uint256 max. JSON array importer validates each row, persists valid items independently to <id>.json via temp+sync+hardlink, skips invalid rows, stops with ImportFailure on storage errors. CLI bounds file to 1MiB and rows to 1000. Request VT-064: valid records survive invalid records; never success when persistence fails; property-based testing; regression risk; 80 concurrent tasks p95<=2.5 sec. Proposed review focus: exact canonical validation and generated strings with trailing CR/LF/Unicode terminators. Produce small implementation plan BEFORE code, assumptions, exact planned file paths under indexer/import/drafts.ts and tests/indexer/import.test.ts, at least 2 tentative recommendations to independently verify against repo. Do not assume API/database exists or claim tests ran. State missing-context risk. Return compact plan.

## Output plan và đánh giá

Agent đề xuất inspect hai module, enforce whole-string canonical nếu cần, property mixed rows/suffix/uint256/failure, kiểm duplicate/cleanup/race và workload 80. Assumptions: format canonical là chủ đích, không cần API/database. Agent nói chưa xem file/chưa chạy test. Nhận định '$' có thể nhận final newline đã bị probe bác bỏ trong context Node đang dùng; không dùng nó làm lý do sửa code. Nhận định reuse dependency được sửa vì package lock không có thư viện property testing.


Giới hạn context và hai output chưa đáng tin được phân tích ở mục 2 và 6 của nội dung chính; không coi AI là bằng chứng correctness.
