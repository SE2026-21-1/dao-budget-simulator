# VT-064 — 2026-11-14 module-only encoding plan (before code)

## Actual assignment and context boundary

This is a real delegated coding-agent planning artifact, written before creating the new encoding tests or changing runtime code. It is not the reconstructed historical prompt in `spec.md`, and it does not claim a second independent model consultation or test execution.

Actual assignment received:

> Target: Only read `indexer/import/drafts.ts`, `indexer/import/cli.ts`, `tests/indexer/import.test.ts`, `docs/vt-064/spec.md` and `package.json` within the worktree. Own NEW `docs/vt-064/20261114-module-plan.md` and NEW `tests/indexer/import-encoding.test.ts`. Do NOT edit runtime code.
>
> User requires real coding-agent implementation plan before code with prompt/assumptions/planned files; only module context supplied. Record this actual prompt/context restriction honestly. Existing CLI createReadStream utf8 may silently replace malformed bytes; persistence must preserve exact data and not report success for corruption. Plan smallest strict UTF8 delta preserving 1MiB/1000rows/existingJSON/error contracts. Include options/tradeoffs/BOM and chunk boundaries, input file vs per-row error semantics, exact planned files; do not assert unseen whole-repo architecture. Provide at least two concrete choices parent can independently challenge using repo/module evidence (not fabricated bad suggestions).
>
> Then write consumer-visible CLI regressions: malformed bytes inside otherwise valid JSON rejects with INVALID_INPUT/no stdout/no persisted output; truncated UTF8 rejects; valid Unicode across 64KiB chunk boundary persists exact data. Seeded generated valid Unicode data property if proportionate, deterministic IDs/dirs and errors/counterexamples. CLI actual process with temp files, no mocks. Extra test file only, no changes to existing tests/runtime. Parent will run RED before patch. End with recommended narrow patch steps and context-missing risk.

The runtime also supplied agent/worktree instructions: work only in `/tmp/dao-vt064-submission-20261114`, preserve historical logs, do not commit/push or run tests/build/formatters, and leave verification/evidence to the parent. Only the five named existing files were consulted. No API, storage, database, compiler configuration, git history or other subsystem was inspected. Architectural statements in the historical specification are requirements/context, not independently verified repository facts here.

## Observed module contracts

- `cli.ts:11–20` reads a stream already decoded as UTF-8, recounts decoded bytes, then parses JSON. Node's replacement decoding can turn invalid bytes inside a JSON string into U+FFFD while leaving JSON syntactically valid. This is a source-level diagnosis, not an observed reproduction in this planning run.
- `cli.ts:21–28` imports only after reading/parsing, prints successful reports on stdout, and maps `InputError` to `INVALID_INPUT`, persistence failure to `PERSISTENCE_FAILED`, other errors to `INPUT_READ_FAILED`.
- `drafts.ts:76–97` independently rejects invalid rows, limits arrays to 1–1000, and lazily creates the output directory only for a valid draft. `drafts.ts:37–49` caps descriptions at 1024 JavaScript string units, validates IDs/recipients/amounts, and copies accepted fields without normalization.
- `drafts.ts:53–72` writes JSON plus newline, syncs, publishes without overwriting, and cleans its temporary file. Preserve this path; no persistence rewrite is needed for source-byte validation.
- `spec.md` AC2 and the core invariant require exact accepted values; NFR2 bounds input at 1 MiB. Exactness here means Unicode string/field equality and the existing JSON serialization, not preserving whitespace or byte-for-byte source JSON formatting.
- Existing CLI tests spawn `process.execPath --import tsx indexer/import/cli.ts`; `package.json` declares Node >=24 and a `test:vt064` script naming only `import.test.ts`.

## Assumptions and error boundary

Input files are UTF-8 JSON. Reject malformed UTF-8 anywhere in the file before parsing or importing any row, even if another row is valid. This is `INVALID_INPUT`, not a per-row `rejected` item or a storage failure: corrupt bytes cannot reliably identify the intended JSON values/row boundaries. Therefore no stdout and no new output directory/files are permitted. Valid UTF-8 containing an actual U+FFFD is legal data and must not be mistaken for corruption. No Unicode normalization, trimming of accepted values, or lossy round trip is allowed.

Keep existing JSON semantics: do not add JSON repair, unpaired-surrogate validation for escaped JSON, record coercion or row recovery. Keep the 1 MiB raw input ceiling (including any BOM/whitespace) and the existing 1000-row limit; preserve argument/read/persistence error codes and per-row semantics for correctly decoded files.

## Independently challengeable implementation choices

1. **Recommend streaming fatal decoding of raw buffers, rather than buffering the full file first.** Remove `encoding: 'utf8'`, count each raw chunk's `byteLength` before decoding, explicitly enforce the specified 1 MiB raw-input ceiling, and feed one `TextDecoder('utf-8', { fatal: true, ignoreBOM: true })` with `{ stream: true }`. Raw-byte accounting corrects baseline behavior: the old code recounts replacement-decoded characters, not necessarily the original bytes. Append a final `decoder.decode()` at EOF to detect an incomplete terminal sequence. Catch only decoder failures and translate them to `InputError`; filesystem errors must remain `INPUT_READ_FAILED`. Preserve the final JSON.parse catch separately. This retains the streaming shape while implementing the NFR's byte bound precisely. A viable alternative is bounded raw-buffer accumulation followed by one fatal decode, which makes EOF handling simpler but adds buffer retention/concatenation alongside the text. Parent can challenge the simplicity/allocation tradeoff directly against the current short loop and 1 MiB requirement; either choice can satisfy the contract. No per-chunk independent decoding: a valid multibyte scalar may straddle chunks.
2. **Recommend retaining current leading-BOM rejection, not silently accepting it.** Existing decoded text keeps U+FEFF and JSON.parse rejects a leading BOM. TextDecoder normally consumes the signature, so use `ignoreBOM: true` (counterintuitively, retain the BOM as a character) to preserve the existing JSON contract. An alternative is deliberately accepting a UTF-8 BOM as an interface enhancement, but that would change currently visible JSON behavior and needs an explicit decision, not an incidental decoder default. Parent can challenge this against `cli.ts:13–20`; the new BOM regression makes the chosen compatibility requirement visible. A U+FEFF inside a description is ordinary valid data and remains accepted.
3. **Recommend file-level decoding validation before persistence, not per-row encoding rejection.** Current CLI already completes reading and JSON parsing before calling `importDrafts`; keeping that sequencing prevents earlier valid rows from being committed when later source bytes are corrupt. Independent per-row validation remains in `drafts.ts`. This choice is checkable against AC2 versus the input-level JSON/array contracts, not an assumption that all errors should abort batches.

## Exact planned files and implementation order

1. NEW `docs/vt-064/20261114-module-plan.md` — this pre-code prompt, context boundary, alternatives, assumptions and narrow patch plan.
2. NEW `tests/indexer/import-encoding.test.ts` — actual-process CLI regressions using real temporary input files/output directories, no mocks. Deterministic case names, draft IDs and child paths under one OS-isolated temporary root per test; seeded generated Unicode with seed/row/counterexample diagnostics. Cover invalid bytes inside otherwise valid JSON (including a valid neighboring row), incomplete UTF-8 at EOF, valid 2/3/4-byte characters spanning byte 65536, BOM compatibility, and exact persistence of generated Unicode including genuine U+FFFD.
3. EXISTING `indexer/import/cli.ts` — parent-owned follow-on patch only: raw-byte counting plus stateful fatal UTF-8 decode/final flush, narrow decoder-to-InputError conversion, no unrelated changes.
4. EXISTING `package.json` — parent-owned follow-on change: include both importer test files in `test:vt064` and use `node --import tsx --test`, matching the existing `test:be07` launcher and CLI subprocess pattern, rather than retaining the old `tsx --test` launcher.

No change planned to `indexer/import/drafts.ts`, `tests/indexer/import.test.ts` or the historical `docs/vt-064/spec.md`. No dependency, migration, API, persistence-format or chain-related change is justified by the supplied context. This worker owns only the two new files.

## Parent verification and acceptance evidence

Do not treat this plan as execution evidence. Parent should first run `node --import tsx --test tests/indexer/import-encoding.test.ts` before the runtime patch and retain the real RED output; malformed bytes in a JSON string are expected to expose replacement-decoding behavior. EOF truncation/BOM/valid Unicode cases may already pass and remain regression guards. After the narrow patch and script update, run the focused importer tests once and record the actual result. If the parent runs type checking, use the repository's real compiler configuration rather than inventing flags here.

The boundary fixture uses JSON whitespace padding to place a multibyte scalar's first byte at offset 65535 without violating the 1024-unit description cap. Its exact scalar bytes cross the current stream's usual 64 KiB boundary. The property is a bounded deterministic batch, not an exhaustive Unicode claim. Compare the parsed stored object and description with independently generated input values; JSON serialization whitespace and trailing newlines are incidental, not an acceptance oracle.

## Recommended narrow patch and missing-context risk

First retain RED evidence from the new tests. Then implement only raw-byte counting, fatal stateful decoding with EOF flush, explicit BOM preservation, and decoder-specific `INVALID_INPUT` mapping in `cli.ts`; wire the new test into `test:vt064`; verify the focused module tests. Do not alter row validation, serialization or publication.

Module-only evidence cannot prove whole-repository architecture, downstream consumers' encoding expectations, CI discovery, or compiler/runtime deployment compatibility beyond the declared Node >=24 requirement. The parent must reconcile those interfaces with its available context. In particular, silently broadening BOM acceptance or changing the test script without checking its actual usage would exceed what this isolated review can establish. No unseen cross-module safety claim is made.

## Parent review decisions applied before runtime patch

The parent reviewed this recorded plan before its runtime patch and independently challenged these details:

1. Rejected the original line-51 oracle requiring stored bytes to equal `JSON.stringify(row) + '\n'`: it overconstrained incidental formatting. The owned tests now compare parsed persisted objects and descriptions with generated source values, without pinning serialization bytes.
2. Chose `node --import tsx --test` for `test:vt064`, matching the visible `test:be07` script and CLI child-process convention. The parent cited avoiding unnecessary Unix IPC from the `tsx` CLI; this worker did not independently execute or investigate that launcher behavior.
3. Corrected the original “same ceiling”/“existing streaming bound” wording: the numeric 1 MiB requirement remains, but counting raw bytes is a behavioral correction to recounting replacement-decoded characters. The reviewed decoder choice above now states that distinction explicitly.

These are actual reviewer-directed changes, not fabricated rejected proposals. This worker revised only its plan and new test file; runtime/script changes and all execution evidence remain parent-owned.
