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

CHECKPOINT_DIR=
if [[ "$MODE" == --full ]]; then
  APP_KEY="$(git -C "$REPO_ROOT" rev-parse HEAD)-$(git -C "$REPO_ROOT" diff --binary HEAD | git hash-object --stdin)"
  ENGINE_KEY="$(git -C "$BRAIN_ROOT" rev-parse HEAD)-$(git -C "$BRAIN_ROOT" diff --binary HEAD | git hash-object --stdin)"
  CHECKPOINT_DIR=${VERIFY_CHECKPOINT_ROOT:-"$REPO_ROOT/.releases/.verify-checkpoints/$APP_KEY-$ENGINE_KEY"}
  install -d -m 700 "$CHECKPOINT_DIR"
  export VERIFY_CHECKPOINT_ROOT="$CHECKPOINT_DIR"
fi

run_checkpoint() {
  local label=$1
  shift
  if [[ -n "$CHECKPOINT_DIR" && -s "$CHECKPOINT_DIR/$label.passed" ]]; then
    printf 'verify: checkpoint passed, skip %s\n' "$label"
    return
  fi
  run "$@"
  [[ -z "$CHECKPOINT_DIR" ]] || printf 'passed_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$CHECKPOINT_DIR/$label.passed"
}

if [[ "$MODE" != "--release" ]]; then
  run_checkpoint engine-gate env LIBRECHAT_ROOT="$REPO_ROOT" \
    "$BRAIN_ROOT/projects/未来线/scripts/verify-engine.sh" "$MODE"
fi
run_checkpoint librechat-gate "$REPO_ROOT/scripts/yiweilife-quality-gate.sh" "$MODE"

if [[ -n "${TEST_EVIDENCE_OUTPUT:-}" ]]; then
  SCOPE=${TEST_EVIDENCE_SCOPE:-full}
  TEST_EVIDENCE_SUITE="verify-local:$MODE" \
    run bash "$SCRIPT_DIR/write-test-evidence.sh" "$SCOPE" "$TEST_EVIDENCE_OUTPUT"
fi

printf 'verify: local gate passed (%s)\n' "$MODE"
