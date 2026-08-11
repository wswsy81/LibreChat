#!/usr/bin/env bash

classify_source_release_delta() {
  mapfile -t API_RELEASE_FILES < <(printf '%s\n' "${APP_RELEASE_CHANGED[@]}" \
    | grep -E '^api/.+\.js$' \
    | grep -Ev '(^|/)(__tests__/|[^/]+\.test\.js$)' || true)
  mapfile -t API_RELEASE_DELETED < <(printf '%s\n' "${APP_RELEASE_DELETED[@]:-}" \
    | grep -E '^api/.+\.js$' \
    | grep -Ev '(^|/)(__tests__/|[^/]+\.test\.js$)' || true)
  PACKAGE_API_RELEASE_CHANGED=false
  printf '%s\n' "${APP_RELEASE_CHANGED[@]}" "${APP_RELEASE_DELETED[@]:-}" \
    | grep -Eq '^packages/api/src/.+\.ts$' \
    && PACKAGE_API_RELEASE_CHANGED=true || true
  DATA_PROVIDER_RELEASE_CHANGED=false
  printf '%s\n' "${APP_RELEASE_CHANGED[@]}" "${APP_RELEASE_DELETED[@]:-}" \
    | grep -Eq '^packages/data-provider/src/.+\.(ts|tsx)$' \
    && DATA_PROVIDER_RELEASE_CHANGED=true || true
  mapfile -t ENGINE_RELEASE_FILES < <(printf '%s\n' "${BRAIN_RELEASE_CHANGED[@]}" \
    | grep -E '^projects/未来线/future-engine-shim/(.+\.js|runtime-compiled\.json)$' \
    | grep -Ev '(^|/)(__tests__/|scripts/|[^/]+\.test\.js$)' || true)
  mapfile -t ENGINE_RELEASE_DELETED < <(printf '%s\n' "${BRAIN_RELEASE_DELETED[@]:-}" \
    | grep -E '^projects/未来线/future-engine-shim/.+\.js$' \
    | grep -Ev '(^|/)(__tests__/|scripts/|[^/]+\.test\.js$)' || true)
  CLIENT_CHANGED=false
  printf '%s\n' "${APP_RELEASE_CHANGED[@]}" "${APP_RELEASE_DELETED[@]:-}" \
    | grep -Eq '^(client/|packages/client/|packages/data-provider/)' \
    && CLIENT_CHANGED=true || true
}
