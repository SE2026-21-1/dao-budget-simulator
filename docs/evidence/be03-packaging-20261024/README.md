# BE03 — kiểm tra candidate trước commit/PR

Bước đóng gói giữ nguyên kết quả và bytes của các evidence bundle trước.
Nguồn nghiệm thu hiện tại là
[report tích hợp](../be03-integration-20261024/report.md) và
[verification tích hợp](../be03-integration-20261024/verification.json):
raw/checkpoint PASS tại H=32/head=34; 14 business log decode đúng, 16 bootstrap
log vẫn unknown_topic; CLI exit 2 / DECODE_INCOMPLETE. Hai bundle lịch sử BLOCKED
được giữ nguyên, không viết lại thành PASS.

Kiểm tra đóng gói ghi ở [verification.json](verification.json). Source đã chạy
integration khớp candidate, ngoại trừ comment registry được sửa để phân biệt
local acceptance với pending SC06/TV1/TV4 handoff. AST sau khi bỏ comment giống
hệt; ABI fragments, CLI exit codes, storage/syncer và helper deploy không thay
đổi. Test/config/package hashes khớp các lần kiểm đã lưu. Có thể chạy lại phép
ràng buộc này từ root bằng `node docs/evidence/be03-packaging-20261024/verify-candidate.mjs`.

Đã chạy lại build/typecheck trên candidate cuối: exit 0/0, không có stdout hoặc
stderr. Tái sử dụng BE03/decoder 47/47, PostgreSQL 16/16, provenance guard 4/4;
không gọi các test này là phép chạy mới trong bước đóng gói. Đây là test PASS,
khác với CLI thật đã trả exit 2 do raw unknown còn được giữ.

README trỏ tới evidence mới; tài liệu gắn nhãn đoạn BLOCKED cũ là lịch sử.
Không đổi marker `awaiting-sc06` vì peer review/bàn giao vẫn chờ.

Staging chỉ chứa source/test/migration/config/docs/evidence BE03 cùng sửa
VoteCastWithParams và provenance. Source/docs được stage với LF; bytes working
tree CRLF được giữ nguyên. So sánh normalized SHA-256 của index/working tree
ràng buộc cùng nội dung, không thêm thay đổi line endings vào các file ngoài
scope. `.gitattributes` chỉ giữ nguyên bytes của bốn bundle BE03; raw terminal/
server `.txt` giữ cả whitespace gốc để checksum đúng, các source/script/JSON/
Markdown tiếp tục được kiểm whitespace.

Không đưa out/, cache/, dist/, node_modules/, binary, tarball, cluster PostgreSQL
hoặc helper tạm vào commit. Các file ngoài scope được giữ và kiểm SHA-256 sau
đóng gói. Không sửa contract/thư viện hoặc warnings.

TV1 còn xác nhận ABI/semantics và receipt WithParams; TV4 còn xác nhận manifest,
Osaka/toolchain, K=2 và chính sách raw unknown/checkpoint/crash recovery trước
bàn giao. PR phải giữ draft. Chưa làm BE04, chưa merge/ready và không đóng #18.
