#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
APP_DIR=${APP_DIR_OVERRIDE:-"$(cd -- "$SCRIPT_DIR/.." && pwd)"}
BRAIN_DIR=${BRAIN_DIR_OVERRIDE:-"$(cd -- "$APP_DIR/../../.." && pwd)"}
BRAIN_BASE=${1:-}
APP_BASE=${2:-}
BRAIN_HEAD=${3:-HEAD}
APP_HEAD=${4:-HEAD}

[[ -n "$BRAIN_BASE" && -n "$APP_BASE" ]] || {
  echo "usage: bash deploy/plan-release.sh <brain-base> <librechat-base> [brain-head] [librechat-head]" >&2
  exit 2
}

BRAIN_PLAN=$(bash "$SCRIPT_DIR/classify-release.sh" "$BRAIN_DIR" "$BRAIN_BASE" "$BRAIN_HEAD")
APP_PLAN=$(bash "$SCRIPT_DIR/classify-release.sh" "$APP_DIR" "$APP_BASE" "$APP_HEAD")

node -e '
const brain = JSON.parse(process.argv[1]);
const app = JSON.parse(process.argv[2]);
let channel = "none";
let service = "none";
let executors = [];
let targetSeconds = { min: 0, max: 0 };
const active = [brain, app].filter((plan) => plan.channel !== "none");
const hasHardImageRisk = active.some((plan) => {
  const facts = plan.facts || {};
  const identityBoundaryChanged = facts.identityOrIsolationChanged && !facts.clientOnly;
  return facts.lockChanged || facts.dependencyChanged || facts.baseImageChanged
    || facts.schemaChanged || identityBoundaryChanged || facts.migrationChanged;
});
if (!hasHardImageRisk && (active.length > 1 || active.some((plan) => plan.channel === "full"))) {
  channel = "ssh-source";
  service = "changed";
  targetSeconds = { min: 300, max: 600 };
  executors = ["deploy/ssh-source-release.sh"];
} else if (active.some((plan) => plan.channel === "full") || active.length > 1) {
  channel = "full";
  service = "all";
  targetSeconds = { min: 600, max: 1200 };
  executors = ["deploy/build-full-release.sh"];
} else if (app.channel === "client-static") {
  channel = "client-static";
  service = "client";
  targetSeconds = app.targetSeconds;
  executors = ["deploy/build-client-release.sh"];
} else if (app.channel === "api-hotfix") {
  channel = "api-hotfix";
  service = "api";
  targetSeconds = app.targetSeconds;
  executors = ["deploy/build-hotfix-release.sh api"];
} else if (brain.channel === "engine-hotfix") {
  channel = brain.channel;
  service = brain.service;
  targetSeconds = brain.targetSeconds;
  executors = ["deploy/build-hotfix-release.sh future-engine"];
} else if (brain.channel === "config-only") {
  channel = brain.channel;
  service = brain.service;
  targetSeconds = brain.targetSeconds;
  if (brain.facts.hasRules) executors.push("deploy/build-config-release.sh");
  if (brain.facts.hasBanks) executors.push("future-engine-shim/scripts/deploy-banks.sh");
  if (brain.facts.hasProductSkills) executors.push("deploy/deploy-product-skills.sh");
} else if (active.length === 1) {
  channel = "full";
  service = "all";
  targetSeconds = { min: 600, max: 1200 };
  executors = ["deploy/build-full-release.sh"];
}
if (brain.facts.hasProductSkills && !executors.includes("deploy/deploy-product-skills.sh")) {
  executors.push("deploy/deploy-product-skills.sh");
}
if (brain.facts.hasBanks && !executors.includes("future-engine-shim/scripts/deploy-banks.sh")) {
  executors.push("future-engine-shim/scripts/deploy-banks.sh");
}
process.stdout.write(JSON.stringify({
  selectedBy: "classifier",
  channel,
  service,
  targetSeconds,
  executors,
  brain,
  librechat: app,
  note: "先复用已有全绿候选；无依赖变化的跨服务普通 bug 走 SSH 内容寻址源码发布，不生成增量镜像"
}, null, 2) + "\n");
' "$BRAIN_PLAN" "$APP_PLAN"
