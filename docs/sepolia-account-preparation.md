# SC10 — chuẩn bị tài khoản offline cho TV4

**ACCOUNT PREPARATION TOOLKIT READY — TV4 LOCAL EXECUTION PENDING.**
Không deployment authorization, không funding/signing/broadcast. Owner/operator
@dung0611 đã [nhận trách nhiệm và preparation source](https://github.com/SE2026-21-1/dao-budget-simulator/issues/20#issuecomment-7240590072);
điều đó không tự xác nhận custody của sáu signer hoặc nguồn native ETH.

## Phạm vi và source

Deployment source giữ nguyên **e17ef61a8a51518005c38b0808cdc06fe7a68bbf**,
Sepolia11155111/PublicNode/K2. Toolkit commit không là approved deployment source.
[Runbook deployment đã review tại pin](https://github.com/SE2026-21-1/dao-budget-simulator/blob/e17ef61a8a51518005c38b0808cdc06fe7a68bbf/docs/sepolia-deployment.md).

Đã tìm và reuse Foundry `cast wallet new`, ethers6.17.0 V3 keystore decryption,
`validateRoleMap` và `keystoreSigners`. TV4 đã có
[hướng dẫn tạo ví chuẩn](https://github.com/SE2026-21-1/dao-budget-simulator/blob/261ffa9c33098e92edda3215ac10a3f04c42b895/docs/sepolia-deployment.md).
Phần bổ sung ở đây chỉ reserve layout ngoài Git, xuất public map/bundle và
validate offline bằng chính loader gốc. Không thêm generator, cryptography,
dependency hoặc thay đổi source deployment/security guards.

## Account map và custody

Map đúng **năm top-level fields**, không thêm secret/config khác:

| Field | Type/value |
|---|---|
| format | string `dao-budget-sepolia-accounts-v1` |
| chainId | string `11155111`, không JSON number |
| approvedSourceCommit | full SHA e17ef61a8a51518005c38b0808cdc06fe7a68bbf |
| signerOwner | tên/GitHub người chịu trách nhiệm bundle, không tự chứng minh custody |
| accounts | object chứa đúng 9 keys bên dưới, Ethereum addresses distinct/nonzero |

[Template chưa hợp lệ để triển khai](examples/sepolia-accounts.template.json)
cố ý có null owner/addresses; không phải map thực, không dùng Anvil addresses.
Parser gốc chỉ yêu cầu owner là nonempty string; toolkit bổ sung trimmed text,
không control chars, tối đa128 UTF-16 code units để tránh log/control injection.

| Exact key | Chức năng | Bootstrap signer | Private storage |
|---|---|---|---|
| A | voter400 GOV, delegation | Có | bootstrap/A |
| B | voter300 GOV, delegation | Có | bootstrap/B |
| C | voter200 GOV, delegation | Có | bootstrap/C |
| D | voter100 GOV, delegation | Có | bootstrap/D |
| funding | BUD initial holder20.000, seed Treasury10.000 | Có | bootstrap/funding |
| deployer | deploy, grant/audit/renounce | Có | bootstrap/deployer |
| caller | permissionless queue/execute demo | Không | demo/caller |
| recipient | nhận BUD, không ký trong bootstrap | Không | demo/recipient |
| outsider | actor trái quyền; không ký trong bootstrap | Không | demo/outsider |

`funding` không mặc nhiên là native ETH funder. Recipient không cần gửi tx chỉ
để nhận BUD. Outsider key chỉ cần nếu campaign âm thực sự yêu cầu giao dịch từ
outsider; chỉ đọc/simulate và actual reverting tx khác scope/gas/authorization.
Caller key đã lưu/decrypt được không có nghĩa demo transaction signing đã duyệt.
Không đưa caller/recipient/outsider vào six-entry deployment bundle.

Workflow đơn giản này dành cho **một custodian tự chọn giữ sáu bootstrap keys**,
một password mạnh chung cho bundle bootstrap và password riêng cho demo bundle.
Chỉ tiếp tục nếu người đó đồng ý custody/exclusive-use. Không mặc định owner,
operator hay TV2 đang giữ keys. Nếu nhóm cần custody phân tán/password riêng từng
role, dừng và phối hợp TV4: loader gốc hỗ trợ FD riêng nhưng toolkit này không
chứng minh workflow phân tán/hardware/MetaMask; không sửa config để giả readiness.

## 1. Môi trường riêng của TV4

Chạy trên trusted local **Bash terminal riêng**, không terminal agent/CI,
screen recording/sharing, `set -x`, `tee`, shell tracing hoặc clipboard automation.
Node24.15.0, Foundry1.8.5, git và locked ethers6.17.0. Dùng checkout toolkit riêng:

```bash
git fetch origin tv1/sc10-sepolia-account-preparation
git worktree add --detach "$HOME/dao-sc10-account-toolkit" origin/tv1/sc10-sepolia-account-preparation
cd "$HOME/dao-sc10-account-toolkit"
nvm use
npm ci
node scripts/prepare_sepolia_accounts.mjs --help
node scripts/validate_sepolia_accounts.mjs --help
```

Network nếu chạy npm ci/git fetch chỉ là tải source/dependencies, trước workflow
offline; không RPC. Check origin/peer-approved toolkit SHA trước sử dụng. Không
chạy deployment từ toolkit checkout. Không cần forge build/submodules để chuẩn bị
tài khoản. CLI kiểm bytes của10 reviewed modules bằng `git show e17ef61:...` trước
dùng parser/loader; clone phải có commit đó. Source mismatch thì fail closed.

Linux/WSL: giữ private directory trong Linux `$HOME` trên ext4 VHD; tránh `/mnt/c`,
OneDrive/Windows folders, NFS/CIFS/9p. CLI từ chối native Windows/macOS và unsupported
filesystems; **không** coi chmod là chứng nhận NTFS ACL. POSIX owner/mode checks
không phát hiện mọi ACL/backup/malware/same-user attack; dùng máy tin cậy và không
chạy hai process hoặc sửa thư mục trong workflow. Linux-supported filesystem
types: ext4, tmpfs, overlayfs, btrfs, xfs.

## 2. Reserve layout và tự tạo 9 encrypted keystores

Các lệnh dưới đây chỉ TV4/custodian trực tiếp chạy. Mật khẩu mạnh, độc nhất cho
campaign; không dùng ví có mainnet assets, password mặc định hoặc hạ KDF.
Không chạy pathless `cast wallet new` vì chế độ đó in plaintext key.

```bash
set -euo pipefail
umask 077
install -d -m 700 "$HOME/.local/share/dao-budget-private"
PRIVATE_SET="$HOME/.local/share/dao-budget-private/sc10-sepolia-20261128"
APPROVED_SOURCE=e17ef61a8a51518005c38b0808cdc06fe7a68bbf
read -r -p 'Tên custodian chịu trách nhiệm bundle: ' SIGNER_OWNER </dev/tty
read -r -p 'Gõ CREATE TESTNET WALLETS để tự tạo 9 ví mới: ' confirmation </dev/tty
test "$confirmation" = 'CREATE TESTNET WALLETS'
node scripts/prepare_sepolia_accounts.mjs init \
  --directory "$PRIVATE_SET" --approved-source "$APPROVED_SOURCE" --signer-owner "$SIGNER_OWNER"
unset CAST_PASSWORD ETH_PASSWORD
for role in A B C D funding deployer; do
  cast wallet new "$PRIVATE_SET/bootstrap" "$role"
  chmod 600 "$PRIVATE_SET/bootstrap/$role"
done
for role in caller recipient outsider; do
  cast wallet new "$PRIVATE_SET/demo" "$role"
  chmod 600 "$PRIVATE_SET/demo/$role"
done
node scripts/prepare_sepolia_accounts.mjs export \
  --directory "$PRIVATE_SET" --approved-source "$APPROVED_SOURCE" --signer-owner "$SIGNER_OWNER"
```

`cast` hỏi password bằng hidden prompt: dùng cùng password bootstrap cho sáu file
đầu, password demo riêng cho ba file sau. Không `--unsafe-password`, `--force`,
password argv/env, plaintext key export hoặc sửa crypto/KDF parameters. Công cụ
metadata không tạo/mã hóa keys và không certify password entropy/KDF strength;
KDF bounds trong validator phục vụ format/resource safety, không là security
grade. Generation dùng mặc định của pinned standard tool, không fast settings.

`init` tạo thư mục mới0700, không overwrite; `export` chỉ đọc keystore metadata và
xuất `accounts.json`, `keystores.json`, `PREPARED.json`0600. Status lúc này là
**EXPORTED_NOT_UNLOCK_VALIDATED**, chưa custody/deployment PASS. Public map chỉ
chứa public fields. `keystores.json` có đúng deployer/funding/A/B/C/D, mỗi entry
`{path: absolute-bootstrap-file, passwordFd: 3}`. Demo files giữ riêng, không upload.

Nếu bị ngắt hoặc bất kỳ lỗi nào: dừng, giữ nguyên mọi encrypted file đã tạo, không
rerun init/export đè hoặc ghép map cũ. Không tự xóa keys. Thiếu/extra role, file
không0600, symlink/hardlink, parent không0700 hoặc unsafe path đều fail. Partial
metadata export có thể còn một số file; toolkit không tự resume/repair. Custodian
kiểm tra riêng, chọn bộ mới hoặc nhờ TV4 reconcile trước tiếp tục. Không claim đủ9
khi thiếu role. Thực hiện backup encrypted keystores/password bằng kênh riêng an
toàn; không lưu password plaintext cùng bundle hoặc trong Git.

## 3. Unlock/address validation offline bằng loader đã review

Nhập lại password trong terminal riêng; shell variables chỉ nằm trong memory,
đưa qua inherited pipes FD3/4, không argv/env/history/file plaintext:

```bash
(
trap 'unset bootstrap_password demo_password' EXIT
IFS= read -r -s -p 'Bootstrap keystore password: ' bootstrap_password </dev/tty
printf '\n' >/dev/tty
IFS= read -r -s -p 'Demo keystore password: ' demo_password </dev/tty
printf '\n' >/dev/tty
if node scripts/validate_sepolia_accounts.mjs \
  --directory "$PRIVATE_SET" --approved-source "$APPROVED_SOURCE" --signer-owner "$SIGNER_OWNER" \
  --password-fd 3 --demo-password-fd 4 \
  3< <(printf '%s' "$bootstrap_password") 4< <(printf '%s' "$demo_password"); then
  unset bootstrap_password demo_password
else
  unset bootstrap_password demo_password
  printf 'STOP: giữ nguyên bộ ví và kiểm tra riêng; không overwrite/resend.\n' >&2
  exit 1
fi
)
```

Không paste password/keystore/key qua agent. FD>=3 đúng contract loader gốc;
loader đọc `/proc/self/fd/N` và cache password cho sáu bootstrap entries. CLI không
gọi signing function loader trả về. Ba demo stores được decrypt/address-check
bằng ethers, không ký. Output chỉ public addresses/safe status:
`OFFLINE_KEYSTORE_COMPATIBILITY_PASS_NOT_AUTHORIZED`.

Wrong password, crypto-key/public-address mismatch hoặc source/map/config mismatch
đều exit nonzero, stderr sanitized. Password/wallet strings tồn tại trong process
memory khi decrypt; JavaScript không bảo đảm zeroization/không swap/core dump.
Xác nhận trusted host, backup và exclusive use riêng; validation không chứng minh
con người nào giữ keys. Trước deployment thật, **fresh validation/preflight lại**
trên approved source và public packet đã chốt; không reuse evidence cũ thay checks.

## 4. Chỉ bàn giao public information

TV4 gửi cho TV1/TV2:

1. Chỉ `accounts.json` và9 public addresses, full source/chain binding.
2. Tên custodian từng bootstrap role, xác nhận đã giữ key, backup và exclusive-use.
3. Sanitized validation PASS, bootstrap six-entry readiness; không gửi config paths
   nếu không cần, encrypted keystore files, passwords, seeds, keys hoặc raw signed tx.
4. Caller custody/key readiness riêng; actual demo signing path còn phải được TV4
   review/authorize. Recipient/outsider custody và nhu cầu dùng key tách riêng.
5. Native ETH funder/source và status thực biết được; UNKNOWN nếu chưa có evidence.

Không tự coi toolkit PASS là actual custody confirmation hoặc ví đã funded.

## 5. Gates còn lại của Issue20

TV2 @daongocuong phối hợp owner @dung0611 xác định **native Sepolia ETH funder**.
Sau actual public map và quyền read-only riêng mới kiểm balances, pending/latest
nonces tại canonical H/hash, actual-map gas estimates và per-sender headroom,
fee cap, budget/funder. Không tự chia ETH theo synthetic estimates cũ.

0,12 Sepolia ETH (0,10 bootstrap +0,02 demo/reserve), gas-price cap1gwei vẫn chỉ
planning envelope. Chưa final budget, funded balance hoặc tx authorization. Current
deployment CLI dùng legacy type0 gasPrice. Giới hạn gas hiện hành/constructor phải
được TV1/TV4 đối chiếu với actual-map preflight, không lấy toolkit/keystore PASS
hoặc historical synthetic estimate làm admission/deployment proof.

**User và deployment owner phải cấp explicit final authorization riêng** gắn
source/map checksum/chain/RPC/K/scope/budget trước ký, funding hoặc broadcast.
Issue20 vẫn OPEN/BLOCKED/live testnet SKIP. Không mở lại security campaign đã
accepted khi source không đổi; không chạy full Foundry/BE09/MetaMask/Issues40/42.

## Kiểm thử và evidence

```bash
node --check scripts/sepolia_account_preparation.mjs
node --check scripts/prepare_sepolia_accounts.mjs
node --check scripts/validate_sepolia_accounts.mjs
node --test tests/sepolia-account-preparation.test.mjs
```

Focused tests dùng9 ephemeral wallets, V3 encrypted JSON với default ethers KDF;
không commit keystores. Chạy trực tiếp parser/loader có bytes khớp10 files tại
exact pin e17ef61; không gọi deploy entrypoint/signing closure. Child test guard
chặn network và signing methods. Kết quả/lệnh/exit codes/source hashes và limitations
được lưu ở [evidence](evidence/sc10-account-preparation-20261128/README.md).
Cast help1.8.5 xác nhận syntax directory/account-name và hidden prompt default;
interactive generation trong terminal agent chưa kiểm chứng, phải TV4 xác nhận
ở terminal riêng. Không đổi việc đó thành PASS từ tests ethers.
