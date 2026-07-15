# 不可变生产发布与回滚手册

## 发布输入和停止条件

只发布受保护 tag 对应的干净 40 位 Git SHA，且 CI 的 `verify:production`、browser、accessibility、查询计划、备份恢复演练、生产依赖审计和 release tests 全绿。Linux x64 CI 只构建一次 shared、backend、Web、miniapp、Prisma client/CLI、生产依赖、迁移、发布/备份脚本和 ops 模板；服务器不重建。

以下任一情况立即停止：DNS 不只指向 `47.103.96.48`、证书不覆盖 `farm.qingyouai.com`、候选端口占用、可用内存低于 1 GiB、可用磁盘低于 10 GiB或容纳不下归档两份加新备份、数据栈不健康、离机备份未确认、租户一致性/迁移状态失败、候选 readiness/SHA/烟测失败。

## CI 构建

```bash
corepack pnpm@10.33.2 release:artifact -- --output-dir /absolute/outside/repository
```

该命令在非 Linux x64 或脏工作树上拒绝运行。归档和外部 manifest 必须一起发布；发布系统还应提供 tag/commit 的可验证来源，不能只信任聊天里提供的 SHA。

## 服务器发布顺序

完整首次安装命令见 [宝塔部署指南](../deploy/baota.md)。每次发布严格按以下顺序：

1. 上传 archive/manifest 到 `incoming`；先核对 manifest Git SHA、归档名和 archive SHA-256。
2. 在 `releases/<sha>` 解压，执行 `scripts/release/verify-artifact.mjs`，逐文件核对外部和内嵌 manifest。
3. 从 `deploy-state.json` 选择 inactive 端口（active 3001 则 candidate 3002，反之亦然），执行 `server-preflight.mjs`。
4. 对 direct PostGIS 创建 AES-256-GCM 加密备份，核对 checksum，并把完整三件套复制到离机不可变存储。
5. 用 `DIRECT_DATABASE_URL` 执行 `migration-preflight.mjs` 和 artifact-local `prisma migrate deploy`。
6. 从 `shared/production.env` 加载环境，用短期只读 token 通过环境变量 `NONGCHANG_SMOKE_ACCESS_TOKEN` 注入烟测身份；不要把 token 放入命令行。
7. 执行 `switch-release.mjs`。它负责候选 PM2 启动、候选 smoke、Nginx 验证/切换/公网 smoke、失败恢复、旧 API 停止、worker 切换、原子状态和三版本保留。
8. 核对公网 `/api/health/live` 的 `deployedGitSha`、稳定 readiness、PM2 进程、worker/队列指标和请求 ID 链路，再标记发布成功。

推荐在工单中记录：tag、完整 SHA、manifest SHA-256、备份 manifest/远端校验结果、迁移输出摘要、切换输出、烟测请求 ID、操作者和时间。禁止复制环境文件或 provider 响应正文。

## 自动失败边界

- 切流前失败：旧流量完全不变，失败候选被删除。
- `nginx -t`、reload 或公网 smoke 失败：恢复原 active include、`current/previous` 链接并 reload 旧配置；不写新 deploy state。
- 状态提交后的旧 API 停止或 worker 重启失败：不反切已验证的新 API，命令返回 degraded；立即修复进程并处理队列告警。
- 迁移永远 forward-only；任何脚本都不得执行 `migrate reset/down`、反向 SQL、DROP/TRUNCATE 或自动数据回滚。

## 应用回滚

回滚前先判断旧应用是否兼容已执行的向前 schema。无法证明兼容时停止回滚并发布 forward-fix。

`rollback.mjs` 会从 `deploy-state.json` 读取 `previousRelease`、`previousGitSha`、`previousPort`，只接受 `releases/<sha>` 下的 inactive previous，并复用与发布相同的锁、候选验证、原子切流和公网 smoke。回滚同样需要短期只读 token、已知公开溯源码，以及人工确认旧应用兼容当前 forward schema。

```bash
ROOT=/www/wwwroot/farm.qingyouai.com
PREVIOUS_SHA=$(jq -r .previousGitSha "$ROOT/deploy-state.json")
PREVIOUS_PORT=$(jq -r .previousPort "$ROOT/deploy-state.json")
PREVIOUS_RELEASE=$(jq -r .previousRelease "$ROOT/deploy-state.json")
test "$PREVIOUS_RELEASE" = "$ROOT/releases/$PREVIOUS_SHA"

set -a; . "$ROOT/shared/production.env"; set +a
export NONGCHANG_SMOKE_ACCESS_TOKEN='<short-lived-read-only-token>'
node "$ROOT/current/scripts/release/rollback.mjs" \
  --release-root "$ROOT" --confirm-forward-schema-compatible yes \
  --node-bin /absolute/path/to/node20 --pm2-bin /absolute/path/to/pm2 \
  --nginx-bin /www/server/nginx/sbin/nginx \
  --nginx-conf /www/server/nginx/conf/nginx.conf \
  --hostname farm.qingyouai.com --trace-code '<known-public-trace-code>'
unset NONGCHANG_SMOKE_ACCESS_TOKEN
```

回滚后重复公网/真实功能验收，并建立缺陷和 forward-fix。不得通过恢复旧数据库或逆向迁移来“匹配”旧应用。

## 首次上线后演练

在非高峰期至少完成一次应用回滚再前滚演练、一次公网 smoke 失败模拟、一次 worker 重启失败处置和一次离机备份恢复演练。只有操作步骤、权限和告警都被真实验证后，发布流程才算可用。
