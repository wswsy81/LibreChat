#!/usr/bin/env bash
set -euo pipefail
APPLY_STARTED_EPOCH=$(date +%s)

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
APP_DIR=${APP_DIR_OVERRIDE:-"$(cd -- "$SCRIPT_DIR/.." && pwd)"}
ENGINE_DIR=${ENGINE_DIR_OVERRIDE:-"$(cd -- "$APP_DIR/../future-engine-shim" && pwd)"}
ENGINE_SOURCE_DIR=${ENGINE_SOURCE_DIR_OVERRIDE:-"$ENGINE_DIR"}
PROJECT_DIR=$(cd -- "$ENGINE_SOURCE_DIR/.." && pwd)
RELEASE_ROOT=${RELEASE_ROOT:-"$APP_DIR/.releases"}
RUNTIME_CONFIG_DIR=${RUNTIME_CONFIG_DIR:-"$APP_DIR/runtime-config"}
CLIENT_RELEASES_DIR=${CLIENT_RELEASES_DIR:-"$APP_DIR/client-releases"}
ENGINE_LAST_GOOD_DIR=${ENGINE_LAST_GOOD_DIR:-"$ENGINE_DIR/data/runtime-last-good"}
RUNTIME_WRITER_UID=${RUNTIME_WRITER_UID:-1000}
RUNTIME_WRITER_GID=${RUNTIME_WRITER_GID:-1000}
CANDIDATE=${1:-}

[[ -n "$CANDIDATE" ]] || {
  echo "usage: bash deploy/apply-release.sh .releases/<release>.env" >&2
  exit 1
}
[[ -f "$APP_DIR/.env" ]] || {
  echo "production .env is missing" >&2
  exit 1
}

install -d -m 755 "$RUNTIME_CONFIG_DIR" "$RUNTIME_CONFIG_DIR/.last-good" "$ENGINE_LAST_GOOD_DIR"
for file in runtime-policy.v1.json security-contract.v1.json product-catalog.v1.json product-experiments.v1.json rules.v1.json; do
  if [[ ! -f "$RUNTIME_CONFIG_DIR/$file" ]]; then
    install -m 644 "$ENGINE_DIR/../config/$file" "$RUNTIME_CONFIG_DIR/$file"
  fi
done

if [[ ! -f "$RUNTIME_CONFIG_DIR/global-prompt.v1.md" ]]; then
  install -m 644 "$ENGINE_DIR/../config/global-prompt.v1.md" "$RUNTIME_CONFIG_DIR/global-prompt.v1.md"
fi
for file in \
  runtime-copy.v1.json \
  rescue-bank.v1.json \
  topics-bank.v1.json \
  house-entry-options-bank.v1.json \
  reveal-scenario-registry.v1.json \
  reveal-common-variables.v1.json \
  house-opening-bank.v1.json \
  house-opening-bank.v2.json \
  constitution.v1.json \
  constitution.v3.json; do
  if [[ ! -f "$RUNTIME_CONFIG_DIR/$file" ]]; then
    install -m 644 "$ENGINE_DIR/banks/$file" "$RUNTIME_CONFIG_DIR/$file"
  fi
done

if [[ ! -f "$RUNTIME_CONFIG_DIR/.last-good/global-prompt.v1.md" ]]; then
  install -m 644 "$RUNTIME_CONFIG_DIR/global-prompt.v1.md" "$RUNTIME_CONFIG_DIR/.last-good/global-prompt.v1.md"
fi
for file in runtime-copy.v1.json rescue-bank.v1.json topics-bank.v1.json; do
  if [[ ! -f "$ENGINE_LAST_GOOD_DIR/$file" ]]; then
    install -m 644 "$RUNTIME_CONFIG_DIR/$file" "$ENGINE_LAST_GOOD_DIR/$file"
  fi
done

# 运行时资产不含密钥，且被只读挂载给 uid 1000 的非 root 容器。即使文件已存在，
# 也要修复旧发布留下的 0600/0700，否则容器启动时会因 EACCES 循环重启。
chmod 755 "$RUNTIME_CONFIG_DIR" "$RUNTIME_CONFIG_DIR/.last-good" "$ENGINE_LAST_GOOD_DIR"
chmod 644 \
  "$RUNTIME_CONFIG_DIR"/runtime-policy.v1.json \
  "$RUNTIME_CONFIG_DIR"/security-contract.v1.json \
  "$RUNTIME_CONFIG_DIR"/product-catalog.v1.json \
  "$RUNTIME_CONFIG_DIR"/product-experiments.v1.json \
  "$RUNTIME_CONFIG_DIR"/rules.v1.json \
  "$RUNTIME_CONFIG_DIR"/global-prompt.v1.md \
  "$RUNTIME_CONFIG_DIR"/runtime-copy.v1.json \
  "$RUNTIME_CONFIG_DIR"/rescue-bank.v1.json \
  "$RUNTIME_CONFIG_DIR"/topics-bank.v1.json \
  "$RUNTIME_CONFIG_DIR"/house-entry-options-bank.v1.json \
  "$RUNTIME_CONFIG_DIR"/reveal-scenario-registry.v1.json \
  "$RUNTIME_CONFIG_DIR"/reveal-common-variables.v1.json \
  "$RUNTIME_CONFIG_DIR"/house-opening-bank.v1.json \
  "$RUNTIME_CONFIG_DIR"/house-opening-bank.v2.json \
  "$RUNTIME_CONFIG_DIR"/constitution.v1.json \
  "$RUNTIME_CONFIG_DIR"/constitution.v3.json \
  "$RUNTIME_CONFIG_DIR"/.last-good/global-prompt.v1.md \
  "$ENGINE_LAST_GOOD_DIR"/runtime-copy.v1.json \
  "$ENGINE_LAST_GOOD_DIR"/rescue-bank.v1.json \
  "$ENGINE_LAST_GOOD_DIR"/topics-bank.v1.json

# last-known-good 快照由容器内的 node(uid/gid 1000) 原子写入。目录只读会让
# 服务看似健康，却无法更新持久回退点；因此不只检查模式，还必须修复所有权。
chown -R "$RUNTIME_WRITER_UID:$RUNTIME_WRITER_GID" \
  "$RUNTIME_CONFIG_DIR/.last-good" \
  "$ENGINE_LAST_GOOD_DIR"

if [[ "$CANDIDATE" != /* ]]; then
  CANDIDATE="$APP_DIR/$CANDIDATE"
fi
[[ -f "$CANDIDATE" ]] || {
  echo "release env is missing: $CANDIDATE" >&2
  exit 1
}

case "$(cd -- "$(dirname -- "$CANDIDATE")" && pwd)/$(basename -- "$CANDIDATE")" in
  "$RELEASE_ROOT"/*.env) ;;
  *)
    echo "release env must live under $RELEASE_ROOT" >&2
    exit 1
    ;;
esac

if docker info >/dev/null 2>&1; then
  DOCKER=(docker)
else
  DOCKER=(sudo docker)
fi

read_release_value() {
  local key=$1
  local file=$2
  awk -F= -v key="$key" '$1 == key { print substr($0, length(key) + 2); found = 1 } END { if (!found) exit 1 }' "$file"
}

read_release_optional() {
  local key=$1
  local file=$2
  awk -F= -v key="$key" '$1 == key { print substr($0, length(key) + 2); found = 1 } END { if (!found) print "" }' "$file"
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

API_SOURCE_IMAGE=$(read_release_value LIBRECHAT_RELEASE_IMAGE "$CANDIDATE")
ENGINE_SOURCE_IMAGE=$(read_release_value FUTURE_ENGINE_RELEASE_IMAGE "$CANDIDATE")
IMAGE_ID_PATTERN='^sha256:[0-9a-f]{64}$'
[[ "$API_SOURCE_IMAGE" =~ $IMAGE_ID_PATTERN && "$ENGINE_SOURCE_IMAGE" =~ $IMAGE_ID_PATTERN ]] || {
  echo "release env must contain two content-addressed sha256 image IDs" >&2
  exit 1
}
API_IMAGE=$API_SOURCE_IMAGE
ENGINE_IMAGE=$ENGINE_SOURCE_IMAGE

MANIFEST_FILE="${CANDIDATE%.env}.manifest"
TRANSPORT_FILE="${CANDIDATE%.env}.transport"
STAGE_STATUS_FILE="${CANDIDATE%.env}.stage-status"
APPLY_RESULT_FILE="${CANDIDATE%.env}.apply"
MANIFEST_SCHEMA=""
if [[ -f "$MANIFEST_FILE" ]]; then
  MANIFEST_SCHEMA=$(read_release_optional manifest_schema "$MANIFEST_FILE")
fi
if [[ "$MANIFEST_SCHEMA" == yiwei.release-manifest.v2 ]]; then
  [[ "$(read_release_value test_evidence_status "$MANIFEST_FILE")" == passed ]] || {
    echo "candidate test evidence is not passed" >&2
    exit 1
  }
  EVIDENCE_SHA=$(read_release_value test_evidence_sha256 "$MANIFEST_FILE")
  [[ "$EVIDENCE_SHA" =~ ^[0-9a-f]{64}$ ]] || {
    echo "candidate test evidence SHA is invalid" >&2
    exit 1
  }
  EVIDENCE_NAME=$(read_release_value test_evidence_file "$MANIFEST_FILE")
  case "$EVIDENCE_NAME" in
    */*|*..*) echo "candidate test evidence file must be a basename" >&2; exit 1 ;;
  esac
  EVIDENCE_FILE="$RELEASE_ROOT/$EVIDENCE_NAME"
  [[ -s "$EVIDENCE_FILE" ]] || {
    echo "candidate test evidence artifact is missing: $EVIDENCE_FILE" >&2
    exit 1
  }
  [[ "$(sha256_file "$EVIDENCE_FILE")" == "$EVIDENCE_SHA" ]] || {
    echo "candidate test evidence artifact SHA mismatch" >&2
    exit 1
  }
  [[ "$(read_release_value schema "$EVIDENCE_FILE")" == yiwei.release-test-evidence.v1 ]] || {
    echo "candidate evidence artifact schema is unsupported" >&2
    exit 1
  }
  [[ "$(read_release_value status "$EVIDENCE_FILE")" == passed ]] || {
    echo "candidate evidence artifact is not passed" >&2
    exit 1
  }
  [[ "$(read_release_value scope "$EVIDENCE_FILE")" == "$(read_release_value test_evidence_scope "$MANIFEST_FILE")" ]] || {
    echo "candidate evidence scope does not match manifest" >&2
    exit 1
  }
  LIBRECHAT_REVISION=$(read_release_value librechat_revision "$MANIFEST_FILE")
  ENGINE_REVISION=$(read_release_value future_engine_revision "$MANIFEST_FILE")
  [[ "$(read_release_value librechat_revision "$EVIDENCE_FILE")" == "$LIBRECHAT_REVISION" ]] || {
    echo "candidate evidence LibreChat revision does not match manifest" >&2
    exit 1
  }
  [[ "$(read_release_value future_engine_revision "$EVIDENCE_FILE")" == "$ENGINE_REVISION" ]] || {
    echo "candidate evidence future-engine revision does not match manifest" >&2
    exit 1
  }
  MANIFEST_API_IMAGE=$(read_release_optional librechat_image "$MANIFEST_FILE")
  MANIFEST_ENGINE_IMAGE=$(read_release_optional future_engine_image "$MANIFEST_FILE")
  if [[ -n "$MANIFEST_API_IMAGE" || -n "$MANIFEST_ENGINE_IMAGE" ]]; then
    [[ "$MANIFEST_API_IMAGE" == "$API_SOURCE_IMAGE" ]] || {
      echo "candidate env LibreChat image does not match manifest" >&2
      exit 1
    }
    [[ "$MANIFEST_ENGINE_IMAGE" == "$ENGINE_SOURCE_IMAGE" ]] || {
      echo "candidate env future-engine image does not match manifest" >&2
      exit 1
    }
  else
    [[ "$LIBRECHAT_REVISION" == reused-active && "$ENGINE_REVISION" == reused-active ]] || {
      echo "candidate manifest is missing bound image IDs" >&2
      exit 1
    }
    [[ "$(read_release_value suite "$EVIDENCE_FILE")" == generated-rollback ]] || {
      echo "only a generated rollback may omit bound image IDs" >&2
      exit 1
    }
  fi

  STAGE_GATE=$(read_release_optional stage_gate "$MANIFEST_FILE")
  if [[ "$STAGE_GATE" == required ]]; then
    [[ -s "$TRANSPORT_FILE" && -s "$STAGE_STATUS_FILE" ]] || {
      echo "candidate is not deployable: transport and stage status are required" >&2
      exit 1
    }
    [[ "$(read_release_value schema "$STAGE_STATUS_FILE")" == yiwei.release-stage-status.v1 ]] || {
      echo "candidate stage status schema is unsupported" >&2
      exit 1
    }
    [[ "$(read_release_value state "$STAGE_STATUS_FILE")" == deployable ]] || {
      echo "candidate stage state is not deployable" >&2
      exit 1
    }
    [[ "$(read_release_value candidate_env_sha256 "$STAGE_STATUS_FILE")" == "$(sha256_file "$CANDIDATE")" ]] || {
      echo "candidate stage status env SHA mismatch" >&2
      exit 1
    }
    [[ "$(read_release_value candidate_manifest_sha256 "$STAGE_STATUS_FILE")" == "$(sha256_file "$MANIFEST_FILE")" ]] || {
      echo "candidate stage status manifest SHA mismatch" >&2
      exit 1
    }
  fi
fi

if [[ -f "$TRANSPORT_FILE" ]]; then
  [[ "$MANIFEST_SCHEMA" == yiwei.release-manifest.v2 ]] || {
    echo "transport proof requires a v2 candidate manifest" >&2
    exit 1
  }
  [[ "$(read_release_value schema "$TRANSPORT_FILE")" == yiwei.release-transport.v1 ]] || {
    echo "candidate transport proof schema is unsupported" >&2
    exit 1
  }
  [[ "$(read_release_value status "$TRANSPORT_FILE")" == passed ]] || {
    echo "candidate transport proof is not passed" >&2
    exit 1
  }
  TRANSPORT_MODE=$(read_release_optional transport_mode "$TRANSPORT_FILE")
  [[ -z "$TRANSPORT_MODE" || "$TRANSPORT_MODE" == legacy-save-load || "$TRANSPORT_MODE" == registry-pull || "$TRANSPORT_MODE" == artifact-only ]] || {
    echo "candidate transport mode is unsupported" >&2
    exit 1
  }
  [[ "$(read_release_value candidate_env_sha256 "$TRANSPORT_FILE")" == "$(sha256_file "$CANDIDATE")" ]] || {
    echo "candidate transport env SHA mismatch" >&2
    exit 1
  }
  [[ "$(read_release_value candidate_manifest_sha256 "$TRANSPORT_FILE")" == "$(sha256_file "$MANIFEST_FILE")" ]] || {
    echo "candidate transport manifest SHA mismatch" >&2
    exit 1
  }
  [[ "$(read_release_value librechat_source_image "$TRANSPORT_FILE")" == "$API_SOURCE_IMAGE" ]] || {
    echo "candidate transport LibreChat source image mismatch" >&2
    exit 1
  }
  [[ "$(read_release_value future_engine_source_image "$TRANSPORT_FILE")" == "$ENGINE_SOURCE_IMAGE" ]] || {
    echo "candidate transport future-engine source image mismatch" >&2
    exit 1
  }
  [[ "$(read_release_value librechat_revision "$TRANSPORT_FILE")" == "$LIBRECHAT_REVISION" ]] || {
    echo "candidate transport LibreChat revision mismatch" >&2
    exit 1
  }
  [[ "$(read_release_value future_engine_revision "$TRANSPORT_FILE")" == "$ENGINE_REVISION" ]] || {
    echo "candidate transport future-engine revision mismatch" >&2
    exit 1
  }
  if [[ "$TRANSPORT_MODE" == registry-pull ]]; then
    [[ "$(read_release_value librechat_registry_ref "$TRANSPORT_FILE")" == "$(read_release_value librechat_registry_ref "$MANIFEST_FILE")" ]] || {
      echo "candidate transport LibreChat registry ref mismatch" >&2
      exit 1
    }
    [[ "$(read_release_value future_engine_registry_ref "$TRANSPORT_FILE")" == "$(read_release_value future_engine_registry_ref "$MANIFEST_FILE")" ]] || {
      echo "candidate transport future-engine registry ref mismatch" >&2
      exit 1
    }
  fi
  TRANSPORT_CLIENT_SHA=$(read_release_optional client_artifact_sha256 "$TRANSPORT_FILE")
  MANIFEST_CLIENT_SHA=$(read_release_optional client_artifact_sha256 "$MANIFEST_FILE")
  if [[ -n "$MANIFEST_CLIENT_SHA" && "$MANIFEST_CLIENT_SHA" != not-applicable ]]; then
    [[ "$TRANSPORT_CLIENT_SHA" == "$MANIFEST_CLIENT_SHA" ]] || {
      echo "candidate transport client artifact SHA mismatch" >&2
      exit 1
    }
  fi
  API_IMAGE=$(read_release_value librechat_loaded_image "$TRANSPORT_FILE")
  ENGINE_IMAGE=$(read_release_value future_engine_loaded_image "$TRANSPORT_FILE")
  [[ "$API_IMAGE" =~ $IMAGE_ID_PATTERN && "$ENGINE_IMAGE" =~ $IMAGE_ID_PATTERN ]] || {
    echo "candidate transport proof must contain two loaded image IDs" >&2
    exit 1
  }
fi

"${DOCKER[@]}" image inspect "$API_IMAGE" "$ENGINE_IMAGE" >/dev/null

verify_runtime_image() {
  local image=$1
  local revision=$2
  local label=$3
  local architecture user image_revision
  architecture=$("${DOCKER[@]}" image inspect --format '{{.Architecture}}' "$image")
  [[ "$architecture" == amd64 ]] || {
    echo "$label image must be linux/amd64, got: $architecture" >&2
    exit 1
  }
  user=$("${DOCKER[@]}" image inspect --format '{{.Config.User}}' "$image")
  [[ "$user" == node || "$user" == 1000 ]] || {
    echo "$label image must run as node/1000, got: ${user:-root}" >&2
    exit 1
  }
  if [[ "$revision" != reused-active ]]; then
    image_revision=$("${DOCKER[@]}" image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")
    [[ "$image_revision" == "$revision" ]] || {
      echo "$label image revision label does not match manifest" >&2
      exit 1
    }
  fi
}

if [[ "$MANIFEST_SCHEMA" == yiwei.release-manifest.v2 ]]; then
  API_IMAGE_REVISION=$LIBRECHAT_REVISION
  ENGINE_IMAGE_REVISION=$ENGINE_REVISION
  RELEASE_MODE=$(read_release_optional release_mode "$MANIFEST_FILE")
  if [[ "$RELEASE_MODE" == static ]]; then
    [[ "$(read_release_value release_service "$MANIFEST_FILE")" == client ]] || {
      echo "static release mode is only valid for the client service" >&2
      exit 1
    }
    API_IMAGE_REVISION=reused-active
    ENGINE_IMAGE_REVISION=reused-active
  fi
  verify_runtime_image "$API_IMAGE" "$API_IMAGE_REVISION" LibreChat
  verify_runtime_image "$ENGINE_IMAGE" "$ENGINE_IMAGE_REVISION" future-engine
fi

EFFECTIVE_ENV=$(mktemp "$RELEASE_ROOT/.effective-release.XXXXXX")
CLIENT_SWITCH_APPLIED=false
RULES_SWITCH_APPLIED=false
SERVICE_SWITCH_ATTEMPTED=false
ROLLBACK_ENV=
RULES_ROLLBACK_FILE=
CLIENT_ROLLBACK_SHA=not-applicable

atomic_client_link() {
  local target=$1
  local tmp="$CLIENT_RELEASES_DIR/.current.$$.tmp"
  install -d -m 755 "$CLIENT_RELEASES_DIR"
  rm -f -- "$tmp"
  ln -s "$target" "$tmp"
  python3 - "$tmp" "$CLIENT_RELEASES_DIR/current" <<'PY'
import os
import sys

os.replace(sys.argv[1], sys.argv[2])
PY
}

restore_client_pointer() {
  if [[ "$CLIENT_ROLLBACK_SHA" == not-applicable ]]; then
    rm -f -- "$CLIENT_RELEASES_DIR/current"
  else
    atomic_client_link "$CLIENT_ROLLBACK_SHA"
  fi
  CLIENT_SWITCH_APPLIED=false
}

rollback_apply_state() {
  local rollback_failed=false
  if [[ "$CLIENT_SWITCH_APPLIED" == true ]]; then
    restore_client_pointer || rollback_failed=true
  fi
  if [[ "$RULES_SWITCH_APPLIED" == true && -n "$RULES_ROLLBACK_FILE" ]]; then
    if install -m 644 "$RULES_ROLLBACK_FILE" "$RUNTIME_CONFIG_DIR/rules.v1.json"; then
      RULES_SWITCH_APPLIED=false
    else
      rollback_failed=true
    fi
  fi
  if [[ "$SERVICE_SWITCH_ATTEMPTED" == true && ${#CHANGED_SERVICES[@]} -gt 0 && -s "$ROLLBACK_ENV" ]]; then
    local rollback_compose=(
      "${DOCKER[@]}" compose
      --file "$APP_DIR/docker-compose.prod.yml"
      --env-file "$APP_DIR/.env"
      --env-file "$ROLLBACK_ENV"
    )
    if "${rollback_compose[@]}" up --detach --no-deps --force-recreate "${CHANGED_SERVICES[@]}"; then
      SERVICE_SWITCH_ATTEMPTED=false
    else
      rollback_failed=true
    fi
  fi
  [[ "$rollback_failed" == false ]]
}

cleanup_apply() {
  local status=$?
  trap - EXIT
  rm -f -- "$EFFECTIVE_ENV"
  if [[ $status -ne 0 ]]; then
    rollback_apply_state || echo "automatic apply rollback was incomplete" >&2
  fi
  exit "$status"
}
trap cleanup_apply EXIT
chmod 600 "$EFFECTIVE_ENV"
{
  printf 'LIBRECHAT_RELEASE_IMAGE=%s\n' "$API_IMAGE"
  printf 'FUTURE_ENGINE_RELEASE_IMAGE=%s\n' "$ENGINE_IMAGE"
} > "$EFFECTIVE_ENV"

CURRENT_API=$("${DOCKER[@]}" inspect --format '{{.Image}}' LibreChat)
CURRENT_ENGINE=$("${DOCKER[@]}" inspect --format '{{.Image}}' future-engine)
CHANGED_SERVICES=()
[[ "$ENGINE_IMAGE" == "$CURRENT_ENGINE" ]] || CHANGED_SERVICES+=(future-engine)
[[ "$API_IMAGE" == "$CURRENT_API" ]] || CHANGED_SERVICES+=(api)

CLIENT_RELEASE_SHA=
if [[ -f "$MANIFEST_FILE" ]]; then
  CLIENT_RELEASE_SHA=$(read_release_optional client_release_sha256 "$MANIFEST_FILE")
  if [[ -z "$CLIENT_RELEASE_SHA" ]]; then
    CLIENT_RELEASE_SHA=$(read_release_optional client_artifact_sha256 "$MANIFEST_FILE")
  fi
fi
CLIENT_CHANGED=false
CLIENT_PREVIOUS_TARGET=
if [[ -L "$CLIENT_RELEASES_DIR/current" ]]; then
  CLIENT_PREVIOUS_TARGET=$(readlink "$CLIENT_RELEASES_DIR/current")
elif [[ -e "$CLIENT_RELEASES_DIR/current" ]]; then
  echo "current client release pointer must be a symlink" >&2
  exit 1
fi
CLIENT_RELEASE_ACTION=$(read_release_optional client_release_action "$MANIFEST_FILE")
if [[ -z "$CLIENT_RELEASE_ACTION" ]]; then
  if [[ -n "$CLIENT_RELEASE_SHA" && "$CLIENT_RELEASE_SHA" != not-applicable ]]; then
    CLIENT_RELEASE_ACTION=switch
  else
    CLIENT_RELEASE_ACTION=none
  fi
fi
case "$CLIENT_RELEASE_ACTION" in
switch)
  [[ "$CLIENT_RELEASE_SHA" =~ ^[0-9a-f]{64}$ ]] || {
    echo "candidate client release SHA is invalid" >&2
    exit 1
  }
  [[ -s "$CLIENT_RELEASES_DIR/$CLIENT_RELEASE_SHA/index.html" ]] || {
    echo "candidate client release is not staged: $CLIENT_RELEASE_SHA" >&2
    exit 1
  }
  [[ "$CLIENT_PREVIOUS_TARGET" == "$CLIENT_RELEASE_SHA" ]] || CLIENT_CHANGED=true
  ;;
remove)
  [[ -z "$CLIENT_RELEASE_SHA" || "$CLIENT_RELEASE_SHA" == not-applicable ]] || {
    echo "client remove action cannot include a release SHA" >&2
    exit 1
  }
  [[ -z "$CLIENT_PREVIOUS_TARGET" ]] || CLIENT_CHANGED=true
  CLIENT_RELEASE_SHA=not-applicable
  ;;
none) ;;
*) echo "candidate client release action is unsupported" >&2; exit 1 ;;
esac

RULES_CHANGED=false
RULES_SOURCE=""
RULES_EXPECTED_SHA=""
RULES_PREVIOUS_SHA=""
if [[ "$MANIFEST_SCHEMA" == yiwei.release-manifest.v2 ]]; then
  RULES_EXPECTED_SHA=$(read_release_value runtime_config_rules_sha256 "$MANIFEST_FILE")
  if [[ "$RULES_EXPECTED_SHA" != not-applicable ]]; then
    RESTORE_FILE=$(read_release_optional runtime_config_rules_restore_file "$MANIFEST_FILE")
    if [[ -n "$RESTORE_FILE" ]]; then
      case "$RESTORE_FILE" in
        "$RELEASE_ROOT"/*) RULES_SOURCE=$RESTORE_FILE ;;
        *) echo "runtime config restore file must live under $RELEASE_ROOT" >&2; exit 1 ;;
      esac
    else
      RULES_SOURCE="$PROJECT_DIR/config/rules.v1.json"
    fi
    [[ -s "$RULES_SOURCE" ]] || {
      echo "candidate rules source is missing: $RULES_SOURCE" >&2
      exit 1
    }
    python3 -m json.tool "$RULES_SOURCE" >/dev/null
    [[ "$(sha256_file "$RULES_SOURCE")" == "$RULES_EXPECTED_SHA" ]] || {
      echo "candidate rules source SHA does not match manifest" >&2
      exit 1
    }
    RULES_PREVIOUS_SHA=$(sha256_file "$RUNTIME_CONFIG_DIR/rules.v1.json")
    [[ "$RULES_PREVIOUS_SHA" == "$RULES_EXPECTED_SHA" ]] || RULES_CHANGED=true
  fi
fi

[[ ${#CHANGED_SERVICES[@]} -gt 0 || "$RULES_CHANGED" == true || "$CLIENT_CHANGED" == true ]] || {
  echo "candidate is identical to the running release and runtime config; nothing to switch" >&2
  exit 1
}
RELEASE_NAME=$(basename -- "$CANDIDATE" .env)
ROLLBACK_ENV="$RELEASE_ROOT/$RELEASE_NAME.rollback.env"
ROLLBACK_MANIFEST="$RELEASE_ROOT/$RELEASE_NAME.rollback.manifest"
umask 077
{
  printf 'LIBRECHAT_RELEASE_IMAGE=%s\n' "$CURRENT_API"
  printf 'FUTURE_ENGINE_RELEASE_IMAGE=%s\n' "$CURRENT_ENGINE"
} > "$ROLLBACK_ENV"
chmod 600 "$ROLLBACK_ENV"

RULES_ROLLBACK_FILE=""
if [[ "$RULES_CHANGED" == true ]]; then
  RULES_ROLLBACK_DIR="$RELEASE_ROOT/$RELEASE_NAME.runtime-config.rollback"
  install -d -m 700 "$RULES_ROLLBACK_DIR"
  RULES_ROLLBACK_FILE="$RULES_ROLLBACK_DIR/rules.v1.json"
  ROLLBACK_EVIDENCE="$RELEASE_ROOT/$RELEASE_NAME.rollback.evidence"
  install -m 600 "$RUNTIME_CONFIG_DIR/rules.v1.json" "$RULES_ROLLBACK_FILE"
  {
    printf 'schema=yiwei.release-test-evidence.v1\n'
    printf 'status=passed\n'
    printf 'scope=config-only\n'
    printf 'suite=generated-rollback\n'
    printf 'librechat_revision=reused-active\n'
    printf 'future_engine_revision=reused-active\n'
    printf 'finished_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } > "$ROLLBACK_EVIDENCE"
  chmod 600 "$ROLLBACK_EVIDENCE"
  ROLLBACK_EVIDENCE_SHA=$(sha256_file "$ROLLBACK_EVIDENCE")
  {
    printf 'manifest_schema=yiwei.release-manifest.v2\n'
    printf 'release_id=%s.rollback\n' "$RELEASE_NAME"
    printf 'release_service=config\n'
    printf 'test_evidence_status=passed\n'
    printf 'test_evidence_scope=config-only\n'
    printf 'test_evidence_sha256=%s\n' "$ROLLBACK_EVIDENCE_SHA"
    printf 'test_evidence_file=%s.rollback.evidence\n' "$RELEASE_NAME"
    printf 'librechat_revision=reused-active\n'
    printf 'future_engine_revision=reused-active\n'
    printf 'librechat_image=%s\n' "$CURRENT_API"
    printf 'future_engine_image=%s\n' "$CURRENT_ENGINE"
    printf 'runtime_config_rules_sha256=%s\n' "$RULES_PREVIOUS_SHA"
    printf 'runtime_config_rules_restore_file=%s\n' "$RULES_ROLLBACK_FILE"
  } > "$ROLLBACK_MANIFEST"
  chmod 600 "$ROLLBACK_MANIFEST"

  RULES_TMP="$RUNTIME_CONFIG_DIR/.rules.v1.json.$RELEASE_NAME.tmp"
  install -m 644 "$RULES_SOURCE" "$RULES_TMP"
  mv "$RULES_TMP" "$RUNTIME_CONFIG_DIR/rules.v1.json"
  [[ "$(sha256_file "$RUNTIME_CONFIG_DIR/rules.v1.json")" == "$RULES_EXPECTED_SHA" ]] || {
    install -m 644 "$RULES_ROLLBACK_FILE" "$RUNTIME_CONFIG_DIR/rules.v1.json"
    echo "runtime rules atomic sync failed SHA verification" >&2
    exit 1
  }
  RULES_SWITCH_APPLIED=true
fi

if [[ "$CLIENT_CHANGED" == true ]]; then
  if [[ -n "$CLIENT_PREVIOUS_TARGET" ]]; then
    CLIENT_ROLLBACK_SHA=$(basename -- "$CLIENT_PREVIOUS_TARGET")
    [[ "$CLIENT_ROLLBACK_SHA" =~ ^[0-9a-f]{64}$ ]] || {
      echo "current client release target is invalid: $CLIENT_PREVIOUS_TARGET" >&2
      exit 1
    }
    [[ -s "$CLIENT_RELEASES_DIR/$CLIENT_ROLLBACK_SHA/index.html" ]] || {
      echo "current client release target is missing index.html: $CLIENT_ROLLBACK_SHA" >&2
      exit 1
    }
  fi
  if [[ "$RULES_CHANGED" != true ]]; then
    ROLLBACK_EVIDENCE="$RELEASE_ROOT/$RELEASE_NAME.rollback.evidence"
    {
      printf 'schema=yiwei.release-test-evidence.v1\n'
      printf 'status=passed\n'
      printf 'scope=config-only\n'
      printf 'suite=generated-rollback\n'
      printf 'librechat_revision=reused-active\n'
      printf 'future_engine_revision=reused-active\n'
      printf 'finished_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    } > "$ROLLBACK_EVIDENCE"
    chmod 600 "$ROLLBACK_EVIDENCE"
    ROLLBACK_EVIDENCE_SHA=$(sha256_file "$ROLLBACK_EVIDENCE")
    {
      printf 'manifest_schema=yiwei.release-manifest.v2\n'
      printf 'release_id=%s.rollback\n' "$RELEASE_NAME"
      printf 'release_service=config\n'
      printf 'stage_gate=not-required\n'
      printf 'test_evidence_status=passed\n'
      printf 'test_evidence_scope=config-only\n'
      printf 'test_evidence_sha256=%s\n' "$ROLLBACK_EVIDENCE_SHA"
      printf 'test_evidence_file=%s.rollback.evidence\n' "$RELEASE_NAME"
      printf 'librechat_revision=reused-active\n'
      printf 'future_engine_revision=reused-active\n'
      printf 'librechat_image=%s\n' "$CURRENT_API"
      printf 'future_engine_image=%s\n' "$CURRENT_ENGINE"
      printf 'runtime_config_rules_sha256=not-applicable\n'
    } > "$ROLLBACK_MANIFEST"
    chmod 600 "$ROLLBACK_MANIFEST"
  fi
  if [[ "$CLIENT_ROLLBACK_SHA" == not-applicable ]]; then
    printf 'client_release_action=remove\nclient_release_sha256=not-applicable\n' >> "$ROLLBACK_MANIFEST"
  else
    printf 'client_release_action=switch\nclient_release_sha256=%s\n' "$CLIENT_ROLLBACK_SHA" >> "$ROLLBACK_MANIFEST"
  fi

  if [[ "$CLIENT_RELEASE_ACTION" == remove ]]; then
    rm -f -- "$CLIENT_RELEASES_DIR/current"
  else
    atomic_client_link "$CLIENT_RELEASE_SHA"
  fi
  CLIENT_SWITCH_APPLIED=true
  if [[ "$CLIENT_RELEASE_ACTION" == remove ]]; then
    [[ ! -e "$CLIENT_RELEASES_DIR/current" ]] || { echo "client release pointer removal failed" >&2; exit 1; }
  else
    [[ "$(readlink "$CLIENT_RELEASES_DIR/current")" == "$CLIENT_RELEASE_SHA" ]] || {
      echo "client release symlink switch failed" >&2
      exit 1
    }
  fi
fi

if [[ " ${CHANGED_SERVICES[*]} " == *" future-engine "* ]]; then
  # 历史 future-engine 以 root 写 data；镜像降权前一次性迁到固定 node uid/gid。
  "${DOCKER[@]}" run --rm \
    --user 0:0 \
    --volume "$ENGINE_DIR/data:/data" \
    --entrypoint sh \
    "$ENGINE_IMAGE" \
    -c 'chown -R 1000:1000 /data'
fi

COMPOSE=(
  "${DOCKER[@]}" compose
  --file "$APP_DIR/docker-compose.prod.yml"
  --env-file "$APP_DIR/.env"
  --env-file "$EFFECTIVE_ENV"
)
"${COMPOSE[@]}" config --quiet

if [[ ${#CHANGED_SERVICES[@]} -gt 0 ]]; then
  echo "Switching content-addressed service(s): ${CHANGED_SERVICES[*]}"
  SERVICE_SWITCH_ATTEMPTED=true
  "${COMPOSE[@]}" up --detach --no-deps --force-recreate "${CHANGED_SERVICES[@]}"
else
  echo "Applying runtime config without rebuilding or recreating services"
fi

healthy=false
HEALTH_ATTEMPTS=${HEALTH_ATTEMPTS:-45}
HEALTH_SLEEP_SECONDS=${HEALTH_SLEEP_SECONDS:-2}
for _attempt in $(seq 1 "$HEALTH_ATTEMPTS"); do
  if "${DOCKER[@]}" exec future-engine node -e \
      "fetch('http://127.0.0.1:8899/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" \
      >/dev/null 2>&1 \
    && "${DOCKER[@]}" exec LibreChat node -e \
      "fetch('http://127.0.0.1:3080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" \
      >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep "$HEALTH_SLEEP_SECONDS"
done

if [[ "$healthy" != true ]]; then
  echo "release health check failed; rolling changed service(s) back: ${CHANGED_SERVICES[*]}" >&2
  ROLLBACK_RESULT=rolled_back
  rollback_apply_state || ROLLBACK_RESULT=rollback_incomplete
  printf 'apply_result=%s\napply_seconds=%s\nruntime_config_rolled_back=%s\nrecorded_at=%s\n' \
    "$ROLLBACK_RESULT" "$(( $(date +%s) - APPLY_STARTED_EPOCH ))" "$RULES_CHANGED" \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$APPLY_RESULT_FILE"
  chmod 600 "$APPLY_RESULT_FILE"
  exit 1
fi

ACTIVE_TMP="$APP_DIR/.release.env.next"
install -m 600 "$EFFECTIVE_ENV" "$ACTIVE_TMP"
mv "$ACTIVE_TMP" "$APP_DIR/.release.env"

printf 'apply_result=healthy\napply_seconds=%s\nchanged_services=%s\nruntime_config_rules_changed=%s\nruntime_config_rules_previous_sha256=%s\nruntime_config_rules_active_sha256=%s\nclient_release_changed=%s\nclient_release_previous=%s\nclient_release_active=%s\nrecorded_at=%s\n' \
  "$(( $(date +%s) - APPLY_STARTED_EPOCH ))" "${CHANGED_SERVICES[*]}" "$RULES_CHANGED" \
  "${RULES_PREVIOUS_SHA:-not-applicable}" "$(sha256_file "$RUNTIME_CONFIG_DIR/rules.v1.json")" \
  "$CLIENT_CHANGED" "${CLIENT_ROLLBACK_SHA:-not-applicable}" "${CLIENT_RELEASE_SHA:-not-applicable}" \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$APPLY_RESULT_FILE"
chmod 600 "$APPLY_RESULT_FILE"

echo "Release healthy and active: $RELEASE_NAME"
echo "Rollback manifest: $ROLLBACK_ENV"
