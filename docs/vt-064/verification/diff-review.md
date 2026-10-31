# Diff review before acceptance

Feature baseline: 1bb182144d516c13d6bb32fc30d2778af71a8169.
Existing feature reviewed: cdc8740c5b1123d612962ffad467657bd4f8444b.

- Read original b61cec8/69ca712 diffs. Import uses validation per row; only
  DuplicateDraftError from link EEXIST is treated as a conflict; mkdir/write
  failures throw ImportFailure. The successful-ID append follows awaited save.
- Reviewed current diff from cdc8740: no production changes under indexer/,
  contracts/, database/ or frontend/. Two package scripts replace tsx CLI
  with Node's tsx loader; no API/DB write integration is introduced.
- New tests generate oracle membership independently, inspect persisted data,
  compare indexes, reverse order and reject 15 field/suffix combinations.
  T14 uses its own temporary directory even on a validator regression, avoiding
  an absolute shared path and leaked state. No automatic shrinking is claimed.
- Replayed behavioral red on b61cec8, verified current green and old BE07,
  killed actual false-success mutation in a separate worktree.
- No original validator change justified by observed test failures; rejected
  agent's speculative regex patch. No imported-only count used as sole oracle.
- Remaining limits: trusted destination, filesystem hardlinks, directory not
  fsynced, stop on infrastructure error, no wallet/HTTP/DB E2E acceptance.
- This is AI-assisted source review, not group/human approval. Do not merge.

GitHub test/plan commit: aca614da8c4842eadecd87434ddc98f9f41813ec.
GitHub runner patch: 969acb370f1a10ebd1f75728afa6d91b035a453d.
Locally executed corresponding commits 58a9798/8d507cf have the same trees;
GitHub plugin publication creates different commit metadata/hashes. Final
submission also includes T14 fixture isolation and updated evidence/report.
