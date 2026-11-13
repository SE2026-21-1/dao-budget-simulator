#!/usr/bin/env bash
# Run the same checks locally and in GitHub Actions. No RPC or private key needed.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

for tool in forge cast anvil python3; do
  command -v "$tool" >/dev/null || { echo "Missing tool: $tool" >&2; exit 1; }
done
for tool in forge cast anvil; do
  version="$("$tool" --version)"
  echo "$version"
  if ! head -n 1 <<< "$version" | grep -Eq "Version: 1\.8\.5($|[-+ ])"; then
    echo "Expected $tool 1.8.5 (see README.md)." >&2
    exit 1
  fi
done
for dependency in lib/forge-std/src/Test.sol lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol; do
  [[ -f "$dependency" ]] || { echo 'Run: git submodule update --init --recursive' >&2; exit 1; }
done

forge fmt --check
forge build
# Run all available suites, including future attack/invariant tests.
forge test -vv
python3 scripts/check.py
