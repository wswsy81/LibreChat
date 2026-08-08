# 未来线发布完成定义

任何“已上线”都必须有命令、响应、哈希、日志或浏览器证据。

## 发布前

- 确认用户已授权生产变更。
- 保留无关 dirty worktree，不 reset、不覆盖。
- 确认目标主机、远程目录、最新非空 VERIFIED 备份与精确 rollback env；只有数据/迁移变更必须生成新整库备份。
- 迁移或数据结构变更要记录发布前计数与内容哈希。

## 本地与候选门禁

- 复用与候选 revision 完全对应的已有证据；普通发布只要求与改动服务匹配的定向 scope，不要求 full。
- `full` 仅允许用于依赖/基础镜像、迁移、身份隔离、共享包或跨服务变更；分片必须写 revision 绑定检查点，失败后只补未通过项。
- 新候选 manifest 必须记录 `yiwei.release-test-evidence.v1` 的 SHA、scope 与相同 revision；任一不一致都拒绝构建或 apply。
- 跨 daemon 镜像必须先经 `stage-release.sh`：新候选以 Registry digest pull 缺失层，transport 绑定候选 env/manifest SHA、Registry ref、Linux 实际 image ID 与相同 revision label；旧候选 save/load 只作兼容。
- 新代码候选必须有 `yiwei.release-stage-status.v1` 且 `state=deployable`；`candidate_ready_local`、`staging` 或 `failed` 均禁止 apply。
- 纯前端候选必须绑定不可变静态包 SHA，stage 后目录必须存在非空 `index.html`；切换只改原子指针，不重建 API 容器。
- 构建 revision 必须真实存在、等于活动源码 HEAD、已推送且 tracked worktree 干净。
- 修改发布脚本后至少运行 `bash deploy/release.test.sh`。
- 发布脚本、测试夹具、文档和评测记录变更不得触发产品镜像候选。
- 镜像必须是内容寻址 digest，manifest 记录 release ID、revision、digest、构建时间与服务范围。
- 镜像体积门禁：LibreChat `<= 2.1GB`，future-engine `<= 1.0GB`；超过即拒绝生成候选。
- 生产 apply 不依赖整仓源码同步；provenance 由构建前已推送 revision、测试证据、transport 和镜像 revision label 共同验证。
- 任一门禁失败就停止，不称为“基本通过”。

## 切换后

- `.release.env` 与两个运行容器 digest 完全一致。
- 变化的服务被 recreate，未变化的服务不应无故重建。
- 纯前端发布必须 `changed_services` 为空，并记录前后静态 SHA；失败必须恢复旧指针，首次切换也必须有可再次 apply 的移除型 rollback。
- API 和 engine 内部 health 为 200；engine 工具表、policy 和 dependencies 全绿。
- 业务容器 `user=node`、`restart=0`、`no-new-privileges:true`。
- 公网 `/`、`/home`、`/login`、`/faq`、`/health` 均为 200。
- 检查切换后日志，新的 `error`、`exception`、`fatal`、`EACCES` 必须解释或修复。
- 对改动的真实用户路径做一次新会话验证；若需登录或会消耗真实邀请码，明确列为待主理人验收，不伪造通过。

## 数据与运行时文案

- 数据迁移要比对发布前后计数、哈希、登录、归档读取和旧报告。
- runtime-config 必须被 node 容器读取；last-good 目录必须被对应 node 容器写入。
- 热更 canary 不能留下测试文案；恢复后比对源文件和 last-good SHA。
- `rules.v1.json` 必须由 `apply-release.sh` 按 manifest SHA 原子同步，生成独立配置 rollback；任一 apply/health 失败同时恢复旧规则。

## 报告

交付报告必须包含：

1. 改动文件与原因。
2. 要求、结果、命令/证据。
3. 备份、rollback、build/apply 时间、digest、health、公网、日志与 canary。
4. 数据完整性证据。
5. 未做、降级、绕过或待真人验收项。
6. spec 未覆盖项、超出 spec 项和跳过的验证。
