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

`apply-release.sh` 会先保存当前两个容器的 image ID，再迁移 future-engine data 到非 root uid，校验 compose，单次重建 future-engine/API，并等待两个深健康端点。健康失败会自动切回旧 image ID；成功后才更新 `.release.env`。

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
