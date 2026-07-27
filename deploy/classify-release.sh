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

FILES=$(git -C "$REPO" diff --name-only "$BASE" "$HEAD")
COUNT=$(printf '%s\n' "$FILES" | sed '/^$/d' | wc -l | tr -d ' ')
LOCK_CHANGED=false
SCHEMA_CHANGED=false
IDENTITY_CHANGED=false
MIGRATION_CHANGED=false
MULTI_UNIT=false

printf '%s\n' "$FILES" | grep -Eq '(^|/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$' && LOCK_CHANGED=true || true
printf '%s\n' "$FILES" | grep -Eqi '(^|/)(migrations?|schema)(/|\.|$)' && SCHEMA_CHANGED=true || true
printf '%s\n' "$FILES" | grep -Eqi '(identity|auth|tenant|isolation)' && IDENTITY_CHANGED=true || true
printf '%s\n' "$FILES" | grep -Eqi '(^|/)(migrations?|scripts/.+migrat)' && MIGRATION_CHANGED=true || true
if printf '%s\n' "$FILES" | grep -q '^client/' \
  && printf '%s\n' "$FILES" | grep -Eq '^(api/|packages/api/|packages/data-provider/)'; then
  MULTI_UNIT=true
fi

RECOMMENDATION=hotfix
if [[ "$LOCK_CHANGED" == true || "$SCHEMA_CHANGED" == true || "$IDENTITY_CHANGED" == true || "$MIGRATION_CHANGED" == true || "$MULTI_UNIT" == true ]]; then
  RECOMMENDATION=full
fi

node -e '
const [count, lock, schema, identity, migration, multi, recommendation] = process.argv.slice(1);
process.stdout.write(JSON.stringify({
  selectedBy: "owner",
  toolRecommendation: recommendation,
  facts: {
    changedFiles: Number(count),
    lockChanged: lock === "true",
    schemaChanged: schema === "true",
    identityOrIsolationChanged: identity === "true",
    migrationChanged: migration === "true",
    multipleBuildUnitsChanged: multi === "true"
  },
  note: "工具只给事实与推荐，最终通道由主理人选择"
}, null, 2) + "\n");
' "$COUNT" "$LOCK_CHANGED" "$SCHEMA_CHANGED" "$IDENTITY_CHANGED" "$MIGRATION_CHANGED" "$MULTI_UNIT" "$RECOMMENDATION"
