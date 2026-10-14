# Kiểm tra SC01 — 14/10/2026

- `forge build`: thành công, Solidity 0.8.37.
- `forge test --match-path tests/unit/ITreasury.t.sol -vv`: 1 passed, 0 failed.
- `python3 scripts/check_sc01.py`: ABI compiler khớp ABI chia sẻ; calldata, descriptionHash và proposalId khớp fixture.
- `forge fmt --check` và `git diff --check`: đạt.
- Build và unit test cũng chạy thành công với out/cache mới trong thư mục tạm, chế độ offline.

Kiểm tra dùng dependency và compiler đã cài, không phải clone sạch trên máy mới.
Không có kiểm thử Treasury/voting/timelock thực tế vì chưa triển khai SC02–SC05.
Nhóm cần xác nhận toolchain, các chuẩn dữ liệu đề xuất và khả năng clone sạch trước khi đóng SC01.
Không tạo commit hoặc push trong đợt này; PR/commit evidence bổ sung sau khi người phụ trách cho phép.
