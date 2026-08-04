#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
RELEASE_ID=${1:-"CONFIG-$(date -u +%Y%m%dT%H%M%SZ)"}
RELEASE_ROOT=${RELEASE_ROOT:-"$(cd -- "$SCRIPT_DIR/.." && pwd)/.releases"}
EVIDENCE_FILE="$RELEASE_ROOT/.test-evidence/$RELEASE_ID.evidence"

TEST_EVIDENCE_OUTPUT="$EVIDENCE_FILE" TEST_EVIDENCE_SCOPE=config-only \
  bash "$SCRIPT_DIR/verify-hotfix.sh" config
SELECTED_BY=classifier SELECTED_CHANNEL=config-only RELEASE_MODE=config-only RELEASE_SERVICE=config \
  TEST_EVIDENCE_FILE="$EVIDENCE_FILE" \
  exec bash "$SCRIPT_DIR/build-release.sh" "$RELEASE_ID"
