#!/usr/bin/env bash
set -euo pipefail

archive=${1:?archive is required}
[[ -s "$archive" ]] || { echo "archive is missing or empty: $archive" >&2; exit 1; }
command -v zstd >/dev/null 2>&1 || { echo "zstd is required" >&2; exit 1; }

tmp=$(mktemp)
cleanup() { rm -f -- "$tmp"; }
trap cleanup EXIT
zstd -dc "$archive" > "$tmp"
if LC_ALL=C grep -a -Fq 'LIBARCHIVE.xattr.com.apple.provenance' "$tmp"; then
  echo "archive contains macOS provenance metadata" >&2
  exit 1
fi
