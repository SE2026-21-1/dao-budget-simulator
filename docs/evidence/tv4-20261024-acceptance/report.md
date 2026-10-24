# TV4 — Nghiệm thu tích hợp ngày 24/10/2026

## Kết luận

Backend, governance, rebuild cùng H, benchmark NFR02 local và E2E bằng EIP-1193/Anvil đã chạy thật. **Không chốt release:** TC11/reorg chưa đạt; API còn phục vụ snapshot của nhánh đã bị thay sau khi ingestion phát hiện hash lệch. Testnet, ví extension, máy thành viên khác, peer approval và CI của revision TV4 mới chưa được nghiệm thu.

## Nguồn và môi trường

- Dev `14517796d3b3641160735e202a12008e71ebebb2` được merge qua `613b62dfc5633c7418242bcb14690d88c091c0d6`.
- BE05/BE06 `c41a9ab97ad24d9b156eb03baa504dff43b165ec` được tích hợp để TV4 kiểm chứng qua `0480c842e494596155b0f67ee189736aea6641a7`; không tự merge PR #25 vào upstream hoặc tự approval.
- TV3 `9f4d57a` được merge qua `c34889604ecfa1a0d85539ef25250363ad49596b`, giữ fixture canonical, accessibility và các cải tiến riêng của TV4.
- Node 24.15.0, Foundry 1.8.5, Solidity 0.8.37, Osaka; PostgreSQL 18.4 native từ package `@embedded-postgres/linux-x64@18.4.0-beta.17`. Version beta là của gói binary; server thực báo PostgreSQL 18.4.
- Docker daemon từ chối quyền; không dùng sudo, đổi group/socket permission hoặc database có sẵn. Cluster native mới thuộc uid hiện tại, bind `127.0.0.1`, database tách theo suite, stop và xóa sau khi chạy.
- Mỗi JSON/report ghi source hashes và base commit lúc chạy. File phát sinh trước commit cuối không được đổi SHA thành revision chưa chạy. `browser.json` ghi riêng thay đổi frontend chưa commit ở thời điểm nghiệm thu.

## Kiểm tra đã chạy

| Phạm vi | Kết quả | Bằng chứng |
|---|---|---|
| Foundry toàn bộ | 147 PASS, 0 fail/skip; fuzz256, hai campaign invariant100×50, seed `0x20261021` | [contracts.txt](contracts.txt) |
| BE02 RPC/config/decoder/CLI | 64 PASS | [backend.txt](backend.txt) |
| BE03 confirmation/resume | 22 PASS | [backend.txt](backend.txt) |
| BE04 model/receipt | 27 PASS | [backend.txt](backend.txt) |
| BE06 manifest/compare | 5 PASS | [backend.txt](backend.txt) |
| Process interruption cũ | 8 PASS, real Anvil/SIGINT/SIGTERM/escalation | [backend.txt](backend.txt) |
| PostgreSQL BE02/03/04/API/BE06 | 21 +16 +10 +3 +1 =51 PASS, không skip | [native/report.json](native/report.json) |
| BE01 SQL/fixtures | Migration/constraints PASS; 123 JSON,45 proposal,20/20/5 | [native/report.json](native/report.json), [backend.txt](backend.txt) |
| Governance storage | Giao dịch thật, final roles, SQL rollback/restart/raw replay PASS | [native/governance-storage.json](native/governance-storage.json) |
| Live BE03→BE04→BE05→BE06 | 10 phase, API/contract/SQL cùng H, hai target rebuild PASS | [native/live.json](native/live.json) |
| Treasury receipt | PASS, không giả Governor/Timelock trong phạm vi Treasury-only | [treasury.json](treasury.json) |
| Frontend | 6 behavior tests PASS; production build PASS sau sửa TS1294 | [frontend.txt](frontend.txt), [frontend-build-fixed.txt](frontend-build-fixed.txt), [frontend-final.txt](frontend-final.txt) |
| Native runner SIGTERM | Exit143; cluster stopped/port closed/temp removed; report FAIL thay vì PASS | [native-interruption/signal-driver.json](native-interruption/signal-driver.json) |
| Browser E2E | 12 checks PASS;4 route×390/1366 không tràn ngang | [browser.json](browser.json), [browser-receipts.json](browser-receipts.json) |

Các campaign invariant là bounded model; số counter cuối stdout thuộc sequence được in, không tự coi là tổng mọi run. Có Governor execute thành công trong sequence; không dùng toàn bộ revert để chứng minh bất biến.

### Rebuild thật, không chỉ raw replay

Tại H=67/hash được ghim, reference và hai database mới đều có6 proposal,9 vote,3 operation,4 Transfer và2 disbursement. TotalIn=13000 BUD, totalOut=12000 BUD, balance=1000 BUD khớp contract tại hash H. Compare normalized bằng nhau; probe sửa state tạo mismatch/exit2, khôi phục trở lại bằng nhau. Sau khi head lên73 và có Transfer ở block70, rebuild vẫn dừng đúng67 và loại event sau H. Các giá trị đầy đủ nằm trong `native/live.json` và các file `.be06-*` đi kèm.

Đây là PASS về FR15 implementation và dataset đã chạy, không tự thay bộ8 trạng thái đồng thời của mọi variant TC12. Các boundary snapshot/deadline/ETA được kiểm riêng qua model, unit và các phase live.

### NFR02 — dữ liệu chain thật

[benchmark.json](benchmark.json) giữ manifest,1.000 vote với weight100 GOV, transaction hashes, SQL counts, source/machine/runtime và raw latency samples.

- 100 proposal,1.000 vote thật đã index;10 ví unlocked được phân lại100 GOV/ví và self-delegate trước snapshot. Không impersonate hoặc dùng private key.
- 10 client closed-loop,60 giây; mix list/list/summary/detail/votes40/20/20/20. Health/Transfer kiểm riêng ngoài khoảng đo.
- 8.133 request thành công,0 lỗi; global p95 **133,652 ms**, max912,070 ms. Mọi timed endpoint p95<1.000 ms. In-flight cuối được drain, không bỏ lỗi/timeout để đạt percentile.
- Treasury vẫn10000 BUD vì benchmark không execute. Ví thứ10 là account Anvil chuẩn thay tên Y lịch sử; tổng cung, phân bổ100/ví và100/1000 không đổi.

Kết quả chỉ áp dụng máy/môi trường/mix này; không chứng minh tải AD-064753 user, remote-client hoặc testnet.

## Browser và các lỗi tích hợp đã sửa

Luồng TC01 local: UI tạo proposal1000 BUD, A400+B300 For, queue qua Governor, chặn Execute trước ETA, execute qua Timelock/Treasury, index K=2 rồi API/UI hiện quỹ9000 BUD. Sau đó UI nạp10 BUD, balance9010; proposal khác được creator hủy khi Pending. Người không phải creator bị khóa nút hủy. Description HTML hiển thị text, không chạy sentinel.

Provider EIP-1193 do runner inject chỉ forward RPC tới Anvil unlocked riêng. Đây không phải wallet extension, chữ ký người dùng/testnet hay kiểm chứng hardware wallet.

| Lỗi tái hiện trước sửa | Sửa và quan sát sau |
|---|---|
| Production build TS1294 do parameter properties với erasableSyntaxOnly | ApiError dùng field tường minh; build PASS |
| Canceled transaction bị coi là proposal thành công vì receipt replacement status1 | Từ chối cancelled/replaced action; cancellation thật hiện error, không success; giữ form |
| Speed-up trả receipt mới nhưng Create tìm hash cũ | Hook giữ receipt/hash đã mine, Create decode receipt đó; repricing thật tìm được proposal ID |
| Delegation của ví0 GOV pending, chuyển B300 GOV, receipt cũ ghi đè B thành0 | Refresh từ closure account/chain cũ bị từ chối; scenario mới giữ300 GOV |
| Vote/deposit reload làm unmount transaction owner và mất status/hash | Giữ content mounted trong refresh thành công, đánh dấu dữ liệu đang ở H cũ; receipt vẫn hiện sau refresh |
| Mixed wallet component/context exports gây WalletProvider missing khi hot update | Tách Provider khỏi context/client/hooks; cold reload và browser live hoạt động |
| Dashboard API còn ghi snapshot BE01 | Nhãn lấy theo dataKind thực |
| Dashboard mobile395px trên viewport390 do sr-only header thoát scroller | Contain absolute child trong table scroller;4 route×2 width PASS |
| API down hiện Failed to fetch | Lỗi mạng tiếng Việt; error thật, không fallback fixture; bật lại API và retry đọc dữ liệu chain được |

Không đưa suppression vào lint hoặc tăng chunk warning limit. Build có cảnh báo bundle khoảng599kB; oxlint còn cảnh báo set-state-in-effect trên refresh async của WalletProvider. Cần đọc log của candidate/clone tương ứng, không coi warnings là0.

Fixture production vẫn45 proposal,20/20/5; không có cấu hình chain thì submit/deposit bị khóa; query giả lỗi dev bị bỏ qua ở production. Skip link Enter focus `main-content`;4 màn hình được chụp ở390/1366, DPR1.25. Các ảnh dùng reduced motion để không chụp giữa animation.

## Kết quả không đạt và điều kiện bên ngoài

### TC11/BE07 — đã tái hiện, không phải giả định

[reorg.json](reorg.json): sau E2E, snapshot chain trước proposal được revert và mine nhánh khác tới cùng head64. CLI `--sync` trả1/`CHECKPOINT_HASH_MISMATCH`, các digest raw/header/checkpoint/projection không đổi. Tuy nhiên GET summary vẫn200 với publication H62/hash nhánh cũ, khác hash canonical tại H62.

TV2 cần bàn giao rollback/common ancestor/window policy, replay, revision/cursor invalidation, health not_ready/rebuild_required và RPC retry/backoff. Không sửa hash checkpoint, bỏ warning, xóa DB hoặc báo reorg PASS để né kết quả. Nhánh này chưa đủ release toàn hệ thống.

### NFR03

[freshness-sample.json](freshness-sample.json): một deposit đã đủ K được xuất bản API sau374,39 ms. Đó là driver nghiệm thu local chạy mỗi500ms, không phải production daemon hoặc chứng minh mọi event≤30s. BE05 lagSeconds vẫnnull; chưa có proof pause>30s→warning→recover toàn pipeline.

### Testnet, review và GitHub

Không có mạng/RPC testnet được nhóm chốt hoặc signer/gas bàn giao trong repo; chỉ có `.env.example`. Không chọn mạng/signer thay người dùng, không xin private key qua chat, không dùng time-warp trên testnet. Cần TV1 review roles/build/EVM, signer an toàn đã có gas và cấu hình network trước demo Executed/Defeated thời gian thật.

Máy không có gh/token/stored credential; `GIT_TERMINAL_PROMPT=0 git push --dry-run origin HEAD:feature/tv4-operation` thất bại do không đọc được Username. Không push, đổi issue/PR, tự approval hoặc tuyên bố CI revision mới xanh. [Nội dung bàn giao sẵn](../../tv4-handoff-20261024.md) cho PR#21 và issue#18/#19/#20.

README AD-064 link và file AD-064 chưa tracked của người dùng được giữ riêng, không nhận là thay đổi TV4 mới. Clone cùng máy và người khác chạy lại phải ghi riêng; không lấy CI hoặc clone cùng máy làm independent-machine approval.

## Chạy lại

Xem README mục **Nghiệm thu native PostgreSQL khi không dùng được Docker**. `npm run test:tv4:native -- --postgres-bin <PG18.4-bin> --output <new-dir>` chạy các suite/live trên cluster riêng. Thêm `--benchmark` để runner tạo database benchmark riêng và chạy100/1000/10/60 trước cleanup. `npm run benchmark:api -- --output <new.json>` dùng riêng chỉ khi người gọi đã provision database rỗng `tv4_benchmark`/owner `be04_test` và đặt hai biến TV4_BENCHMARK theo usage.

Không dùng địa chỉ trong evidence để chạy lại chain đã dừng/reset. Mỗi lần deploy phải tạo manifest mới và cấu hình BE05 deployment_name thật; không nhầm external deploymentId với PK nội bộ.
