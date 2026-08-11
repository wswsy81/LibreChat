#!/usr/bin/env bash
set -euo pipefail

REPO=${1:-}
BASE=${2:-}
HEAD=${3:-HEAD}

[[ -d "$REPO/.git" || -f "$REPO/.git" ]] || {
  echo "usage: bash deploy/classify-release.sh <repo> <base> [head]" >&2
  exit 2
}
git -C "$REPO" rev-parse --verify "$BASE^{commit}" >/dev/null
git -C "$REPO" rev-parse --verify "$HEAD^{commit}" >/dev/null

FILES=$(git -C "$REPO" -c core.quotePath=false diff --name-only "$BASE" "$HEAD")
COUNT=$(printf '%s\n' "$FILES" | sed '/^$/d' | wc -l | tr -d ' ')
LOCK_CHANGED=false
DEPENDENCY_CHANGED=false
BASE_IMAGE_CHANGED=false
SCHEMA_CHANGED=false
IDENTITY_CHANGED=false
MIGRATION_CHANGED=false
CONFIG_ONLY=false
ENGINE_ONLY=false
CLIENT_ONLY=false
API_ONLY=false
CONTROL_PLANE_ONLY=false
CONFIG_KIND=none
HAS_RULES=false
HAS_BANKS=false
HAS_PRODUCT_SKILLS=false
CHANNEL=none
SERVICE=none
MIN_SECONDS=0
MAX_SECONDS=0

if [[ "$COUNT" -gt 0 ]]; then
  CONTROL_PATTERN='^(deploy/|scripts/|docs/|\.claude/|\.github/|test/|tests/|README($|\.)|CLAUDE\.md$|AGENTS\.md$)|^(state|decisions|specs|evals|报告|调研|library/skills)/|^projects/未来线/(scripts|specs|evals|报告|调研|缺陷追踪|用户反馈)/|^projects/未来线/未来线部署操作手册\.md$'
  PRODUCT_FILES=$(printf '%s\n' "$FILES" | grep -Ev "$CONTROL_PATTERN" | grep -Ev '(^|/)(__tests__/|[^/]+\.(test|spec)\.)' || true)
  [[ -z "$PRODUCT_FILES" ]] && CONTROL_PLANE_ONLY=true

  printf '%s\n' "$PRODUCT_FILES" | grep -Eq '(^|/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$' && LOCK_CHANGED=true || true
  printf '%s\n' "$PRODUCT_FILES" | grep -Eq '(^|/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$' && DEPENDENCY_CHANGED=true || true
  printf '%s\n' "$PRODUCT_FILES" | grep -Eq '(^|/)(Dockerfile([^/]*)?|docker-compose[^/]*\.ya?ml|\.dockerignore)$' && BASE_IMAGE_CHANGED=true || true
  printf '%s\n' "$PRODUCT_FILES" | grep -Eqi '(^|/)(migrations?|schema)(/|\.|$)' && SCHEMA_CHANGED=true || true
  printf '%s\n' "$PRODUCT_FILES" | grep -Eqi '(identity|auth|tenant|isolation)' && IDENTITY_CHANGED=true || true
  printf '%s\n' "$PRODUCT_FILES" | grep -Eqi '(^|/)(migrations?|scripts/.+migrat)' && MIGRATION_CHANGED=true || true

  NON_CONFIG=$(printf '%s\n' "$PRODUCT_FILES" | grep -Ev '(^|/)(config/(global-prompt\.v1\.md|runtime-policy\.v1\.json|security-contract\.v1\.json|product-catalog\.v1\.json|product-experiments\.v1\.json|rules\.v1\.json)|product-skills/.+\.(json|md)|future-engine-shim/banks/.+\.(json|md)|banks/.+\.(json|md))$' || true)
  [[ -z "$NON_CONFIG" ]] && CONFIG_ONLY=true
  printf '%s\n' "$PRODUCT_FILES" | grep -Eq '(^|/)config/(global-prompt\.v1\.md|runtime-policy\.v1\.json|security-contract\.v1\.json|product-catalog\.v1\.json|product-experiments\.v1\.json|rules\.v1\.json)$' && HAS_RULES=true || true
  printf '%s\n' "$PRODUCT_FILES" | grep -Eq '(^|/)(future-engine-shim/)?banks/.+\.(json|md)$' && HAS_BANKS=true || true
  printf '%s\n' "$PRODUCT_FILES" | grep -Eq '(^|/)product-skills/.+\.(json|md)$' && HAS_PRODUCT_SKILLS=true || true

  if [[ $(basename -- "$REPO") == future-engine-shim ]]; then
    [[ "$CONTROL_PLANE_ONLY" == true ]] || ENGINE_ONLY=true
  else
    NON_ENGINE=$(printf '%s\n' "$PRODUCT_FILES" | grep -Ev '^projects/未来线/future-engine-shim/' || true)
    [[ -z "$NON_ENGINE" ]] && ENGINE_ONLY=true
  fi
  NON_CLIENT=$(printf '%s\n' "$PRODUCT_FILES" | grep -Ev '^(client/|packages/client/)' || true)
  [[ -z "$NON_CLIENT" ]] && CLIENT_ONLY=true
  NON_API=$(printf '%s\n' "$PRODUCT_FILES" | grep -Ev '^(api/|packages/api/|packages/data-schemas/)' || true)
  [[ -z "$NON_API" ]] && API_ONLY=true
fi

if [[ "$CONTROL_PLANE_ONLY" == true ]]; then
  CHANNEL=none
  SERVICE=none
elif [[ "$LOCK_CHANGED" == true || "$DEPENDENCY_CHANGED" == true || "$BASE_IMAGE_CHANGED" == true || "$SCHEMA_CHANGED" == true || ( "$IDENTITY_CHANGED" == true && "$CLIENT_ONLY" != true ) || "$MIGRATION_CHANGED" == true ]]; then
  CHANNEL=full
  SERVICE=all
  MIN_SECONDS=600
  MAX_SECONDS=1200
elif [[ "$CONFIG_ONLY" == true ]]; then
  CONFIG_KIND=runtime-config
  [[ "$HAS_BANKS" == true && "$HAS_RULES" == false ]] && CONFIG_KIND=bank-copy
  [[ "$HAS_PRODUCT_SKILLS" == true && "$HAS_RULES" == false && "$HAS_BANKS" == false ]] && CONFIG_KIND=product-skill-copy
  CONFIG_TYPE_COUNT=0
  [[ "$HAS_RULES" == false ]] || ((CONFIG_TYPE_COUNT += 1))
  [[ "$HAS_BANKS" == false ]] || ((CONFIG_TYPE_COUNT += 1))
  [[ "$HAS_PRODUCT_SKILLS" == false ]] || ((CONFIG_TYPE_COUNT += 1))
  [[ "$CONFIG_TYPE_COUNT" -le 1 ]] || CONFIG_KIND=mixed
  CHANNEL=config-only
  SERVICE=config
  MIN_SECONDS=60
  MAX_SECONDS=180
elif [[ "$CLIENT_ONLY" == true ]]; then
  CHANNEL=client-static
  SERVICE=client
  MIN_SECONDS=60
  MAX_SECONDS=180
elif [[ "$ENGINE_ONLY" == true ]]; then
  CHANNEL=engine-hotfix
  SERVICE=future-engine
  MIN_SECONDS=300
  MAX_SECONDS=480
elif [[ "$API_ONLY" == true ]]; then
  CHANNEL=api-hotfix
  SERVICE=api
  MIN_SECONDS=300
  MAX_SECONDS=600
elif [[ "$COUNT" -gt 0 ]]; then
  CHANNEL=full
  SERVICE=all
  MIN_SECONDS=600
  MAX_SECONDS=1200
fi

node -e '
const [count, lock, dependency, baseImage, schema, identity, migration, configOnly, engineOnly, clientOnly, apiOnly, controlPlaneOnly, hasRules, hasBanks, hasProductSkills, configKind, channel, service, min, max] = process.argv.slice(1);
process.stdout.write(JSON.stringify({
  selectedBy: "classifier",
  channel,
  service,
  configKind,
  targetSeconds: { min: Number(min), max: Number(max) },
  facts: {
    changedFiles: Number(count),
    lockChanged: lock === "true",
    dependencyChanged: dependency === "true",
    baseImageChanged: baseImage === "true",
    schemaChanged: schema === "true",
    identityOrIsolationChanged: identity === "true",
    migrationChanged: migration === "true",
    configOnly: configOnly === "true",
    engineOnly: engineOnly === "true",
    clientOnly: clientOnly === "true",
    apiOnly: apiOnly === "true",
    controlPlaneOnly: controlPlaneOnly === "true",
    hasRules: hasRules === "true",
    hasBanks: hasBanks === "true",
    hasProductSkills: hasProductSkills === "true"
  },
  note: "日常发布只选变化服务；只有依赖、基础镜像、迁移、身份隔离、共享包或跨服务变更进入 full"
}, null, 2) + "\n");
' "$COUNT" "$LOCK_CHANGED" "$DEPENDENCY_CHANGED" "$BASE_IMAGE_CHANGED" "$SCHEMA_CHANGED" "$IDENTITY_CHANGED" "$MIGRATION_CHANGED" "$CONFIG_ONLY" "$ENGINE_ONLY" "$CLIENT_ONLY" "$API_ONLY" "$CONTROL_PLANE_ONLY" "$HAS_RULES" "$HAS_BANKS" "$HAS_PRODUCT_SKILLS" "$CONFIG_KIND" "$CHANNEL" "$SERVICE" "$MIN_SECONDS" "$MAX_SECONDS"
