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

RELEASE_SERVICE=$SERVICE exec bash "$SCRIPT_DIR/build-release.sh" "$RELEASE_ID"
