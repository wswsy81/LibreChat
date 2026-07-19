#!/usr/bin/env bash
set -euo pipefail

MODE="${1:---full}"
if [[ "$MODE" != "--full" && "$MODE" != "--quick" ]]; then
  echo "usage: verify-local.sh [--full|--quick]" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"
PROJECT_ROOT="$(cd "$REPO_ROOT/.." && pwd)"
BRAIN_ROOT="$(cd "$REPO_ROOT/../../.." && pwd)"

run() {
  printf 'verify: %s\n' "$*"
  "$@"
}

run env LIBRECHAT_ROOT="$REPO_ROOT" \
  "$BRAIN_ROOT/projects/未来线/scripts/verify-engine.sh" "$MODE"
run "$REPO_ROOT/scripts/yiweilife-quality-gate.sh" "$MODE"

printf 'verify: local gate passed (%s)\n' "$MODE"
