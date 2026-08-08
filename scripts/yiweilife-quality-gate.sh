#!/usr/bin/env bash
set -euo pipefail

MODE=${1:---full}
if [[ "$MODE" != "--full" && "$MODE" != "--quick" && "$MODE" != "--release" ]]; then
  echo "usage: yiweilife-quality-gate.sh [--full|--quick|--release]" >&2
  exit 2
fi

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)

run() {
  printf 'librechat-gate: %s\n' "$*"
  "$@"
}

CHECKPOINT_DIR=
if [[ "$MODE" == --full ]]; then
  CHECKPOINT_KEY="$(git -C "$REPO_ROOT" rev-parse HEAD)-$(git -C "$REPO_ROOT" diff --binary HEAD | git hash-object --stdin)"
  CHECKPOINT_DIR=${VERIFY_CHECKPOINT_ROOT:-"$REPO_ROOT/.releases/.verify-checkpoints/$CHECKPOINT_KEY/librechat"}
  install -d -m 700 "$CHECKPOINT_DIR"
fi

run_checkpoint() {
  local label=$1
  shift
  if [[ -n "$CHECKPOINT_DIR" && -s "$CHECKPOINT_DIR/$label.passed" ]]; then
    printf 'librechat-gate: checkpoint passed, skip %s\n' "$label"
    return
  fi
  run "$@"
  [[ -z "$CHECKPOINT_DIR" ]] || printf 'passed_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$CHECKPOINT_DIR/$label.passed"
}

cd "$REPO_ROOT"
if [[ "$MODE" != "--release" ]]; then
  run_checkpoint lint npm run lint
  run_checkpoint typecheck-client npm run typecheck --workspace @librechat/frontend
  run_checkpoint build-data-provider npm run build:data-provider
  run_checkpoint build-data-schemas npm run build:data-schemas
  run_checkpoint build-api npm run build:api
  run_checkpoint build-client-package npm run build:client-package
fi

if [[ "$MODE" == "--full" ]]; then
  export NODE_OPTIONS=${NODE_OPTIONS:---max-old-space-size=8192}
  # UploadSkillDialog's userEvent upload can stop dispatching change after the
  # full client process grows past roughly 1 GB. Run every other client suite
  # first, then this suite in a fresh Jest process. Coverage remains complete.
  client_isolated_pattern='src/components/Skills/dialogs/__tests__/UploadSkillDialog\.spec\.tsx$'
  run_checkpoint test-client-main npm run test:client -- --runInBand \
    --testPathIgnorePatterns="$client_isolated_pattern"
  run_checkpoint test-client-upload npm run test:client -- --runInBand --runTestsByPath \
    src/components/Skills/dialogs/__tests__/UploadSkillDialog.spec.tsx
  # A single long-lived API run grows beyond 6 GB and lets integration suites
  # leak native workspace caches and sockets into later suites. Four sequential
  # shards keep every Jest process short-lived without reducing coverage. Run
  # each shard in band as well: parallel workers intermittently cross-talk over
  # ephemeral Supertest sockets, producing random 400/parse/socket failures.
  api_isolated_pattern='server/services/AuthService\.spec\.js$|server/middleware/optionalShareFileAuth\.spec\.js$|server/routes/__tests__/convos-import\.spec\.js$'
  for shard in 1 2 3 4; do
    run_checkpoint "test-api-shard-$shard" npm run test:api -- --runInBand --forceExit --shard="${shard}/4" \
      --testPathIgnorePatterns="$api_isolated_pattern"
  done
  # These suites specifically depend on a fresh workspace-module/socket state.
  run_checkpoint test-api-isolated npm run test:api -- --runInBand --forceExit --runTestsByPath \
    server/services/AuthService.spec.js \
    server/middleware/optionalShareFileAuth.spec.js \
    server/routes/__tests__/convos-import.spec.js
  run_checkpoint test-packages-api npm run test:packages:api -- --runInBand
  run_checkpoint test-packages-data-provider npm run test:packages:data-provider -- --runInBand
  run_checkpoint test-packages-data-schemas npm run test:packages:data-schemas -- --runInBand
  run_checkpoint test-config npm run test:config -- --runInBand
fi

if [[ "$MODE" == "--quick" ]]; then
  run npm run build:client
  run node client/scripts/smoke-production-build.cjs
fi
run bash -n deploy/build-release.sh
run bash -n deploy/build-config-release.sh
run bash -n deploy/build-hotfix-release.sh
run bash -n deploy/build-full-release.sh
run bash -n deploy/classify-release.sh
run bash -n deploy/plan-release.sh
run bash -n deploy/verify-revision.sh
run bash -n deploy/write-test-evidence.sh
run bash -n deploy/deploy-product-skills.sh
run bash -n deploy/stage-release.sh
run bash -n deploy/apply-release.sh
run bash -n deploy/verify-hotfix.sh
run bash -n deploy/verify-local.sh
run bash -n deploy/compose.sh
run bash deploy/release.test.sh
run bash deploy/stage-release.test.sh
run bash deploy/backup.test.sh

if [[ "$MODE" == "--full" ]]; then
  command -v docker >/dev/null 2>&1 || {
    echo "librechat-gate: Docker is required for --full" >&2
    exit 1
  }
  release_env=$(mktemp)
  trap 'rm -f "$release_env"' EXIT
  {
    printf 'LIBRECHAT_RELEASE_IMAGE=sha256:%064d\n' 0
    printf 'FUTURE_ENGINE_RELEASE_IMAGE=sha256:%064d\n' 0
  } > "$release_env"
  run docker compose \
    --file docker-compose.prod.yml \
    --env-file deploy/.env.prod.example \
    --env-file "$release_env" \
    config --quiet
  run docker build --check .
fi

run git diff --check
printf 'librechat-gate: passed (%s)\n' "$MODE"
