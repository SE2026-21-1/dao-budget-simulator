# H52 original-packet extraction — 2026-11-24

These are **extracted copies**, not new run output, answering [TV2's request](https://github.com/SE2026-21-1/dao-budget-simulator/issues/41#issuecomment-7129225892). JSON bytes, including formatting and trailing newlines, are unchanged. No chain, worker, database query, wallet campaign, build or test was rerun.

## Source and integrity

- Source: [`docs/evidence/tv4-20261123-current-ui.tar.gz` at PR60 commit `b186844d1ff19ef26dfd83a060e7584bb6e0c419`](https://github.com/SE2026-21-1/dao-budget-simulator/blob/b186844d1ff19ef26dfd83a060e7584bb6e0c419/docs/evidence/tv4-20261123-current-ui.tar.gz).
- Archive: 10,383,497 bytes; SHA-256 `f2ae8cf26fcddbeb57d89dd8bbabc8e9401a0d49e3712e1887719cbf2f2247d7`.
- Embedded `MANIFEST.json`: SHA-256 `5946b8311f22d07260af5e04d35f1c39168450e89917f01114ecb3e0abe8bd1b`; all 161 payload sizes and SHA-256 hashes matched, with no unlisted payload files.
- Product source recorded by manifest and both JSON files: `6766e5ee2d8c466542687cbeb09677c4d11e5463`. This is the tested product revision, not the evidence-publication commit.

| Extracted copy | Original archive member | Bytes | SHA-256 (matches original MANIFEST) |
| --- | --- | ---: | --- |
| [extracted-worker-publication-H52.json](extracted-worker-publication-H52.json) | `real-extension/worker-publication-H52.json` | 1346 | `619a4f7375bbfb66263a5c17e1949b1891a7ec24aad133eda8b5f18b21984ee2` |
| [extracted-sql-reconciliation.json](extracted-sql-reconciliation.json) | `real-extension/sql-reconciliation.json` | 1968 | `9b27aff41993be137b721218bc8abb3bd4fc51e82e997ad25dc576c329649981` |

## Same-run reconciliation

The archive's `real-extension/real-extension-report.json` (SHA-256 `eceea6696b79e160d423a58d88dc3de0d62a40e05722de431073464371918dce`) records `PASS_SCOPED_TWO_REAL_EXTENSION_ACTORS`, 2026-11-23 08:59:19.847–09:00:53.760 UTC. Receipt, worker record, SQL excerpt and the report's three HTTP-200 summary/detail/transfers responses agree on the following boundary and applicable identities:

- Chain `31337`; H52 (`0x34`); hash `0x6be070601e941fd721fe0c25e584215f31fed12342d3b9736f6746512146ba66`; timestamp `1800002470`; revision `ae1ae7f2-48f8-4847-af12-b20988a382c9`.
- Proposal `80473439291238266157620742991282647983838392855857342276874399640497195595742`.
- Request `0xe27c8bbb52745c8a7636d106ba15a005b7f55d4084293bdfd415dfe06d557ab4`; operation `0xb22c7cbd699601e46d9531d013a1da4dc679f76d311fbe2add89992ef163cb1c`.
- Execute `0xd7ba6c7f1582def7b9e9d04c72168156128cc599bad7577e083bc0d4f2661d2c`, receipt status `0x1`; transfer log index `0` (`0x0` in receipt). SQL joins `raw_events` through deployment ID and source-event ID and returns exactly one disbursement for that request/transaction/block; it does not independently expose log index.
- One outgoing transfer/disbursement of 11,000 BUD; worker/API total in 12,000 BUD, total out 11,000 BUD, balance 1,000 BUD (18 decimals).

Worker `record.rawJson` exactly matches line 7540 of archived `real-extension-services/worker.stdout.log`. That 7,088,536-byte log has SHA-256 `4027507813b4d8df462c9678bd72722b574a245369752c9f9862a75abd635684`; the raw JSON record, without its line terminator, hashes to `dbef80c59aeb76e2a9f36c3adcedf881829ca1d2efb15b4f6c262353e4914000`, as recorded in the extracted worker file.

## Deployment namespaces and limits

Worker context uses numeric SQL `deployment_id` **`1`**; API context and SQL file's `executedBoundary` use deployment name **`qa07-e2e`**. [The original index](https://github.com/SE2026-21-1/dao-budget-simulator/blob/b186844d1ff19ef26dfd83a060e7584bb6e0c419/docs/evidence/tv4-20261123-current-ui-index.json#L102-L135) records the SQL INSERT-returned ID/name binding for chain 31337. They are different namespaces for this owned deployment, not interchangeable configuration values; do not set `VITE_DEPLOYMENT_ID=1`. The SQL excerpt contains its join/query and result, but not the deployment lookup or bound parameter values; this extraction does not claim a new independent database lookup.

SQL `projectionAtQuery` is H58/hash `0xdd3c67c7d6fecd831564e7e78b6566843925a7fcedd21769460b8d86fbf9d0a3`, after the separate account-switch fixture. Its returned disbursement remains bound to the original H52 execute; it is not a claim that the later SQL projection was still at H52. Scope remains the original fresh owned local PostgreSQL/unforked Anvil run with two extension actors, not testnet, production, human acceptance, or a new H52 chain.
