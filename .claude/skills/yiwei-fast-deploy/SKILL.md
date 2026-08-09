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

1. 先完整读 `../未来线部署操作手册.md`、大脑仓 `state/当前状态.md`、LibreChat `CLAUDE.md`、当前 spec 和本 skill 的 `references/definition-of-done.md`。手册决定通道与禁止项，不得跳过。
2. 先查生产 `.release.env`、`.releases/*.env`、manifest、transport、stage status 与本地已推送 revision。只要已有正确候选，已 `deployable` 就直接 `apply-release.sh`，禁止重建。
3. 只在没有可用候选时构建：前端/API/Engine 分别用 `build-client-release.sh`、`build-hotfix-release.sh api`、`build-hotfix-release.sh future-engine`。只有依赖/基础镜像、迁移、身份隔离、共享包或跨服务变更用 `build-full-release.sh`；发布脚本、测试夹具和文档不生成产品候选。
4. 无数据变更的 API/Engine/前端/config 复用最新 VERIFIED 备份和精确 rollback，不重复导出 Mongo/Postgres。
5. 切换只用 `deploy/apply-release.sh <candidate.env>`。新候选必须是 `deployable`；纯前端只原子切换 `client-releases/current`，不重建 API 镜像。不直接改浮动 tag，不直接 `compose build/up`。
6. 一个候选 apply 失败后依赖自动回滚。只有在失败被证明为宿主发布脚本/权限问题、修复已有定向测试且无需重建时，才允许重试一次。第二次失败立即停止。
7. 不在 2 核生产机上重跑已有证据的全量测试。复用与候选 revision 对应的本地全量结果，生产只跑 release 定向门禁与 canary。
8. 任何测试文案都要用 trap 恢复，并比对恢复后 SHA。
9. `client-static` 的新前端 revision 由 evidence、manifest 与静态包 SHA 绑定；复用旧 API/Engine 镜像时仍校验 digest、架构和运行用户，但禁止拿新前端 revision 校验旧镜像 label。
10. staging 前确认生产 `.release.env` 为 `0600` 且固定发布用户可读；root apply 写回后 owner 必须恢复为应用目录 owner。
11. 新发布故障必须完成“脚本修复＋确定性回归＋部署手册/skill 回写”后才能关闭；现场绕过不算永久修复。

只改发布/备份/skill 管道时使用 `projects/未来线/librechat/deploy/verify-local.sh --release`；业务代码开发用 `--quick`，最终完整交付用 `--full`。

## 执行顺序

1. **恢复上下文**：确认分支、已推送 revision、改动服务、活动 release、最新候选、备份与 rollback。
2. **候选优先**：比较候选双 digest 与运行容器 digest。候选已在且不同，直接进入第 4 步。
3. **必要时构建**：按变更面选 `client-static`、`api`、`future-engine` 或 `all`；记录 release ID、revision、digest、体积与构建秒数。
4. **可见 staging**：前台推进 `candidate_ready_local -> staging -> deployable/failed`，Registry 候选只 pull digest 缺失层；不使用会随 Codex 任务退出的 `nohup`。
5. **切换**：只对 `deployable` 候选调用 `apply-release.sh`；双 health 失败同时回滚镜像、规则与前端指针。
6. **生产验收**：按 `references/definition-of-done.md` 的 fail-closed 原则检查：
   - `.release.env` 与容器 digest 一致，权限为 `0600` 且固定发布用户可读；
   - `user=node`、`restart=0`、`no-new-privileges:true`；
   - API `/health` 200；engine `/health` 200、工具数和 dependencies 正常；
   - 公网 `/`、`/home`、`/login`、`/faq`、`/health` 全部 200；
   - 最近日志无新 `error|exception|fatal|EACCES`（明确的非致命 RAG 告警单列）。
7. **运行时控制面 canary**：仅当改动 runtime-copy/prompt 管道时执行。
   - JSON：同一 engine 进程内修改后无重启读到，再恢复 SHA。
   - MCP/schema：改一个 describe 标记，重启 engine，live `tools/list` 看到；恢复并再启后消失。
   - prompt：改 prompt 标记，重启 API，last-good 出现；恢复并再启后 SHA 一致。
8. **收尾**：只在全绿后清理明确无引用的 staging/重复备份、更新 `state/当前状态.md`，再 commit + push；不同步整仓生产源码。保护 `.env`、`runtime-config/`、`data/`、`banks-live/`、`uploads/`、`images/`、`data-node/`、`.releases/`。

## 发布产物保留

- 每次收尾先跑 `docker system df`、统计 `.release-src`、`.releases`、两个 backups 目录。
- 必须保留：活动双 digest、当前 release 的精确 rollback 双 digest、对应 env/manifest、最新非空 `VERIFIED` 备份。
- 可清理：已停止的临时构建容器、不被任何容器/活动/rollback digest 引用的 dangling 镜像、已完成 release 的 staging、明确重复的同时点备份。
- `.releases/.build-cache` 是固定两份的构建加速缓存，不应随 release 数量增长，也绝不能进备份。
- 备份按 `KEEP_DAYS` 轮转；不得为了腾空间删除唯一有效恢复点。
- 删除前用内容 digest 而不是 tag 判定引用关系。目标不清楚就只报告，不删。

## 时间预算

- 已 stage 候选：目标 1–3 分钟内切换和基础验收。
- Prompt／mode card 热更新：目标 1–3 分钟，不运行全量测试、不构建镜像。
- 纯前端静态包：目标 1–3 分钟，不构建、不传输镜像、不重启 API。
- Engine 代码热修：目标 5–8 分钟。
- LibreChat API 热修：目标 5–10 分钟。
- 前端＋Engine 完整版本：目标 10–20 分钟。
- 镜像预算：LibreChat 不得超过 2.1GB，future-engine 不得超过 1.0GB。
- 超过 60 秒没有新的可见进展，立即报告当前阶段、耗时和阻断。
- 不把上游模型 503/CPU 过载当成发布失败；发布只验证目标代码和服务健康，上游容量单独报告。

## 交付报告

用 `DONE`、`DONE_WITH_CONCERNS` 或 `BLOCKED` 开头，只报告：release ID、双 digest、apply/build 秒数、备份、rollback、健康/公网/日志/canary 证据，以及任何跳过项。
