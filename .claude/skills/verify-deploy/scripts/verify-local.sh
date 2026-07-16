#!/usr/bin/env bash
set -euo pipefail

MODE="${1:---full}"
if [[ "$MODE" != "--full" && "$MODE" != "--quick" ]]; then
  echo "usage: verify-local.sh [--full|--quick]" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"
PROJECT_ROOT="$(cd "$REPO_ROOT/.." && pwd)"
BRAIN_ROOT="$(cd "$REPO_ROOT/../../.." && pwd)"
SHIM_ROOT="$PROJECT_ROOT/future-engine-shim"

run() {
  printf 'verify: %s\n' "$*"
  "$@"
}

lint_changed_files() {
  local files=()
  local file
  while IFS= read -r file; do
    [[ -n "$file" ]] && files+=("$file")
  done < <(
    {
      git diff --name-only --diff-filter=ACMR HEAD -- '*.js' '*.jsx' '*.ts' '*.tsx'
      git diff --cached --name-only --diff-filter=ACMR -- '*.js' '*.jsx' '*.ts' '*.tsx'
      git ls-files --others --exclude-standard -- '*.js' '*.jsx' '*.ts' '*.tsx'
    } | sort -u
  )

  if [[ ${#files[@]} -gt 0 ]]; then
    run npx eslint "${files[@]}"
  else
    printf 'verify: eslint skipped (no changed JS/TS files)\n'
  fi
}

run node --check "$SHIM_ROOT/profile.js"
run node --check "$SHIM_ROOT/stage-runtime.js"
run node --check "$SHIM_ROOT/mcp-server.js"
run node --check "$SHIM_ROOT/life-api.js"
run node --check "$SHIM_ROOT/scripts/compile-runtime.js"
run node --check "$SHIM_ROOT/scripts/compile-prompt.js"
run node "$SHIM_ROOT/scripts/compile-runtime.js" --check
run node "$SHIM_ROOT/scripts/compile-prompt.js" --check
run node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" "$PROJECT_ROOT/本体/人生画像-v0.schema.json"
run cmp -s "$PROJECT_ROOT/config/librechat.yaml" "$REPO_ROOT/librechat.yaml"

(
  cd "$REPO_ROOT"
  run node -e "const fs=require('fs');const yaml=require('yaml');for(const f of process.argv.slice(1)) yaml.parse(fs.readFileSync(f,'utf8'));" \
    "$PROJECT_ROOT/config/librechat.yaml" "$REPO_ROOT/librechat.yaml"
)

(
  cd "$SHIM_ROOT"
  run npm test
)

(
  cd "$BRAIN_ROOT"
  run git diff --check
)
(
  cd "$REPO_ROOT"
  run git diff --check
)

if [[ "$MODE" == "--full" ]]; then
  (
    cd "$REPO_ROOT"
    run npm run typecheck --workspace @librechat/frontend
    lint_changed_files
    run npm run build:data-provider
    run npm run build:client-package
    run npm run build:client
  )
fi

printf 'verify: local gate passed (%s)\n' "$MODE"
