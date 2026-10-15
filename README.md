# dao-budget-simulator

## Môi trường Foundry — TV4 Operation

Cấu hình, thư viện và dữ liệu tích hợp SC01 được đồng bộ từ nhánh `feature/tv1-sc01`,
commit `9a406fedfbac6c54237712a536b0700fdad9bb73`. Interface `ITreasury`, ABI chia sẻ,
fixture tổng hợp và script kiểm tra fixture được giữ làm chuẩn tích hợp.
Test selector TV1 đã được thay bằng bộ kiểm tra tương thích ABI dành cho TV4;
chưa có triển khai Treasury, voting hoặc timelock.

| Thành phần | Phiên bản |
| --- | --- |
| Foundry (`forge`, `cast`, `anvil`) | 1.8.5 |
| Solidity | 0.8.37 |
| OpenZeppelin Contracts | 5.4.0 |
| forge-std | 1.17.0 |
| EVM local | osaka |
| Optimizer | bật, 200 runs |

Dependency được khóa bằng Git submodule và `foundry.lock`. Cài Foundry 1.8.5
theo [hướng dẫn Foundry](https://getfoundry.sh/introduction/installation), rồi chạy:

```bash
git clone --branch feature/tv4-operation https://github.com/SE2026-21-1/dao-budget-simulator.git
cd dao-budget-simulator
git submodule update --init --recursive
forge --version
cast --version
anvil --version
forge build
forge test -vv
python3 scripts/check_sc01.py
forge fmt --check
```

Lần build đầu có mã Solidity cần mạng để tải compiler 0.8.37 nếu chưa có.
Foundry tìm contract trong `contracts/`, test trong `tests/` và thư viện trong
`lib/`. Remapping `forge-std/` và `@openzeppelin/contracts/` đã có trong
`foundry.toml`. Script kiểm tra ABI/fixture cần Python 3, không cần package bổ sung.
Bộ test `tests/unit/OperationAbiCompatibility.t.sol` gồm:

- `testFuzzDisbursementPayloadMatchesClientAbi`: đối chiếu calldata do interface
  tạo với ABI công khai cho requestId, địa chỉ nhận và số lượng được fuzz.
- `testBudgetDisbursedTopicMatchesIndexerAbi`: cố định topic0 của sự kiện
  `BudgetDisbursed` để phát hiện thay đổi làm mất tương thích với indexer.

Script Python đối chiếu ABI compiler, calldata, descriptionHash và proposalId.
Fixture là dữ liệu tổng hợp, không phải receipt on-chain. Các kiểm tra này chưa
chứng minh phân quyền Treasury, chống giải ngân lặp hay luồng DAO end-to-end.

Cấu hình `osaka` chỉ được xác minh bằng thực thi EVM local; cần kiểm tra hỗ trợ
của testnet trước khi deploy. Không commit private key hoặc RPC secret:
`.env`, `.env.*`, `out/`, `cache/` và `broadcast/` được bỏ qua; `.env.example`
được phép đưa vào Git.