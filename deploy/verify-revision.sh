#!/usr/bin/env bash
set -euo pipefail

REPO=${1:-}
REQUESTED=${2:-HEAD}
LABEL=${3:-revision}
MODE=${4:-active-head}

[[ -d "$REPO/.git" || -f "$REPO/.git" ]] || {
  echo "$LABEL source is not a Git checkout: $REPO" >&2
  exit 1
}

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
