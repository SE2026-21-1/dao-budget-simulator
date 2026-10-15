# dao-budget-simulator

## Môi trường Foundry — TV4 Operation

Cấu hình và thư viện được đồng bộ từ nhánh `feature/tv1-sc01`, commit
`9a406fedfbac6c54237712a536b0700fdad9bb73`. Không sao chép contract, test hay
fixture nghiệp vụ SC01 sang nhánh operation.

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
forge fmt --check
```

Lần build đầu có mã Solidity cần mạng để tải compiler 0.8.37 nếu chưa có.
Foundry tìm contract trong `contracts/`, test trong `tests/` và thư viện trong
`lib/`. Remapping `forge-std/` và `@openzeppelin/contracts/` đã có trong
`foundry.toml`. Khi bổ sung test, chạy `forge test`; nhánh hiện chưa có contract
hoặc test nghiệp vụ, nên build trống không chứng minh tính đúng của ứng dụng.

Cấu hình `osaka` chỉ được xác minh bằng thực thi EVM local; cần kiểm tra hỗ trợ
của testnet trước khi deploy. Không commit private key hoặc RPC secret:
`.env`, `.env.*`, `out/`, `cache/` và `broadcast/` được bỏ qua; `.env.example`
được phép đưa vào Git.