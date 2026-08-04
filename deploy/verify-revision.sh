#!/usr/bin/env bash
set -euo pipefail

REPO=${1:-}
REQUESTED=${2:-HEAD}
LABEL=${3:-revision}
MODE=${4:-active-head}

SOURCE_DIR=$(cd -- "$REPO" 2>/dev/null && pwd -P) || {
  echo "$LABEL source directory does not exist: $REPO" >&2
  exit 1
}
GIT_ROOT=$(git -C "$SOURCE_DIR" rev-parse --show-toplevel 2>/dev/null) || {
  echo "$LABEL source is not a Git checkout: $REPO" >&2
  exit 1
}
GIT_ROOT=$(cd -- "$GIT_ROOT" && pwd -P)
if [[ "$SOURCE_DIR" != "$GIT_ROOT" ]]; then
  SOURCE_RELATIVE=${SOURCE_DIR#"$GIT_ROOT"/}
  [[ -n "$(git -C "$GIT_ROOT" ls-files -- "$SOURCE_RELATIVE/" | sed -n '1p')" ]] || {
    echo "$LABEL source is not tracked in its Git checkout: $REPO" >&2
    exit 1
  }
fi
REPO=$GIT_ROOT

RESOLVED=$(git -C "$REPO" rev-parse --verify "$REQUESTED^{commit}" 2>/dev/null) || {
  echo "$LABEL does not exist: $REQUESTED" >&2
  exit 1
}
case "$MODE" in
  active-head)
    HEAD_REVISION=$(git -C "$REPO" rev-parse HEAD)
    [[ "$RESOLVED" == "$HEAD_REVISION" ]] || {
      echo "$LABEL must equal the active source HEAD: requested=$RESOLVED head=$HEAD_REVISION" >&2
      exit 1
    }
    [[ -z "$(git -C "$REPO" status --porcelain --untracked-files=no)" ]] || {
      echo "$LABEL source has tracked changes; commit before building" >&2
      exit 1
    }
    ;;
  pushed)
    ;;
  *)
    echo "revision verification mode must be active-head or pushed" >&2
    exit 2
    ;;
esac
REMOTE_REFS=$(git -C "$REPO" for-each-ref --format='%(refname)' --contains "$RESOLVED" refs/remotes/)
[[ -n "$REMOTE_REFS" ]] || {
  echo "$LABEL is not present in any fetched remote ref: $RESOLVED" >&2
  exit 1
}

printf '%s\n' "$RESOLVED"
