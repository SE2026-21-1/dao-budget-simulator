# BE09 local verification — PASS

- Source revision: `774197cea6ce376d94a7fb706f56cdc54e6db3d3`
- Verification worktree HEAD: `774197cea6ce376d94a7fb706f56cdc54e6db3d3` (local file hashes and status in results.json)
- Chain ID: `31337`
- Deployment name: `be09-local-20261109T154035Z-ab72342b0b29`
- Real proposal ID: `85033959057062009095055709644487027886063896898440812188508422353819508755887`
- Snapshot: H=24, hash=0x0dfe9b8a51047f8c5fbf98bd414a0ba49c50dca5c278c81408afa6aae47172db, revision=7aa6c3ea-83b5-4b58-8fb2-a8b2f058a0e8

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

Machine-readable evidence: `/workspace/work/be09-state/runs/20261109T154035Z-31218ca0e76f/reports/verify-20261109T154111Z-dce84a44/results.json`
This local result does not replace CI, testnet, browser/wallet E2E, or TV3/TV4 review.
No cursor secret, database password, or private key is included in this report.
