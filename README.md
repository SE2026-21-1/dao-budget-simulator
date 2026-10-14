# DAO Budget Simulator

Mô phỏng quản lý ngân sách DAO: proposal → voting → queue → timelock → giải ngân BUD.
Chỉ dùng local/testnet, không dùng tiền thật. Hiện repository mới có nền tảng SC01;
chưa có token, Treasury hoặc Governor triển khai, chưa chạy được demo end-to-end.

## Môi trường tái lập

- Foundry (forge/cast/anvil): 1.8.5.
- Solidity: 0.8.37; optimizer 200 runs; EVM local: osaka.
- OpenZeppelin Contracts: 5.4.0; forge-std: 1.17.0.
- Python 3 để kiểm tra ABI/fixture, không cần package bên ngoài.
- Dependency được khóa bằng git submodule và `foundry.lock`.

Cài Foundry đúng phiên bản theo hướng dẫn của nhóm/TV4. Sau khi clone:

```bash
git submodule update --init --recursive
forge --version
cast --version
forge build
forge test --match-path 'tests/unit/ITreasury.t.sol' -vv
python3 scripts/check_sc01.py
forge fmt --check
```

Lần build đầu cần mạng để tải compiler nếu máy chưa có Solidity 0.8.37.
Để kiểm tra toàn bộ test khi các task tiếp theo được triển khai, dùng `forge test`.
Cấu hình tìm test trong `tests/` để nhận cả unit/invariant/attacks sau này.
Không suy ra test thành công từ artifact `out/` có sẵn.

## Tài liệu và chuẩn tích hợp

- [Yêu cầu nhóm](docs/requirements/DAO_Budget_Simulator_Requirements_Nhom_4.md)
- [Phân công TV1](docs/requirements/TV1_Cong_viec_Smart_Contracts.md)
- [Giao tiếp contract và quyết định chờ review](docs/contracts.md)
- [ABI interface Treasury](shared/abi/ITreasury.json)
- [Fixture tổng hợp SC01](fixtures/sc01/disbursement-v1.json)

Fixture SC01 không phải receipt hoặc bằng chứng deployment. Receipt/log thật thuộc SC06.
TV1 phụ trách contract/unit test; TV2 indexer/API; TV3 dashboard/ví;
TV4 deploy/seed/check-roles, CI và attack/invariant/E2E. Mỗi PR cần người khác review.
Không đưa private key hoặc RPC secret vào fixture, tài liệu hay Git.
