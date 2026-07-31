# yiweilife 备份与恢复

`deploy/backup.sh` 每次生成一个 `yiweilife-YYYYmmdd-HHMMSS/` 目录。只有完成权限、压缩包、SHA256、Mongo dry-run 和 Postgres restore-list 校验后，目录才会从隐藏的 `.partial` 原子改名，并带有 `VERIFIED`。

## 恢复包内容

| 文件                           | 用途                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `mongodb-LibreChat.archive.gz` | LibreChat 账号、会话、消息和 Life 协调数据                                                                        |
| `umami-postgres.dump`          | Umami Postgres custom-format 备份                                                                                 |
| `future-engine-data.tgz`       | 画像、报告、分享、inbox、后台记录和删除墓碑                                                                       |
| `future-engine-runtime.tgz`    | 引擎代码和构建入口，不重复包含 data                                                                               |
| `librechat-user-files.tgz`     | `uploads/` 和 `images/`                                                                                           |
| `librechat-runtime.tgz`        | `.env`、当前/历史 release manifest、compose、Docker 构建入口、LibreChat YAML、Caddy、deploy 脚本、可重建源码/dist，以及热改 `runtime-config` 与 prompt last-known-good |
| `images.txt`                   | 备份时六个容器的镜像 ID                                                                                           |
| `SHA256SUMS`                   | 恢复前完整性校验                                                                                                  |
| `mongorestore-dry-run.txt`     | 备份时 Mongo 可读验证                                                                                             |
| `postgres-restore-list.txt`    | 备份时 Postgres 可读验证                                                                                          |

## 恢复前闸门

1. 只选择同时存在 `VERIFIED` 和 `SHA256SUMS` 的目录。
2. 以 root 进入备份目录，先执行 `sha256sum -c SHA256SUMS`。
3. 在隔离容器或新机上重跑 Mongo `mongorestore --dryRun` 与 `pg_restore --list`。
4. 核对 `manifest.txt`、`images.txt`、Git SHA 和目标时间。
5. 在正式写回任何数据前，停止六个 yiweilife 容器，再对当前状态做一份独立保全包。恢复是破坏性操作，不允许由 cron 或无人值守脚本自动触发。

## 恢复顺序

1. 恢复 `librechat-runtime.tgz` 和 `future-engine-runtime.tgz`，只读检查 `.env` 必需键存在，不整份 `source`；同主机回滚直接使用 `.releases/*.env`，整机丢失时按 manifest 的 revision 重建镜像。
2. 恢复 Mongo 与 Umami Postgres。
3. 恢复 `future-engine-data.tgz` 和 `librechat-user-files.tgz`。
4. 按 `images.txt` 与 Git SHA 恢复运行版本，重建/启动容器。Caddy 证书可重签，但必须保留同一域名配置并观察 CA 限频。
5. 验证六容器 health、19 个引擎工具、登录、存档、报告 owner 隔离和公开分享。核对 Mongo 集合计数、画像/报告索引与文件数。

## 异机副本

只允许加密后外送。在备份机生成 GPG 密钥，仅把公钥导入生产机，然后同时配置：

```bash
OFFSITE_GPG_RECIPIENT='<fingerprint>'
OFFSITE_RSYNC_TARGET='backup-user@independent-host:/srv/yiweilife'
```

脚本会生成 `yiweilife-*.tar.gpg` 和对应 SHA256，rsync 成功后在本机包中写入 `OFFSITE_VERIFIED`。不得把未加密备份拉到 FileVault 关闭的 Mac，也不得把 yiweilife 备份放到 Evo 或 Project2 运行服务器。未配置独立目标时，脚本会明确警告，但仍保留已验证本机恢复包。
