# BT3 VT-062 — chạy lại và đọc evidence

Repository gốc: <https://github.com/SE2026-21-1/dao-budget-simulator>. Nhánh local `individual/23001841-vt062-idempotent-retry`, baseline `ae8c3533e14a01f74ba4ea7b00c74365e1651be1`. Nhánh **chưa publish** lên GitHub; URL PR trong `DRAFT_PR.md` chỉ là dự kiến.

## Môi trường và kiểm tra nhanh

- Node 24.15.0 theo `.nvmrc`; npm với `package-lock.json` ở root và `frontend/package-lock.json`. Máy tạo evidence dùng Node ở `/home/cuongdz/.local/share/be06-tools/node/bin`.
- PostgreSQL 18.4 native chỉ cần cho mutation API. Foundry không cần cho test retry frontend/tải local; không có RPC/ví thật trong thí nghiệm tải.

```bash
cd ~/projects/dao-budget-vt062-individual
export PATH=/home/cuongdz/.local/share/be06-tools/node/bin:$PATH
npm ci --offline --no-audit
npm ci --prefix frontend --offline --no-audit
npm run test --prefix frontend
npm run lint --prefix frontend
npm run build --prefix frontend
```

Nếu cache npm không đủ, bỏ `--offline` để cài từ lockfile. Test trọng tâm: `frontend/src/chain/useTransaction.vt062.test.ts`, `frontend/src/pages/CreateProposalPage.vt062.test.tsx`, `frontend/src/chain/waitForReceipt.vt062.test.ts`. Log RED/GREEN và F1 nằm ở `docs/evidence/vt062/`; nguồn cuối F1 là commit `0d0a5f697f3ccc1a76333177f34508f721e8a2b4`.

## API/PostgreSQL và mutation

Test `tests/api/vt062-request-id.test.mjs` được chạy qua `scripts/check_vt062_api_native.mjs`. Runner tự tạo và xóa cluster/database tạm, áp dụng migration 001–005, seed publication và chạy HTTP server loopback. **Không** đặt runner vào database đang phục vụ API hoặc database dữ liệu cá nhân.

```bash
PATH=/home/cuongdz/.local/share/be06-tools/node/bin:$PATH \
LD_LIBRARY_PATH=/home/cuongdz/.local/share/be08-tools/pg184/usr/lib/x86_64-linux-gnu:/home/cuongdz/.local/share/be06-tools/postgres-root/usr/lib/x86_64-linux-gnu \
node scripts/check_vt062_api_native.mjs \
  --postgres-bin /home/cuongdz/.local/share/be08-tools/pg184/usr/lib/postgresql/18/bin \
  --output /tmp/vt062-api-good-recheck
```

Good/mutant/restored đã chạy trên database/snapshot mới mỗi lượt; command, SHA mapper, assertion fail và diff mutation một expression ở `docs/evidence/vt062/evaluation-runbook.md` và `docs/evidence/vt062/mutation/`. Tái lập bằng worktree tạm từ code tốt, không sửa nhánh nộp:

```bash
git worktree add --detach /tmp/vt062-mutant-recheck ae7f6e9928326e6bcce32f121439259efe9a582a
git -C /tmp/vt062-mutant-recheck apply "$PWD/docs/evidence/vt062/mutation/requestid-mutant.diff"
cd /tmp/vt062-mutant-recheck
npm ci --offline --no-audit
# Chạy đúng lệnh API/PostgreSQL ở trên với --output /tmp/vt062-api-mutant-recheck;
# expected exit 1 tại assertion requestId, không phải setup.
git apply -R "$HOME/projects/dao-budget-vt062-individual/docs/evidence/vt062/mutation/requestid-mutant.diff"
# Chạy lại với --output /tmp/vt062-api-restored-recheck (cluster/snapshot mới), expected exit 0.
cd "$HOME/projects/dao-budget-vt062-individual"
git worktree remove /tmp/vt062-mutant-recheck
```

Chọn đường worktree chưa tồn tại và output mới mỗi lượt; không dùng snapshot đã được tạo trước mutation. `requestId` bytes32 của fixture khác proposalId decimal. Không dùng `--force` khi tháo worktree.

## Tải local 60 tác vụ

`frontend/scripts/vt062-load.load.tsx` render hook `useTransaction` production trong React thật; ví và receipt là fake boundary. `frontend/vitest.load.config.ts` tách test tải khỏi suite mặc định. 60 task/wave, 10 warm-up và 100 wave đo cho từng workload, ba process/lượt độc lập. Lệnh dưới đây tạo lại CSV/JSON trong thư mục tạm để không ghi đè evidence đã nộp:

```bash
for run in 1 2 3; do
  VT062_LOAD_RUN="$run" VT062_LOAD_WARMUP=10 VT062_LOAD_WAVES=100 \
  VT062_LOAD_OUTPUT=/tmp/vt062-load-recheck \
  npm run test --prefix frontend -- --config vitest.load.config.ts
done
python3 scripts/summarize_vt062_load.py --input /tmp/vt062-load-recheck
```

`docs/evidence/vt062/load/raw-run-{1,2,3}.csv` là raw samples (có warm-up và measured); `summary-run-*.json` và `aggregate.json` là kết quả. Load harness/evidence commit `ae7f6e9928326e6bcce32f121439259efe9a582a`; hook SHA-256 `4cb742fd8f10a08af84c9b5b678541d26070b9e52350b22ebd8213de970d258d`, trang F1 SHA-256 `121365f2fccb44af4df14dc08a7e16708a337c1ae83e1534d81aaad9dce9ff13`. P95 nearest-rank tính lại từ CSV. Timing là `performance.now()` ngay trước `useTransaction.run` đến khi Promise của lần gọi đó settle; fake receipt mở bằng barrier, không chèn delay. Đây chỉ là latency logic local, **không** phải SLA 60 người dùng, network, RPC hay blockchain thật. DUPLICATE trả 59 `null` bị chặn/wave; `null` không được ghi là thành công.

## Báo cáo và PDF

`BT3_23001841_VT-062.md` là nguồn nội dung; `BT3_23001841_VT-062.pdf` là bản xuất có nội dung chính tối đa 8 trang, phụ lục riêng. Renderer ở `scripts/render_vt062_report.py` dùng `markdown==3.10`, `weasyprint==66.0`, `pypdf==6.7.4`, `pymupdf==1.26.5` và font DejaVu Sans. Cài dependency Python vào môi trường tạm rồi chạy:

```bash
python3 -m pip install -r docs/individual/23001841-vt062/pdf-requirements.txt
python3 scripts/render_vt062_report.py
```

Máy evidence không có `pip` mặc định; lượt này tải pip wheel vào `/tmp/vt062-pdf-tools/pip`, cài các package vào `/tmp/vt062-pdf-tools/packages` và chạy với `PYTHONPATH` trỏ tới đó. Nếu tái lập đúng trên máy này, có thể bootstrap pip vào `/tmp` mà không sửa system Python:

```bash
python3 - <<'PY'
import json, urllib.request, zipfile
from pathlib import Path
base = Path('/tmp/vt062-pdf-tools'); base.mkdir(exist_ok=True)
data = json.load(urllib.request.urlopen('https://pypi.org/pypi/pip/json'))
wheel = next(x for x in data['urls'] if x['filename'].endswith('py3-none-any.whl'))
path = base / wheel['filename']
if not path.exists(): path.write_bytes(urllib.request.urlopen(wheel['url']).read())
with zipfile.ZipFile(path) as archive: archive.extractall(base / 'pip')
PY
PYTHONPATH=/tmp/vt062-pdf-tools/pip python3 -m pip install \
  --target /tmp/vt062-pdf-tools/packages --no-input \
  -r docs/individual/23001841-vt062/pdf-requirements.txt
PYTHONPATH=/tmp/vt062-pdf-tools/packages python3 scripts/render_vt062_report.py
```

`docs/evidence/vt062/pdf-validation.txt` ghi số trang, font, text extraction và kiểm tra render. Bản reflection trong báo cáo là **bản nháp AI hỗ trợ**, cần sinh viên tự đọc và sửa theo trải nghiệm thật. Không có xác nhận sinh viên đã review/chấp thuận patch.
