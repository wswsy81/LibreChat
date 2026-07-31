#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
TEST_ROOT=$(mktemp -d)
trap 'rm -rf -- "$TEST_ROOT"' EXIT

APP_DIR="$TEST_ROOT/app"
ENGINE_DIR="$TEST_ROOT/future-engine"
RELEASE_ROOT="$TEST_ROOT/releases"
FAKE_BIN="$TEST_ROOT/bin"
FAKE_LOG="$TEST_ROOT/docker.log"
mkdir -p "$APP_DIR" "$ENGINE_DIR/data" "$ENGINE_DIR/banks" "$RELEASE_ROOT" "$FAKE_BIN" "$TEST_ROOT/config" "$TEST_ROOT/library/corpora/schemas"
touch "$APP_DIR/.env" "$APP_DIR/docker-compose.prod.yml" "$ENGINE_DIR/Dockerfile"
printf '{}\n' > "$TEST_ROOT/library/corpora/schemas/bank-item.schema.json"
for file in runtime-policy.v1.json security-contract.v1.json product-catalog.v1.json product-experiments.v1.json rules.v1.json; do
  printf '{}\n' > "$TEST_ROOT/config/$file"
done
printf 'test prompt\n' > "$TEST_ROOT/config/global-prompt.v1.md"
for file in runtime-copy.v1.json rescue-bank.v1.json topics-bank.v1.json house-entry-options-bank.v1.json reveal-scenario-registry.v1.json reveal-common-variables.v1.json house-opening-bank.v1.json house-opening-bank.v2.json constitution.v1.json; do
  printf '{}\n' > "$ENGINE_DIR/banks/$file"
done

CURRENT_API="sha256:$(printf 'a%.0s' {1..64})"
CURRENT_ENGINE="sha256:$(printf 'b%.0s' {1..64})"
NEW_API="sha256:$(printf 'c%.0s' {1..64})"
NEW_ENGINE="sha256:$(printf 'd%.0s' {1..64})"
cat > "$APP_DIR/.release.env" <<EOF
LIBRECHAT_RELEASE_IMAGE=$CURRENT_API
FUTURE_ENGINE_RELEASE_IMAGE=$CURRENT_ENGINE
EOF

cat > "$FAKE_BIN/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$FAKE_DOCKER_LOG"
case "${1:-}" in
  info|run) exit 0 ;;
  buildx) exit 1 ;;
  build) exit 0 ;;
  image)
    if [[ "${2:-}" != inspect ]]; then exit 0; fi
    if [[ " $* " != *" --format "* ]]; then exit 0; fi
    format=${4:-}
    target=${5:-}
    if [[ "$format" == '{{.Id}}' ]]; then
      if [[ "$target" == yiweilife/librechat:* ]]; then printf '%s\n' "$FAKE_NEW_API"; else printf '%s\n' "$FAKE_NEW_ENGINE"; fi
    else
      printf 'node\n'
    fi
    ;;
  inspect)
    target=${*: -1}
    if [[ "$target" == LibreChat ]]; then printf '%s\n' "$FAKE_CURRENT_API"; else printf '%s\n' "$FAKE_CURRENT_ENGINE"; fi
    ;;
  compose) exit 0 ;;
  exec)
    [[ "${FAKE_HEALTH_FAIL:-0}" != 1 ]]
    ;;
  *) exit 0 ;;
esac
EOF
chmod +x "$FAKE_BIN/docker"

export PATH="$FAKE_BIN:$PATH"
export FAKE_DOCKER_LOG="$FAKE_LOG"
export FAKE_CURRENT_API="$CURRENT_API"
export FAKE_CURRENT_ENGINE="$CURRENT_ENGINE"
export FAKE_NEW_API="$NEW_API"
export FAKE_NEW_ENGINE="$NEW_ENGINE"
export APP_DIR_OVERRIDE="$APP_DIR"
export ENGINE_DIR_OVERRIDE="$ENGINE_DIR"
export RELEASE_ROOT
export LIBRECHAT_REVISION=test-api-revision
export ENGINE_REVISION=test-engine-revision

RELEASE_SERVICE=api bash "$SCRIPT_DIR/build-release.sh" API-HOTFIX-TEST >/dev/null
grep -qx "LIBRECHAT_RELEASE_IMAGE=$NEW_API" "$RELEASE_ROOT/API-HOTFIX-TEST.env"
grep -qx "FUTURE_ENGINE_RELEASE_IMAGE=$CURRENT_ENGINE" "$RELEASE_ROOT/API-HOTFIX-TEST.env"
grep -qx 'release_service=api' "$RELEASE_ROOT/API-HOTFIX-TEST.manifest"
[[ $(grep -c '^build ' "$FAKE_LOG") -eq 1 ]]

: > "$FAKE_LOG"
DOCKER_BUILDKIT=0 BUILD_CPU_QUOTA=60000 RELEASE_SERVICE=api \
  bash "$SCRIPT_DIR/build-release.sh" API-CPU-LIMIT-TEST >/dev/null
grep -q '^build --cpu-period 100000 --cpu-quota 60000 ' "$FAKE_LOG"
! grep -q -- '--cache-to' "$FAKE_LOG"

: > "$FAKE_LOG"
RELEASE_SERVICE=future-engine bash "$SCRIPT_DIR/build-release.sh" ENGINE-HOTFIX-TEST >/dev/null
grep -qx "LIBRECHAT_RELEASE_IMAGE=$CURRENT_API" "$RELEASE_ROOT/ENGINE-HOTFIX-TEST.env"
grep -qx "FUTURE_ENGINE_RELEASE_IMAGE=$NEW_ENGINE" "$RELEASE_ROOT/ENGINE-HOTFIX-TEST.env"
grep -qx 'release_service=future-engine' "$RELEASE_ROOT/ENGINE-HOTFIX-TEST.manifest"
[[ $(grep -c '^build ' "$FAKE_LOG") -eq 2 ]]

: > "$FAKE_LOG"
bash "$SCRIPT_DIR/apply-release.sh" "$RELEASE_ROOT/ENGINE-HOTFIX-TEST.env" >/dev/null
up_line=$(grep 'compose .* up --detach' "$FAKE_LOG")
[[ "$up_line" == *'future-engine' && "$up_line" != *' api'* ]]
grep -qx "LIBRECHAT_RELEASE_IMAGE=$CURRENT_API" "$APP_DIR/.release.env"
grep -qx "FUTURE_ENGINE_RELEASE_IMAGE=$NEW_ENGINE" "$APP_DIR/.release.env"
[[ -s "$APP_DIR/runtime-config/.last-good/global-prompt.v1.md" ]]
[[ -s "$ENGINE_DIR/data/runtime-last-good/runtime-copy.v1.json" ]]
[[ -s "$ENGINE_DIR/data/runtime-last-good/rescue-bank.v1.json" ]]
[[ -s "$ENGINE_DIR/data/runtime-last-good/topics-bank.v1.json" ]]

file_mode() {
  stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"
}
[[ $(file_mode "$APP_DIR/runtime-config") == 755 ]]
[[ $(file_mode "$APP_DIR/runtime-config/runtime-copy.v1.json") == 644 ]]
[[ $(file_mode "$APP_DIR/runtime-config/.last-good") == 755 ]]
[[ $(file_mode "$APP_DIR/runtime-config/.last-good/global-prompt.v1.md") == 644 ]]
[[ $(file_mode "$ENGINE_DIR/data/runtime-last-good") == 755 ]]
[[ $(file_mode "$ENGINE_DIR/data/runtime-last-good/runtime-copy.v1.json") == 644 ]]

: > "$FAKE_LOG"
set +e
FAKE_HEALTH_FAIL=1 HEALTH_ATTEMPTS=1 HEALTH_SLEEP_SECONDS=0 \
  bash "$SCRIPT_DIR/apply-release.sh" "$RELEASE_ROOT/API-HOTFIX-TEST.env" >/dev/null 2>&1
status=$?
set -e
[[ $status -ne 0 ]]
[[ $(grep -c 'compose .* up --detach' "$FAKE_LOG") -eq 2 ]]
while IFS= read -r line; do
  [[ "$line" == *' api' && "$line" != *'future-engine'* ]]
done < <(grep 'compose .* up --detach' "$FAKE_LOG")

printf 'release tests passed\n'
