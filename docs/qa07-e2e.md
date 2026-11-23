# QA07 — Browser → worker → API → UI trên môi trường dùng một lần

## Phạm vi và điều kiện

Runner hẹp `scripts/check_qa07_e2e.mjs` tái sử dụng deployment/receipt/lifecycle của repo, không thay product code, không thêm package script. Chạy bằng Node 24+, PostgreSQL **18.4**, Forge/Anvil **1.8.5**, production artifacts từ `forge build` (Solidity 0.8.37, Osaka, optimizer 200), submodule đúng revision. Cài dependency root/frontend bằng lockfile trước khi chạy. Cần Chrome và Playwright bên ngoài hoặc trong môi trường QA; không thay `package.json` của dự án.

**Đây là adapter EIP-1193 với tài khoản Anvil unlocked do runner sở hữu, KHÔNG phải MetaMask.** Adapter công bố tên có chữ NOT MetaMask, chỉ gửi từ tài khoản A trên chain mới 31337 và đặt gas 8.000.000. Từ chối code 4001 và `chainChanged` sai mạng là fault injection ở adapter; không được ghi thành đã kiểm thử popup/extension thật. Không sử dụng ví người dùng, ký bên ngoài, fork hay RPC/DB caller.

## Lệnh chạy duy nhất sau khi chuẩn bị xong

Ví dụ đường dẫn của workstation QA (đổi đường dẫn binary nếu cần):

```sh
export PATH=/home/ptdung/.nvm/versions/node/v24.15.0/bin:/home/ptdung/.foundry/bin:$PATH
# Dependency trình duyệt độc lập, không sửa manifest/lockfile repo:
npm install --prefix /tmp/tv4-browser-driver-20261123 --no-package-lock --no-audit --no-fund playwright@1.56.1
export QA07_PLAYWRIGHT_MODULE=/tmp/tv4-browser-driver-20261123/node_modules/playwright/index.mjs
export QA07_CHROME_BIN=/usr/bin/google-chrome
node --import tsx scripts/check_qa07_e2e.mjs \
  --postgres-bin /tmp/dao-tv4-pg18-20261123/node_modules/@embedded-postgres/linux-x64/native/bin \
  --output /tmp/qa07-e2e-evidence-NEW
```

Output phải chưa tồn tại. Runner tự tạo cluster PG trust chỉ bind numeric loopback, port tạm, schema mới, Anvil unforked, worker CLI thật, API và Vite. Không dừng process có sẵn. Chỉ cleanup child/temp do chính runner tạo; giữ evidence kể cả khi lỗi. Không chạy BE08/broad suite từ lệnh này. Chưa có package script `test:tv4:native`; không suy diễn rằng lệnh đó tồn tại.

## Chứng cứ cần kiểm tra

`report.json` chứa lệnh/env công khai, phiên bản runtime, SHA-256 source, manifest/artifact provenance, requestId/proposalId/operationId/txHash, raw receipts, SQL/API/contract balance tại cùng H/hash; `worker.stdout.log` là output CLI thật. File `*.png` và `*.txt` là screenshot + nội dung DOM thực sau từng bước, không phải dữ liệu fixture hay chèn trạng thái giao diện.

Một proposal duy nhất do form browser tạo, cùng deployment xuyên suốt:

1. Sai mạng khóa nút ký; chuyển lại qua provider adapter.
2. Từ chối signature ở adapter, không có transaction được gửi; thử lại tạo proposal.
3. Receipt confirmed nhưng K=2 chưa đủ: UI giữ tx/proposal ID, trang detail báo chưa có trong publication.
4. Mine qua snapshot; browser bỏ phiếu; mine qua deadline; browser Queue; mine qua ETA.
5. Browser Execute khoản 11.000 BUD khi Treasury chỉ có 10.000: receipt status=0, chưa paid, số dư không đổi.
6. Nạp thêm 2.000 BUD bằng tài khoản funding được sở hữu; browser retry Execute cùng proposal/request, receipt status=1.
7. Worker CLI publish; SQL disbursement, API detail/transfer, receipt và contract đọc bằng EIP-1898 canonical blockHash khớp nhau. Treasury=1.000 BUD, recipient=11.000 BUD tại H/hash này. Desktop UI hiển thị Executed, txHash và H/hash.
8. Proxy transport trì hoãn request thật để chụp loading; đóng socket để chụp error; phục hồi transport và dùng nút Thử lại. Không chế tạo API envelope.
9. Snapshot Anvil sau lifecycle; tạo nhánh funding 1 wei, lấy cursor thật. Revert và tạo nhánh funding 2 wei. Worker phát hiện reorg; proxy chỉ giữ RPC **sau khi worker đã ghi gate recovering thật** để quan sát API summary503 + cursor409 và lỗi UI. Thả RPC, worker canonical replay, cursor cũ vẫn409; UI retry phục hồi. Không sửa SQL/state product để tạo kết quả.
10. Chụp detail Executed ở 1366×900 và 390×844.

`PASS` chỉ nói về các assertion đã chạy trong report và các ảnh cần review; không đồng nghĩa nghiệm thu MetaMask, public testnet, explorer hoặc SLA BE08. Có lỗi phải giữ nguyên report/log/ảnh của lần đó, ghi rõ đã dừng ở bước nào; không đổi failed evidence thành PASS và không thu hẹp assertion để né lỗi.

## Trách nhiệm nghiệm thu

- **TV3 (vận hành):** chuẩn bị/sở hữu endpoint và signer được phép; thực hiện phần extension thật trên browser riêng: permission, reject/sign, switch/add chain, account change; lưu ảnh và txHash thực. Không yêu cầu assistant truy cập ví cá nhân.
- **TV2 reconcile:** xác nhận metadata deployment, K, SQL raw/projection, API publication cùng H/hash; đối chiếu request/proposal/operation/tx và số dư ở canonical hash. Kết quả reorg409/recovery503 phải lấy từ log/gate thật.
- **TV4 signoff:** liên kết source/artifact hashes với command/raw reports/screenshots; phân biệt PASS của local adapter với các mục extension/testnet chưa chạy; chỉ ký nghiệm thu theo bằng chứng quan sát. CI xanh không thay thế acceptance.

Kết quả thực thi và đường dẫn report của lần chạy được ghi trong bàn giao QA; runbook không coi các bước chưa chạy là đã đạt.

## Checklist TV3 dùng ví extension thật

Tạo **run mới** theo [local deploy/metadata/worker](../README.md) và
[cấu hình frontend](../frontend/README.md#chạy-local); giữ services còn sống trong
suốt thao tác. Không dùng port/address/manifest của raw archive sau teardown.
Nếu dùng receiver BE09 của TV2, giữ đúng source/run/deployment của receiver đó,
không gọi đó là source sạch hiện tại nếu chưa đối chiếu.

- [ ] TV3 lưu full SHA, tool versions, manifest SHA256, chainId và năm addresses;
      xác nhận origin/API/RPC/chain/deployment trước khi nối extension.
- [ ] Chỉ dùng signer demo disposable do TV3 kiểm soát. Nhập/thiết lập ví tại máy
      TV3; không gửi key/seed/password lên issue, log hoặc chat.
- [ ] Kiểm permission/connect, wrong network không send, switch network và account
      change; ghi extension/version và log phương thức đã redact.
- [ ] Form 11.000 BUD gửi recipient demo: reject ở popup, giữ nguyên requestId và
      title/body/recipient/amount, sau đó sign. Lưu proposalId và original bytes.
- [ ] Trước publication, receipt confirmed/txHash còn xem được nhưng proposal chưa
      indexed; sau K2 ghi checkpoint và publication H/hash/revision.
- [ ] A vote400 For; queue sau deadline, execute sau ETA thiếu quỹ phải receipt0,
      paid=false, Treasury10.000. Nạp2.000, retry **cùng** proposal/request/operation;
      receipt1, Treasury1.000/recipient11.000. Không tạo proposal thay cho retry.
- [ ] TV2 đối chiếu receipt/event→raw→projection→API same H/hash, operation Done,
      state Executed, exactly one disbursement và transfer linkage không đếm đôi.
- [ ] TV3 lưu ảnh UI desktop/mobile và trạng thái signing/submitted/confirmed/
      reverted/refused; TV4 ghi kết luận theo bytes được giao, không ký thay TV3.

TC01 exact A+B700/chi1.000/Treasury9.000 là ca reset riêng, không được lấy ca
11.000/retry này thay. Faults cursor409/recovery503 chỉ tạo trên môi trường cô lập;
không pause/reorg worker đang phục vụ người khác. `report.json` và 14 ảnh của
lượt adapter là baseline tái lập, **không đánh tick** các mục extension chưa chạy.

