BE07: khôi phục reorg và theo dõi RPC/freshness cho indexer/API.

Trước thay đổi, reorg làm sync dừng ở CHECKPOINT_HASH_MISMATCH; DB giữ nhánh cũ
và API vẫn trả 200/synced với hash orphan. Sau thay đổi, indexer lưu recovery
trước RPC search, invalidate revision/cursor, rollback về tổ tiên chung và replay
canonical với K=2. Chỉ BE04 đã đối chiếu lại cùng H/hash mới mở publication.

- Dùng cửa sổ hash cấu hình được, giữ prefix headers và metadata deployment.
  Rollback raw/model/checkpoint/publication theo deployment dưới advisory lock;
  revision/checkpoint CAS chặn writer cũ. Vượt cửa sổ chuyển rebuild_required.
- Worker polling kiểm tra cả idle; RPC retry có giới hạn, backoff/jitter/timeout
  và abort. Freshness dựa thời điểm RPC verification trước DB lock, không dùng
  last commit. API giữ enum/error code BE05, thêm recoveryStatus/lastRpcCheckAt/
  publicationBlock; cursor orphan trả 409 và recovery data/health trả 503.
- Áp dụng migration 005 sau 001–004. DB rebuild BE06 mới cũng áp dụng 004/005.
  Audit còn sửa shorter-head cuối batch, lag JSON null và cursor padding alias.

Validation: local Node24.15.0, PostgreSQL18.4, Foundry/Anvil1.8.5.
Evidence nền:133 unit/65 PostgreSQL case, Anvil reorg và BE06 compare equal H67.
Sau audit chỉ chạy lại phần liên quan:37 unit,18 DB BE07,4 API cases,
typecheck/build và Anvil recovery/5 SIGKILL/BE06 compare equal. RPC503 >31 giây
chuyển lagging rồi phục hồi; event đủ K sample177 ms. NFR03 là workload local,
không khẳng định SLA dưới tải lớn. Lượt API lỗi trung gian và evidence TV4 kế
thừa được phân biệt rõ, không đánh lại PASS.

Chạy nghiệm thu bằng toolchain trên:
```bash
npm ci
git submodule update --init --recursive
forge build
BE07_PG_BIN=/usr/lib/postgresql/18/bin npm run test:be07:native
```

Base: **feature/tv2-be06**, phụ thuộc BE05/BE06 vì Dev1451779 chưa chứa đầy đủ
các dependency đó. Diff PR chỉ gồm BE07; không merge dependency trong PR này.

Evidence: docs/evidence/be07-20261025/report.md và
docs/evidence/be07-packaging-20261025/report.md. Hướng dẫn: docs/be07.md.

- [ ] CI remote đúng head SHA: chưa có kết quả tại lúc tạo Draft PR.
- [ ] TV4 nghiệm thu độc lập/máy khác.

Related #18
