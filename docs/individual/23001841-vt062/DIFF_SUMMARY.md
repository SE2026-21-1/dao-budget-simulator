# VT-062 — tóm tắt diff để review

Baseline `ae8c3533e14a01f74ba4ea7b00c74365e1651be1`; nhánh local `individual/23001841-vt062-idempotent-retry`. Xem diff đầy đủ tại checkout bằng `git diff ae8c3533e14a01f74ba4ea7b00c74365e1651be1...HEAD -- frontend/src/chain frontend/src/pages/CreateProposalPage.tsx frontend/src/pages/CreateProposalPage.vt062.test.tsx` và `git diff --stat ae8c3533e14a01f74ba4ea7b00c74365e1651be1...HEAD`. Nhánh chưa publish; chưa có PR/link review từ GitHub.

| Nhóm | Thay đổi chính | Lý do/evidence |
|---|---|---|
| Production frontend | `useTransaction.ts` giữ `{hash,key}` sau H1, retry cùng key wait H1; `transactions.ts` phân loại revert/cancel/repricing; `CreateProposalPage.tsx` tạo exact request key và sau F1 lưu receipt success/hash theo key, guard trong handler khi thiếu ID. | RED ban đầu và F1 RED expected send 1 actual 2; GREEN 33/33 frontend. |
| Test frontend | `useTransaction.vt062.test.ts`, `CreateProposalPage.vt062.test.tsx`, `waitForReceipt.vt062.test.ts`. | Deferred/barrier, negative/failure path, identity, UI submit trực tiếp, terminal và callback. |
| API test/mutation | `tests/api/vt062-request-id.test.mjs`, `scripts/check_vt062_api_native.mjs`; API production mapper không sửa. | Good-pass/mutant-fail/restored-pass trên PostgreSQL/snapshot mới cho requestId bytes32. |
| Dependency test | `happy-dom` 21.0.4 và `@vitest/coverage-v8` 4.1.12 trong frontend devDependencies/lockfile. | UI test và V8 coverage đúng Vitest khóa. |
| Tải/đóng gói | `frontend/scripts/vt062-load.load.tsx`, `frontend/vitest.load.config.ts`, `scripts/summarize_vt062_load.py`, renderer PDF, README/MD/PDF, raw/evidence. | 60 overlap ×100 wave ×3 run; outcome tách biệt, p95 nearest-rank; báo cáo tái lập. |

**Mốc commit:** test-only ban đầu `9a87741`; patch ban đầu `8a4cb64`; F1 test-only `198fd22`; F1 patch/test `0d0a5f6`; load harness/raw `ae7f6e9928326e6bcce32f121439259efe9a582a`. Diff production cần người review kỹ ở `frontend/src/chain/useTransaction.ts:15–49`, `transactions.ts:72–87`, `CreateProposalPage.tsx:39–79,105–108`. Các test dùng mock ví/RPC; load p95 không phải SLA chain thật. Không có persistence reload/multi-tab hoặc E2E extension wallet. Sinh viên chưa review/chấp thuận patch.
