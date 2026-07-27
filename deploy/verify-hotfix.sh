#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
APP_DIR=${APP_DIR_OVERRIDE:-"$(cd -- "$SCRIPT_DIR/.." && pwd)"}
ENGINE_DIR=${ENGINE_DIR_OVERRIDE:-"$(cd -- "$APP_DIR/../future-engine-shim" && pwd)"}
SERVICE=${1:-}

case "$SERVICE" in
  future-engine)
    cd "$ENGINE_DIR"
    node --check runtime-policy.js
    node --check mcp-server.js
    node --test \
      runtime-policy.test.js \
      reveal-rollout.test.js \
      reveal-scenarios.test.js \
      reveal-scenario-routing.test.js \
      reveal-arc.integration.test.js \
      life-api.test.js
    ;;
  api)
    cd "$APP_DIR/packages/api"
    npx jest \
      src/life/runtimeConfig.spec.ts \
      src/life/client.spec.ts \
      src/mcp/__tests__/MCPFutureEngineIdentity.test.ts \
      --runInBand \
      --coverage=false
    npm run build
    cd "$APP_DIR/api"
    npx jest \
      server/routes/life.test.js \
      server/routes/life.stance-feedback.test.js \
      --runInBand \
      --coverage=false
    ;;
  *)
    echo "usage: bash deploy/verify-hotfix.sh <api|future-engine>" >&2
    exit 2
    ;;
esac
