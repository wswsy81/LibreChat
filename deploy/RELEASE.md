# 未来线不可变发布

生产 API 不再用 21 个宿主代码/config/dist bind mount 拼装版本。LibreChat 与 future-engine 先各自构建为内容寻址镜像，运行中的两个服务只在一次 `docker compose up` 中切换；Mongo、Umami、Caddy 不随业务发布重建。

## 发布

1. 先查找 revision、digest 与测试证据都匹配的既有候选；存在时禁止重建。
2. 没有候选时运行 `plan-release.sh <brain-base> <librechat-base>`，自动选择 `config-only`、`engine-hotfix` 或 `full`。
3. 同步并核对源码。构建脚本会拒绝不存在、不等于活动 HEAD、未推送或带 tracked dirty 的 revision。
4. 按通道运行测试；测试成功后生成 `yiwei.release-test-evidence.v1`，候选 manifest 必须绑定相同 revision 和 evidence SHA。
5. 按风险运行备份：完整版本生成 VERIFIED；代码 hotfix 复用有效 VERIFIED；配置候选生成配置级 rollback。
6. 构建候选。构建不会触碰运行中的容器：

   ```bash
   bash deploy/build-full-release.sh B5-20260719
   ```

7. 用候选 env 做一次切换：

   ```bash
   bash deploy/apply-release.sh .releases/B5-20260719.env
   ```

`apply-release.sh` 会先验证 v2 manifest 的测试证据与 revision，保存当前两个容器的 image ID，原子同步 manifest 绑定的 `rules.v1.json` 并生成可再次 apply 的配置 rollback，然后只重建 image ID 真正变化的服务并等待两个深健康端点。健康失败会同时恢复旧 image ID 与旧规则配置；成功后才更新 `.release.env`。

已有全绿候选在 apply 阶段只做 provenance、双 health 与 canary，不重跑本地大套件。

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

快速候选仍包含两个内容寻址 image ID：变化服务使用新镜像，未变化服务从当前 `.release.env` 复用。若在独立 staging 目录构建，可用 `ACTIVE_RELEASE_ENV=/home/ubuntu/app/librechat/.release.env` 明确指向生产当前版本。随后仍使用同一个应用脚本：

```bash
bash deploy/apply-release.sh .releases/ENGINE-HOTFIX-20260724T120000Z.env
```

这条路径会先生成 revision 绑定的测试证据，再只构建变化服务；不会跳过目标服务测试、不可变镜像、双健康、rollback manifest 或失败自动回滚。若前端与 Engine 同时变化，使用 `build-full-release.sh`。

时间目标：Engine 代码热修 5–8 分钟；前端＋Engine 完整版本 10–20 分钟；已有候选切换 1–3 分钟，正常 apply 通常只有几秒。

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

⚠️ 同步源码时 rsync `future-engine-shim/` 必须加 `--exclude 'banks-live/'`(与 `data/` 同级纪律),否则 --delete 会清掉服务器热更新目录。
