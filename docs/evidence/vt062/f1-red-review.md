# VT-062 F1 — Receipt success nhưng không đọc được Proposal ID (test-first RED)

Ngày: 2026-10-31 UTC. Đây là lượt tái hiện riêng finding F1, chưa sửa production code. Sinh viên chưa xác nhận review/chấp thuận patch F1.

## Baseline và source identity

- Branch: `individual/23001841-vt062-idempotent-retry`; HEAD trước test `a997bf8b25ab9911772d2174c1085519b31199d9`, status sạch.
- Test-only commit sau RED: `198fd2263040db52b13219daafbf38896ba0a6af` (chỉ thêm một case vào `frontend/src/pages/CreateProposalPage.vt062.test.tsx`).
- `f1-production-diff.txt` dài 0 byte. SHA-256 production trong `f1-source-sha256.txt`: trang `2a89dccea4f1700696f2de8fba6ae8fb6039420eb7d1abab06ba21edf8272c1b`, hook `4cb742fd8f10a08af84c9b5b678541d26070b9e52350b22ebd8213de970d258d`, transactions/decoder `5aed140355fb5f5cb427c90c7a174575c8f7e58759fe989878eff59abbf79f7e`. Các SHA này khớp GREEN trước đó.
- Diff test trước commit: `f1-test-only.diff`, SHA-256 `912b0bb1ec9cf16d72da9841fcb187cc2836e7c375c41503f708b0a799ea5a51`. Test file sau commit SHA-256 `9771b65b52d0769e7f126dda91449f1f9f98bbbb4bd39151c986e3c83df869fb`.
- Môi trường: Node 24.15.0 theo `.nvmrc`, Vitest 4.1.12 và happy-dom 21.0.4 theo frontend lockfile; không dùng RPC ngoài, DB, clock giả hay sleep cố định.

## Fault injection và quan sát

Test trong `CreateProposalPage.vt062.test.tsx:270–328` render trang và hook `useTransaction` thật. API summary, wallet và lời gọi gửi giao dịch được mock ở boundary. Cùng account `0xaaaa…`, chain `31337`, deployment `vt062-local`, title/body/recipient/amount và `requestId` `0x0101…` được giữ qua hai lượt. Lần gửi đầu trả H1 `0x1111…`; deferred Promise giữ receipt wait tới khi test giải quyết. Receipt có `status: success`, `transactionHash: H1`; fault injection là `proposalIdFromReceipt` trả `null` cho `logs: []`. Source decoder thật cũng trả `null` nếu không tìm thấy `ProposalCreated` (`transactions.ts:155–164`), nhưng test này **không** xác minh decoder hay receipt thật từ chain.

Sau khi receipt wait giải quyết, test đã đi qua các assertion: decoder boundary được gọi với receipt logs; UI hiển thị “Giao dịch đã được xác nhận.” và H1, không có Proposal ID, không hiển thị revert; bốn trường form và requestId vẫn còn, `newRequestId` gọi một lần. Test bấm lại nút submit hiện có; `buildProposal` nếu được gọi vẫn nhận đúng cùng draft/requestId. Assertion cuối yêu cầu `sendGovernor` một lần nhưng actual hai lần. Vì click vào nút đã kích hoạt submit trong happy-dom, UI đang cho phép người dùng gửi lại.

Đây là **receipt thành công nhưng bước lấy kết quả phụ trợ thất bại**. `waitForReceipt` không reject, hook chuyển `success`, không phải `reverted` hoặc lỗi quan sát trạng thái chưa xác định. Source hook xóa pending ở `useTransaction.ts:37–39`, callback trang đặt `submittedId=null` ở `CreateProposalPage.tsx:56–58`, và nút chỉ khóa khi `submittedId !== null` ở `:86`.

## Lệnh và kết quả cuối trên test đã commit

Mọi lệnh chạy từ clone cá nhân với `PATH=/home/cuongdz/.local/share/be06-tools/node/bin:$PATH`. Raw output và `EXIT_CODE` nằm ở các file được nêu; các file `*-initial.txt` giữ lượt trước khi thêm assertion kiểm draft không rỗng.

| Lệnh sau prefix PATH | Raw log cuối | Exit | Kết quả |
|---|---|---:|---|
| `npm run test --prefix frontend -- src/pages/CreateProposalPage.vt062.test.tsx -t 'does not submit the same draft again'` | `f1-red-page-final.txt` | 1 | Fail duy nhất tại `:327`: expected send count 1, actual 2. Hai case khác được lọc bởi `-t`, không bị thay/skip trong file. |
| `npm run test --prefix frontend -- src/pages/CreateProposalPage.vt062.test.tsx` | `f1-red-ui-all-final.txt` | 1 | 2 pass, 1 fail cùng assertion; không có case skip. |
| `npm run test --prefix frontend` | `f1-red-frontend-suite-final.txt` | 1 | 30 pass, 1 fail cùng assertion; 4 file khác pass. |
| `npm run build --prefix frontend` | `f1-red-build-final.txt` | 0 | TypeScript và Vite pass; warning chunk lớn như baseline. |
| `npm run lint --prefix frontend` | `f1-red-lint-final.txt` | 0 | Chỉ còn 8 warning `wallet.tsx` đã có trước. |

RED hợp lệ vì test đã render trang, load summary, nhận H1, chờ receipt thành công, qua các assertion UI/draft và fail ở oracle số lần gửi. Không có lỗi package, import, selector, DB hay TypeScript. Test không sửa expected của hai RED gốc.

## Patch dự kiến, chưa thực hiện

Giữ kết quả receipt success độc lập với khả năng đọc Proposal ID. Trang cần chặn submit cùng request sau success ngay cả khi `proposalIdFromReceipt` trả null, và hiển thị trạng thái “đã xác nhận nhưng chưa đọc được Proposal ID” cùng H1. Cần guard ở handler hoặc state keyed theo request để không phụ thuộc riêng vào `disabled` của nút; không làm mất draft. Phải cân nhắc đường action mới sau terminal success và không khóa nhầm request khác. Giữ assertion RED mới, chạy GREEN/regression sau khi sinh viên kiểm nguyên nhân RED.
