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
for file in runtime-copy.v1.json rescue-bank.v1.json topics-bank.v1.json house-entry-options-bank.v1.json reveal-scenario-registry.v1.json reveal-common-variables.v1.json house-opening-bank.v1.json house-opening-bank.v2.json constitution.v1.json constitution.v3.json; do
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
      inspect)
        [[ "${FAKE_BUILDX_INSPECT_FAIL:-0}" != 1 ]] || exit 1
        printf 'Name: test-builder\nDriver: %s\n' "${FAKE_BUILDX_DRIVER:-docker}"
        ;;
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
  push)
    target=${2:-}
    if [[ "$target" == *librechat* ]]; then
      digest="sha256:$(printf 'e%.0s' {1..64})"
    else
      digest="sha256:$(printf 'f%.0s' {1..64})"
    fi
    printf '%s: digest: %s size: 1\n' "$target" "$digest"
    ;;
  image)
    if [[ "${2:-}" != inspect ]]; then exit 0; fi
    if [[ " $* " != *" --format "* ]]; then exit 0; fi
    format=${4:-}
    target=${5:-}
    case "$format" in
      '{{.Id}}')
        if [[ "$target" == yiweilife/librechat:* ]]; then printf '%s\n' "$FAKE_NEW_API"; else printf '%s\n' "$FAKE_NEW_ENGINE"; fi
        ;;
      '{{.Architecture}}') printf 'amd64\n' ;;
      '{{.Config.User}}') printf 'node\n' ;;
      '{{.Size}}') printf '1000\n' ;;
      *org.opencontainers.image.revision*)
        if [[ "$target" == "$FAKE_NEW_API" || "$target" == "$FAKE_TRANSPORT_API" ]]; then
          printf '%s\n' "$FAKE_API_REVISION"
        else
          printf '%s\n' "$FAKE_ENGINE_REVISION"
        fi
        ;;
      *) exit 1 ;;
    esac
    ;;
  inspect)
    target=${*: -1}
    if [[ "$target" == LibreChat ]]; then printf '%s\n' "$FAKE_CURRENT_API"; else printf '%s\n' "$FAKE_CURRENT_ENGINE"; fi
    ;;
  compose)
    if [[ " $* " == *" config --quiet "* && "${FAKE_COMPOSE_CONFIG_FAIL:-0}" == 1 ]]; then
      exit 1
    fi
    exit 0
    ;;
  exec)
    [[ "${FAKE_HEALTH_FAIL:-0}" != 1 ]]
    ;;
  *) exit 0 ;;
esac
EOF
chmod +x "$FAKE_BIN/docker"
cat > "$FAKE_BIN/npm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == run && "${2:-}" == frontend ]]; then
  mkdir -p client/dist
  printf '<html>client build</html>\n' > client/dist/index.html
  exit 0
fi
exit 0
EOF
chmod +x "$FAKE_BIN/npm"

export PATH="$FAKE_BIN:$PATH"
export FAKE_DOCKER_LOG="$FAKE_LOG"
export FAKE_CURRENT_API="$CURRENT_API"
export FAKE_CURRENT_ENGINE="$CURRENT_ENGINE"
export FAKE_NEW_API="$NEW_API"
export FAKE_NEW_ENGINE="$NEW_ENGINE"
export FAKE_TRANSPORT_API="sha256:$(printf 'e%.0s' {1..64})"
export FAKE_TRANSPORT_ENGINE="sha256:$(printf 'f%.0s' {1..64})"
export APP_DIR_OVERRIDE="$APP_DIR"
export ENGINE_DIR_OVERRIDE="$ENGINE_DIR"
export RELEASE_ROOT
export LIBRECHAT_REVISION
export ENGINE_REVISION
LIBRECHAT_REVISION=$(git -C "$APP_DIR" rev-parse HEAD)
ENGINE_REVISION=$(git -C "$ENGINE_DIR" rev-parse HEAD)
export FAKE_API_REVISION="$LIBRECHAT_REVISION"
export FAKE_ENGINE_REVISION="$ENGINE_REVISION"
export RUNTIME_WRITER_UID
export RUNTIME_WRITER_GID
export REGISTRY_PUSH=false
export AUTO_STAGE=false
export STAGE_GATE_MODE=not-required
export CLIENT_ARTIFACT=false

AUTO_STAGE=false bash "$SCRIPT_DIR/build-client-release.sh" CLIENT-BUILD-TEST >/dev/null
grep -qx 'release_service=client' "$RELEASE_ROOT/CLIENT-BUILD-TEST.manifest"
grep -qx 'selected_channel=client-static' "$RELEASE_ROOT/CLIENT-BUILD-TEST.manifest"
grep -Eq '^client_artifact_sha256=[0-9a-f]{64}$' "$RELEASE_ROOT/CLIENT-BUILD-TEST.manifest"
[[ -s "$RELEASE_ROOT/CLIENT-BUILD-TEST.client.tar.zst" ]]
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
grep -qx 'data_backup_required=false' "$RELEASE_ROOT/API-HOTFIX-TEST.manifest"
[[ $(grep -c '^build ' "$FAKE_LOG") -eq 1 ]]

REGISTRY_PUSH=true STAGE_GATE_MODE=required AUTO_STAGE=false TEST_EVIDENCE_FILE="$API_EVIDENCE" \
  SELECTED_CHANNEL=api-hotfix RELEASE_MODE=hotfix RELEASE_SERVICE=api \
  bash "$SCRIPT_DIR/build-release.sh" API-REGISTRY-TEST >/dev/null
grep -qx "librechat_registry_ref=ghcr.io/wswsy81/yiweilife-librechat@sha256:$(printf 'e%.0s' {1..64})" "$RELEASE_ROOT/API-REGISTRY-TEST.manifest"
grep -qx 'future_engine_registry_ref=not-applicable' "$RELEASE_ROOT/API-REGISTRY-TEST.manifest"
grep -qx 'stage_gate=required' "$RELEASE_ROOT/API-REGISTRY-TEST.manifest"
grep -qx 'state=candidate_ready_local' "$RELEASE_ROOT/API-REGISTRY-TEST.stage-status"

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
FAKE_BUILDX_AVAILABLE=1 FAKE_BUILDX_INSPECT_FAIL=1 TEST_EVIDENCE_FILE="$API_EVIDENCE" \
  SELECTED_CHANNEL=api-hotfix RELEASE_MODE=hotfix RELEASE_SERVICE=api \
  bash "$SCRIPT_DIR/build-release.sh" API-BUILDX-INSPECT-FAIL-TEST >/dev/null
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
grep -qx 'data_backup_required=false' "$RELEASE_ROOT/ENGINE-HOTFIX-TEST.manifest"
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

ENGINE_CANDIDATE="$RELEASE_ROOT/ENGINE-HOTFIX-TEST.env"
ENGINE_MANIFEST="$RELEASE_ROOT/ENGINE-HOTFIX-TEST.manifest"
ENGINE_TRANSPORT="$RELEASE_ROOT/ENGINE-HOTFIX-TEST.transport"
cat > "$ENGINE_TRANSPORT" <<EOF
schema=yiwei.release-transport.v1
status=passed
candidate_env_sha256=$(shasum -a 256 "$ENGINE_CANDIDATE" | awk '{print $1}')
candidate_manifest_sha256=$(shasum -a 256 "$ENGINE_MANIFEST" | awk '{print $1}')
librechat_source_image=$CURRENT_API
future_engine_source_image=$NEW_ENGINE
librechat_loaded_image=$CURRENT_API
future_engine_loaded_image=$FAKE_TRANSPORT_ENGINE
librechat_revision=reused-active
future_engine_revision=$ENGINE_REVISION
EOF
: > "$FAKE_LOG"
bash "$SCRIPT_DIR/apply-release.sh" "$ENGINE_CANDIDATE" >/dev/null
grep -qx "LIBRECHAT_RELEASE_IMAGE=$CURRENT_API" "$APP_DIR/.release.env"
grep -qx "FUTURE_ENGINE_RELEASE_IMAGE=$FAKE_TRANSPORT_ENGINE" "$APP_DIR/.release.env"
grep -q "$FAKE_TRANSPORT_ENGINE" "$FAKE_LOG"

ENGINE_SOURCE_DIR="$TEST_ROOT/engine-source"
RUNTIME_ENGINE_DIR="$TEST_ROOT/runtime-engine"
git clone "$TEST_ROOT/engine-origin.git" "$ENGINE_SOURCE_DIR" >/dev/null
mkdir -p "$RUNTIME_ENGINE_DIR/data"
: > "$FAKE_LOG"
ENGINE_DIR_OVERRIDE="$RUNTIME_ENGINE_DIR" \
  ENGINE_SOURCE_DIR_OVERRIDE="$ENGINE_SOURCE_DIR" \
  ENGINE_LAST_GOOD_DIR="$RUNTIME_ENGINE_DIR/data/runtime-last-good" \
  bash "$SCRIPT_DIR/apply-release.sh" "$RELEASE_ROOT/ENGINE-HOTFIX-TEST.env" >/dev/null
[[ -s "$RUNTIME_ENGINE_DIR/data/runtime-last-good/runtime-copy.v1.json" ]]
[[ ! -e "$ENGINE_SOURCE_DIR/data/runtime-last-good/runtime-copy.v1.json" ]]
grep -q -- "--volume $RUNTIME_ENGINE_DIR/data:/data" "$FAKE_LOG"
! grep -q -- "--volume $ENGINE_SOURCE_DIR/data:/data" "$FAKE_LOG"

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

set +e
FAKE_COMPOSE_CONFIG_FAIL=1 bash "$SCRIPT_DIR/apply-release.sh" "$RELEASE_ROOT/CONFIG-ONLY-TEST.env" >/dev/null 2>&1
config_apply_fail_status=$?
set -e
[[ $config_apply_fail_status -ne 0 ]]
grep -qx '{}' "$APP_DIR/runtime-config/rules.v1.json"

CLIENT_RELEASE_SHA=$(printf '9%.0s' {1..64})
mkdir -p "$APP_DIR/client-releases/$CLIENT_RELEASE_SHA"
printf '<html>static release</html>\n' > "$APP_DIR/client-releases/$CLIENT_RELEASE_SHA/index.html"
CLIENT_API=$(sed -n 's/^LIBRECHAT_RELEASE_IMAGE=//p' "$APP_DIR/.release.env")
CLIENT_ENGINE=$(sed -n 's/^FUTURE_ENGINE_RELEASE_IMAGE=//p' "$APP_DIR/.release.env")
cat > "$RELEASE_ROOT/CLIENT-STATIC-TEST.evidence" <<EOF
schema=yiwei.release-test-evidence.v1
status=passed
scope=client-static
suite=release-test
librechat_revision=$LIBRECHAT_REVISION
future_engine_revision=reused-active
finished_at=2026-08-08T00:00:00Z
EOF
CLIENT_EVIDENCE_SHA=$(shasum -a 256 "$RELEASE_ROOT/CLIENT-STATIC-TEST.evidence" | awk '{print $1}')
cat > "$RELEASE_ROOT/CLIENT-STATIC-TEST.env" <<EOF
LIBRECHAT_RELEASE_IMAGE=$CLIENT_API
FUTURE_ENGINE_RELEASE_IMAGE=$CLIENT_ENGINE
EOF
cat > "$RELEASE_ROOT/CLIENT-STATIC-TEST.manifest" <<EOF
manifest_schema=yiwei.release-manifest.v2
release_id=CLIENT-STATIC-TEST
release_service=client
release_mode=static
stage_gate=not-required
test_evidence_status=passed
test_evidence_scope=client-static
test_evidence_sha256=$CLIENT_EVIDENCE_SHA
test_evidence_file=CLIENT-STATIC-TEST.evidence
librechat_revision=$LIBRECHAT_REVISION
future_engine_revision=reused-active
librechat_image=$CLIENT_API
future_engine_image=$CLIENT_ENGINE
runtime_config_rules_sha256=not-applicable
client_release_sha256=$CLIENT_RELEASE_SHA
EOF
: > "$FAKE_LOG"
bash "$SCRIPT_DIR/apply-release.sh" "$RELEASE_ROOT/CLIENT-STATIC-TEST.env" >/dev/null
[[ $(readlink "$APP_DIR/client-releases/current") == "$CLIENT_RELEASE_SHA" ]]
! grep -q 'compose .* up --detach' "$FAKE_LOG"
grep -qx 'client_release_changed=true' "$RELEASE_ROOT/CLIENT-STATIC-TEST.apply"
grep -qx 'client_release_action=remove' "$RELEASE_ROOT/CLIENT-STATIC-TEST.rollback.manifest"
bash "$SCRIPT_DIR/apply-release.sh" "$RELEASE_ROOT/CLIENT-STATIC-TEST.rollback.env" >/dev/null
[[ ! -e "$APP_DIR/client-releases/current" ]]
bash "$SCRIPT_DIR/apply-release.sh" "$RELEASE_ROOT/CLIENT-STATIC-TEST.env" >/dev/null
[[ $(readlink "$APP_DIR/client-releases/current") == "$CLIENT_RELEASE_SHA" ]]

CLIENT_FAIL_SHA=$(printf '8%.0s' {1..64})
mkdir -p "$APP_DIR/client-releases/$CLIENT_FAIL_SHA"
printf '<html>failed static release</html>\n' > "$APP_DIR/client-releases/$CLIENT_FAIL_SHA/index.html"
cp "$RELEASE_ROOT/CLIENT-STATIC-TEST.evidence" "$RELEASE_ROOT/CLIENT-STATIC-FAIL.evidence"
CLIENT_FAIL_EVIDENCE_SHA=$(shasum -a 256 "$RELEASE_ROOT/CLIENT-STATIC-FAIL.evidence" | awk '{print $1}')
cp "$RELEASE_ROOT/CLIENT-STATIC-TEST.env" "$RELEASE_ROOT/CLIENT-STATIC-FAIL.env"
cat > "$RELEASE_ROOT/CLIENT-STATIC-FAIL.manifest" <<EOF
manifest_schema=yiwei.release-manifest.v2
release_id=CLIENT-STATIC-FAIL
release_service=client
release_mode=static
stage_gate=not-required
test_evidence_status=passed
test_evidence_scope=client-static
test_evidence_sha256=$CLIENT_FAIL_EVIDENCE_SHA
test_evidence_file=CLIENT-STATIC-FAIL.evidence
librechat_revision=$LIBRECHAT_REVISION
future_engine_revision=reused-active
librechat_image=$CLIENT_API
future_engine_image=$CLIENT_ENGINE
runtime_config_rules_sha256=not-applicable
client_release_sha256=$CLIENT_FAIL_SHA
EOF
set +e
FAKE_HEALTH_FAIL=1 HEALTH_ATTEMPTS=1 HEALTH_SLEEP_SECONDS=0 \
  bash "$SCRIPT_DIR/apply-release.sh" "$RELEASE_ROOT/CLIENT-STATIC-FAIL.env" >/dev/null 2>&1
client_fail_status=$?
set -e
[[ $client_fail_status -ne 0 ]]
[[ $(readlink "$APP_DIR/client-releases/current") == "$CLIENT_RELEASE_SHA" ]]

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
mkdir -p "$CLASSIFY_REPO/projects/未来线/product-skills/advisor-mode-routing/v1/prompts"
printf 'prompt\n' > "$CLASSIFY_REPO/projects/未来线/product-skills/advisor-mode-routing/v1/prompts/free-chat.md"
git -C "$CLASSIFY_REPO" add . && git -C "$CLASSIFY_REPO" commit -m product-skill >/dev/null
PRODUCT_SKILL_CLASS=$(bash "$SCRIPT_DIR/classify-release.sh" "$CLASSIFY_REPO" "$CLASSIFY_BASE" HEAD)
[[ $(node -e 'console.log(JSON.parse(process.argv[1]).channel)' "$PRODUCT_SKILL_CLASS") == config-only ]]
[[ $(node -e 'console.log(JSON.parse(process.argv[1]).configKind)' "$PRODUCT_SKILL_CLASS") == product-skill-copy ]]
[[ $(node -e 'console.log(JSON.parse(process.argv[1]).facts.hasProductSkills)' "$PRODUCT_SKILL_CLASS") == true ]]

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
CLIENT_CLASS=$(bash "$SCRIPT_DIR/classify-release.sh" "$CLASSIFY_REPO" "$CLASSIFY_BASE" HEAD)
[[ $(node -e 'console.log(JSON.parse(process.argv[1]).channel)' "$CLIENT_CLASS") == client-static ]]
[[ $(node -e 'console.log(JSON.parse(process.argv[1]).facts.clientOnly)' "$CLIENT_CLASS") == true ]]

CLASSIFY_BASE=$(git -C "$CLASSIFY_REPO" rev-parse HEAD)
mkdir -p "$CLASSIFY_REPO/packages/api/src/life"
printf 'export {};\n' > "$CLASSIFY_REPO/packages/api/src/life/change.ts"
git -C "$CLASSIFY_REPO" add . && git -C "$CLASSIFY_REPO" commit -m api >/dev/null
API_CLASS=$(bash "$SCRIPT_DIR/classify-release.sh" "$CLASSIFY_REPO" "$CLASSIFY_BASE" HEAD)
[[ $(node -e 'console.log(JSON.parse(process.argv[1]).channel)' "$API_CLASS") == api-hotfix ]]
[[ $(node -e 'console.log(JSON.parse(process.argv[1]).facts.apiOnly)' "$API_CLASS") == true ]]

CLASSIFY_BASE=$(git -C "$CLASSIFY_REPO" rev-parse HEAD)
mkdir -p "$CLASSIFY_REPO/deploy"
printf '#!/usr/bin/env bash\n' > "$CLASSIFY_REPO/deploy/control.sh"
git -C "$CLASSIFY_REPO" add . && git -C "$CLASSIFY_REPO" commit -m control >/dev/null
CONTROL_CLASS=$(bash "$SCRIPT_DIR/classify-release.sh" "$CLASSIFY_REPO" "$CLASSIFY_BASE" HEAD)
[[ $(node -e 'console.log(JSON.parse(process.argv[1]).channel)' "$CONTROL_CLASS") == none ]]
[[ $(node -e 'console.log(JSON.parse(process.argv[1]).facts.controlPlaneOnly)' "$CONTROL_CLASS") == true ]]

CLASSIFY_BASE=$(git -C "$CLASSIFY_REPO" rev-parse HEAD)
mkdir -p "$CLASSIFY_REPO/projects/未来线"
printf '# deployment runbook\n' > "$CLASSIFY_REPO/projects/未来线/未来线部署操作手册.md"
git -C "$CLASSIFY_REPO" add . && git -C "$CLASSIFY_REPO" commit -m deployment-runbook >/dev/null
RUNBOOK_CLASS=$(bash "$SCRIPT_DIR/classify-release.sh" "$CLASSIFY_REPO" "$CLASSIFY_BASE" HEAD)
[[ $(node -e 'console.log(JSON.parse(process.argv[1]).channel)' "$RUNBOOK_CLASS") == none ]]
[[ $(node -e 'console.log(JSON.parse(process.argv[1]).facts.controlPlaneOnly)' "$RUNBOOK_CLASS") == true ]]

CLASSIFY_BASE=$(git -C "$CLASSIFY_REPO" rev-parse HEAD)
printf '{"scripts":{}}\n' > "$CLASSIFY_REPO/package.json"
git -C "$CLASSIFY_REPO" add . && git -C "$CLASSIFY_REPO" commit -m dependency >/dev/null
DEPENDENCY_CLASS=$(bash "$SCRIPT_DIR/classify-release.sh" "$CLASSIFY_REPO" "$CLASSIFY_BASE" HEAD)
[[ $(node -e 'console.log(JSON.parse(process.argv[1]).channel)' "$DEPENDENCY_CLASS") == full ]]
[[ $(node -e 'console.log(JSON.parse(process.argv[1]).facts.dependencyChanged)' "$DEPENDENCY_CLASS") == true ]]

BRAIN_PLAN_REPO="$TEST_ROOT/brain-plan"
APP_PLAN_REPO="$TEST_ROOT/app-plan"
mkdir -p "$BRAIN_PLAN_REPO" "$APP_PLAN_REPO"
printf 'brain\n' > "$BRAIN_PLAN_REPO/.keep"
printf 'app\n' > "$APP_PLAN_REPO/.keep"
init_pushed_repo "$BRAIN_PLAN_REPO" "$TEST_ROOT/brain-plan-origin.git"
init_pushed_repo "$APP_PLAN_REPO" "$TEST_ROOT/app-plan-origin.git"
BRAIN_PLAN_BASE=$(git -C "$BRAIN_PLAN_REPO" rev-parse HEAD)
APP_PLAN_BASE=$(git -C "$APP_PLAN_REPO" rev-parse HEAD)
mkdir -p "$APP_PLAN_REPO/packages/api/src/life"
printf 'export {};\n' > "$APP_PLAN_REPO/packages/api/src/life/hotfix.ts"
git -C "$APP_PLAN_REPO" add . && git -C "$APP_PLAN_REPO" commit -m api-hotfix >/dev/null
API_PLAN=$(BRAIN_DIR_OVERRIDE="$BRAIN_PLAN_REPO" APP_DIR_OVERRIDE="$APP_PLAN_REPO" \
  bash "$SCRIPT_DIR/plan-release.sh" "$BRAIN_PLAN_BASE" "$APP_PLAN_BASE")
[[ $(node -e 'console.log(JSON.parse(process.argv[1]).channel)' "$API_PLAN") == api-hotfix ]]
[[ $(node -e 'console.log(JSON.parse(process.argv[1]).executors[0])' "$API_PLAN") == 'deploy/build-hotfix-release.sh api' ]]

mkdir -p "$BRAIN_PLAN_REPO/projects/未来线/future-engine-shim"
printf 'module.exports = {};\n' > "$BRAIN_PLAN_REPO/projects/未来线/future-engine-shim/hotfix.js"
git -C "$BRAIN_PLAN_REPO" add . && git -C "$BRAIN_PLAN_REPO" commit -m engine-hotfix >/dev/null
CROSS_PLAN=$(BRAIN_DIR_OVERRIDE="$BRAIN_PLAN_REPO" APP_DIR_OVERRIDE="$APP_PLAN_REPO" \
  bash "$SCRIPT_DIR/plan-release.sh" "$BRAIN_PLAN_BASE" "$APP_PLAN_BASE")
[[ $(node -e 'console.log(JSON.parse(process.argv[1]).channel)' "$CROSS_PLAN") == ssh-source ]]
[[ $(node -e 'console.log(JSON.parse(process.argv[1]).executors[0])' "$CROSS_PLAN") == 'deploy/ssh-source-release.sh' ]]
grep -F 'sudo -n install -d -o \"\$owner\" -g \"\$group\" -m 700 \"\$app/.release-src\"' \
  "$SCRIPT_DIR/ssh-source-release.sh" >/dev/null
grep -F 'test \"\$(stat -c '\''%a'\'' \"\$app/.release-src\")\" = 700' \
  "$SCRIPT_DIR/ssh-source-release.sh" >/dev/null
grep -F 'mapfile -t ACTIVE_REVISIONS' "$SCRIPT_DIR/ssh-source-release.sh" >/dev/null
! grep -F 'read -r APP_BASE BRAIN_BASE' "$SCRIPT_DIR/ssh-source-release.sh" >/dev/null

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
