# TV4 — chuẩn bị CI/CD ứng dụng

Phạm vi: BC-03 / SE2026-T16 / TV4 Phan Thanh Dũng. Chỉ local/testnet, không tiền thật.
Chưa có server đích; **không xác nhận CD end-to-end**. Không có bước deploy contract trong pipeline ứng dụng.

## Nhánh, quyền và phụ thuộc

- Default branch GitHub: `main`; nhánh chung: `Dev` (PR #52 đang đề xuất promote Dev → main). README quy định nhánh tích hợp ứng dụng `feature/tv4-operation`, đưa vào Dev qua PR #21.
- Frontend live/API/wallet tái sử dụng từ [PR #21](https://github.com/SE2026-21-1/dao-budget-simulator/pull/21), không tạo một convention frontend thứ hai. PR CI/CD nhắm `feature/tv4-operation` để không lặp toàn bộ diff PR21; nhánh làm việc đã tích hợp Dev hiện tại. Publish chỉ bắt đầu khi các thay đổi đã được review và đi vào Dev qua PR21.
- GitHub ngày 18/11/2026: `main`, `Dev`, `feature/tv4-operation` có `protected:false`; rulesets trả `[]`. Tài khoản `dung0611` có push, không admin/maintain; API Actions permissions trả 403. Bật branch protection/review và Environment là việc maintainer, không tự thay đổi trong đợt này.
- PR đang mở được kiểm tra: #21 frontend/integration, #51 wallet events, #52 promotion, #53 harness cá nhân. Không thấy PR Docker/GHCR/CD riêng.
- Token local có repo scope nhưng thiếu `read:packages`/`write:packages`; API danh sách GHCR trả 403. Chưa chứng minh quyền publish package của tổ chức. Sau merge, job `publish` dùng `GITHUB_TOKEN` với quyền `packages: write`; quản trị viên phải cho repo tạo/truy cập ba package nếu policy tổ chức chặn.

## Luồng phát hành

`TV4 CI` giữ các suite hiện có; BE08 trở thành reusable workflow được gọi như một gate, vẫn có thể chạy thủ công. Job `containers` build cả ba image trên PR, kiểm tra release/migration và chạy Compose smoke cô lập. Khi push `Dev`, lưu đúng image đã smoke. Chỉ job `publish`, sau **tất cả** gate thành công, được ghi GHCR.

Ba package: `ghcr.io/se2026-21-1/dao-budget-simulator/{frontend,api,indexer}`. Tag là **full commit SHA**; không dùng `latest`. Manifest artifact `release-<SHA>/manifest.json` chỉ xuất hiện sau cả ba push thành công, chứa repository, SHA, run ID, ba digest và migration fingerprint. Manifest sống 90 ngày: lưu bản đã xác minh trong hồ sơ release/server trước khi artifact hết hạn; công cụ hiện từ chối manifest hết hạn, không bỏ qua provenance. Khôi phục release cũ khi hết hạn cần quy trình phát hành lại/review, không sửa tay digest.

`TV4 manual application deployment` nhận full SHA, mặc định `mode=verify`:

1. Chỉ nhận run `TV4 CI`, event push, branch `Dev`, completed/success, cùng repository/SHA.
2. Tải artifact manifest của chính run, xác minh đủ digest và pull cả ba image.
3. Verify không SSH và không sửa server. Đây không kiểm tra được các file/secrets/schema đang nằm trên server.
4. `mode=deploy` chỉ chạy từ ref `Dev`, dùng GitHub Environment `dao-staging` và concurrency không hủy lượt đang chạy. Workflow cần có trên default branch để xuất hiện trong giao diện workflow_dispatch; promote workflow đã review sang main theo quy trình repo, không bypass PR #52.

Có thể xác minh trực tiếp sau khi có release thật:

```bash
export GH_TOKEN=... # actions:read; không commit/in log
node scripts/cd/release.mjs download --sha FULL_SHA --manifest /tmp/new-release/manifest.json
node scripts/cd/release.mjs verify --sha FULL_SHA --manifest /tmp/new-release/manifest.json
```

Tạo `/tmp/new-release` trước. `verify-local` chỉ kiểm cấu trúc; **không** thay thế `verify` online hay xác nhận đã qua CI.

## Khi có server — chuẩn bị một lần

1. Dùng Linux x86_64, Docker Engine và Compose **≥2.24.4** (`up --wait`, smoke dùng `!override`), Node **24.15.0**, Bash, `flock`, `unzip`, `sha256sum`. SSH có key riêng cho deploy; quyền Docker tương đương root, không coi group Docker là sandbox. Tạo `/srv/dao/{shared,releases}` thuộc tài khoản deploy, chmod 700.
2. Tạo Environment `dao-staging`, yêu cầu reviewer và chỉ cho nhánh `Dev`. Variables: `DEPLOY_HOST` (hostname/IP, không URL), `DEPLOY_USER`, `DEPLOY_PORT` (ví dụ 22). Secrets: `DEPLOY_SSH_KEY` và `DEPLOY_KNOWN_HOSTS`. Lấy host key qua kênh độc lập/console nhà cung cấp, không tin `ssh-keyscan` chưa đối chiếu. Workflow dùng StrictHostKeyChecking, không tự accept host key mới. Chưa cấu hình các giá trị thật trong đợt này.
3. Cấu hình quyền pull GHCR trên server bằng tài khoản/machine token tối thiểu `read:packages`, cấp repo/package access và SSO nếu cần. Đăng nhập `docker login ghcr.io --password-stdin`, không đưa token vào command line, Compose hoặc image. Credentials được quản lý trên server; workflow không gửi token ghi package xuống server.
4. `/srv/dao/shared/github.env` (600) chứa `GH_TOKEN` chỉ đọc Actions artifact để server xác minh lại provenance. Không dùng token ký giao dịch. Quản lý/vòng đời token riêng với image.
5. Copy `deploy/env.example` thành `/srv/dao/shared/runtime.env` (600), thay placeholders. Dùng DB ứng dụng riêng, không URL/tài khoản của bất cứ suite test nào. DB hostname trong mạng Compose là `postgres`; không expose 5432. `POSTGRES_PASSWORD` và `DATABASE_URL` phải khớp (URL-encode mật khẩu). Không đổi mật khẩu volume cũ chỉ bằng thay env.
6. Chuẩn bị `/srv/dao/shared/indexer.json` từ config/handoff deployment đã được xác minh: chain ID, deployment SQL ID, block bắt đầu, đủ bốn contract roles và ABI version được registry hỗ trợ, `toBlock:"latest"`. RPC runtime có thể chứa credential và không public. Không dùng `indexer/config/example.json` với địa chỉ synthetic cho deploy thật.
7. Đăng ký deployment metadata trong database theo `docs/indexer.md`/`docs/sc06-handoff.md`: `deployments`, `deployment_contracts`, governance config và ABI từ handoff đã kiểm tra. `deploymentId` JSON worker là SQL numeric ID; frontend dùng `deployment_name` public. Xác minh receipt/block/hash, chain ID, địa chỉ, code và ABI theo handoff; preflight không tự deploy/register metadata hoặc tự biến địa chỉ bất kỳ thành “đã xác minh”. Thiếu handoff thật là blocker deploy thật.
   `deployments.deployment_block` phải là block sớm nhất của **bốn role raw** Governor/Timelock/Treasury/BUD, như runner tích hợp hiện có; không dùng block GOV sớm hơn. Worker raw không đọc GOV logs, còn API đòi prefix header đủ từ deployment block. Đặt `fromBlock` cùng ranh giới đó; đăng ký GOV riêng cho historical reconciliation. Preflight từ chối sai ranh giới trước rollout, không sửa DB hoặc bỏ header để né gate.
8. Frontend dùng file public `/srv/dao/shared/frontend.json` theo mẫu trong `deploy/env.example`. Không đưa RPC secret/private key/token/mật khẩu vào đây hay `VITE_*`. Image không cố định chain/deployment lúc build; runtime phục vụ cấu hình công khai. Mọi giá trị trong file này đều đọc được từ browser. Browser RPC phải là endpoint public phù hợp chain.
9. Domain/DNS và HTTPS được cấu hình ngoài Compose bằng reverse proxy đã vận hành, trỏ vào frontend loopback. API chỉ qua proxy frontend; cấu hình origin/CORS đúng domain. Không công khai cổng PostgreSQL/API hoặc Anvil. Hạn chế firewall/SSH. Chưa tạo DNS hay TLS thật trong đợt này.

## Deploy đầu tiên, migration và cập nhật

Chạy verify mode trước. Để bootstrap PostgreSQL/migration, lấy bundle source đúng SHA đã phát hành và manifest/release.env đã online verify; đặt `/srv/dao/releases/<SHA>` có `deploy/`, `scripts/cd/release.mjs`, `manifest.json`, `release.env` như bundle workflow.

- Chạy Compose với project/path/env giống `deploy/deploy.sh`; khởi động **chỉ postgres**. Volume named giữ nguyên qua deploy/recreate; mount PG18 là `/var/lib/postgresql`, không dùng mount path kiểu PG17. Không chạy `down -v`, `volume rm` hoặc DB test wrapper trên môi trường này.

```bash
SHA=FULL_SHA
R=/srv/dao/releases/$SHA
compose=(docker compose --project-name dao \
  --env-file /srv/dao/shared/runtime.env --env-file "$R/release.env" \
  -f "$R/deploy/compose.yml")
"${compose[@]}" up -d --wait --wait-timeout 120 postgres
mkdir -p /srv/backups
BACKUP=/srv/backups/dao-before-$SHA.dump
"${compose[@]}" exec -T postgres sh -c 'exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$BACKUP"
chmod 600 "$BACKUP"
HASH=$(sha256sum "$BACKUP" | cut -d ' ' -f1)
```

- Trước migration phá tương thích: dùng `pg_restore --list` để kiểm archive, restore vào PostgreSQL 18.4 **cô lập mới**, kiểm dữ liệu/roles và kế hoạch downtime. Không restore đè DB phục vụ để thử backup.
- Migration là lệnh **riêng**, không có trong workflow deploy. Đọc SQL và đánh giá tương thích cả image cũ/mới trước; dừng writes/worker khi cần. Chụp backup đã kiểm tra, lưu ngoài volume, kiểm tra checksum và thử restore vào DB cô lập trước migration phá tương thích. Backup file/checksum trong lệnh là xác nhận operator, không tự chứng minh đã restore thành công.

```bash
bash "$R/deploy/deploy.sh" migrate "$R" "$SHA" \
  --approve --backup "$BACKUP" --backup-sha256 "$HASH"
```

Migration có file lock và PostgreSQL advisory lock, ledger checksum; không sửa checksum migration cũ để ép qua. DB đã migration trước khi dùng tooling cần baseline **explicit** theo phần `migrate` trong script (`--baseline LAST.sql --schema-fingerprint HASH`), đối chiếu schema/SQL bằng review. Không baseline tự động DB không rõ nguồn gốc. Sau migration, đăng ký metadata đúng handoff nếu DB mới, rồi chạy preflight/deploy. Không tự triển khai contract để “làm xanh” kiểm tra.

Sau bootstrap, Actions → manual deployment → SHA → verify → deploy; Environment reviewer phê duyệt. Workflow SSH chuyển bundle vào `/srv/dao/releases/<SHA>` rồi gọi:

```bash
bash deploy/deploy.sh deploy /srv/dao/releases/FULL_SHA FULL_SHA
```

Server lock và một session PostgreSQL advisory lock tuần tự hóa deploy/migrate/rollback (kể cả gọi tay). Trước thay đổi: xác minh manifest/provenance, pull đủ images, kiểm cấu hình/schema/metadata/RPC; lưu manifest/state hiện tại. State authoritative là `/srv/dao/current/{manifest.json,state.json}` và `previous/`, trỏ nguyên tử tới snapshot trong `state/`. Chỉ activate current sau smoke: tối đa 120 giây, yêu cầu frontend HTML/HTTP, API đúng scope và publication synced/ready, worker canonical check mới sau rollout và DB truy cập được. Compose/pull có deadline riêng trong script; toàn job deploy tối đa 20 phút. Catch-up lâu/RPC lỗi khiến deploy fail; xem log và giải quyết nguyên nhân, không nới health gate để giả thành công.

Smoke kiểm **application readiness**, không đồng nghĩa raw decode hoàn chỉnh. API hiện có cho phép HTTP 200/publication ready nhưng `status=degraded` khi giữ ancillary logs chưa decode; smoke giữ đúng contract đó và in `SMOKE_RAW_DECODE_INCOMPLETE` cùng counters, không đổi status/raw logs hoặc giả `rawDecodeComplete=true`. Đây là cảnh báo dữ liệu cần theo dõi/review riêng trước nghiệm thu nghiệp vụ/testnet; không gọi readiness PASS là toàn bộ chain data đã hoàn chỉnh.

Lỗi: `docker compose ... ps`, `docker compose ... logs --tail 200 api indexer frontend postgres` trên server (không upload log chứa runtime secrets chưa redaction). Đọc current/previous state và báo phiên bản nào đang chạy; không coi workflow exit 0 là đủ nếu smoke chưa hoàn tất.

## Rollback

```bash
bash /srv/dao/releases/CURRENT_SHA/deploy/deploy.sh rollback
```

Dùng manifest/digest release trước, không tag trôi. Chỉ tự khôi phục image khi migration set và fingerprint schema thực tế tương thích với trạng thái đã lưu. Schema đã đổi/chưa có bằng chứng tương thích: **dừng**, operator quyết định forward-fix hoặc restore đã thử nghiệm, không tự chạy SQL downgrade. Rollback image không phục hồi schema/dữ liệu; tuyệt đối giữ PostgreSQL volume. Release cũ phải còn artifact provenance và quyền pull image.

## Bằng chứng và giới hạn

[Evidence thực chạy](evidence/cicd-20261118.json) ghi kết quả và giới hạn; CI link ở PR. Local đã chạy release/operation/config regression, frontend lint/build container-mode, backend build, actionlint, Compose syntax và browser runtime public config/error path. Docker daemon local bị từ chối quyền; không gọi đó là image/Compose smoke PASS.

Khi có Docker daemon được phép dùng, Node24/Foundry1.8.5 và submodules:

```bash
nvm use
npm ci
git submodule update --init --recursive
bash scripts/cd/container-smoke.sh
```

Runner tự build images nếu không truyền IMAGE_TAG, tạo project/volume/Anvil riêng và dọn **chỉ tài nguyên test nó sở hữu**. Nó kiểm migration+backup/checksum/ledger, scope tên deployment khác numeric ID, runtime public config, proxy error contract, stale canonical heartbeat, nonroot, dữ liệu sau recreate PostgreSQL và đổi cấu hình image A→B→A. B là image cùng application code nhưng label/config khác để chứng minh thay/khôi phục image ID, **không chứng minh tương thích schema giữa hai revision ứng dụng khác nhau**. Manifest test chỉ là input helper, không giả là release GHCR đã qua CI.

Chỉ xác nhận CD end-to-end sau deploy **server đích**, smoke frontend/API/indexer/PostgreSQL và thử rollback thành công. GHCR publish, verify release thành công và server acceptance vẫn cần bằng chứng tương ứng; không chuyển trạng thái bằng suy đoán.
