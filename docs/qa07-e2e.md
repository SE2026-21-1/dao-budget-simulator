# QA07 — Browser → worker → API → UI trên môi trường dùng một lần

## Phạm vi và điều kiện

Runner hẹp `scripts/check_qa07_e2e.mjs` tái sử dụng deployment/receipt/lifecycle của repo, không thay product code, không thêm package script. Chạy bằng Node **24.15.0**, PostgreSQL **18.4**, Forge/Anvil **1.8.5**, production artifacts từ `forge build` (Solidity 0.8.37, Osaka, optimizer 200), submodule đúng revision. Cài dependency root/frontend bằng lockfile trước khi chạy. Cần Chrome và Playwright bên ngoài hoặc trong môi trường QA; không thay `package.json` của dự án.

**Chế độ tự động dùng adapter EIP-1193 với tài khoản Anvil unlocked do runner sở hữu, KHÔNG phải MetaMask.** Adapter công bố tên có chữ NOT MetaMask, chỉ gửi từ tài khoản A trên chain mới 31337 và đặt gas 8.000.000. Từ chối code 4001 và `chainChanged` sai mạng là fault injection ở adapter; không được ghi thành đã kiểm thử popup/extension thật. Không sử dụng ví người dùng, ký bên ngoài, fork hay RPC/DB caller. Chế độ `--serve` dưới đây không inject adapter hoặc tự thực hiện workflow.

## Gate hiện hành — 27/11/2026

- [#19 lượt hẹp mới đã review](evidence/2026-11-27-issue19-review.md):
  B-active + draft + lỗi sau Submit có ảnh trực tiếp; no-send vẫn **inference**, chưa provider trace.
  MetaMask13.58.0 chỉ producer khai báo của run mới/source4cba99a, không version phiên H26.
  Proposals503 được giữ nguyên, thiếu raw response/log để chốt nguyên nhân; không full E2E PASS.
  Không yêu cầu lại governance hoặc provenance H26 đã đạt.
- [#42 receiver API-only PASS độc lập](evidence/2026-11-27-r2-issue42.md):
  approved source896f93e/H22/hash3b9fd152…94c8/revisionedc6f818…db90;78/78restart checksums,
  12HTTP200 và5semantic pairs MATCH; evidence đã niêm phong, không còn receiver-not-ready blocker.
  TERMcommandexit không thay terminationexit cũ; API mới còn chạy, không bịa exit.
- [#40 readiness HOLD](evidence/2026-11-27-r2-receiver-deltas.md): chưa access/ownership Windows/WSL,
  không run FAIL. Clean approvede8e443c receiver do TV3 vận hành narrowOptionB; bảo vệ stack/evidence#42.
- Pipeline #41 product6766e5e/H52 và #18/#36/BE06/bounded invariants đã nghiệm thu giữ nguyên.
  [Candidate integration/runtime proof](evidence/2026-11-27-r2-integration.md) khác
  [evidence/docs handoff](evidence/2026-11-27-r2-acceptance.md); nhóm còn chọn exactsource/manifest/demo/video#44.
  CIgreen/Netlifypreview/publishSKIP không releaseacceptance; #20 owner gates còn BLOCKED.
  Không merge/promote/tag/release/broadcast hoặc khôi phục staging#56.

## Gate 26/11/2026 — lịch sử, cập nhật mới ở trên

- [TV3 review6055560601 COMMENT](https://github.com/SE2026-21-1/dao-budget-simulator/pull/60#pullrequestreview-6055560601)
  xác nhận pinning P2 được giải quyết tại evidence HEAD
  `b92bef5409d6478de97efbc8209241620967d18a` (fix
  `bbe6fa47cc9d9f9c49a60330bc48d910724fb517`); không còn chờ re-review này.
  Đây **không** phải whole-PR APPROVED hoặc MetaMask acceptance.
- TV1 security APPROVED b186844; TV2 BE08 APPROVED đúng PR60
  `0a5cc5cfda29a92df4ab4498e1cd72cd57023088` / PR61
  `cba8b6c9eda65959d82250441b8eed131a1a5044`, giữ scope từng review.
- [#41 local OptionB pipeline ACCEPTED](https://github.com/SE2026-21-1/dao-budget-simulator/issues/41#issuecomment-7155604461):
  product `6766e5ee2d8c466542687cbeb09677c4d11e5463`, publication H52/hash/revision
  và original receipts là evidence lịch sử đã nhận. SQL query H58 không phải
  publication H52; không gán run đó cho b92bef5 hoặc revision demo mới, không chờ
  thêm worker/SQL signoff hoặc chạy lại governance để lấy lại evidence đã đủ.
- #19 vẫn documentary PARTIAL: [provenance bổ sung đạt liên kết run/source/digests](evidence/2026-11-26-issue19-provenance-review.md);
  thiếu capture **B-active afterSubmit** và exact MetaMask version của phiên H26.
  Không biến provenance PASS thành full acceptance hoặc yêu cầu làm lại cả governance.
- #40 đã chọn **Option B lifecycle hẹp**: cần run/output receiver mới theo scope đó,
  không dùng Option B pipeline #41 thay lifecycle. #42 receiver preregistration và
  API-only restart evidence vẫn BLOCKED; giữ DB/deployment/worker, không BE06 rerun.
- #20 owner authorization/testnet và nhóm chốt exact source/manifest/run/video
  vẫn riêng. Read-only probe/local drill không thay receiver, ví thật, Sepolia hoặc
  video nhóm. Cập nhật docs này không chạy test, service, ký hay broadcast.

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

## Source đã được duyệt và bàn giao ví thật

Tooling QA và source sản phẩm có thể nằm ở hai checkout khác nhau. `--project-root`
chọn **toàn bộ** contract artifacts, helper deployment/receipt/lifecycle, worker,
API và frontend từ checkout sản phẩm; không chỉ đổi thư mục Vite. Chuẩn bị recursive
submodules, root/frontend `npm ci` và `forge build` tại checkout đó trước khi chạy.
`manifest.sourceCommit` và `sourceHashes` phải thuộc source sản phẩm;
`qaHarness.sha256`/`keyboardSha256` ghi riêng bytes tooling. Không gọi cả PR60 đã
được duyệt chỉ vì dùng baseline Dev đã có review.

Baseline sản phẩm đã dùng cho evidence lịch sử #41: **Dev
`6766e5ee2d8c466542687cbeb09677c4d11e5463`**, local unforked31337, K2.
Không tự chọn baseline đó hoặc current HEAD cho run mới: nhóm chọn full approved
product SHA và tooling SHA riêng, ghi quyết định trước rehearsal.
Checkout tách riêng, không checkout/reset nhánh personal hoặc đưa #21/#55 vào ancestry.

```sh
# Chạy từ checkout tooling có dependencies; hai output phải là thư mục mới.
node --import tsx scripts/check_qa07_e2e.mjs \
  --postgres-bin /absolute/pg18.4/bin --output /tmp/qa07-reviewed-auto-NEW \
  --project-root /absolute/reviewed-checkout
node --import tsx scripts/check_qa07_e2e.mjs \
  --postgres-bin /absolute/pg18.4/bin --output /tmp/qa07-reviewed-wallet-NEW \
  --project-root /absolute/reviewed-checkout --serve
```

`--serve` tạo stack mới và in `QA07_SERVE_READY`; `handoff.json`/`manifest.json`
chỉ chứa metadata công khai, addresses và endpoint **của lượt đang sống**. Dùng
chúng để thêm network/nối ví disposable; không dùng port/manifest archived.
Startup là `SERVING_NOT_ACCEPTANCE`, không phải MetaMask/E2E PASS. Ctrl-C ở đúng
process runner sẽ giữ report/logs và cleanup các child/cluster do nó sở hữu;
`SERVE_STOPPED` cũng không phải acceptance. Không dừng service của người khác.

Runner này cần POSIX/Linux; TV3 có thể dùng WSL/Linux hoặc receiver BE09 Windows
đã có, nhưng phải chứng minh revision/manifest của receiver. Ví extension thật
do operator kiểm soát; không gửi seed/key/password vào stdout, archive, issue
hoặc chat. Với MetaMask13.58, nếu thêm custom chain xong gặp4100, kiểm quyền
account **trên chain hiện hành** và xác nhận lại permissions qua ví; không sửa
provider trả kết quả giả, impersonate signer hoặc gọi đó là product fix.


## Chứng cứ cần kiểm tra

`report.json` chứa lệnh/env công khai, phiên bản runtime, SHA-256 source, manifest/artifact provenance, requestId/proposalId/operationId/txHash, raw receipts, SQL/API/contract balance tại cùng H/hash; `worker.stdout.log` là output CLI thật. File `*.png` và `*.txt` là screenshot + nội dung DOM thực sau từng bước, không phải dữ liệu fixture hay chèn trạng thái giao diện.

Trước workflow, `keyboard` ghi traversal **chỉ Tab/Shift-Tab/Enter/Space** ở
1366×900 và390×844: skip link→main, form/review/back giữ dữ liệu, navigation,
focus-visible có outline/shadow và focused control trong viewport, không
horizontal overflow. Đây là keyboard desktop/mobile-emulation, không physical
mobile hoặc screen-reader certification.

Một proposal duy nhất do form browser tạo, cùng deployment xuyên suốt:

1. Sai mạng khóa nút ký; chuyển lại qua provider adapter.
2. Từ chối signature ở adapter, không có transaction được gửi; thử lại tạo proposal.
3. Receipt confirmed nhưng K=2 chưa đủ: UI giữ tx/proposal ID, trang detail báo chưa có trong publication.
4. Mine qua snapshot; browser bỏ phiếu; mine qua deadline; browser Queue; mine qua ETA.
5. Browser Execute khoản 11.000 BUD khi Treasury chỉ có 10.000: receipt status=0, chưa paid, số dư không đổi.
6. Nạp thêm 2.000 BUD bằng tài khoản funding được sở hữu; browser retry Execute cùng proposal/request, receipt status=1.
7. Worker CLI publish; SQL disbursement, API detail/transfer, receipt và contract đọc bằng EIP-1898 canonical blockHash khớp nhau. Summary materialize snapshot; runner truyền chính `asOfBlock` + `asOfBlockHash` của Summary vào cả Detail và Transfers (kèm proposalId cho Transfers), không gửi query `snapshotRevision`. Summary/detail/transfers phải cùng chainId, deploymentId, H/hash, snapshotRevision, asOfTimestamp và dataKind; không so freshness `sync` có thể thay đổi giữa các request. Treasury=1.000 BUD, recipient=11.000 BUD tại H/hash này. Desktop UI hiển thị Executed, txHash và H/hash; runner đọc revision từ `<code>` thực của `.snapshot-info`, đối chiếu với summary và lưu `reconciliation.uiSnapshot`. Sau khi capture UI, runner buộc worker thật publish một H mới qua empty blocks, rồi chứng minh hai pinned GET vẫn đọc snapshot cũ canonical/còn TTL. `reconciliation.pin` và `latestContextBeforeReads` giữ cả hai mốc; không ép UI phải hiển thị publication mới hay dừng worker để né race.
8. Proxy transport trì hoãn request thật để chụp loading; đóng socket để chụp error; phục hồi transport và dùng nút Thử lại. Không chế tạo API envelope.
9. Snapshot Anvil sau lifecycle; tạo nhánh funding 1 wei, lấy cursor thật. Revert và tạo nhánh funding 2 wei. Worker phát hiện reorg; proxy chỉ giữ RPC **sau khi worker đã ghi gate recovering thật** để quan sát API summary503 + cursor409 và lỗi UI. Thả RPC, worker canonical replay, cursor cũ vẫn409; UI retry phục hồi. Không sửa SQL/state product để tạo kết quả.
10. Chụp detail Executed ở 1366×900 và 390×844.

`PASS` chỉ nói về các assertion đã chạy trong report và các ảnh cần review; không đồng nghĩa nghiệm thu MetaMask, public testnet, explorer hoặc SLA BE08. Có lỗi phải giữ nguyên report/log/ảnh của lần đó, ghi rõ đã dừng ở bước nào; không đổi failed evidence thành PASS và không thu hẹp assertion để né lỗi.

Regression độc lập (không chain/browser): `node --test tests/smoke/qa07-snapshot.test.mjs`.
Giữ negative đổi riêng revision ở detail/transfers tại cùng chain/deployment/H/hash và positive cùng revision.
API-contract fixture deterministic cho publication H52→H53→H54 xen giữa các request: pinned reads giữ H52;
bỏ pin ở riêng Detail hoặc Transfers phải bị oracle từ chối. Unit cũng inject UI revision lệch tại cùng hash
và kiểm hash mismatch. Fixture là kiểm oracle, không giả worker/DB acceptance; runner cô lập dùng worker/API thật
để kiểm publication xen giữa. Các kiểm chain/deployment/H/hash/metadata và extension boundaries #19/#36 giữ nguyên.

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


## Account switch: phần evidence tối thiểu còn thiếu của #19

[TV4 đã chạy, không nhận PASS toàn case](evidence/tv4-20261123-account-switch.json):
A300 đủ điều kiện; nhập ví test B0 thật; MetaMask vẫn cấp account A cho site dù
global wallet đang B. Revoke permissions thật đã phát `accountsChanged([])` và
khóa ký A. Driver gặp lỗi focus/không còn control truy cập được khi hoàn tất
B, kể cả trên display Xvfb riêng; không sửa MetaMask/app state hoặc tăng timeout.

[TV3 A→B→A đã được tiếp nhận scoped functional support](evidence/2026-11-25-issue19-tv4-review.md);
[supplement provenance đã đạt](evidence/2026-11-26-issue19-provenance-review.md).
Chỉ còn B-active afterSubmit và exact version của phiên H26. Nếu bản gốc không
còn, TV3 chỉ narrow recapture draft/account-switch/no-send trên stack mới của
approved source, **run ID mới và version đúng phiên mới**; không gán ảnh/version
mới thành H26 hoặc chạy lại governance. Checklist dưới là thủ tục cho phần thiếu,
không phải yêu cầu rerun phần functional đã được hỗ trợ.

1. Lấy `handoff.json` mới từ `--serve`; kiểm đúng31337/K2/manifest/source. A và B
   là hai account disposable do operator giữ; B không có GOV/votes.
2. Nếu A là account extension mới, chuyển400 GOV từ **unlocked Anvil fixture A**
   sang public address của extension A, rồi Self-delegate qua ví thật. Chỉ dùng
   RPC loopback thuộc runner đang sống, không dùng caller RPC/testnet:

   ```sh
   test "$(cast chain-id --rpc-url "$OWNED_RPC")" = 31337
   cast send "$GOV" 'transfer(address,uint256)' "$EXTENSION_A" \
     400000000000000000000 --from "$ANVIL_FIXTURE_A" --unlocked --rpc-url "$OWNED_RPC"
   cast rpc anvil_mine 0x2 0x1 --rpc-url "$OWNED_RPC"
   ```

3. A có đủ voting power, đúng network/deployment: tạo **draft**1 BUD, mở review,
   lưu requestId/fields và A/B nonce; chưa gửi proposal. Ghi provider methods và
   events bằng observer pass-through, không chế tạo response hoặc emit event giả.
4. Đổi **site-authorized account** sang B qua UI permission/account chooser.
   Nếu MetaMask ghim site ở A, revoke quyền của **site demo sở hữu** rồi connect B;
   global selection B một mình không phải `accountsChanged(B)`.
5. Lưu event B thật, UI address/balance/power0 và draft giữ requestId/fields.
   Thử gửi: B0 phải bị chặn trước signature; không có `eth_sendTransaction`,
   không đổi nonce A/B, không có txHash/receipt để bịa. Chụp UI/error thật.
6. Giao JSON methods/events, public nonce reads, ảnh, source/manifest và
   browser/extension version cho TV4; TV2 chỉ reconcile backend nếu có thay đổi
   chain. Không gửi key/seed/password, screenshot credential hoặc browser profile.

Observer chỉ gắn trên **site demo**, đúng provider MetaMask app đang chọn
(profile chỉ có MetaMask có thể dùng `window.ethereum`). Nếu nhiều extension,
không lấy log của một provider khác rồi gọi đó là no-send của provider đã chọn.
Mẫu DevTools sau chỉ quan sát, giữ nguyên args/result/error của ví thật:

```js
const tv4Evidence = [];
const provider = window.ethereum;
const originalRequest = provider.request.bind(provider);
const tracked = new Set(["eth_accounts", "eth_chainId", "eth_sendTransaction"]);
provider.on("accountsChanged", accounts =>
  tv4Evidence.push({ at: new Date().toISOString(), event: "accountsChanged", accounts }));
provider.request = async args => {
  const entry = tracked.has(args.method)
    ? { at: new Date().toISOString(), method: args.method, params: args.params } : null;
  if (entry) tv4Evidence.push(entry);
  try {
    const result = await originalRequest(args);
    if (entry) entry.result = result;
    return result;
  } catch (error) {
    if (entry) entry.error = { code: error.code, message: error.message };
    throw error;
  }
};
// Sau thao tác thật, xuất JSON từ DevTools; không gọi emit/set app state.
copy(JSON.stringify(tv4Evidence, null, 2));
```

Gắn observer trước valid control của A; giữ log cả các bước, đánh dấu thời điểm
switch để đếm request gửi sau đó. Không dùng logger để giả rejection/chain/account
hoặc sửa DOM/control, không dùng nó chứng minh extension identity thay version/ID.

A400 For/11.000 BUD/revert/retry của [lượt extension đã hoàn tất](evidence/tv4-20261123-real-extension.json)
vẫn là proof riêng; case này không được thay proposal/request đã thực thi để
gọi là retry, không dùng profile/port archived sau cleanup.

## Diễn tập Integration & Release — 24/11

Kịch bản cập nhật **26/11**; chưa chạy trong lượt docs này, không phải biên bản nghiệm thu.
Nhóm chọn full approved product SHA và tooling SHA riêng sau review/CI; current
candidate/evidence b92bef5409d6478de97efbc8209241620967d18a không tự thành revision
demo. Trang mở đầu demo/video phải ghi run ID/thời gian/operator, hai SHA,
manifest path + SHA256, toolchain, chainId/K, deploymentId/năm contract addresses,
creation blocks, frontend origin/API/RPC và publication H/hash/revision.
Đối chiếu các giá trị đó với handoff/manifest **run đang sống** trước nối ví;
khác source/manifest/endpoint thì dừng trước ký, giữ evidence mismatch.
Không dùng journal/manifest/endpoint archived cho lượt mới. Evidence H52/product6766e5e
đã nhận được trình bày riêng với ngày/run cũ, không relabel thành live run mới.

| Bước | Thao tác | Kết quả cần trình bày |
|---|---|---|
| Chuẩn bị (chỉ khi operator được phép chạy) | Node24.15.0/Foundry1.8.5/PG18.4; lockfile/submodule đúng; build artifacts từ product SHA đã chọn, output mới; đối chiếu header run ở trên và [Sepolia gates](sepolia-deployment.md). | SHA/artifact/manifest/chain/deployment nhất quán; endpoints thuộc run đang sống; không secret trên màn hình/log. Thiếu prerequisite thì dừng, không tự khởi động/sửa service của người khác. |
| Hash và fail-stop local | `node --test --test-name-pattern='signed submission|funding submission|unconfirmed final funding' tests/smoke/sepolia.test.mjs` | Response hash delegation và receipt delegation là hai lỗi khác nhau, đều bị từ chối; signed hash local còn trong journal, không resend hoặc false K2. Chỉ Anvil disposable, không Sepolia. |
| Demo browser nhóm | Tạo stack `--serve` theo hướng dẫn trên; thao tác extension thật trên cùng proposal: tạo, vote, queue, execute thiếu quỹ, nạp2.000, retry. | Lưu receipt0/receipt1, IDs và publication cùng H/hash; SQL/API/UI, Treasury1.000/recipient11.000; không gọi adapter là extension. |
| Ca còn thiếu | TV3 bổ sung documentary B-active afterSubmit/exact MetaMask version #19; provenance H26 đã review riêng, ảnh mới chỉ dùng cho narrow run mới. Receiver chạy lifecycle Option B #40 và preregister/API-only restart #42 theo runbook riêng. | Ghi rõ run nào chứng minh bước nào; thiếu bytes thì PARTIAL/BLOCKED. Không chờ lại #41 worker/SQL đã accepted; không dùng local adapter thay receiver/ví thật. |
| Kết thúc | Lưu requirement→issue→commit→test/report/receipt, log/ảnh đã redact và quyết định scoped review; operator cleanup đúng runner sở hữu sau rehearsal. Nhóm chọn lịch/video/report khi đủ gates. | Video phải chỉ rõ live/local/archived/testnet từng đoạn; chưa có video/rehearsal thì ghi chưa chạy. Không release/tag/merge từ demo local; không tái tạo server staging đã retired #56. |

Nếu thiếu PG/Chrome/extension hoặc RPC lỗi: dừng đúng bước, giữ failed report;
chỉ trình bày evidence lịch sử với SHA/ngày/giới hạn rõ, không gọi là demo live.
Nếu submission mơ hồ: không chạy lại journal, không gửi lại giao dịch; đối chiếu
hash local/sender/nonce/chain với custodian theo [runbook Sepolia](sepolia-deployment.md).
Demo Sepolia chỉ thêm sau đủ owner authorization/map/custodians/budget, chờ thời
gian thật; không dùng warp local thay Executed/Defeated testnet.
