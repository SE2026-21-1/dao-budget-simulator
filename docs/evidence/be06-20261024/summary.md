# BE06 live rebuild/compare evidence

## Version and environment

- Implementation commit: \`1ffbc3b8a283a7bdd346ecc3205909fa358c0590\` (\`feat(be06): rebuild and compare at pinned block H\`).
- Live runner \`baseCommit\`, manifest \`sourceCommit\`, and implementation commit are the same SHA. All 33 recorded source-file SHA-256 values match that committed tree.
- The BE02–BE06 regression suite ran on local commit \`77b2d819aef2540d6e22ffd0df37da4f1c577312\`; its Git tree SHA \`7ba189849004f24ba17b4d5dd3b1a7873a02e4b4\` is identical to the implementation commit tree.
- Node 24.15.0, TypeScript 5.9.3, tsx 4.23.15, PostgreSQL 18.6, Foundry/Anvil 1.8.5, solc 0.8.37 and EVM Osaka.
- The runner used a new local Anvil chain and fresh source/target databases in an isolated loopback PostgreSQL cluster. Docker and PowerShell wrappers were unavailable; those wrappers are BLOCKED, while equivalent PostgreSQL suites ran directly.

## FR15 / TC12 result

The audited deployment scope is chainId \`31337\` with the Governor, Timelock, Treasury and BUD contracts, deployment blocks, ABI versions and GOV token recorded in \`manifest.json\`. Manifest SHA-256: \`bec3431039710891f0e52fb3b036f6cf2dd1671fcaad4fd742c1143db6914528\`.

At H=\`67\`, block hash \`0xe97832b322764ee72481d093d9ce3598d423779e47eddc5c017ff00af12daeee\`, K=2, two fresh targets rebuilt from RPC through BE03 ingestion and BE04 projection. Both raw checkpoints and publications matched the requested H/hash. The reference and both rebuilds normalized to SHA-256 \`bd5f430c33834380a6dc73498311ae7f975b82ca27aeb17a367b5573cdbd3c18\`.

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

Validation output is in \`verification.json\`; the full machine-readable live record is \`live.json\`.

## Review status and scope

This evidence was generated against the implementation commit above. The follow-up commit changes only evidence documents; the live report's 33 source hashes bind it to the exact code/document tree. GitHub Actions status is recorded on the final branch head separately.

TV4 still needs to accept FR15 rebuild/compare independently. TV1 still needs to confirm the on-chain cross-checks. No peer review is claimed complete. Automatic reorg rollback/retry remains BE07; acceptance benchmarking remains BE08.
