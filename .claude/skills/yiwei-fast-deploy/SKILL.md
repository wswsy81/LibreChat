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

1. 先完整读 `/Users/wushengwen/Desktop/yiwei/projects/未来线/未来线部署操作手册.md`、`/Users/wushengwen/Desktop/yiwei/state/当前状态.md`、LibreChat `CLAUDE.md`、当前 spec 和本 skill 的 `references/definition-of-done.md`。手册决定通道与禁止项，不得跳过。
2. 先查生产 `.release.env`、`.releases/*.env`、transport、manifest 与本地已推送 revision。只要已有正确候选，禁止重建；未 stage 时只运行 `stage-release.sh`，已 stage 时直接 `apply-release.sh`。
3. 没有候选时先运行 `deploy/plan-release.sh`，按实际 diff 选择 `config-only`、`client-static`、`api-hotfix`、`engine-hotfix`、`ssh-source` 或 `full`。无依赖变化的跨前端/API/Engine 普通 bug 使用 `ssh-source`；发布脚本、测试夹具、文档和评测记录属于控制面，不生成产品候选。
4. 镜像候选构建前仍用 `deploy/verify-revision.sh` 确认 revision 存在、等于活动 HEAD 且已推送。日常 `ssh-source` 不依赖 GitHub/GHCR：要求双仓 tracked worktree 干净、HEAD commit 真实存在，并用本地 revision＋源码包 SHA＋生产解包 SHA 绑定 provenance；VPN/GitHub 不得成为普通 bug 上线前置条件。
5. 只在没有可用候选时构建：Prompt/config/前端/API/Engine 分别走对应单服务快轨。只有 lockfile/package manifest、基础镜像、数据迁移、身份/租户隔离，或无法由已验证编译产物安全覆盖的共享运行时变更才用 `build-full-release.sh`。
6. 无数据变更的 API/Engine/前端/config 候选复用最新 VERIFIED 备份和精确 rollback，不重复导出 Mongo/Postgres；只有 full 数据或迁移发布生成新整库备份。
7. 每个新候选必须携带 `yiwei.release-test-evidence.v1`，证据中的服务范围和 revision 必须与候选 manifest 完全一致；已有全绿候选在 apply 时只做 provenance、health 和 canary，不重复大套件。
8. 镜像 staging 只用 `deploy/stage-release.sh <candidate.env>`：新候选必须以 OCI Registry digest 按缺失层 pull，旧候选才兼容 zstd save/load；transport 必须绑定 Registry ref、Linux 实际 image ID、`linux/amd64`、`user=node` 与 revision label。
9. 新代码候选用可见的前台 staging 按 `candidate_ready_local -> staging -> deployable/failed` 推进；不使用会在 Codex 任务退出后丢失的 `nohup` 后台进程。
10. 切换只在生产宿主 `/home/ubuntu/app/librechat` 执行 `deploy/apply-release.sh <candidate.env>`，必须逐字使用 `stage-release.sh` 输出的完整 `next=ssh ...` 命令；禁止在本地工作区运行 apply。脚本会在任何文件修改前拒绝非生产路径，并核对 manifest、evidence、stage status、transport 与镜像 revision label，原子同步 `rules.v1.json` 和前端指针并生成 rollback；禁止同步整仓生产源码、直接改浮动 tag 或直接 `compose build/up`。
11. 一个候选 apply 失败后依赖自动回滚。只有在失败被证明为宿主发布脚本/权限问题、修复已有定向测试且无需重建时，才允许重试一次。第二次失败立即停止。
12. 不在 2 核生产机上重跑已有证据的全量测试。复用与候选 revision 对应的本地全量结果，生产只跑 release 定向门禁与 canary。
13. 任何测试文案都要用 trap 恢复，并比对恢复后 SHA。
14. full 门禁仅用于上述高风险变更，每个分片成功后写入 revision 绑定检查点；短暂 socket/进程故障只补失败项，禁止全流程归零。
15. 每次 DONE、DONE_WITH_CONCERNS、BLOCKED 或 rollback 后，运行 `library/skills/yiwei-skill-evolver/scripts/record-outcome.py` 记录脱敏结构化结果和确定性 gate；`--mode` 必须等于实际通道（包括 `ssh-source`），禁止为了迁就旧枚举伪记成 `engine-hotfix`，也禁止在发布热路径运行模型优化。
16. `client-static` 必须把新前端 revision 绑定在 evidence/manifest/静态包 SHA 上；API/Engine 镜像是 `reused-active` 时仍校验 digest、`linux/amd64` 与 `user=node`，但禁止用新前端 revision 校验旧镜像 label。
17. staging 前必须确认生产 `.release.env` 为 `0600` 且固定发布用户可读；root apply 写回后 owner 必须恢复为应用目录 owner。只用 `sudo` 临时读过去不算闭环。
18. 新发布故障必须完成“脚本修复＋确定性回归＋手册/skill 回写”三件套后才能标记 DONE；现场命令绕过、重复手工 `chown` 或修改候选 manifest 都不算永久修复。
19. 权限预检必须在传输前验证 SSH 用户等于应用目录 owner、`.release.env=owner:0600`、`.releases=owner:0700`、`sudo -n docker info` 可用。候选文件必须安装为应用 owner 的 `0600`；root 管理的静态目录只能经 `/tmp → sudo install → 原子切换` 写入。禁止直接 SCP 到应用目录，也禁止递归 `chown /app`（会误碰 `data/runtime-config/banks-live` 只读挂载）。
20. package/lockfile、Dockerfile、compose 关键结构、迁移、身份隔离均未变化时，普通 API/Engine/前端组合默认走 `deploy/ssh-source-release.sh`：复用活动依赖镜像，只上传相对镜像 revision 的变化源码与前端静态包，落到 `.release-src/<sha>` 并原子切换；禁止因此创建“两个增量镜像”。
21. SSH 返回多行 revision/digest 时使用 `mapfile`/逐行数组并断言数量；禁止把去掉结尾换行的管道交给单次 `read`，避免已经读到值却因 EOF 状态 1 静默退出。
22. macOS 打源码/静态 tar 包必须在支持时使用 `--no-xattrs`，并保留 `COPYFILE_DISABLE=1`；生产日志不得被 `LIBARCHIVE.xattr.com.apple.provenance` 淹没。
23. 连续 `ssh-source` 的变化服务必须相对生产 `.source-release.env` 的活动 source revision 计算；镜像 revision 只作为累计覆盖包 base。纯前端 delta 的 API/Engine 变化数必须为 0，不得因历史覆盖文件再次 recreate 两个容器。
24. `--no-xattrs` 支持性必须通过真实空归档命令探测，禁止 `tar --help | grep -q` 在 `pipefail` 下静默误判；源码包上传前必须扫描最终解压 tar 流并拒绝任何 `LIBARCHIVE.xattr.com.apple.provenance`。
25. `packages/api/src` 的普通 TypeScript 改动由 `ssh-source` 打包已通过验证的 `packages/api/dist` 并只读挂载到 `/app/packages/api/dist`；产物缺失必须拒绝发布，不回退到镜像构建。
26. 代码与 `product-skills`、bank 同时变化时，发布计划必须完整执行 source release、product-skill 热更和 bank 热更中实际需要的部分；禁止只上线代码或只上线部分资产。热更复用最新 VERIFIED 并只保留精确资产 rollback，不新建整库备份；Product Skill rollback 必须归应用发布用户所有且权限为 `0600`。
27. `packages/data-provider/src` 的普通业务改动，在依赖、迁移、身份与隔离边界未变时，由 `ssh-source` 打包已验证的 `packages/data-provider/dist` 并只读挂载到 API，同时发布同 revision 的 Client 静态产物；dist 缺失必须 fail-closed，不得自动改走 full。
28. 删除前端源码、普通 API JS 或 Engine JS 时不得仅因 deletion 自动升级镜像发布：Client 以同 revision 静态产物覆盖；API／Engine 由 `ssh-source` 生成只读、加载即失败的 tombstone 隐藏稳定镜像旧文件，并把删除计入变化服务与精确 rollback。删除依赖、镜像、compose、迁移、身份隔离或不支持的共享运行时仍 fail-closed。
29. bank 热更必须同时覆盖 `ADVISOR_BANKS_DIR=/app/banks-live` 和 `FUTURE_ENGINE_BANK_ROOT=/app/runtime-config`；`deploy-banks.sh` 要为 runtime-config 生成应用发布用户 `0600` 的精确 rollback，以 `/tmp → sudo install → 原子替换` 更新，并比较本地、宿主和容器 SHA。只同步 banks-live 不得标记完成。
30. bank runtime-config 资产包与 SSH source/client 包遵守同一 macOS provenance 门：`COPYFILE_DISABLE=1`、真实空归档探测 `--no-xattrs`、上传前扫描最终 tar；出现 `LIBARCHIVE.xattr.com.apple.provenance` 不得标记完成。

只改发布/备份/skill 管道时使用 `projects/未来线/librechat/deploy/verify-local.sh --release`；业务代码开发用 `--quick`，最终完整交付用 `--full`。

## 执行顺序

1. **恢复上下文**：确认分支、已推送 revision、改动服务、活动 release、最新候选、备份与 rollback。
2. **候选优先**：比较候选双 digest、配置 SHA、transport 与运行版本。候选已全绿且尚未 stage，进入第 4 步；已经 stage，直接进入第 5 步。
3. **自动分流并必要时构建**：分类器输出 `none`、`config-only`、`client-static`、`api-hotfix`、`engine-hotfix`、`ssh-source` 或 `full`。
4. **可恢复 staging**：前台调用 `stage-release.sh`，Registry 只 pull 缺失层，生成 `deployable` 后才切换。
5. **切换**：逐字执行 staging 输出的完整远程命令，例如 `ssh tencentcloud2 "cd /home/ubuntu/app/librechat && sudo bash deploy/apply-release.sh .releases/<release>.env"`。不得在本地调用 apply；脚本必须只 recreate digest 变化的服务，双 health 失败自动回滚。
6. **生产验收**：按 `references/definition-of-done.md` 的 fail-closed 原则检查：
   - `.release.env` 与容器 digest 一致，权限为 `0600` 且固定发布用户可读；
   - `user=node`、`restart=0`、`no-new-privileges:true`；
   - API `/health` 200；engine `/health` 200、工具列表与当前注册表逐项一致、dependencies 正常；
   - 公网 `/`、`/home`、`/login`、`/faq`、`/health` 全部 200；
   - 最近日志无新 `error|exception|fatal|EACCES`（明确的非致命 RAG 告警单列）。
7. **运行时控制面 canary**：仅当改动 runtime-copy/prompt 管道时执行。
   - JSON：同一 engine 进程内修改后无重启读到，再恢复 SHA。
   - MCP/schema：改一个 describe 标记，重启 engine，live `tools/list` 看到；恢复并再启后消失。
   - prompt：改 prompt 标记，重启 API，last-good 出现；恢复并再启后 SHA 一致。
   - `rules.v1.json`：先同步正式文件并做独立备份；同一 Engine PID 内验证请求级热读；用 trap 恢复原文件并确认 source/last-good 恢复 SHA 且无测试标记残留。
8. **收尾**：只在全绿后清理明确无引用的 staging/重复备份、更新 `state/当前状态.md`，再 commit + push。生产不做整仓源码同步；宿主控制脚本的一次性更新必须独立、最小且保护 `.env`、`runtime-config/`、`data/`、`banks-live/`、`uploads/`、`images/`、`data-node/`、`.releases/`。若本轮发现新的发布控制面缺口，同轮完成脚本、回归和 skill/手册回写。

## 发布产物保留

- 每次收尾先跑 `docker system df`、统计 `.release-src`、`.releases`、两个 backups 目录。
- 必须保留：活动双 digest、当前 release 的精确 rollback 双 digest、对应 env/manifest、最新非空 `VERIFIED` 备份。
- 可清理：已停止的临时构建容器、不被任何容器/活动/rollback digest 引用的 dangling 镜像、已完成 release 的 staging、明确重复的同时点备份。
- `.releases/.build-cache` 是固定两份的构建加速缓存，不应随 release 数量增长，也绝不能进备份。
- 备份按 `KEEP_DAYS` 轮转；不得为了腾空间删除唯一有效恢复点。
- 删除前用内容 digest 而不是 tag 判定引用关系。目标不清楚就只报告，不删。

## 时间预算

- 已 stage 候选：目标 1–3 分钟内切换和基础验收。
- 未 stage 候选：传输可恢复，但仍计入用户感受的“改完到上线”总时间；开始前必须给出估算，超过 10 分钟停止并报告。
- 纯文案／规则热更新：目标 1–3 分钟。
- Prompt／mode card 热更新：目标 1–3 分钟，不运行全量测试、不构建镜像。
- 纯前端静态包：目标 1–3 分钟，不构建、不传输、不重启 API 镜像。
- Engine 代码热修：目标 5–8 分钟。
- LibreChat API 热修：目标 5–10 分钟。
- 前端＋Engine 完整版本：目标 10–20 分钟。
- 镜像预算：LibreChat 不得超过 2.1GB，future-engine 不得超过 1.0GB；超过直接拒绝候选。
- 超过 60 秒没有新的可见进展，立即报告当前阶段、耗时和阻断；任何模型优化不得阻塞发布。
- 不把上游模型 503/CPU 过载当成发布失败；发布只验证目标代码和服务健康，上游容量单独报告。

## 交付报告

用 `DONE`、`DONE_WITH_CONCERNS` 或 `BLOCKED` 开头，只报告：release ID、双 digest、apply/build 秒数、备份、rollback、健康/公网/日志/canary 证据，以及任何跳过项。
