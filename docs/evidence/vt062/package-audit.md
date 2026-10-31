# VT-062 — audit artifact trước khi chuyển sinh viên review

Ngày 2026-10-31 UTC. Source production cuối F1 ở commit `0d0a5f697f3ccc1a76333177f34508f721e8a2b4`; hook SHA-256 `4cb742fd8f10a08af84c9b5b678541d26070b9e52350b22ebd8213de970d258d`, trang SHA-256 `121365f2fccb44af4df14dc08a7e16708a337c1ae83e1534d81aaad9dce9ff13`. Harness/raw commit `ae7f6e9928326e6bcce32f121439259efe9a582a`. Các commit lịch sử RED/GREEN/mutation/F1 giữ nguyên.

| Rubric/kiểm tra | Kết quả có evidence | Giới hạn |
|---|---|---|
| Spec, AC, invariant, constraints | `spec-plan-v1.md`, v2–v4, báo cáo mục 1–2 | Bảo đảm cùng mount, không reload/multi-tab. |
| Plan review thật ≥2 chỉnh sửa | `plan-review-v2.md`, `plan-review-v4.md` và source dẫn tại báo cáo mục 2 | Không nhận plan v1 là kết quả thực thi. |
| Equivalence partitions, ≥10 cases, negative/failure path | 7 partitions và 13 cases ở báo cáo mục 2–3 | Browser wallet E2E chưa chạy. |
| Test-first RED → patch → GREEN | `red-ui.txt`, `green-original-two.txt`, `f1-red-page-final.txt`, `f1-green-final-suite.txt` | Hai RED có xác nhận nguyên nhân của sinh viên; không có xác nhận sinh viên review patch. |
| Mutation bắt response field | `mutation/good-02`, `mutant-01`, `restored-01`, `requestid-mutant.diff` | Trên API/PostgreSQL trước F1; mapper không đổi sau đó. |
| Coverage/risk và flaky sau F1 | `f1-coverage-final-run.txt`, `f1-flaky-ui-30-final-*`, `f1-flaky-suite-6-final-*` | Include ba module frontend; API mapper ngoài phép đo V8. |
| 60 task ×100 wave ×3 run | `load/raw-run-{1,2,3}.csv`, `aggregate.json`, `validation.txt`, `load-runbook.md`; 36.000 measured, 0 unexpected error, peak logical 60 | Hook React thật với fake ví/receipt; p95 local không chứng minh SLA 60 người dùng/chain thật hoặc F1 handler dưới tải. |
| Báo cáo Markdown/PDF và phụ lục | `docs/individual/23001841-vt062/BT3_23001841_VT-062.md/.pdf`; `pdf-validation.txt`: 5 trang chính, 5 phụ lục, reflection 344 từ, DejaVu embedded 48.776 bytes, 0 clipped spans, 10/10 trang render được | Reflection là bản nháp AI hỗ trợ, cần sinh viên chỉnh và xác nhận. |
| README, Draft PR và diff | `README.md`, `DRAFT_PR.md`, `DIFF_SUMMARY.md` trong thư mục cá nhân | Nhánh chưa push, link PR chưa có. |

Sau khi thêm harness/đóng gói, frontend suite 33/33, lint/build exit 0 (`package-frontend-suite.txt`, `package-frontend-lint.txt`, `package-frontend-build.txt`). Lint còn warning baseline ở `wallet.tsx`; build còn warning chunk lớn. `pdf-render-command.txt` ghi command và exit 0; WeasyPrint/PyPDF có warning annotation khi ghép nhưng PDF mở, trích text tiếng Việt và render đầy đủ, không có clipped span. Các preview trang 1, 3 (bảng), 5 ở `pdf-preview-page-*.png` đã được xem trực quan.

**Cần sinh viên tự review:** source identity/guard ở trang, terminal/callback ở hook, UX thiếu Proposal ID, giả định phạm vi, số liệu thí nghiệm và reflection; chưa có chữ ký/xác nhận chấp thuận. Tải chain/ví thật và publish nhánh còn thiếu nếu rubric/người review yêu cầu. Không push, mở PR hoặc merge trong lượt này.
