# BE08 — Sửa CI PostgreSQL service, 30/10/2026

Push đầu `d6fbd19` tạo nhánh feature/tv2-be08. CI BE08 [run40993175782](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/40993175782)
FAIL ở bước identity trước các test: client kết nối 127.0.0.1:5432 nhưng
`inet_server_addr()` của PostgreSQL container là 172.18.0.2. Kết quả local trước
đó vẫn PASS với native cluster và service native; không đại diện Docker forwarding.

Runner và benchmark dùng chung kiểm tra client socket thật: peer phải numeric
loopback, port phải đúng cấu hình, server phải PostgreSQL18.4. Native cluster
do runner sở hữu vẫn bắt buộc đúng data_directory và server binding riêng.
Kiểm tra role/DB/owner, DB rỗng và opt-in test service được giữ nguyên.

Thêm ba regression test: forwarded server address/port; từ chối peer/port/version
sai; native directory/server binding phải khớp. Hai test phép đo cũ vẫn chạy.
Source benchmark thay đổi nên số đo ngày27/10 là evidence source cũ; CI mới sẽ
đo lại đủ 100 proposals/1000 votes, 10 client và freshness, không tái dùng p95 cũ.
Kết quả CI của bản sửa chưa có tại thời điểm commit này.
