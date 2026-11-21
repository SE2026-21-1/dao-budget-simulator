#!/usr/bin/env bash
set -euo pipefail

for tool in forge cast anvil; do
  version="$("$tool" --version)"
  printf '%s\n' "$version"
  if [[ "${version%%$'\n'*}" != "$tool Version: 1.8.5" ]]; then
    echo "Expected exactly $tool Version: 1.8.5 on the first line." >&2
    exit 1
  fi
done
