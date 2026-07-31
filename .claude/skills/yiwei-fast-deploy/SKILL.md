---
name: yiwei-fast-deploy
description: Deploy Future Lines/未来线 to production through its candidate-first immutable-image release channel. Use whenever the user says “部署”, “上线”, “发版”, “快速部署”, “热修”, “ship”, asks to verify the live Future Lines site, or resumes an interrupted Future Lines release. Prefer this skill over generic land-and-deploy for production release execution.
---

# 未来线快速部署

把发布当成可恢复的候选镜像切换，不要当成一次新建工程。

## 固定路径

- 大脑仓：`/Users/wushengwen/Desktop/yiwei`
- LibreChat：`projects/未来线/librechat`
- future-engine：`projects/未来线/future-engine-shim`
- 生产 SSH：`tencentcloud2`
- 生产 LibreChat：`/home/ubuntu/app/librechat`
- 验收定义：`references/definition-of-done.md`

## 硬规则

1. 先读 `state/当前状态.md`、LibreChat `CLAUDE.md`、当前 spec 和本 skill 的 `references/definition-of-done.md`。
2. 先查生产 `.release.env`、`.releases/*.env`、manifest 与本地已推送 revision。只要已有正确候选，必须直接 `apply-release.sh`，禁止重建。
3. 只在没有可用候选时构建：单服务用 `build-hotfix-release.sh` 或 `RELEASE_SERVICE=<api|future-engine> build-release.sh`；双服务用 `build-release.sh`。生产机无 host Node/npm 时，跳过依赖 host Node 的 wrapper，但不跳过已有本地/镜像门禁。
4. 生产写入前必须有已验证且非空的备份、候选 env 和精确 rollback env。
5. 切换只用 `deploy/apply-release.sh <candidate.env>`。不直接改浮动 tag，不直接 `compose build/up`。
6. 一个候选 apply 失败后依赖自动回滚。只有在失败被证明为宿主发布脚本/权限问题、修复已有定向测试且无需重建时，才允许重试一次。第二次失败立即停止。
7. 不在 2 核生产机上重跑已有证据的全量测试。复用与候选 revision 对应的本地全量结果，生产只跑 release 定向门禁与 canary。
8. 任何测试文案都要用 trap 恢复，并比对恢复后 SHA。

只改发布/备份/skill 管道时使用 `projects/未来线/librechat/deploy/verify-local.sh --release`；业务代码开发用 `--quick`，最终完整交付用 `--full`。

## 执行顺序

1. **恢复上下文**：确认分支、已推送 revision、改动服务、活动 release、最新候选、备份与 rollback。
2. **候选优先**：比较候选双 digest 与运行容器 digest。候选已在且不同，直接进入第 4 步。
3. **必要时构建**：按变更面选 `api`、`future-engine` 或 `all`；记录 release ID、revision、digest 和构建秒数。
4. **切换**：用候选 env 调用 `apply-release.sh`。脚本必须只 recreate digest 变化的服务，双 health 失败自动回滚。
5. **生产验收**：按 `references/definition-of-done.md` 的 fail-closed 原则检查：
   - `.release.env` 与容器 digest 一致；
   - `user=node`、`restart=0`、`no-new-privileges:true`；
   - API `/health` 200；engine `/health` 200、工具数和 dependencies 正常；
   - 公网 `/`、`/home`、`/login`、`/faq`、`/health` 全部 200；
   - 最近日志无新 `error|exception|fatal|EACCES`（明确的非致命 RAG 告警单列）。
6. **运行时控制面 canary**：仅当改动 runtime-copy/prompt 管道时执行。
   - JSON：同一 engine 进程内修改后无重启读到，再恢复 SHA。
   - MCP/schema：改一个 describe 标记，重启 engine，live `tools/list` 看到；恢复并再启后消失。
   - prompt：改 prompt 标记，重启 API，last-good 出现；恢复并再启后 SHA 一致。
7. **收尾**：只在全绿后同步生产源码、清理 staging/重复备份、更新 `state/当前状态.md`，再 commit + push。保护 `.env`、`runtime-config/`、`data/`、`banks-live/`、`uploads/`、`images/`、`data-node/`、`.releases/`。

## 发布产物保留

- 每次收尾先跑 `docker system df`、统计 `.release-src`、`.releases`、两个 backups 目录。
- 必须保留：活动双 digest、当前 release 的精确 rollback 双 digest、对应 env/manifest、最新非空 `VERIFIED` 备份。
- 可清理：已停止的临时构建容器、不被任何容器/活动/rollback digest 引用的 dangling 镜像、已完成 release 的 staging、明确重复的同时点备份。
- `.releases/.build-cache` 是固定两份的构建加速缓存，不应随 release 数量增长，也绝不能进备份。
- 备份按 `KEEP_DAYS` 轮转；不得为了腾空间删除唯一有效恢复点。
- 删除前用内容 digest 而不是 tag 判定引用关系。目标不清楚就只报告，不删。

## 时间预算

- 已有候选：目标 1–3 分钟内切换和基础验收。
- 单服务构建：目标 5 分钟内。
- 超过 5 分钟没有新的可见进展，立即报告当前阶段、耗时和阻断，不要静默等待。
- 不把上游模型 503/CPU 过载当成发布失败；发布只验证目标代码和服务健康，上游容量单独报告。

## 交付报告

用 `DONE`、`DONE_WITH_CONCERNS` 或 `BLOCKED` 开头，只报告：release ID、双 digest、apply/build 秒数、备份、rollback、健康/公网/日志/canary 证据，以及任何跳过项。
