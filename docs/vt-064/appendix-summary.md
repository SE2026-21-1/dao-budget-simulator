# Phụ lục A — AI Usage Log rút gọn

Bài cá nhân Phan Thanh Dũng,23001850,VT-064. AI hỗ trợ lập plan, tests, patch và báo cáo; không dùng output AI làm chứng cứ correctness. [AI Usage Log đầy đủ](AI-usage.md) và [prompt/plan trước patch](20261114-module-plan.md) được giữ nguyên trên nhánh nộp.

| Công cụ / bước | Prompt chính, output và review | Evidence |
|---|---|---|
| OMP + ScopedImporterPlan | Chỉ cấp drafts.ts,cli.ts,import.test.ts,spec.md,package.json. Yêu cầu plan strictUTF8,giữ1MiB/1000rows/errorcontracts; viết tests trước runtime patch,không tự chạy checks. | Plan/test31cd658 |
| Parent review plan | Bác oracle pin JSON.stringify+newline; so parsed fields. Đổi launcher node--importtsx--test theo test:be07; ghi rõ raw-byte accounting là correction. | Plan §Parent review;implementation.patch |
| Test-first + patch | RED6malformed-byte counterexamples; patch statefulfataldecoder/EOFflush/BOM semantics; giữ persistence cũ. | RED31cd658→GREEN8e6f27a |
| Mutation / quality | Cố ý success khi mkdir fail trên worktree riêng;T07 bắt lỗi. Coverage,đảo thứ tự/concurrency1/4;80tasks×3runs,giữ samples. | Mutant3e6ce68;results/load JSON |
| PdfSubmissionLayout + OMP | Layout tiếng Việt,links,main/appendix;parent render/đếm trang/xem ảnh. Lượt rút gọn chỉ đổi PDF/phụ lục,không chạy lại hoặc gán lại runtime tests. | build_pdf.py;PDF verification |

**Context thiếu:** Agent lập plan chỉ xem module; parent có repo instructions/lịch sử và kiểm API GET-only ởserver.ts:683–686. Không khẳng định toàn bộ tương tác AI đều module-only. Risk là nhầm draft với projection chain hoặc vô tình thêm quyền ghi; giữ staging offline,không POST/chain mutation.

**Hai output chưa đáng tin ngay:** (1) Chỉ đếm imported không chứng minh persistence; phải đọc file và kill mutant. Pin serializer/newline lại kiểm implementation thay contract. (2) Decoder fatal thiếu stream state/EOF flush hoặc tự strip BOM vẫn phá behavior cũ;T14–T17 kiểm các boundary liên quan.

**Lịch sử không sửa:** Bài gốc b61cec8/69ca712 và logs cũ được giữ đúng nguồn; PR31 đã merge09/11,không có submitted reviews theo API. Nhánh bổ sung chưa merge; mutant không push/merge. Reflection do AI hỗ trợ soạn và đã khai báo; không giả lập chữ ký hoặc peer approval.

<!-- pagebreak -->

# Phụ lục B — evidence và cách kiểm lại

Logs đầy đủ ghi command,sourceSHA,exit code trên [thư mục evidence](https://github.com/SE2026-21-1/dao-budget-simulator/tree/personal/23001850-vt064-submission-20261114/docs/vt-064). Bảng dưới tóm tắt execution đã có,không phải các lượt chạy mới khi rút PDF.

| Kiểm chứng | Source / kết quả thực tế | Log đầy đủ |
|---|---|---|
| RED trước patch |31cd658:6malformed-byte subcases sai;Missing expected rejection;exit1.14Nodechecks gồm group:7pass/7fail. |[RED](20261114-red.log) |
| Patch→GREEN |8e6f27a:21/21PASS,0FAIL/SKIP;typecheck/build exit0. |[GREEN](20261114-green.log),[diff](20261114-implementation.patch) |
| Mutation bắt buộc |3e6ce68:catch mkdir lỗi vẫn push imported/continue;T07exit1 Missing expected rejection.Clean source cùng test exit0.Mutant không là ancestor nhánh nộp. |[Mutation diff](20261114-mutation.patch),[FAIL](20261114-mutation.log),[clean PASS](20261114-mutation-clean.log) |
| Behavior cũ / flaky |BE07 tại8e6f27a:15/15PASS;Gitblobkhôngđổi.Đảo fileorder và concurrency1/4 tạib79beda:3/3PASS mỗi lượt. |[Regression](20261114-regression.log),[replay1](20261114-flaky-1.log),[replay2](20261114-flaky-2.log) |
| Coverage |drafts100%line/branch;cli91,89%line/75%branch.Tổng97,78%line/96,36%branch;không chứng minh mọi I/O/crash. |[Coverage](20261114-coverage.log) |
|80tasks đồng thời |b79beda:3runs riêng,mỗi run80/80,0errors;p95109,012/88,523/88,187ms≤2500ms.Tính lại từ80samples/run;localFS,không80HTTPusers. |[Raw samples](20261114-load.json),[source/results](20261114-results.json) |

**Chạy lại từ repository root,Node24.15.0:**

```bash
npm ci
npm run test:vt064
npm run test:be07
npm run typecheck && npm run build
node --import tsx scripts/benchmark_vt064.mjs
```

[README](README.md) có lệnh coverage và hướng dẫn tái tạo mutant trong worktree disposable;không áp mutation lên nhánh nộp. [PDF source](report.md) giữ17casefamilies,traceability và reflection314từ. Không tuyên bố upload Classroom,peer review,DB/chain/walletE2E hoặc durability khi mất điện.
