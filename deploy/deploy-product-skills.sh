#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
APP_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)
BRAIN_ROOT=$(cd -- "$APP_DIR/../../.." && pwd)
SOURCE_DIR="$BRAIN_ROOT/projects/未来线/product-skills"
CATALOG_SOURCE="$BRAIN_ROOT/projects/未来线/config/product-catalog.v1.json"
TARGET=${PRODUCTION_SSH:-tencentcloud2}
REMOTE_APP_DIR=${PRODUCTION_APP_DIR:-/home/ubuntu/app/librechat}
REMOTE_DIR="$REMOTE_APP_DIR/runtime-config/product-skills"
REMOTE_CATALOG="$REMOTE_APP_DIR/runtime-config/product-catalog.v1.json"
CHECK_ONLY=false
STAGE_ONLY=${STAGE_ONLY:-false}

[[ "${1:-}" != --check ]] || CHECK_ONLY=true
[[ -d "$SOURCE_DIR" ]] || { echo "product-skills source is missing: $SOURCE_DIR" >&2; exit 1; }
[[ -s "$CATALOG_SOURCE" ]] || { echo "product catalog source is missing: $CATALOG_SOURCE" >&2; exit 1; }

hash_tree() {
  node - "$1" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2]);
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile()) files.push(file);
    else throw new Error(`unsupported product-skill entry: ${file}`);
  }
}
walk(root);
const hash = crypto.createHash('sha256');
for (const file of files.sort()) {
  hash.update(path.relative(root, file).split(path.sep).join('/'));
  hash.update('\0');
  hash.update(fs.readFileSync(file));
  hash.update('\0');
}
process.stdout.write(hash.digest('hex'));
NODE
}

validate_local() {
  node - "$BRAIN_ROOT/projects/未来线/future-engine-shim" "$SOURCE_DIR" <<'NODE'
const path = require('node:path');
const engine = process.argv[2];
const skillRoot = process.argv[3];
const { createProductSkillLoader } = require(path.join(engine, 'product-skill-registry.js'));
const loader = createProductSkillLoader({
  catalogFile: path.join(engine, '..', 'config', 'product-catalog.v1.json'),
  skillRoot,
  pluginRoot: path.join(engine, '..', 'product-plugins'),
  bankRoot: path.join(engine, 'banks'),
});
const compiled = loader.current();
if (!compiled.capabilities['advisor.mode-flow']) throw new Error('advisor.mode-flow is missing');
process.stdout.write(compiled.snapshot.sha256);
NODE
}

SNAPSHOT_SHA=$(validate_local)
CONTENT_SHA=$(hash_tree "$SOURCE_DIR")
CATALOG_SHA=$(shasum -a 256 "$CATALOG_SOURCE" | awk '{print $1}')
printf 'product_skill_snapshot_sha256=%s\n' "$SNAPSHOT_SHA"
printf 'product_skill_content_sha256=%s\n' "$CONTENT_SHA"
printf 'product_catalog_sha256=%s\n' "$CATALOG_SHA"
[[ "$CHECK_ONLY" == false ]] || exit 0

VERIFIED_BACKUP=$(ssh "$TARGET" "sudo -n find /root/backups /home/ubuntu/backups -maxdepth 2 -type f -name VERIFIED -size +0c -printf '%T@ %h\\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-")
[[ -n "$VERIFIED_BACKUP" ]] || { echo "no non-empty VERIFIED backup is available" >&2; exit 1; }
printf 'reusing_verified_backup=%s\n' "$VERIFIED_BACKUP"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
REMOTE_BACKUP="$REMOTE_APP_DIR/.releases/product-skills-$STAMP.tgz"
ssh "$TARGET" "set -e; sudo install -d -m 755 '$REMOTE_DIR'; sudo tar -C '$REMOTE_APP_DIR/runtime-config' -czf '$REMOTE_BACKUP' product-skills product-catalog.v1.json"

restore_remote() {
  ssh "$TARGET" "set -e; sudo find '$REMOTE_DIR' -mindepth 1 -delete; sudo tar -C '$REMOTE_APP_DIR/runtime-config' -xzf '$REMOTE_BACKUP'" >/dev/null 2>&1 || true
}
trap restore_remote ERR

rsync -a --delete --rsync-path="sudo rsync" "$SOURCE_DIR/" "$TARGET:$REMOTE_DIR/"
ssh "$TARGET" "sudo find '$REMOTE_DIR' -type d -exec chmod 755 {} +; sudo find '$REMOTE_DIR' -type f -exec chmod 644 {} +"

if [[ "$STAGE_ONLY" != true ]]; then
  REMOTE_TMP="/tmp/yiwei-product-catalog-$STAMP-$$"
  ssh "$TARGET" "install -d -m 700 '$REMOTE_TMP'"
  scp -q "$CATALOG_SOURCE" "$TARGET:$REMOTE_TMP/product-catalog.v1.json"
  ssh "$TARGET" "set -e; sudo install -m 644 '$REMOTE_TMP/product-catalog.v1.json' '$REMOTE_CATALOG'; rm -rf -- '$REMOTE_TMP'"
fi

if [[ "$STAGE_ONLY" == true ]]; then
  REMOTE_CONTENT_SHA=$(ssh "$TARGET" "sudo python3 - '$REMOTE_DIR'" <<'PYTHON'
import hashlib
import pathlib
import sys

root = pathlib.Path(sys.argv[1]).resolve()
files = sorted(path for path in root.rglob('*') if path.is_file())
digest = hashlib.sha256()
for file in files:
    digest.update(file.relative_to(root).as_posix().encode())
    digest.update(b'\0')
    digest.update(file.read_bytes())
    digest.update(b'\0')
print(digest.hexdigest(), end='')
PYTHON
  )
else
  REMOTE_CONTENT_SHA=$(ssh "$TARGET" "sudo docker exec -i future-engine node - '$REMOTE_DIR'" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = '/app/runtime-config/product-skills';
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile()) files.push(file);
    else throw new Error(`unsupported product-skill entry: ${file}`);
  }
}
walk(root);
const hash = crypto.createHash('sha256');
for (const file of files.sort()) {
  hash.update(path.relative(root, file).split(path.sep).join('/'));
  hash.update('\0');
  hash.update(fs.readFileSync(file));
  hash.update('\0');
}
process.stdout.write(hash.digest('hex'));
NODE
  )
fi
[[ "$REMOTE_CONTENT_SHA" == "$CONTENT_SHA" ]] || { echo "remote product-skills SHA mismatch" >&2; exit 1; }

if [[ "$STAGE_ONLY" == true ]]; then
  trap - ERR
  printf 'product-skills staged; activation waits for the next future-engine recreate\n'
  exit 0
fi

REMOTE_CATALOG_SHA=$(ssh "$TARGET" "sudo sha256sum '$REMOTE_CATALOG' | awk '{print \$1}'")
[[ "$REMOTE_CATALOG_SHA" == "$CATALOG_SHA" ]] || { echo "remote product catalog SHA mismatch" >&2; exit 1; }

ACTIVE_ROOT=$(ssh "$TARGET" "sudo docker inspect future-engine --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^FUTURE_ENGINE_PRODUCT_SKILL_ROOT=//p'")
[[ "$ACTIVE_ROOT" == /app/runtime-config/product-skills ]] || {
  echo "product-skills staged but current engine still uses $ACTIVE_ROOT; run once with STAGE_ONLY=true before the control-plane recreate" >&2
  exit 1
}
ssh "$TARGET" "sudo docker exec future-engine node -e \"fetch('http://127.0.0.1:8899/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))\""
trap - ERR
printf 'product-skills hot update active; rollback=%s\n' "$REMOTE_BACKUP"
