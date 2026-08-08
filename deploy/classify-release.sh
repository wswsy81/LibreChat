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
SCHEMA_CHANGED=false
IDENTITY_CHANGED=false
MIGRATION_CHANGED=false
CONFIG_ONLY=false
ENGINE_ONLY=false
CONFIG_KIND=none
HAS_RULES=false
HAS_BANKS=false
HAS_PRODUCT_SKILLS=false
CHANNEL=none
SERVICE=none
MIN_SECONDS=0
MAX_SECONDS=0

printf '%s\n' "$FILES" | grep -Eq '(^|/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$' && LOCK_CHANGED=true || true
printf '%s\n' "$FILES" | grep -Eqi '(^|/)(migrations?|schema)(/|\.|$)' && SCHEMA_CHANGED=true || true
printf '%s\n' "$FILES" | grep -Eqi '(identity|auth|tenant|isolation)' && IDENTITY_CHANGED=true || true
printf '%s\n' "$FILES" | grep -Eqi '(^|/)(migrations?|scripts/.+migrat)' && MIGRATION_CHANGED=true || true

if [[ "$COUNT" -gt 0 ]]; then
  NON_CONFIG=$(printf '%s\n' "$FILES" | grep -Ev '(^|/)(config/(global-prompt\.v1\.md|runtime-policy\.v1\.json|security-contract\.v1\.json|product-catalog\.v1\.json|product-experiments\.v1\.json|rules\.v1\.json)|product-skills/.+\.(json|md)|future-engine-shim/banks/.+\.(json|md)|banks/.+\.(json|md))$' || true)
  [[ -z "$NON_CONFIG" ]] && CONFIG_ONLY=true

  if [[ $(basename -- "$REPO") == future-engine-shim ]]; then
    ENGINE_ONLY=true
  else
    NON_ENGINE=$(printf '%s\n' "$FILES" | grep -Ev '^projects/未来线/future-engine-shim/' || true)
    [[ -z "$NON_ENGINE" ]] && ENGINE_ONLY=true
  fi
fi

if [[ "$CONFIG_ONLY" == true && "$LOCK_CHANGED" == false && "$SCHEMA_CHANGED" == false && "$IDENTITY_CHANGED" == false && "$MIGRATION_CHANGED" == false ]]; then
  printf '%s\n' "$FILES" | grep -Eq '(^|/)config/(global-prompt\.v1\.md|runtime-policy\.v1\.json|security-contract\.v1\.json|product-catalog\.v1\.json|product-experiments\.v1\.json|rules\.v1\.json)$' && HAS_RULES=true || true
  printf '%s\n' "$FILES" | grep -Eq '(^|/)(future-engine-shim/)?banks/.+\.(json|md)$' && HAS_BANKS=true || true
  printf '%s\n' "$FILES" | grep -Eq '(^|/)product-skills/.+\.(json|md)$' && HAS_PRODUCT_SKILLS=true || true
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
elif [[ "$ENGINE_ONLY" == true && "$LOCK_CHANGED" == false && "$SCHEMA_CHANGED" == false && "$IDENTITY_CHANGED" == false && "$MIGRATION_CHANGED" == false ]]; then
  CHANNEL=engine-hotfix
  SERVICE=future-engine
  MIN_SECONDS=300
  MAX_SECONDS=480
elif [[ "$COUNT" -gt 0 ]]; then
  CHANNEL=full
  SERVICE=all
  MIN_SECONDS=600
  MAX_SECONDS=1200
fi

node -e '
const [count, lock, schema, identity, migration, configOnly, engineOnly, hasRules, hasBanks, hasProductSkills, configKind, channel, service, min, max] = process.argv.slice(1);
process.stdout.write(JSON.stringify({
  selectedBy: "classifier",
  channel,
  service,
  configKind,
  targetSeconds: { min: Number(min), max: Number(max) },
  facts: {
    changedFiles: Number(count),
    lockChanged: lock === "true",
    schemaChanged: schema === "true",
    identityOrIsolationChanged: identity === "true",
    migrationChanged: migration === "true",
    configOnly: configOnly === "true",
    engineOnly: engineOnly === "true",
    hasRules: hasRules === "true",
    hasBanks: hasBanks === "true",
    hasProductSkills: hasProductSkills === "true"
  },
  note: "分类器按实际 diff 自动选择最小安全通道；无法可靠判定时进入 full"
}, null, 2) + "\n");
' "$COUNT" "$LOCK_CHANGED" "$SCHEMA_CHANGED" "$IDENTITY_CHANGED" "$MIGRATION_CHANGED" "$CONFIG_ONLY" "$ENGINE_ONLY" "$HAS_RULES" "$HAS_BANKS" "$HAS_PRODUCT_SKILLS" "$CONFIG_KIND" "$CHANNEL" "$SERVICE" "$MIN_SECONDS" "$MAX_SECONDS"
