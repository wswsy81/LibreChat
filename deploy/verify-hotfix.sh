#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
APP_DIR=${APP_DIR_OVERRIDE:-"$(cd -- "$SCRIPT_DIR/.." && pwd)"}
ENGINE_DIR=${ENGINE_DIR_OVERRIDE:-"$(cd -- "$APP_DIR/../future-engine-shim" && pwd)"}
SERVICE=${1:-}

# 生产宿主没有 Node,快速通道原本在服务器上根本跑不起来(node: command not found)。
# 有 node 就直接用;没有就跑 Dockerfile 的 test stage——与完整发布同一个门,
# 依赖齐全、结果可复现,不为省事跳过验证。
run_engine_checks() {
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
}

run_engine_checks_in_image() {
  local docker_bin=(docker)
  docker info >/dev/null 2>&1 || docker_bin=(sudo docker)
  echo "宿主无 node,改跑镜像 test stage(与完整发布同一个门)"
  "${docker_bin[@]}" build \
    --file "$ENGINE_DIR/Dockerfile" \
    --target test \
    "$(cd -- "$ENGINE_DIR/.." && pwd)"
}

case "$SERVICE" in
  future-engine)
    # 光有 node 不够:测试还要 devDependencies(mongodb-memory-server 等)。
    # 生产宿主装了 node 但没装依赖时,仍然走镜像 test stage,别假装验证过。
    if command -v node >/dev/null 2>&1 && [[ -d "$ENGINE_DIR/node_modules/mongodb-memory-server" ]]; then
      run_engine_checks
    else
      run_engine_checks_in_image
    fi
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
