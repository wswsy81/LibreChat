# 未来线发布完成定义

任何“已上线”都必须有命令、响应、哈希、日志或浏览器证据。

## 发布前

- 确认用户已授权生产变更。
- 保留无关 dirty worktree，不 reset、不覆盖。
- 确认目标主机、远程目录、非空备份与精确 rollback env。
- 迁移或数据结构变更要记录发布前计数与内容哈希。

## 本地与候选门禁

- 复用与候选 revision 完全对应的已有全量测试证据。
- 修改发布脚本后至少运行 `bash deploy/release.test.sh`。
- 镜像必须是内容寻址 digest，manifest 记录 release ID、revision、digest、构建时间与服务范围。
- 任一门禁失败就停止，不称为“基本通过”。

## 切换后

- `.release.env` 与两个运行容器 digest 完全一致。
- 变化的服务被 recreate，未变化的服务不应无故重建。
- API 和 engine 内部 health 为 200；engine 工具表、policy 和 dependencies 全绿。
- 业务容器 `user=node`、`restart=0`、`no-new-privileges:true`。
- 公网 `/`、`/home`、`/login`、`/faq`、`/health` 均为 200。
- 检查切换后日志，新的 `error`、`exception`、`fatal`、`EACCES` 必须解释或修复。
- 对改动的真实用户路径做一次新会话验证；若需登录或会消耗真实邀请码，明确列为待主理人验收，不伪造通过。

## 数据与运行时文案

- 数据迁移要比对发布前后计数、哈希、登录、归档读取和旧报告。
- runtime-config 必须被 node 容器读取；last-good 目录必须被对应 node 容器写入。
- 热更 canary 不能留下测试文案；恢复后比对源文件和 last-good SHA。

## 报告

交付报告必须包含：

1. 改动文件与原因。
2. 要求、结果、命令/证据。
3. 备份、rollback、build/apply 时间、digest、health、公网、日志与 canary。
4. 数据完整性证据。
5. 未做、降级、绕过或待真人验收项。
6. spec 未覆盖项、超出 spec 项和跳过的验证。
