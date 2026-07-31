#!/usr/bin/env bash
set -euo pipefail

MODE="${1:---full}"
if [[ "$MODE" != "--full" && "$MODE" != "--quick" && "$MODE" != "--release" ]]; then
  echo "usage: verify-local.sh [--full|--quick|--release]" >&2
  exit 2
fi

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
BRAIN_ROOT=$(cd -- "$REPO_ROOT/../../.." && pwd)

run() {
  printf 'verify: %s\n' "$*"
  "$@"
}

if [[ "$MODE" != "--release" ]]; then
  run env LIBRECHAT_ROOT="$REPO_ROOT" \
    "$BRAIN_ROOT/projects/未来线/scripts/verify-engine.sh" "$MODE"
fi
run "$REPO_ROOT/scripts/yiweilife-quality-gate.sh" "$MODE"

printf 'verify: local gate passed (%s)\n' "$MODE"
