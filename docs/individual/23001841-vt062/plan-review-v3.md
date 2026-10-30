# VT-062 — Plan review bổ sung sau audit test harness (v3)

Ngày: 2026-10-30 UTC.

## Phát hiện mới

Test hook ở frontend/src/chain/useTransaction.vt062.test.ts đã tạo RED đúng hành vi: lần đầu send trả H1, waitForReceipt bị lỗi timeout, retry làm send được gọi lần thứ hai. Tuy nhiên harness gọi useTransaction trực tiếp với React state mock; nó chưa mount CreateProposalPage và chưa tự đi qua form submit/nút đang bật.

Yêu cầu đầu vào chỉ rõ người dùng phải thử lại “qua luồng sản phẩm đang có”. Vì vậy test hook là unit regression hữu ích nhưng chưa đủ làm test trọng tâm. Bản plan v2 đã đánh giá Vitest hiện có đủ, dựa trên lớp hook; đánh giá đó bị thu hẹp sau khi đối chiếu lại oracle UI.

## Điều chỉnh plan

- Giữ test hook làm unit control cho state machine và pre-hash/concurrent cases.
- Bổ sung frontend/src/pages/CreateProposalPage.vt062.test.tsx trong môi trường happy-dom. Render trang hiện có, chờ mock summary làm nút submit sẵn sàng, submit một bản nháp hợp lệ, trả H1, làm wait đầu lỗi timeout, rồi submit lại chính form đó.
- Oracle UI: nút retry đang enable sau lỗi; sendGovernor chỉ gọi một lần; waitForReceipt gọi hai lần với H1; sau receipt thành công hiển thị proposal ID từ receipt; request ID/form không bị reset.
- Thêm đúng một devDependency happy-dom, pin phiên bản trong package.json/package-lock.json, vì frontend chỉ có Vitest và React DOM, chưa có DOM emulator/testing library. Không thêm testing-library hoặc browser automation.
- Tách bạch bằng chứng: unit hook RED hiện có và UI flow RED mới. Nếu UI test gặp lỗi do setup/selector/harness thì đó chưa phải RED hành vi; cần sửa setup cho tới khi assertion thất bại ở send count với module/page được render thành công.

## Lệnh/dependency

npm install trong sandbox gặp EAI_AGAIN; sau network approval, happy-dom 21.0.4 được thêm làm một direct devDependency và package-lock được cập nhật. npm ci --offline theo lockfile cuối cài 93 packages thành công. UI test render trang và fail đúng ở sendGovernor count expected 1, actual 2; DOM, summary, selector, form và mock receipt đều chạy được. Full suite: 16 pass, hai VT-062 behavior failures, exit 1. Production source vẫn chưa sửa.

Production source tiếp tục giữ nguyên cho đến khi test UI chạy và sinh viên kiểm tra RED.
