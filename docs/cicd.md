# CI và phát hành container

Tài liệu này mô tả kiểm thử CI và phát hành image. Repository không còn workflow SSH
triển khai ứng dụng lên server.

## Kiểm thử

Workflow [TV4 CI](../.github/workflows/ci.yml) chạy các suite hợp đồng, backend,
frontend và container. Job container build ba image, kiểm tra cấu hình Compose và
chạy smoke trên project cô lập; đây không phải deployment hay live testnet acceptance.

Các lệnh liên quan:

```bash
node --test scripts/cd/release.test.mjs
bash scripts/cd/container-smoke.sh
```

Smoke cần Docker daemon được phép sử dụng; chỉ dọn tài nguyên cô lập do chính runner
tạo. Không chạy trên database đang phục vụ.

## Phát hành image

Trên pull request, CI build và smoke image nhưng không publish. Sau khi toàn bộ gate
pass trên push `Dev`, workflow có thể publish các image frontend, API và indexer lên
GHCR, khóa theo digest và tạo manifest gắn với SHA của release. Xác minh kết quả bằng
Actions run và artifact tương ứng; CI xanh không chứng minh deployment server,
wallet extension hoặc testnet E2E.

`deploy/compose.yml` là cấu hình dịch vụ dùng trong build/smoke. `deploy/compose.smoke.yml`
dành cho smoke cục bộ cô lập. Không có workflow deploy tới máy chủ trong repository.
