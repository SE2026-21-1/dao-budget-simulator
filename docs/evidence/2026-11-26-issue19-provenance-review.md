# TV4 — provenance bổ sung #19, 26/11/2026

## Kết luận riêng

**ĐẠT cho liên kết provenance bổ sung từ bytes đã giao**: snapshot H21 có run ID/source/digest tham chiếu khớp manifest/handoff và evidence H26 đã tiếp nhận. **Không phải full #19 PASS**: giữ FUNCTIONAL PASS SUPPORTED / DOCUMENTARY EVIDENCE PARTIAL. Thiếu ảnh/clip B-active sau Submit và version MetaMask của đúng phiên H26. Không gán 13.57.0.0 từ Chrome Profile 3 hoặc 13.58.0.0 của lượt TV4 cho phiên này.

Nguồn: [TV3 supplementary handoff7163475692](https://github.com/SE2026-21-1/dao-budget-simulator/issues/19#issuecomment-7163475692), [supplementary ZIP thực tế](https://github.com/user-attachments/files/35412686/TV3_Issue19_Supplementary_Provenance.zip), [original23-file ZIP](https://github.com/user-attachments/files/35336910/TV3_Issue19_QA07_Stale_Signer_SHAREABLE_REDACTED_20261124.zip), [review đã tiếp nhận7155152141](https://github.com/SE2026-21-1/dao-budget-simulator/issues/19#issuecomment-7155152141), [báo cáo trước](2026-11-25-issue19-tv4-review.md).

## Môi trường và thực thi

Review checkout **b92bef5409d6478de97efbc8209241620967d18a**, worktree chung riêng `/tmp/dao-tv4-acceptance-20261126`; không nhập PR21/55/personal. Linux 7.0.0-43-generic x86_64, Python3.12.3 stdlib urllib/zipfile/hashlib/json; Node22.23.3/npm10.9.9 chỉ là toolchain hiện tại, không dùng để gán lại runtime của TV3.

Đã tải HTTP bytes hai URL trên bằng urllib, kiểm trước giải nén: không absolute/traversal/backslash/symlink/duplicate member. Giải nén vào hai thư mục mới tạo exclusive `/tmp/tv4-github-20261126/{supplement,original}-extracted`. Sau đó chạy `python3 /tmp/tv4-github-20261126/verify_provenance.py`, **exit0**. Script dùng `ZipFile.testzip()`, SHA-256 toàn ZIP/từng SHA256SUMS entry, coverage đầy đủ trừ chính SHA256SUMS, so extracted bytes với archive members, assertions các binding bên dưới và `git show SOURCE:path` cho 12 first-party source hashes. Đây là offline verification; không gọi archived RPC/FE, không chạy governance/browser hoặc receiver mới. Script điều tra là tạm thời; thuật toán và kết quả được giữ tại báo cáo này.

| Gói | Bytes | Files / checksum | SHA-256 | CRC / path |
|---|---:|---|---|---|
| Supplement | 3.006 | 3 / 2 trên2 | `1bd7a594dcd3474f8a383335340c732ba32604992fad4c3b71856f319ff7d78a` | PASS / PASS |
| Original | 1.575.039 | 23 / 22 trên22 | `eb6aefafc60724bff4bc13ab6565a5d82655e3bb55fbcd850ed52508f34c5824` | PASS / PASS |

Supplement gồm `tv3_pre_wallet_rpc_snapshot.json`, `PROVENANCE.md`, `SHA256SUMS`; checksum coverage2/2 gồm JSON và notes. Original coverage22/22 giữ nguyên. Không yêu cầu TV3 đóng gói lại gói đã đủ checksum.

## Điều trực tiếp kiểm được

| Trường | Snapshot / đối chiếu |
|---|---|
| Snapshot SHA-256 | `f372c52c448394d36050146622d7e75a4e772cc6853c9fa1ee831bb6cb034293`, khớp original digest TV3 công bố |
| runId | `20261124T081807Z-tv3-account-switch` có trực tiếp trong JSON, không còn chỉ run label trong lời bàn giao |
| capturedAt | `2026-11-24T08:24:53.275709+00:00` có trực tiếp trong JSON; đây là timestamp do producer ghi, không timestamp được bên ngoài attestation |
| sourceCommit | `6766e5ee2d8c466542687cbeb09677c4d11e5463` bằng manifest, handoff, B-after-blocked RPC; 12/12 first-party manifest source hashes khớp object Git của SHA này |
| manifestSha256 | `eed749340e0530538195bb6695ea4ad11e7cf33698ddab49d9c32ba3c0bcfbbc`, tính lại từ bytes original `manifest.json`, bằng snapshot/handoff/H26 |
| handoffSha256 | `6732e7d3255bbef64b9c9ac28c017b40b1f99a160aa28f19711dd889ee67e479`, tính lại từ bytes original `handoff.json`, bằng snapshot |
| Chain/deployment/endpoints | chain31337; deployment `qa07-e2e` từ handoff, không phải field deployment trong snapshot. RPC `http://127.0.0.1:33053`, FE `http://127.0.0.1:44277` khớp; cả5contract addresses manifest/handoff khớp. URL là lịch sử, không còn là receiver live đã xác nhận |
| Genesis | `0xbf48bc3c82308c9f095294b82fb69a9d32425e21de16ef725a531fd6ff2d8c9c`, snapshot bằng H26 RPC |
| Pre-wallet H21 | number `0x15`, hash `0x67194a73ae4937c7a60773aa71175579de380534945ca3d83da82e5fc21f92a4` |
| Existing H26 | number `0x1a`, hash `0x70114d1c0c6b79369e3c6b73d35e18268fde943db401429967e267263d5d6b3f`; B-after-blocked JSON SHA-256 `7066f5ca75380a79441cfdd2df2e0787ead226c94e6de14b2810b6df76e44b6e` |

## Không suy ra từ digest

- “Tìm thấy tệp nguyên byte từ thư mục run lịch sử” là lời TV3; TV4 xác nhận **bytes nhận được và digest công bố**, không chứng minh độc lập thời điểm tạo hay người đã chạy. SHA-256 không phải chữ ký/attestation.
- H21→H26 được liên kết bằng source/manifest/handoff/chain/genesis/endpoints; không có toàn chuỗi header H22–H26 để tự xác minh ancestry canonical, cũng không attestation toàn served frontend. H21 không thay thế trace B-active/no-send H26 đã review.
- Không gán current PR60 head hoặc current Dev cho run6766e5e; không nâng offline review thành trực tiếp quan sát extension/receiver.
- Ảnh Review/trace sau khi về A không phải B-active sau Submit; version phiên H26 vẫn **UNKNOWN**. Full issue giữ mở.

## Phần TV3 còn phải bổ sung

Yêu cầu tối thiểu đã có ở7155152141 vẫn hiệu lực; không gửi lại yêu cầu provenance/ZIP đã được giải quyết. Nếu không còn ảnh/version của H26, ghi MISSING/UNKNOWN và chỉ thực hiện **một lượt draft/account-switch/no-send mới**, run ID mới + full approved source + manifest/handoff digests + browser/extension identity/version đúng phiên + B-active sau Submit/error/draft/requestId + provider trace/nonces/head/txpool trước–sau. Giữ run mới riêng, không giả ảnh mới thuộc H26, không chạy lại toàn governance. Không yêu cầu secret, key, seed, password, keystore hoặc RPC credential.
