# BE09 foreground handoff verification — 09/11/2026

Source tested: `774197cea6ce376d94a7fb706f56cdc54e6db3d3` (code commit, clean tracked/untracked checkout
at preflight/up/verify). This later evidence commit adds reports only.
Linux x64 cloud host; Node 24.15.0, npm 11.12.1, Forge/Anvil 1.8.5
(`51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f`), Solidity 0.8.37/Osaka,
PostgreSQL 18.4 (embedded server plus PostgreSQL official 18.4 client/libpq).
No WSL host was available here: TV3 must retest on their WSL.

## Result

- `preflight` PASS; root/frontend clean npm installs, backend typecheck/build,
  frontend build and forge build PASS (existing Solidity/Vite warnings retained).
- Foreground `serve` created fresh PostgreSQL, migrations 001–005, Anvil,
  deployment/role audit/governance seed, worker, API and frontend.
- `status` from independent commands before/after `verify`: five services LIVE.
- `verify`: six GET HTTP200, contract/API same H/hash, CORS preflight204 with
  allow-origin `http://127.0.0.1:5173`, worker restart/checkpoint/model digest PASS,
  FE live 1 passed / 0 failed / 0 skipped.
- Snapshot H=24, hash `0x0dfe9b8a51047f8c5fbf98bd414a0ba49c50dca5c278c81408afa6aae47172db`,
  revision `7aa6c3ea-83b5-4b58-8fb2-a8b2f058a0e8`; chainId31337, deployment `be09-local-20261109T154035Z-ab72342b0b29`.
- Health is **degraded**, indexer synced/publication ready: 16 unknown ancillary
  topics, 0 decode errors, rawDecodeComplete=false. No warning was hidden.
- Prior isolated run `20261109T153820Z-f0eaf5e07615` also passed verify on the same
  source; sending SIGTERM to its foreground shell stopped Vite/API/worker/Anvil
  and PostgreSQL. Data/logs retained; subsequent status exit1 reported all DOWN.
  This tests explicit signal cleanup on Linux, not WSL shutdown or terminal close.

## Access and receipt of handoff

RPC `http://127.0.0.1:18545`, API `http://127.0.0.1:3300`,
frontend `http://127.0.0.1:5173` were live on the source host at capture.
They are **loopback URLs**, not URLs accessible directly from TV3's machine.
The run was left serving at capture, but this file is an archive and never
establishes current availability after the cloud session stops.

TV3 should use [the foreground WSL runbook](../../be09.md#giữ-phiên-wsl-hoạt-động-khi-bàn-giao-40)
to create their own deployment, leave terminal1 running `serve`, and use terminal2
for `status → verify → status`. They must keep the first WSL session open and
confirm again from a newly opened second terminal. Save their own SHA, toolchain,
manifest, deployment name, H/hash/revision and report in #40. Do not reuse these
contract addresses or this deployment metadata for another Anvil.

Stop with Ctrl+C on the foreground terminal or `BE09_RUN_DIR=<exact-run-dir>
bash scripts/be09-local.sh down`. Restart after stopping means a new `serve`
run and new manifest; `verify` tests worker-only restart without resetting chain/DB.
Do not run a second `up`/`serve` over occupied ports.

## Evidence files

`manifest.json`, `source-provenance.json`, `handoff-public.json`, `results.json`,
`report.md`, Vitest JSON/log, six endpoint response JSON files and status output.
`sha256.json` covers all files except itself. Public fields only; runtime.env,
worker.env, database credentials and API_CURSOR_SECRET are excluded.

Issue #40 stays pending TV3's receiving-host verification. No cross-machine
reachability, WSL fix acceptance, browser-extension wallet, testnet or CI PASS is
claimed by this local run. A foreground session avoids letting the WSL call exit;
the original cause of TV3's process deaths still needs their logs/retest.
