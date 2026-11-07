# BE09 local PASS — 2026-11-06 11:10 UTC

Lượt verify của TV2 trên run `20261106T105820Z-262c5151e980` trả **PASS**.
Gói này không xác nhận testnet, browser/extension-wallet, review của TV3/TV4
hoặc CI. Manifest là lịch sử của chain local, không phải thông tin testnet hay
bằng chứng service sẽ luôn hoạt động.

- SHA nền và HEAD khi verify: `681289bb1f11db87bdfcb15c6b28d1d995229835`.
  Các script `scripts/be09-*` là file local chưa được Git theo dõi; SHA nền
  không chứa chúng. Không có diff tracked/staged tại thời điểm verify theo
  `results.json`. Frontend TV3 tại SHA nền là code đã có, không phải patch BE09.
- Chain `31337`; deployment name `be09-local-20261106T105820Z-3225088c3bdc`;
  proposal `85033959057062009095055709644487027886063896898440812188508422353819508755887`.
- H=24; hash `0x9a23133c9f90387329db7483c90055843e24bbbce8af15248ff0ded44204fa6a`;
  snapshot revision `ae00bfe8-550e-41a0-9013-292d618f3982`.
- Sáu endpoint GET có HTTP 200; đối soát API/contract tại H/hash, preflight
  CORS 204, restart worker và digest database không đổi đều PASS. Vitest chạy
  1 test, 1 pass, 0 skip. Chi tiết và giới hạn nằm trong file gốc bên dưới.

## Nội dung

| File | Nguồn và ý nghĩa |
| --- | --- |
| [verify-report.md](verify-report.md), [results.json](results.json) | Bản sao report/result gốc; `results.json` chứa HTTP status từng endpoint, kết quả đối soát, CORS, checkpoint/digest sau restart và hashes worktree. Các đường dẫn tuyệt đối trong đó là vị trí gốc trên host. |
| [frontend-api-live-test.txt](frontend-api-live-test.txt), [Vitest JSON](frontend-api-live-test.vitest.json) | Log gốc được đổi đuôi `.txt` để không bị `.gitignore` loại và kết quả có cấu trúc của cùng lượt verify. |
| [manifest.json](manifest.json) | Manifest công khai của chain local đã kiểm; giữ nguyên deployment block, ABI và receipt. |
| [api-responses-after-verify.json](api-responses-after-verify.json) | Sáu GET bổ sung lúc 11:13:58 UTC sau verify, cùng H/hash/revision được yêu cầu; không phải response body đã được verify lưu lúc 11:10. Health ở lần chụp bổ sung là `ready`, `synced`, nhưng `degraded` với 16 unknown topic và 0 decode error. |
| [SHA256-verified-scripts.txt](SHA256-verified-scripts.txt) | Checksum sáu script tại thời điểm verify, đối chiếu với `worktree.sha256` trong results. |
| [SHA256-current-scripts.txt](SHA256-current-scripts.txt) | Checksum khi đóng gói, sau thay đổi preflight được mô tả bên dưới. |
| [SHA256-evidence.txt](SHA256-evidence.txt) | Checksum của report, results, Vitest, manifest và response được lưu trong gói; chạy `sha256sum -c SHA256-evidence.txt` từ thư mục này. |
| [issue-40-draft.md](issue-40-draft.md), [issue-41-checklist.md](issue-41-checklist.md) | Bản nháp trong repository, chưa gửi lên GitHub. |

Sau verify, `scripts/be09-local.sh` được sửa **một dòng preflight** để cho phép
file untracked `docs/be09.md` được yêu cầu cho bàn giao; nếu không, chính file
tài liệu đó khiến `verify`/`up` từ chối chạy. Thay đổi này chưa có kết quả full
verify, nên checksum hiện tại khác checksum của script được kiểm; năm script
còn lại khớp. Không dùng bảng checksum hiện tại để viết lại bằng chứng 11:10.
Các file tài liệu và evidence mới cũng được tạo sau verify.

Các lần `BLOCKED` và evidence thất bại trước đó được giữ trên host tại run
directory cũ và workspace `docs/evidence/be09-20261106/`; gói review này không
chứa đầy đủ log cũ và không thay trạng thái lịch sử của chúng.

## Rà soát khi đóng gói

Git không có diff tracked hay staged; `docs/be09.md`, gói này, evidence BE09
cũ và sáu script BE09 là untracked. Đã so khớp năm script không thay đổi với
hash lúc verify, kiểm hash hiện tại của cả sáu script, kiểm liên kết Markdown,
chạy `bash -n` và preflight source/toolchain sau thay đổi một dòng. Đã rà nội
dung file untracked để tìm cursor secret đang dùng, URL có credential và mẫu
private key/secret; không có kết quả khớp. Đây là kiểm tra chọn lọc, không là
chứng nhận bảo mật tổng quát. Không copy runtime env, database hay cache.
