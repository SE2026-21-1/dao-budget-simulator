# BE09 local verification — PASS

- Source revision: `681289bb1f11db87bdfcb15c6b28d1d995229835`
- Verification worktree HEAD: `681289bb1f11db87bdfcb15c6b28d1d995229835` (local file hashes and status in results.json)
- Chain ID: `31337`
- Deployment name: `be09-local-20261106T105820Z-3225088c3bdc`
- Real proposal ID: `85033959057062009095055709644487027886063896898440812188508422353819508755887`
- Snapshot: H=24, hash=0x9a23133c9f90387329db7483c90055843e24bbbce8af15248ff0ded44204fa6a, revision=ae00bfe8-550e-41a0-9013-292d618f3982

## API endpoints

| GET endpoint | HTTP |
| --- | ---: |
| /api/health | 200 |
| /api/proposals | 200 |
| /api/summary | 200 |
| /api/proposals/85033959057062009095055709644487027886063896898440812188508422353819508755887 | 200 |
| /api/proposals/85033959057062009095055709644487027886063896898440812188508422353819508755887/votes | 200 |
| /api/treasury/transfers | 200 |

## Checks

- Contract/API comparison at the same H/hash: **PASS**
- CORS origin http://127.0.0.1:5173: **PASS**
- Worker restart, checkpoint and semantic database digest: **PASS**
- frontend/src/data/api.live.test.ts: **PASS**

Machine-readable evidence: `/home/cuongdz/.local/state/dao-budget-be09/runs/20261106T105820Z-262c5151e980/reports/verify-20261106T111024Z-bd857665/results.json`
This local result does not replace CI, testnet, browser/wallet E2E, or TV3/TV4 review.
No cursor secret, database password, or private key is included in this report.
