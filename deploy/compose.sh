#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
APP_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)

[[ -f "$APP_DIR/.env" ]] || {
  echo "production .env is missing" >&2
  exit 1
}
[[ -f "$APP_DIR/.release.env" ]] || {
  echo "active .release.env is missing; build and apply a release first" >&2
  exit 1
}

if docker info >/dev/null 2>&1; then
  DOCKER=(docker)
else
  DOCKER=(sudo docker)
fi

COMPOSE_FILES=(--file "$APP_DIR/docker-compose.prod.yml")
if [[ -s "$APP_DIR/.release-source.override.yml" ]]; then
  COMPOSE_FILES+=(--file "$APP_DIR/.release-source.override.yml")
fi

exec "${DOCKER[@]}" compose \
  "${COMPOSE_FILES[@]}" \
  --env-file "$APP_DIR/.env" \
  --env-file "$APP_DIR/.release.env" \
  "$@"
