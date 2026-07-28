#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
KIND=${1:-}
FILE=${2:-}
BASE_URL=${RUNTIME_CONFIG_BASE_URL:-https://yiweilife.com}

case "$KIND" in
  runtime|security_contract|product_catalog) ;;
  *)
    echo "usage: LIBRECHAT_ADMIN_TOKEN=... bash deploy/apply-runtime-config.sh <runtime|security_contract|product_catalog> <json-file>" >&2
    exit 2
    ;;
esac
[[ -f "$FILE" ]] || { echo "config file is missing: $FILE" >&2; exit 2; }
[[ -n "${LIBRECHAT_ADMIN_TOKEN:-}" ]] || {
  echo "LIBRECHAT_ADMIN_TOKEN is required; obtain it from the signed-in ADMIN session" >&2
  exit 2
}

RESPONSE_FILE=$(mktemp)
trap 'rm -f -- "$RESPONSE_FILE"' EXIT

sed -n '1,$p' "$FILE" | node "$SCRIPT_DIR/runtime-config-request.mjs" "$KIND" | curl \
  --silent \
  --show-error \
  --fail-with-body \
  --output "$RESPONSE_FILE" \
  --request POST \
  --header "Authorization: Bearer $LIBRECHAT_ADMIN_TOKEN" \
  --header 'Content-Type: application/json' \
  --data-binary @- \
  "$BASE_URL/api/life/admin/runtime-config/apply"

node -e "const fs=require('fs');const row=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(JSON.stringify(row,null,2))" "$RESPONSE_FILE"
