# BE08 — Review trước push, 30/10/2026

Đủ điều kiện push nhánh feature để chạy CI và bàn giao review. Chưa khẳng định
đủ điều kiện merge: cần CI remote đúng head SHA và TV4 nghiệm thu độc lập.

Base `feature/tv2-be07` tại `2adcbfac24fa34da9f76673a2404ef71dd3cb804`.
Đã đối chiếu các nhánh GitHub: BE01–BE07 tồn tại, BE08 chưa publish tại lúc review.
Dev chưa chứa đủ BE05–BE07; PR BE08 cần đặt base là BE07 như chuỗi bàn giao cũ.

## Findings và đóng gói

Không phát hiện lỗi chức năng chặn push trong diff BE08. Các file source hiện tại
khớp final-review và dependency benchmark (trừ thuộc tính whitespace đóng gói bên dưới); toàn bộ manifest evidence cũ khớp hash.
`.gitignore` bỏ qua 116 log trong evidence BE08. Đóng gói bằng đường dẫn explicit
và force-add thư mục evidence để không thiếu các file đã được manifest liệt kê.
Kiểm tra hash của từng blob trong index trước commit; giữ nguyên evidence lịch sử.
Bổ sung thuộc tính `whitespace=cr-at-eol` cho bản trích DOCX nguyên byte: Git
nhận CRLF là kết thúc dòng, không sửa nội dung hay checksum tài liệu. Đây là
thay đổi đóng gói sau test, không đổi source runtime hoặc dependency benchmark.
Metadata worktree dùng đường dẫn Windows: review bằng Git Linux với git-dir/work-tree
explicit và core.autocrlf=true, không sửa metadata hoặc checkout khác.

## Validation

[Lượt chức năng mới](functional/report.json) PASS: typecheck/build, 135 unit,
70 PostgreSQL/API, BE01 SQL, 142 contract/invariant, real Anvil BE07 reorg,
rollback/replay, restart/SIGKILL, gate/cursor và fresh rebuild/compare.
Source không đổi trong lượt chạy; PostgreSQL/Anvil và tài nguyên tạm cleanup PASS.
Lượt đầu dừng ở bước setup vì thiếu đường dẫn thư viện PostgreSQL trong môi trường;
giữ nguyên [báo cáo lỗi](setup-library-failure/report.json), không tính thành PASS.

Không đo lại benchmark vì toàn bộ dependency vẫn khớp lần chạy cuối đã lưu.
Tính độc lập từ raw samples: 38.159 request, 0 lỗi, p95=19,450186 ms;
mọi endpoint p95<1000 ms; 20/20 sample freshness<30000 ms, max=6593,748702 ms.
[Raw performance](../be08-20261027/run-4-final/benchmark.json).

CI remote BE08 chưa chạy tại thời điểm commit. UI/wallet/testnet và peer approval
không được nhận là đã đạt bởi các kiểm tra local này.
