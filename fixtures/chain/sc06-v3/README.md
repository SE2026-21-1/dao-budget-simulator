# SC06 v3 — canonical recursive build, 13 November 2026

Generated on a fresh owned Anvil by:

```bash
git submodule update --init --recursive
forge build
node --import tsx scripts/generate_sc06_chain.mjs fixtures/chain/sc06-v3
```

Exact source is `chain.json.generation.sourceCommit` (`7fb2958`), committed before
generation. Node24.15.0, Foundry/Anvil1.8.5, Solidity0.8.37/Osaka, optimizer200.
The generator verified raw receipts/headers/logs/calls against that live RPC before
stopping its owned resources:24receipts/42logs/27headers,14decoded business logs,
16ancillary unknown topics retained, two proposals Executed/Canceled, two votes,
700GOV For, one operation/disbursement,10000in/1000out/9000BUD balance at H26/hash.

CI on cacc7f6 rejected v2 because that worktree initialized only top-level submodules.
Canonical CI initializes recursively, adding erc4626-tests/halmos auto-remappings
into compiler metadata. Artifact/initcode/runtime hashes therefore legitimately
changed. All five rebuilt artifact hashes now exactly match the canonical v1/CI
build; creation code before CBOR is byte-for-byte equal to v2. No compiler,
Solidity, role, ABI or provenance assertion was relaxed. V1/v2 JSON/receipts/hash
remain archived unchanged; they must not be relabelled as this run.

The shared loader now rejects uninitialized or wrong-revision recursive dependencies
before loading compiler artifacts/deploying. Regression uses isolated real Git
repositories with incomplete and mismatched nested checkouts; no network or user
repository is modified. Existing local Anvil31337 and signed Sepolia guards remain.

New narrow verification at7fb2958:32/32SC06,28/28bootstrap/Sepolia,2/2frontend
canonical-SC06 live cases PASS. Full stdout/source/commands and canonical PublicNode
preflight are in `docs/evidence/tv4-20261113-canonical-raw.tar.gz`; final-head CI is
recorded on PR21. `liveRpcVerified=true` is generation-time verification, not a
currently running service, wallet extension, testnet deployment or release approval.

Use a new output directory for any future generation. Never overwrite historical
fixture or checksum to accommodate a later source/build.
