# Sepolia — chuẩn bị chung và điều kiện triển khai

## Trạng thái TV4 ngày 24/11/2026

Mạng đã chốt tại #20: Sepolia, chainId **11155111**, RPC public
`https://ethereum-sepolia-rpc.publicnode.com`, **K=2**. Lượt này không được cấp
quyền broadcast và không gửi giao dịch. Bỏ rollout SSH trong #60/#56 là bỏ đường
triển khai server ứng dụng, **không** bỏ triển khai smart contract lên Sepolia.

Dev `6766e5ee2d8c466542687cbeb09677c4d11e5463` chưa có các helper remote. Candidate
TV4 tái tạo riêng sáu file chung deploy/check-roles/signing/preflight/CLI/test từ
source đã review `94d5367c8d60326b9b9f7de09265be531743f3b8`, không nhập ancestry,
file hoặc nội dung personal/individual/VT-063/VT-064 của #21/#55.
Hash/provenance và tests local mới được ghi riêng; approval lịch sử không tự
thành approval candidate mới. Guard local loopback/unforked31337 giữ nguyên.

**Delta review hiện hành:** TV1 xác nhận receipt-binding đã sửa ở `9e121c5`,
nhưng [finding submission identity Medium](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#discussion_r4667841738)
vẫn chặn merge: hash trả về từ broadcast có thể trỏ tới delegation thay vì funding.
Candidate tính `keccak256(signedRaw)` tại máy ký, fsync identity trước send và
đối chiếu response trước K2. [Ma trận, lệnh và giới hạn mới](evidence/tv4-20261124-submission-identity.md)
tách khỏi [bằng chứng receipt-binding trước đó](evidence/tv4-20261123-sepolia-receipt-fix.json).
TV1 phải re-review; không tự dismiss request-changes hoặc coi đây là quyền broadcast.


## Kiểm tra không cần signer

Node **24.15.0**, Foundry **1.8.5**, Solidity **0.8.37**, Osaka, optimizer 200,
dependency đệ quy và lockfile của checkout:

```bash
nvm use
npm ci
git submodule update --init --recursive
forge build
mkdir -p reports
node scripts/check_sepolia_readonly.mjs --output reports/sepolia-readonly-new.json
```

Output phải mới. Script chỉ gọi chainId, blockNumber, getBlockByNumber và eth_call;
không có khóa, ký, impersonation hoặc giao dịch. Kiểm artifacts với source/compiler/
dependency pins, probe CLZ(1) tại head−2 rồi đọc lại hash và chainId.
`READ_ONLY_PREFLIGHT_PASS` chỉ là năng lực RPC/Osaka và provenance local, **không**
là deployment/testnet PASS hay đủ gas budget. Không dùng địa chỉ Anvil cho Sepolia.

## Đường remote chung đã chuẩn bị

- `governance_sepolia.mjs`: network/genesis cố định; map public gắn full SHA;
  sáu encrypted keystores khớp sender, password từ FD>=3, không nhận raw key;
  estimate hiện hành +20% gas headroom, block gas/fee/cumulative-budget/balance
  và pending/latest/expected nonce gates cho **mỗi** transaction.
- `sepolia_cli.mjs`: từ chối output cũ, journal fsync/atomic rename trước/sau send.
  `SIGNED` giữ hash tính từ signed bytes trước broadcast; khi response mất/sai,
  trạng thái này **không chứng minh chưa gửi**. Đối chiếu hash/sender/nonce/chain
  với custodian; không tự resend/resume, không lưu raw signed bytes hoặc secret.
- `deploy_sepolia.mjs`: explicit chain/source approval, từ chối tracked source
  dirty, grant→audit→renounce→audit→delegate→audit→fund→audit; K2 canonical receipt.
- `check_roles_sepolia.mjs`: read-only source/constructor/runtime/ABI/admin/history
  và operation audit tại confirmed H và tip, không bỏ qua khoảng K2.
- `preflight_sepolia.mjs --accounts - --output <new-report>`: optional synthetic
  read-only remote estimate + **owned disposable fork**, không signer/broadcast.
  Fork và state overrides không phải bằng chứng deployment testnet.
- `node --test tests/smoke/sepolia.test.mjs`: role-map/network/K2/nonce/signing/
  journal và fail-closed bootstrap trên chain **synthetic**, không gọi là Sepolia PASS.

Chuỗi identity: **signed raw bytes → keccak256 → journal SIGNED → broadcast
response cùng hash → SUBMITTED → hai canonical receipt reads → CONFIRMED_K2**.
Hash response hợp lệ khác hoa/thường được chuẩn hóa về lowercase; hash sai
đối tượng/sai độ dài/null hoặc response mất đều dừng, không dùng response đó để
chọn receipt. Đây là transaction hash, không phải descriptionHash/proposalId;
không normalize lại description, không đổi hash contract/frontend/backend.

Gate K2 tiếp tục yêu cầu hai receipt cùng transaction hash, block number/hash/index
khớp và `canonical.transactions[index]` đúng identity. Mismatch receipt giữ
`SUBMITTED`; mismatch/mất response broadcast giữ `SIGNED` cùng hash local.
Manifest chuyển `FAIL_STOP_NO_AUTOMATIC_RETRY`, không ghi receipt funding/K2.
Hai regression tách biệt giữ actual funding ở head với **0 descendants**:
receipt delegation bị thay và response submission delegation bị thay.
K/nonce/gas/role/source guards không bị nới.


Sau khi toàn checklist bên dưới được owner xác nhận công khai và TV1 review,
operator giữ file ngoài Git, mode0600: public accounts map
(`format=dao-budget-sepolia-accounts-v1`, `chainId=11155111`,
`approvedSourceCommit`, `signerOwner`, chín `accounts`) và sáu keystore entries
A/B/C/D/funding/deployer, mỗi entry có `path` và inherited `passwordFd>=3`.
Không đặt password trong argv/env. Chỉ tại terminal owner được cấp quyền:

```bash
node scripts/deploy_sepolia.mjs \
  --accounts "$ACCOUNTS" --keystores "$KEYSTORES" --output "$NEW_MANIFEST" \
  --approve-chain 11155111 --approve-source "$APPROVED_SHA" \
  --max-fee-wei "$APPROVED_FEE_CAP" --max-total-cost-wei "$APPROVED_TOTAL_BUDGET"
node scripts/check_roles_sepolia.mjs --manifest "$NEW_MANIFEST"
```

Không chạy hai deploy process hoặc dùng signer cho giao dịch khác trong campaign.
Không retry journal lỗi: đối chiếu sender/nonce/chain/receipt với custodian trước.
Partial renounce không có general recovery guarantee; có thể phải redeploy.

## Checklist công khai trước khi gửi (#20)

Owner được nhóm chỉ định, do TV2 `@daongocuong` phối hợp xác định, cần ghi quyết định:

- [ ] Full SHA được chọn và review; compiler/artifact/ABI hashes cùng checkout.
- [ ] Chín địa chỉ khác nhau A/B/C/D/funding/deployer/caller/recipient/outsider.
- [ ] Custodian từng signer A/B/C/D/funding/deployer, custody an toàn và xác nhận
      exclusive-use trong lượt deployment.
- [ ] Đường remote chung đã triển khai và review: signer bảo vệ, chainId guard,
      receipt canonical K2, journal bền vững, nonce pending/latest/expected,
      dừng và reconcile khi send mơ hồ; không tự resend.
- [ ] Native balances tại H/hash, estimates theo map thật, headroom, fee cap từng
      transaction, tổng native budget bằng số và người nạp gas.
- [ ] Explicit broadcast authorization gắn đúng SHA/map/chain/budget.

Không yêu cầu hoặc công khai private key, seed, keystore, password, token hay
RPC secret. Quyền xử lý repository không phải quyền tiêu gas của signer.
TV1 `@nvdungmim` review remote path và role audit; TV4 giữ nghiệm thu/evidence.

## Bằng chứng sau khi được cấp quyền và triển khai

Giữ một manifest public: SHA, chain/genesis, năm địa chỉ và creation block/txHash,
compiler/ABI/runtime hashes, K2, cấu hình và public actor map. Audit constructors,
links, runtime, role-admin graph và toàn bộ grant/revoke/renounce/operation history
**trước renounce**, trước funding và sau seed. Final authority: Timelock giữ
Treasury admin/spender; Governor giữ proposer/executor/canceller; Timelock self-admin.
Không có operation bootstrap tồn đọng hoặc executor zero mở.

Trên cùng deployment, chứng minh một proposal **Executed** (A+B=700 For, chi
1000 BUD, Treasury còn 9000 BUD) và một **Defeated** (ví dụ D=100 For, thiếu quorum).
Chờ voting delay/period/timelock bằng thời gian thật; warp/fork/local receipt không
thay thế. Nối requestId/proposalId/operationId với receipts/events/balances cùng
H/hash, rồi worker/API/UI.

## Kết luận

Probe không signer và helper remote chung đã chuẩn bị. Deployment/nghiệm thu #20
vẫn **BLOCKED** khi owner checklist và peer review candidate chưa đủ.
SSH/OpenStack ngoài scope: không provision VM/apply Terraform hoặc sửa hạ tầng chung.

