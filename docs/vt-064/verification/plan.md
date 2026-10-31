# Verification plan before additional tests (2026-11-01, Asia/Saigon)

Existing feature baseline: 1bb182144d516c13d6bb32fc30d2778af71a8169.
Starting review revision: cdc8740c5b1123d612962ffad467657bd4f8444b.
Continue the same student's personal branch; do not merge it.

## Actual isolated coding-agent prompt

The coding agent received only Draft fields, the three validation expressions,
per-row import/persistence behavior, CLI input bounds, VT-064 constraints and
the two module paths. It received no conversation history (fork_turns=none),
repository files, credentials, or other students' work. Prompt: "Produce a small
implementation plan BEFORE code ... exact canonical validation and generated
strings with trailing CR/LF/Unicode terminators ... assumptions, planned files,
two tentative recommendations to independently verify ... missing-context risk."

## Agent output, recorded before edits

1. Inspect drafts.ts and import.test.ts; enforce whole-string validation if needed.
2. Add generated mixed rows, line-terminator and uint256 boundary tests.
3. Check storage failure propagation, duplicate IDs, cleanup and concurrency.
4. Reuse a property-testing dependency and benchmark if already present.
Planned paths: indexer/import/drafts.ts; tests/indexer/import.test.ts.
Assumptions: canonical formats intended, no API/database changes.

## Independent review: rejected/revised recommendations

- Reject speculative validator patch: Node 24.22.1 returns false for both
  /^[1-9][0-9]*$/.test('1\n') and the ID expression on 'a\n'. The agent's
  suggestion about JavaScript '$' was untrustworthy. Add boundary properties
  without changing already-correct validation; do not trim malformed data.
- Revise dependency assumption: package.json/package-lock.json contain no
  fast-check. Existing import.test.ts implements a deterministic generator.
  Extend it with a metamorphic order/isolation property and an independent
  expected set; no new dependency and no claim of shrinking.
- Revise runner: npm run test:vt064 uses tsx's IPC CLI and fails EPERM here.
  node --import tsx --test runs the same tests without that IPC server. Change
  only the two import npm scripts, preserving arguments and CLI behavior.
- Repository evidence for staying offline: indexer/api/server.ts:685-686 rejects
  non-GET methods; storage.ts:274-286 wraps canonical batches in a transaction.
  User rows must not be inserted into this chain-derived read model.

## Revised work and limits

Add two properties in tests/indexer/import.test.ts, update import npm runners,
reproduce behavior-level red on b61cec8 with the reviewed tests, run current
green/typecheck/build/BE07, reproduce the required false-success mutation on
a temporary local branch/commit, restore clean submission source, capture
coverage and 80-task benchmark, update README/report/AI log and PDF.
Additional paths: package.json, docs/vt-064/*; production importer unchanged
unless a failing behavioral test justifies a fix.

Missing-context risk: module-only AI cannot establish whether drafts are
authorized proposals or infer API write permissions. Full repository review
remains the responsibility of the coordinating reviewer. The main assistant
already has repository guidelines and history; only this isolated plan call
can truthfully claim module-only context. Earlier PDF claims remain historical
and are not treated as newly observed execution evidence.
