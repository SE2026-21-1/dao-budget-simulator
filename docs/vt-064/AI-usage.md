# Phụ lục A — AI Usage Log

## A1. Context và quyền tác giả

Bài cá nhân Phan Thanh Dũng23001850, VT-064. Không lấy test plan/data/mutation/reflection của thành viên khác. Group repository là nền tảng được chỉ định; importer gốc và mutation7bc4ac6 là lịch sử bài cá nhân đã có trong Git. Assistant chính có repository instructions và lịch sử phiên làm việc; không thể tuyên bố mọi tương tác AI đều module-only. Lượt coding-agent `ScopedImporterPlan` được tách riêng, chỉ có source module liên quan và spec/package, rồi parent kiểm rủi ro cross-module. Không dùng “AI nói đúng” thay test/review. Reflection được AI hỗ trợ soạn và đã khai báo; không giả lập chữ ký, hoạt động review của sinh viên hoặc xác nhận của thành viên khác.

## A2. Lịch sử trước lượt bổ sung — không nhận là execution mới

Các record kế thừa từ0328eea: assistant tự lập spec/plan, không có cuộc gọi model lập plan riêng ở lượt gốc; red.log là missing-module, review-red.log là accepted-index behavior mismatch; b61cec8/69ca712 triển khai và sửa report/bounded streaming. Historical AI log ghi reviewer ImporterReview/TestOracleReview đã nêu input không giới hạn, partial rejected rows, indexes và stored-winner oracle. Các cuộc review đó không được chạy lại hay gán cho agent mới. Historical mutation7bc4ac6 và diff/log vẫn giữ nguyên. Cần phân biệt các artifact lịch sử với bằng chứng source-bound ngày14/11 bên dưới.

## A3. Các lần dùng AI thực tế ngày14/11

| Bước / công cụ | Prompt chính và context | Output dùng / sửa hoặc bác bỏ | Evidence |
|---|---|---|---|
| OMP điều phối | Đối chiếu rubric VT-064; giữ nguyên checkout cá nhân; worktree từ0328eea; không merge nhánh bổ sung. | Phát hiện link nhánh cũ không còn trên remote, PR31 đã merge lịch sử; không che lịch sử bằng báo cáo “chưa từng merge”. | report.md,20261114-results.json; GitHub PR31 |
| Coding agent ScopedImporterPlan | Chỉ đọc drafts.ts,cli.ts,import.test.ts,spec.md,package.json. “Plan smallest strict UTF8 delta preserving1MiB/1000rows/existingJSON/error contracts”; viết plan trước tests/runtime; không sửa runtime hoặc chạy checks. | Plan/prompt/assumptions/alternatives thật; tạo CLI tests cho malformed bytes, EOF,BOM,chunkboundary,seededUnicode. | 20261114-module-plan.md chứa đầy đủ assignment; commit31cd658 |
| Parent review trước patch | “Do not pin stored bytes to JSON.stringify(row)+'newline'; compare parsed object/description. Wire node--importtsx--test. Raw-byte count is correction, not identical baseline semantics.” | Bác byte-format oracle; đổi test launcher theo test:be07; sửa diễn đạt ceiling. Agent cập nhật plan/tests trước patch. Parent sau đó kiểm API GET/OPTIONS boundary, không giao thêm API source cho agent module-only. | Plan §Parent review; package.json; indexer/api/server.ts:683–686 |
| Test-first + AI-assisted patch | Chạy encoding tests trước runtime patch; chỉ raw-buffer/statefulfataldecoder/EOFflush/BOM-preservation và launcher, giữ saveDraft/importDrafts. | RED6malformed subcases; review exact diff; patch8e6f27a; GREEN21checks và BE0715pass, typecheck/build0. Không copy/commit thay đổi dirty của checkout gốc. | 20261114-red.log,implementation.patch,green.log,regression.log,typecheck.log,build.log |
| Who tests tests? | Trên worktree/branch experiment riêng, cố ý claim imported khi mkdir thất bại; chạy T07, rồi clean control; không đưa mutant vào submission ancestry. | Mutation3e6ce68 bị giết bởi Missing expected rejection; clean controlpass. Mutant không push/merge. | 20261114-mutation.patch/.log,mutation-clean.log; results.json |
| Quality/performance | Coverage theo module; replay selected seeded/race tests với order/concurrency1/4;80logicaltasks×3run, giữ80samples/run và tính lại percentile75. | Không đồng nhất line100 với correctness; không gọi3runs là240concurrentusers hoặc 80HTTPclients. | 20261114-coverage.log,flaky-1/2.log,load.json và load-1/2/3.log |
| Coding agent PdfSubmissionLayout | Chỉ renderer/report/AIlog/README. Sửa layout tiếng Việt9.2pt,table≥8,markdownlinks,phụ lục tách main,fullfailuredetails. Không render/chạy kiểm thay parent. | Renderer thay đổi; parent sửa branch URL còn stale và metadata, tự render/đếm trang/xem ảnh. Không xem agent “completed” là proof PDF đúng. | build_pdf.py; PDF và main-only page count |
| OMP report/PDF | Trace AC/risk→testfile→sourceSHA→result,17casefamilies,negative/failurepaths,reflection250–350từ; không gán test cũ cho SHA mới. | report.md,README và PDF cuối; declaration/AI disclosure rõ. Chỉ link branch nộp, không merge hoặc nộp Classroom thay người học. | README.md,report.md,BT3_23001850_VT-064.pdf |

## A4. Hai output AI cần kiểm độc lập và risk thiếu context

1. Test chỉ so imported.length hoặc serializer bytes có vẻ hợp lý nhưng có thể bỏ qua false-success/dữ liệu mất, hoặc trói format không nằm trong AC. Bắt buộc actual persisted-set/field oracle và mutant persistence.
2. TextDecoder fatal nhìn đúng nhưng thiếu stream state/EOF flush sẽ phá scalar qua chunk; default BOM stripping lại đổi behavior cũ. T14/T15/T16/T17 chứng minh các boundary liên quan, không khẳng định mọi Unicode hoặc filesystem.

Module-only agent không xác minh API/read-model authority hoặc cơ chế CI toàn repo. Parent kiểm GET-only ở API và giữ offline drafts tách chain projection; BE07 unchanged regression15PASS cung cấp bằng chứng behavior ngoài importer, không phải full DB/chain acceptance. Không có lời hứa crash-durability, NFS hoặc80người dùng network. Logs ghi command/exit/SHA thật; historical failures không bị sửa thành PASS.
