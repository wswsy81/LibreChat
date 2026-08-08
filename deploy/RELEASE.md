# 未来线不可变发布

生产 API 不再用 21 个宿主代码/config/dist bind mount 拼装版本。LibreChat 与 future-engine 先各自构建为内容寻址镜像，运行中的两个服务只在一次 `docker compose up` 中切换；Mongo、Umami、Caddy 不随业务发布重建。

## 发布

1. 先查找 revision、digest 与测试证据都匹配的既有候选；存在时禁止重建。
2. 没有候选时运行 `plan-release.sh <brain-base> <librechat-base>`，自动选择 `config-only`、`client-static`、`api-hotfix`、`engine-hotfix` 或 `full`。发布脚本、测试夹具和文档输出 `none`，不生成产品候选。
3. 在构建机核对源码。构建脚本会拒绝不存在、不等于活动 HEAD、未推送或带 tracked dirty 的 revision；生产机不再同步整仓源码，apply 改为核对候选证据和镜像内 revision label。
4. 按通道运行测试；测试成功后生成 `yiwei.release-test-evidence.v1`，候选 manifest 必须绑定相同 revision 和 evidence SHA。
5. 按风险运行备份：完整版本生成 VERIFIED；代码 hotfix 复用有效 VERIFIED；配置候选生成配置级 rollback。
6. 构建候选。构建不会触碰运行中的容器：

   ```bash
   bash deploy/build-full-release.sh B5-20260719
   ```

7. 候选生成后在当前可见进程 stage 到生产，不使用可能随任务退出的 `nohup`。新候选 push 到 OCI Registry 并记录不可变 digest，生产只 pull 缺失层。无数据变更的日常候选复用最新 VERIFIED 备份，不重复导出 Mongo/Postgres：

   ```bash
   bash deploy/stage-release.sh .releases/B5-20260719.env
   ```

8. 用候选 env 做一次秒级切换：

   ```bash
   bash deploy/apply-release.sh .releases/B5-20260719.env
   ```

`apply-release.sh` 会先验证 v2 manifest、测试证据、`deployable` 状态、transport 证明与镜像内 revision label，保存当前两个容器的 image ID，原子同步 manifest 绑定的 `rules.v1.json` 和前端静态指针，然后只重建 image ID 真正变化的服务。健康失败会同时恢复旧 image ID、旧规则和旧前端；成功后才更新 `.release.env`。

## 前端静态通道

只改 `client/` 或 `packages/client/` 时，分类器输出 `client-static`，不构建、不传输、不重启 API 镜像：

```bash
bash deploy/build-client-release.sh CLIENT-20260808T120000Z
bash deploy/apply-release.sh .releases/CLIENT-20260808T120000Z.env
```

前端产物以 tar.zst SHA 为不可变目录，`apply` 只原子切换 `client-releases/current` 指针。API 每次返回 SPA `index.html` 时从当前指针读取，静态文件立即生效；健康失败自动恢复上一个指针。首次切换会生成可再次 apply 的“移除指针”rollback；该通道不改业务数据，因此不重复导出 Mongo/Postgres。

已有全绿候选在 apply 阶段只做 provenance、双 health 与 canary，不重跑本地大套件。`stage-release.sh` 可重复执行；已 `deployable` 的同一候选会直接返回，网络中断后再次运行会跳过 revision label 已匹配的镜像，不从头重传，也不重复做 VERIFIED 备份。

## 配置通道

规则配置不构建镜像：

```bash
bash deploy/build-config-release.sh CONFIG-20260804T120000Z
bash deploy/apply-release.sh .releases/CONFIG-20260804T120000Z.env
```

两张 image digest 保持不变，`apply-release.sh` 只做配置 SHA 校验、备份、原子替换、双 health 和回滚产物。目标 1–3 分钟。纯 bank 文案继续走 `future-engine-shim/scripts/deploy-banks.sh` 热轨。

## 小修快速发布

只改一个服务时，不再重复构建和重启另一个服务。先照常运行与改动风险匹配的测试，再构建单服务候选：

```bash
# 只改 LibreChat API/前端
bash deploy/build-hotfix-release.sh api API-HOTFIX-20260724T120000Z

# 只改 future-engine
bash deploy/build-hotfix-release.sh future-engine ENGINE-HOTFIX-20260724T120000Z
```

快速候选仍包含两个内容寻址 image ID：变化服务使用新镜像，未变化服务从当前 `.release.env` 复用。若在独立 staging 目录构建，可用 `ACTIVE_RELEASE_ENV=/home/ubuntu/app/librechat/.release.env` 明确指向生产当前版本。随后先 stage，再使用同一个应用脚本：

```bash
bash deploy/stage-release.sh .releases/ENGINE-HOTFIX-20260724T120000Z.env
bash deploy/apply-release.sh .releases/ENGINE-HOTFIX-20260724T120000Z.env
```

这条路径会先生成 revision 绑定的测试证据，再只构建变化服务；不会跳过目标服务测试、不可变镜像、双健康、rollback manifest 或失败自动回滚。若前端与 Engine 同时变化，使用 `build-full-release.sh`。

时间目标：Prompt/config 1–3 分钟；纯前端 2–5 分钟；API/Engine 单服务热修 5–10 分钟；已经 stage 的候选 apply 1–3 分钟。从改完到上线的总时间必须如实记录，不再把 build/stage 排除在“部署”之外。

## 日常 compose 与回滚

所有日常命令通过当前 release env：

```bash
bash deploy/compose.sh ps
bash deploy/compose.sh logs --since 10m api future-engine
```

手动回滚仍走同一条发布路径：

```bash
bash deploy/apply-release.sh .releases/B5-20260719.rollback.env
```

`.release.env`、`.releases/*.env` 权限固定为 0600，不提交 Git。manifest 只记录 release ID、两个 Git revision、构建时间、image ID 和本地 tag，不含密钥。

## 话术库热更新(2026-07-22 起)

bank 文案与代码发布解耦:生产 compose 把 `../future-engine-shim/banks-live` 只读挂进引擎(`ADVISOR_BANKS_DIR=/app/banks-live`),`bank-loader` 按 mtime 失效缓存、坏文件回落上一版。改文案=本地改 `banks/*.json` 过 lint+拍板 → `bash scripts/deploy-banks.sh`,秒级生效,不重建镜像不重启容器。镜像内 `banks/` 仍是兜底(热目录缺该文件时用)。

生产发布不再同步整仓源码。若仅为修复宿主发布控制脚本做一次显式同步，仍必须保护 `.env`、`runtime-config/`、`data/`、`banks-live/`、`uploads/`、`images/` 与 `.releases/`。
