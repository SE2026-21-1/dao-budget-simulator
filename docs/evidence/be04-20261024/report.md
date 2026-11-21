# BE04 Kết quả kiểm thử local ngày 24 tháng 10 năm 2026

BE04 đã được triển khai trên `feature/tv2-be04`, nền BE03 `4b9f060`.
Kết quả dưới đây là kiểm thử local thực chạy trong phiên triển khai, chưa có
peer review hoặc CI remote cho candidate này.

| Kiểm tra | Kết quả |
| --- | --- |
| Typecheck và build TypeScript | PASS |
| BE04 unit | 23/23 PASS, 0 skip |
| BE04 PostgreSQL và child CLI | 8/8 PASS, 0 skip |
| Hồi quy BE02/BE03 unit và CLI | 86/86 PASS |
| Hồi quy BE02 PostgreSQL | 21/21 PASS |
| Hồi quy BE03 PostgreSQL, concurrency và kill/restart | 16/16 PASS |
| Anvil mới → deploy/roles → governance → BE03 raw → BE04 projection | PASS qua 8 mốc |

Unit kiểm biên snapshot/deadline/ETA, quorum For + Abstain, kết quả hòa/thua,
description/calldata/hash nguyên bản, số lớn, zero/repeated requestId,
WithParams, zero/self/unrelated transfers, log thiếu/khác transaction/mơ hồ và
phát lại nguyên bytes của receipt BE03 cũ. Đây là kiểm thử offline, được tách
khỏi lần chạy Anvil mới.

Suite PostgreSQL kiểm transaction publication, snapshot cũ sau lỗi SQL/RPC,
độc lập raw/projection checkpoint, raw payload mâu thuẫn, event unknown và CLI
thật. Child CLI `--sync-project` vẫn exit 2 khi raw có event quản trị unknown,
trong khi `--project` exit 0 chỉ chứng minh publication thành công.

## Luồng mới trên Anvil

Script `scripts/check_be04_live.mjs` tự tạo Anvil mới, dùng deploy/role checker
của repository và một PostgreSQL database mới. Năm proposal gồm khoản chi,
proposal trùng requestId, thiếu quorum, dùng Abstain đạt quorum và hủy Pending.

| Mốc | H | Kết quả đối chiếu |
| --- | --- | --- |
| Created | 24 | 5 Pending; quorum null |
| Đúng snapshot | 28 | 4 Pending + 1 Canceled; quorum null |
| Block trống sau snapshot | 31 | 4 Active + 1 Canceled |
| Đúng deadline | 41 | Vẫn Active, 7 vote đã index |
| Block trống sau deadline | 44 | 3 Succeeded + 1 Defeated + 1 Canceled |
| Queue | 48 | 2 Queued/Waiting |
| Block trống đúng ETA | 51 | 2 Queued/Ready |
| Execute và duplicate revert | 55 | 1 Executed; proposal trùng requestId vẫn Queued/Ready |

Tại H=55, head đủ K=2: 5 proposal, 7 vote, 2 operation, 2 Transfer liên quan
Treasury và 1 disbursement. Tổng vào **10.000 BUD**, tổng ra **1.000 BUD**,
số dư **9.000 BUD**. Một lần chi không bị cộng lại từ BudgetDisbursed.
State/tally/quorum/balance/operation đều đối chiếu bằng eth_call canonical hash
tại H tương ứng. Repeat projection giữ nguyên rows và transfer IDs; raw idle
restart nhập 0 batch, giữ nguyên raw IDs/bytes/decode status.

H cuối:

```text
55
0x5be818bf8866935804e3d165e61e577b343fcdc0148e11f0e84d5fc47a6b98bb
```

16 bootstrap event vẫn có raw `unknown_topic` trong BE03, không có raw
decode_error. BE04 chỉ nhận diện chúng bằng danh sách ancillary cụ thể và kiểm
canonical encoding, không sửa raw status hoặc xóa DECODE_INCOMPLETE. Unknown
khác vẫn chặn publication.

## Môi trường và giới hạn kiểm chứng

Local thực chạy: Node 24.19.0, Forge/Anvil 1.7.1, compiler
0.8.37+commit.f401782d, EVM Osaka, optimizer 200; PostgreSQL 16.15.
Không đổi contract, library, compiler target hay loại warnings.

Namespace của runtime chỉ ánh xạ UID 0 và không cho Unix socket. Hai binary
PostgreSQL tạm chỉ được bỏ nhánh từ chối startup dưới root để chạy cluster thử
nghiệm qua TCP loopback; mã xử lý SQL/transaction không đổi. Chi tiết offsets
được ghi trong verification.json. Không đưa binary hoặc cluster vào repository.
Dùng `node --import tsx` để tránh Unix IPC của executable tsx trong môi trường
này. Đây là giới hạn của bằng chứng local; chưa khẳng định đã chạy đúng Docker
PostgreSQL 18.4/Forge 1.8.5 của CI chuẩn.

Docker không có trong runtime này. Runner Docker đã kiểm cú pháp, CI đã thêm
job unit/DB và live step nhưng chưa có CI remote. TV1/TV4 cần review và chạy lại
runner chuẩn. Chưa đo benchmark, HTTP API, production rebuild hoặc rollback reorg.

Hai lỗi phát hiện khi viết test đã được sửa: driver pg cần cast mảng domain
topics thành text[] khi đọc lại; RPC fixture phải giữ timestamp không giảm giữa
các header. Các kết quả PASS ở trên dùng source sau khi sửa.

## File bằng chứng

- [verification.json](verification.json): kết quả, môi trường, SHA256 của candidate.
- [live.json](live.json): manifest, receipts mới, từng snapshot H, đối chiếu SQL và source hashes.
- [unit.txt](unit.txt): 23 unit, có bài phát lại receipt BE03 offline.
- [postgres.txt](postgres.txt): 8 test PostgreSQL và child CLI.
- [live.txt](live.txt): phần stdout được lưu gồm ba mốc đầu; đủ tám mốc và
  kết quả cuối được ghi trong live.json.
- [typecheck.txt](typecheck.txt), [build.txt](build.txt).

Output hồi quy 86/21/16 đã được đọc trong tool results của phiên làm việc;
verification ghi số lượng và không giả nhận có file log đầy đủ riêng cho chúng.
Mã hiện tại và hướng dẫn chạy lại nằm trong repository.
