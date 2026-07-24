# 未来线不可变发布

生产 API 不再用 21 个宿主代码/config/dist bind mount 拼装版本。LibreChat 与 future-engine 先各自构建为内容寻址镜像，运行中的两个服务只在一次 `docker compose up` 中切换；Mongo、Umami、Caddy 不随业务发布重建。

## 发布

1. 同步并核对源码，先运行完整门禁。
2. 运行一次 `sudo bash deploy/backup.sh`，确认恢复包含 `VERIFIED`。
3. 构建候选镜像。构建不会触碰运行中的容器：

   ```bash
   LIBRECHAT_REVISION=<LibreChat commit> \
   ENGINE_REVISION=<yiwei commit> \
   bash deploy/build-release.sh B5-20260719
   ```

4. 用候选 env 做一次切换：

   ```bash
   bash deploy/apply-release.sh .releases/B5-20260719.env
   ```

`apply-release.sh` 会先保存当前两个容器的 image ID，校验 compose，只重建候选中 image ID 真正变化的服务，并等待两个深健康端点。future-engine 变化时才迁移 data 到非 root uid。健康失败会自动切回发生变化服务的旧 image ID；成功后才更新 `.release.env`。完整候选中两个镜像都变化时，行为仍是双服务同批切换。

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

这条路径只省掉未变化服务的构建、镜像检查和容器重建；不会跳过目标服务测试、不可变镜像、双健康、rollback manifest 或失败自动回滚。若同时改了两个服务，必须使用 `build-release.sh` 完整发布。

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
