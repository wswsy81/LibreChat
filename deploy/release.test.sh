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

init_pushed_repo() {
  local repo=$1
  local remote=$2
  git init --bare "$remote" >/dev/null
  git -C "$repo" init -b main >/dev/null
  git -C "$repo" config user.name release-test
  git -C "$repo" config user.email release-test@example.invalid
  git -C "$repo" add .
  git -C "$repo" commit -m initial >/dev/null
  git -C "$repo" remote add origin "$remote"
  git -C "$repo" push -u origin main >/dev/null
}

cat > "$APP_DIR/.gitignore" <<'EOF'
.env
.release.env
.releases/
runtime-config/
EOF
printf 'app source\n' > "$APP_DIR/source.txt"
printf 'data/\n' > "$ENGINE_DIR/.gitignore"
printf 'engine source\n' > "$ENGINE_DIR/source.txt"
init_pushed_repo "$APP_DIR" "$TEST_ROOT/app-origin.git"
init_pushed_repo "$ENGINE_DIR" "$TEST_ROOT/engine-origin.git"

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
  buildx)
    case "${2:-}" in
      version) [[ "${FAKE_BUILDX_AVAILABLE:-0}" == 1 ]] ;;
      inspect) printf 'Name: test-builder\nDriver: %s\n' "${FAKE_BUILDX_DRIVER:-docker}" ;;
      *) exit 1 ;;
    esac
    ;;
  build)
    for arg in "$@"; do
      if [[ "$arg" == type=local,dest=*,mode=max ]]; then
        cache_dir=${arg#type=local,dest=}
        mkdir -p "${cache_dir%,mode=max}"
      fi
    done
    ;;
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
export LIBRECHAT_REVISION
export ENGINE_REVISION
LIBRECHAT_REVISION=$(git -C "$APP_DIR" rev-parse HEAD)
ENGINE_REVISION=$(git -C "$ENGINE_DIR" rev-parse HEAD)
export RUNTIME_WRITER_UID
export RUNTIME_WRITER_GID
RUNTIME_WRITER_UID=$(id -u)
RUNTIME_WRITER_GID=$(id -g)

API_EVIDENCE="$RELEASE_ROOT/.test-evidence/API-HOTFIX-TEST.evidence"
TEST_EVIDENCE_SUITE=release-test \
  bash "$SCRIPT_DIR/write-test-evidence.sh" api-hotfix "$API_EVIDENCE" >/dev/null
TEST_EVIDENCE_FILE="$API_EVIDENCE" SELECTED_CHANNEL=api-hotfix RELEASE_MODE=hotfix RELEASE_SERVICE=api \
  bash "$SCRIPT_DIR/build-release.sh" API-HOTFIX-TEST >/dev/null
grep -qx "LIBRECHAT_RELEASE_IMAGE=$NEW_API" "$RELEASE_ROOT/API-HOTFIX-TEST.env"
grep -qx "FUTURE_ENGINE_RELEASE_IMAGE=$CURRENT_ENGINE" "$RELEASE_ROOT/API-HOTFIX-TEST.env"
grep -qx 'release_service=api' "$RELEASE_ROOT/API-HOTFIX-TEST.manifest"
[[ $(grep -c '^build ' "$FAKE_LOG") -eq 1 ]]

: > "$FAKE_LOG"
DOCKER_BUILDKIT=0 BUILD_CPU_QUOTA=60000 TEST_EVIDENCE_FILE="$API_EVIDENCE" \
  SELECTED_CHANNEL=api-hotfix RELEASE_MODE=hotfix RELEASE_SERVICE=api \
  bash "$SCRIPT_DIR/build-release.sh" API-CPU-LIMIT-TEST >/dev/null
grep -q '^build --cpu-period 100000 --cpu-quota 60000 ' "$FAKE_LOG"
! grep -q -- '--cache-to' "$FAKE_LOG"

: > "$FAKE_LOG"
FAKE_BUILDX_AVAILABLE=1 FAKE_BUILDX_DRIVER=docker TEST_EVIDENCE_FILE="$API_EVIDENCE" \
  SELECTED_CHANNEL=api-hotfix RELEASE_MODE=hotfix RELEASE_SERVICE=api \
  bash "$SCRIPT_DIR/build-release.sh" API-DOCKER-DRIVER-TEST >/dev/null
! grep -q -- '--cache-to' "$FAKE_LOG"

: > "$FAKE_LOG"
ENGINE_EVIDENCE="$RELEASE_ROOT/.test-evidence/ENGINE-HOTFIX-TEST.evidence"
TEST_EVIDENCE_SUITE=release-test \
  bash "$SCRIPT_DIR/write-test-evidence.sh" engine-hotfix "$ENGINE_EVIDENCE" >/dev/null
TEST_EVIDENCE_FILE="$ENGINE_EVIDENCE" SELECTED_CHANNEL=engine-hotfix RELEASE_MODE=hotfix RELEASE_SERVICE=future-engine \
  bash "$SCRIPT_DIR/build-release.sh" ENGINE-HOTFIX-TEST >/dev/null
grep -qx "LIBRECHAT_RELEASE_IMAGE=$CURRENT_API" "$RELEASE_ROOT/ENGINE-HOTFIX-TEST.env"
grep -qx "FUTURE_ENGINE_RELEASE_IMAGE=$NEW_ENGINE" "$RELEASE_ROOT/ENGINE-HOTFIX-TEST.env"
grep -qx 'release_service=future-engine' "$RELEASE_ROOT/ENGINE-HOTFIX-TEST.manifest"
[[ $(grep -c '^build ' "$FAKE_LOG") -eq 1 ]]
grep -qx 'test_evidence_status=passed' "$RELEASE_ROOT/ENGINE-HOTFIX-TEST.manifest"
grep -qx "test_evidence_sha256=$(shasum -a 256 "$ENGINE_EVIDENCE" | awk '{print $1}')" "$RELEASE_ROOT/ENGINE-HOTFIX-TEST.manifest"

cp "$RELEASE_ROOT/ENGINE-HOTFIX-TEST.evidence" "$RELEASE_ROOT/ENGINE-HOTFIX-TEST.evidence.clean"
printf 'tampered=true\n' >> "$RELEASE_ROOT/ENGINE-HOTFIX-TEST.evidence"
set +e
bash "$SCRIPT_DIR/apply-release.sh" "$RELEASE_ROOT/ENGINE-HOTFIX-TEST.env" >/dev/null 2>&1
tampered_status=$?
set -e
[[ $tampered_status -ne 0 ]]
mv "$RELEASE_ROOT/ENGINE-HOTFIX-TEST.evidence.clean" "$RELEASE_ROOT/ENGINE-HOTFIX-TEST.evidence"

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
file_uid() {
  stat -c '%u' "$1" 2>/dev/null || stat -f '%u' "$1"
}
file_gid() {
  stat -c '%g' "$1" 2>/dev/null || stat -f '%g' "$1"
}
[[ $(file_mode "$APP_DIR/runtime-config") == 755 ]]
[[ $(file_mode "$APP_DIR/runtime-config/runtime-copy.v1.json") == 644 ]]
[[ $(file_mode "$APP_DIR/runtime-config/.last-good") == 755 ]]
[[ $(file_mode "$APP_DIR/runtime-config/.last-good/global-prompt.v1.md") == 644 ]]
[[ $(file_mode "$ENGINE_DIR/data/runtime-last-good") == 755 ]]
[[ $(file_mode "$ENGINE_DIR/data/runtime-last-good/runtime-copy.v1.json") == 644 ]]
[[ $(file_uid "$APP_DIR/runtime-config/.last-good") == "$RUNTIME_WRITER_UID" ]]
[[ $(file_gid "$APP_DIR/runtime-config/.last-good") == "$RUNTIME_WRITER_GID" ]]
[[ $(file_uid "$ENGINE_DIR/data/runtime-last-good") == "$RUNTIME_WRITER_UID" ]]
[[ $(file_gid "$ENGINE_DIR/data/runtime-last-good") == "$RUNTIME_WRITER_GID" ]]

printf '{"version":2}\n' > "$TEST_ROOT/config/rules.v1.json"
CONFIG_EVIDENCE="$RELEASE_ROOT/.test-evidence/CONFIG-ONLY-TEST.evidence"
TEST_EVIDENCE_SUITE=release-test \
  bash "$SCRIPT_DIR/write-test-evidence.sh" config-only "$CONFIG_EVIDENCE" >/dev/null
TEST_EVIDENCE_FILE="$CONFIG_EVIDENCE" SELECTED_CHANNEL=config-only RELEASE_MODE=config-only RELEASE_SERVICE=config \
  bash "$SCRIPT_DIR/build-release.sh" CONFIG-ONLY-TEST >/dev/null
: > "$FAKE_LOG"
bash "$SCRIPT_DIR/apply-release.sh" "$RELEASE_ROOT/CONFIG-ONLY-TEST.env" >/dev/null
grep -qx '{"version":2}' "$APP_DIR/runtime-config/rules.v1.json"
[[ -s "$RELEASE_ROOT/CONFIG-ONLY-TEST.runtime-config.rollback/rules.v1.json" ]]
[[ -s "$RELEASE_ROOT/CONFIG-ONLY-TEST.rollback.manifest" ]]
! grep -q 'compose .* up --detach' "$FAKE_LOG"

bash "$SCRIPT_DIR/apply-release.sh" "$RELEASE_ROOT/CONFIG-ONLY-TEST.rollback.env" >/dev/null
grep -qx '{}' "$APP_DIR/runtime-config/rules.v1.json"

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

CLASSIFY_REPO="$TEST_ROOT/classify"
mkdir -p "$CLASSIFY_REPO/projects/未来线/config"
git -C "$CLASSIFY_REPO" init -b main >/dev/null
git -C "$CLASSIFY_REPO" config user.name release-test
git -C "$CLASSIFY_REPO" config user.email release-test@example.invalid
touch "$CLASSIFY_REPO/.keep"
git -C "$CLASSIFY_REPO" add . && git -C "$CLASSIFY_REPO" commit -m base >/dev/null
CLASSIFY_BASE=$(git -C "$CLASSIFY_REPO" rev-parse HEAD)
printf '{}\n' > "$CLASSIFY_REPO/projects/未来线/config/rules.v1.json"
git -C "$CLASSIFY_REPO" add . && git -C "$CLASSIFY_REPO" commit -m config >/dev/null
CONFIG_CLASS=$(bash "$SCRIPT_DIR/classify-release.sh" "$CLASSIFY_REPO" "$CLASSIFY_BASE" HEAD)
[[ $(node -e 'console.log(JSON.parse(process.argv[1]).channel)' "$CONFIG_CLASS") == config-only ]]

CLASSIFY_BASE=$(git -C "$CLASSIFY_REPO" rev-parse HEAD)
mkdir -p "$CLASSIFY_REPO/projects/未来线/future-engine-shim"
printf 'module.exports = {};\n' > "$CLASSIFY_REPO/projects/未来线/future-engine-shim/change.js"
git -C "$CLASSIFY_REPO" add . && git -C "$CLASSIFY_REPO" commit -m engine >/dev/null
ENGINE_CLASS=$(bash "$SCRIPT_DIR/classify-release.sh" "$CLASSIFY_REPO" "$CLASSIFY_BASE" HEAD)
[[ $(node -e 'console.log(JSON.parse(process.argv[1]).channel)' "$ENGINE_CLASS") == engine-hotfix ]]

CLASSIFY_BASE=$(git -C "$CLASSIFY_REPO" rev-parse HEAD)
mkdir -p "$CLASSIFY_REPO/client"
printf 'export {};\n' > "$CLASSIFY_REPO/client/change.ts"
git -C "$CLASSIFY_REPO" add . && git -C "$CLASSIFY_REPO" commit -m full >/dev/null
FULL_CLASS=$(bash "$SCRIPT_DIR/classify-release.sh" "$CLASSIFY_REPO" "$CLASSIFY_BASE" HEAD)
[[ $(node -e 'console.log(JSON.parse(process.argv[1]).channel)' "$FULL_CLASS") == full ]]

REVISION_REPO="$TEST_ROOT/revision"
mkdir -p "$REVISION_REPO"
printf 'one\n' > "$REVISION_REPO/file"
init_pushed_repo "$REVISION_REPO" "$TEST_ROOT/revision-origin.git"
PUSHED_REVISION=$(git -C "$REVISION_REPO" rev-parse HEAD)
bash "$SCRIPT_DIR/verify-revision.sh" "$REVISION_REPO" HEAD test_revision >/dev/null
set +e
bash "$SCRIPT_DIR/verify-revision.sh" "$REVISION_REPO" deadbeef test_revision >/dev/null 2>&1
missing_status=$?
set -e
[[ $missing_status -ne 0 ]]

NESTED_REVISION_REPO="$TEST_ROOT/nested-revision"
mkdir -p "$NESTED_REVISION_REPO/projects/未来线/future-engine"
printf 'nested engine\n' > "$NESTED_REVISION_REPO/projects/未来线/future-engine/source.txt"
for index in {1..128}; do
  printf 'nested engine %s\n' "$index" > "$NESTED_REVISION_REPO/projects/未来线/future-engine/source-$index.txt"
done
init_pushed_repo "$NESTED_REVISION_REPO" "$TEST_ROOT/nested-revision-origin.git"
bash "$SCRIPT_DIR/verify-revision.sh" "$NESTED_REVISION_REPO/projects/未来线/future-engine" HEAD nested_revision >/dev/null
mkdir -p "$NESTED_REVISION_REPO/untracked-engine"
printf 'untracked\n' > "$NESTED_REVISION_REPO/untracked-engine/source.txt"
set +e
bash "$SCRIPT_DIR/verify-revision.sh" "$NESTED_REVISION_REPO/untracked-engine" HEAD nested_revision >/dev/null 2>&1
untracked_nested_status=$?
set -e
[[ $untracked_nested_status -ne 0 ]]

printf 'two\n' >> "$REVISION_REPO/file"
git -C "$REVISION_REPO" add file && git -C "$REVISION_REPO" commit -m unpushed >/dev/null
bash "$SCRIPT_DIR/verify-revision.sh" "$REVISION_REPO" "$PUSHED_REVISION" test_revision pushed >/dev/null
set +e
bash "$SCRIPT_DIR/verify-revision.sh" "$REVISION_REPO" HEAD test_revision >/dev/null 2>&1
unpushed_status=$?
set -e
[[ $unpushed_status -ne 0 ]]

printf 'release tests passed\n'
