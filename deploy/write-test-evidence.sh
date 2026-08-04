#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
APP_DIR=${APP_DIR_OVERRIDE:-"$(cd -- "$SCRIPT_DIR/.." && pwd)"}
ENGINE_DIR=${ENGINE_DIR_OVERRIDE:-"$(cd -- "$APP_DIR/../future-engine-shim" && pwd)"}
SCOPE=${1:-}
OUTPUT=${2:-}
SUITE=${TEST_EVIDENCE_SUITE:-manual}

case "$SCOPE" in
  config-only|engine-hotfix|api-hotfix|full|release-pipeline) ;;
  *)
    echo "usage: bash deploy/write-test-evidence.sh <config-only|engine-hotfix|api-hotfix|full|release-pipeline> <output>" >&2
    exit 2
    ;;
esac
[[ -n "$OUTPUT" ]] || {
  echo "test evidence output is required" >&2
  exit 2
}

LIBRECHAT_REVISION=reused-active
ENGINE_REVISION=reused-active
case "$SCOPE" in
  api-hotfix)
    LIBRECHAT_REVISION=$(bash "$SCRIPT_DIR/verify-revision.sh" "$APP_DIR" HEAD librechat_revision)
    ;;
  config-only|engine-hotfix|release-pipeline)
    ENGINE_REVISION=$(bash "$SCRIPT_DIR/verify-revision.sh" "$ENGINE_DIR" HEAD future_engine_revision)
    ;;
  full)
    LIBRECHAT_REVISION=$(bash "$SCRIPT_DIR/verify-revision.sh" "$APP_DIR" HEAD librechat_revision)
    ENGINE_REVISION=$(bash "$SCRIPT_DIR/verify-revision.sh" "$ENGINE_DIR" HEAD future_engine_revision)
    ;;
esac

install -d -m 700 "$(dirname -- "$OUTPUT")"
TMP="$OUTPUT.tmp.$$"
umask 077
{
  printf 'schema=yiwei.release-test-evidence.v1\n'
  printf 'status=passed\n'
  printf 'scope=%s\n' "$SCOPE"
  printf 'suite=%s\n' "$SUITE"
  printf 'librechat_revision=%s\n' "$LIBRECHAT_REVISION"
  printf 'future_engine_revision=%s\n' "$ENGINE_REVISION"
  printf 'finished_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$TMP"
chmod 600 "$TMP"
mv "$TMP" "$OUTPUT"
printf '%s\n' "$OUTPUT"
