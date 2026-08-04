#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SERVICE=${1:-}
RELEASE_ID=${2:-"HOTFIX-$(date -u +%Y%m%dT%H%M%SZ)"}

case "$SERVICE" in
  api|future-engine) ;;
  *)
    echo "usage: bash deploy/build-hotfix-release.sh <api|future-engine> [release-id]" >&2
    exit 1
    ;;
esac

RELEASE_ROOT=${RELEASE_ROOT:-"$(cd -- "$SCRIPT_DIR/.." && pwd)/.releases"}
EVIDENCE_DIR="$RELEASE_ROOT/.test-evidence"
EVIDENCE_FILE="$EVIDENCE_DIR/$RELEASE_ID.evidence"
SCOPE=api-hotfix
[[ "$SERVICE" == future-engine ]] && SCOPE=engine-hotfix
TEST_EVIDENCE_OUTPUT="$EVIDENCE_FILE" TEST_EVIDENCE_SCOPE="$SCOPE" \
  bash "$SCRIPT_DIR/verify-hotfix.sh" "$SERVICE"
SELECTED_BY=classifier SELECTED_CHANNEL="$SCOPE" RELEASE_MODE=hotfix RELEASE_SERVICE=$SERVICE \
  TEST_EVIDENCE_FILE="$EVIDENCE_FILE" \
  exec bash "$SCRIPT_DIR/build-release.sh" "$RELEASE_ID"
