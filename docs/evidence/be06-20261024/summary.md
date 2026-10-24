# BE06 live rebuild/compare evidence

## Version and environment

- Live evidence commit: \`e4c3ce4300dfb3e90a4e933508b2a403887aaaee\`; the runner \`baseCommit\` and manifest \`sourceCommit\` match it. All 33 recorded source-file SHA-256 values match this committed tree.
- The live run includes the BE06 CI workflow addition and used a fresh Anvil chain plus fresh source/target databases in an isolated loopback PostgreSQL 18.6 cluster.
- BE02–BE06 local regression checks ran at \`77b2d819aef2540d6e22ffd0df37da4f1c577312\`. The only source-tree change from that test commit to the live evidence commit was \`.github/workflows/ci.yml\`; runtime and test implementation files were unchanged. The live rebuild/compare was run again against the exact evidence commit.
- Node 24.15.0, TypeScript 5.9.3, tsx 4.23.15, Foundry/Anvil 1.8.5, solc 0.8.37 and EVM Osaka.
- Docker and PowerShell wrappers were unavailable locally and remain BLOCKED; equivalent PostgreSQL suites ran directly. A dedicated GitHub Actions job now runs BE06 unit, PostgreSQL and live Anvil/PostgreSQL suites.

## FR15 / TC12 result

The deployment scope is chainId \`31337\` with the Governor, Timelock, Treasury and BUD contracts, deployment blocks, ABI versions and GOV token recorded in \`manifest.json\`. Manifest SHA-256: \`fd6275aacd0c8b922639601da3ef22f6587b6e61d20b919895a3434589378ff4\`.

At H=\`67\`, block hash \`0x284bf374a1854c73a1819ec5dbad08cfe155d93319daa8a52f8fcca3b4f3edc7\`, K=2, two fresh targets rebuilt from RPC through BE03 ingestion and BE04 projection. Both raw checkpoints and publications matched the requested H/hash. The reference and both rebuilds normalized to SHA-256 \`4edc995cd4ea206c893b0b55ffb22d8878504ce4e4478e64f1118c4944a97f81\`.

The normalized publication contains 6 proposals and states, 9 votes, 3 operations, 4 BUD transfers and 2 disbursements. Treasury totals are 13,000 BUD in, 12,000 BUD out and 1,000 BUD balance. Both reference and rebuilt data passed hash-pinned chain reconciliation for Governor state, \`proposalVotes\`, quorum, Timelock timestamp, contract linkage, clock and \`balanceOf(Treasury)\`.

The runner changed one target proposal state deliberately. Compare exited 2 and reported the proposal state mismatch with reference \`Canceled\` versus rebuild \`Defeated\`. After restoring the row, compare returned equal. The known 16 bootstrap ancillary unknown logs remain present; \`decodeComplete=false\`, 16 unknown topics, zero decode errors.

After the first rebuild, a BUD Transfer was mined at block 70 and returned by RPC. The chain advanced to head 73, leaving H=67 confirmed at K=2. A second fresh target still checkpointed and published only H=67/hash; neither target contained indexed headers or raw events after H.

## Commands and regression checks

Live command shape (RPC and database URLs are local loopback values and are omitted):

\`\`\`bash
node --import tsx scripts/check_be04_live.mjs --output <new-report-path> --be06
\`\`\`

The machine report records all 10 BE06 CLI invocations, target rebuild reports, normalized exports, compare reports, receipt evidence, deployment scope, H/hash, tool versions and source hashes. The compare JSON/Markdown, normalized exports, rebuild reports, manifest and SHA256SUMS are retained beside it.

| Check | Result |
| --- | ---: |
| \`npm run typecheck\`, \`npm run build\`, \`forge build\` | PASS |
| BE02 unit / PostgreSQL | 64/64, 21/21 |
| BE03 unit / PostgreSQL | 22/22, 16/16 |
| BE04 unit / PostgreSQL | 27/27, 10/10 |
| BE05 PostgreSQL API regression | 3/3 |
| BE06 unit / PostgreSQL | 5/5, 1/1 |
| Live Anvil + PostgreSQL rebuild/compare | PASS; equal at H/hash before and after chain advance |
| Live mismatch probe | PASS; mismatch reported and exit 2 |

Validation outputs are in \`verification.json\`; the full machine-readable live record is \`live.json\`. GitHub Actions is tracked on the final branch head.

## Review status and scope

The live evidence is bound to commit \`e4c3ce4\`. The following commit changes only evidence documents; the report's 33 source hashes bind it to the exact runtime/CI source tree.

TV4 still needs to accept FR15 rebuild/compare independently. TV1 still needs to confirm the on-chain cross-checks. No peer review is claimed complete. Automatic reorg rollback/retry remains BE07; acceptance benchmarking remains BE08.
