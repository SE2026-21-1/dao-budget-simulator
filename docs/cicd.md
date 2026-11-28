# TV4 — CI, GHCR và xác minh release

## Phạm vi hiện hành

Hạ tầng server đã được rút khỏi phạm vi theo [issue #56](https://github.com/SE2026-21-1/dao-budget-simulator/issues/56),
đóng ngày 23/11/2026. Không provision hoặc triển khai lại server.
Workflow `.github/workflows/verify-release.yml` chỉ xác minh release.
Các script rollout/rollback server, cấu hình SSH và mẫu env server đã gỡ.

GHCR, Compose CI và Sepolia [#20](https://github.com/SE2026-21-1/dao-budget-simulator/issues/20)
là các phạm vi riêng. Không xóa package, database, volume hoặc cấu hình
production/static hosting khi dọn phần server không còn dùng.

## CI và phát hành image

`TV4 CI` giữ các suite contracts/backend/frontend và BE08 reusable gate.
Job `containers` build ba image, kiểm tra release/migration và chạy Compose
smoke cô lập. Khi push `Dev`, lưu đúng image đã smoke. Chỉ job `publish`,
sau tất cả gate thành công, được ghi GHCR bằng `GITHUB_TOKEN` với `packages: write`.

Ba package là `ghcr.io/se2026-21-1/dao-budget-simulator/{frontend,api,indexer}`.
Tag dùng full commit SHA; không dùng `latest`. Artifact `release-<SHA>/manifest.json`
chỉ xuất hiện sau cả ba push thành công, chứa repository, SHA, run ID, ba digest
và migration fingerprint. Artifact giữ 90 ngày; công cụ từ chối artifact hết hạn,
không bỏ qua provenance. Không sửa tay digest để hợp thức hóa release cũ.

CI xanh hoặc có manifest không tự chứng minh release-ready, peer approval,
nghiệm thu Sepolia hay UI/wallet end-to-end. Cần đọc bằng chứng đúng revision.

## Xác minh release thủ công

Workflow nhận một input `sha` là full commit SHA:

1. Chỉ nhận run `TV4 CI`, event push, branch `Dev`, completed/success, cùng repository/SHA.
2. Tải manifest từ chính run đó; xác minh provenance và đủ ba digest.
3. Checkout source đúng SHA, kiểm migration fingerprint và cú pháp Compose.
4. Pull cả ba image đã phát hành; lưu artifact xác minh và đăng xuất GHCR.

Workflow không SSH, không thay đổi server và không deploy contract.
Nó cần tồn tại trên default branch để xuất hiện trong giao diện workflow_dispatch;
đưa workflow lên default branch theo quy trình review của repository.

Có thể xác minh qua CLI sau khi có release thật và `GH_TOKEN` đã được cấp quyền
đọc Actions phù hợp, không ghi token vào lệnh hoặc log:

```bash
mkdir -p /tmp/new-release
node scripts/cd/release.mjs download --sha FULL_SHA --manifest /tmp/new-release/manifest.json
node scripts/cd/release.mjs verify --sha FULL_SHA --manifest /tmp/new-release/manifest.json
```

`verify-local` chỉ kiểm cấu trúc và migration; không thay `verify` online hoặc
chứng minh CI thành công. Các kiểm tra provenance/GHCR vẫn được giữ.

## Compose smoke dùng chung

`deploy/compose.smoke.yml` kế thừa `deploy/compose.yml`; đây là topology test
cô lập trên runner. Giữ Dockerfiles và các helper migration, preflight, health,
smoke, release cùng regression tests vì chúng còn được CI sử dụng.
Frontend container nhận cấu hình công khai qua `/runtime-config.js` và
`globalThis.__DAO_PUBLIC_CONFIG__`, build với `VITE_CONTAINER_RUNTIME=1`.
Thiếu cấu hình live phải fail closed; không ghi RPC secret/private key/token
vào frontend hoặc `VITE_*`. Smoke không dùng caller database/RPC/config.

Kiểm tra delivery không cần deployment secrets, sau `npm ci`:

```bash
node --test scripts/cd/release.test.mjs deploy/operations.test.mjs
bash -n scripts/cd/container-smoke.sh
actionlint
docker compose -f deploy/compose.yml config --no-interpolate --quiet
```

Khi có Docker daemon được phép dùng, Node 24, Foundry 1.8.5 và submodules:

```bash
npm ci
git submodule update --init --recursive
bash scripts/cd/container-smoke.sh
```

Runner tự build images nếu không truyền `IMAGE_TAG`, tạo project/volume/Anvil
riêng và dọn chỉ tài nguyên test nó sở hữu. Nó kiểm migration, backup/checksum,
ledger, scope deployment, runtime public config, proxy error contract,
stale canonical heartbeat, nonroot, dữ liệu sau recreate PostgreSQL và đổi
cấu hình image A→B→A. B là cùng application code với label/config khác;
không chứng minh tương thích schema giữa hai revision ứng dụng khác nhau.
Manifest test chỉ là input helper, không phải release GHCR đã qua CI.

Smoke kiểm application readiness; API có thể publication ready nhưng
`status=degraded` do ancillary raw logs chưa decode. Giữ cảnh báo
`SMOKE_RAW_DECODE_INCOMPLETE`, không giả `rawDecodeComplete=true` hoặc hạ
health gate. Kết quả local, CI, GHCR và nghiệm thu nghiệp vụ phải ghi riêng.
