# 农场系统宝塔生产部署指南

本指南只适用于 `farm.qingyouai.com` 在现有宝塔服务器 `47.103.96.48` 上的首次上线。目标是新增一套隔离的 Nongchang 运行时，不复用、不重启也不修改服务器上已有的网站、PM2 应用、PostgreSQL、Redis 或 Docker 容器。

生产拓扑固定为：宝塔 Nginx 对外开放 80/443；API blue/green 分别监听 `127.0.0.1:3001/3002`；唯一 worker 监听 `127.0.0.1:3003`；专用 PostGIS、Redis、PgBouncer 分别绑定 `127.0.0.1:5544/56380/56432`。服务器只运行 CI 产出的 Linux x64 不可变归档，不拉源码、不安装依赖、不现场构建。

## 1. 上线前安全处理

1. 立即轮换曾经通过聊天或工单传递过的 root 密码。不要把新密码写入仓库、Shell 历史或部署日志。
2. 新建专用部署用户，安装 SSH 公钥并验证宝塔控制台的紧急入口；确认可恢复后，关闭 root 密码登录和普通用户密码登录。
3. 在阿里云安全组限制 SSH 和宝塔面板只允许管理员固定 IP。公网应用只开放 80/443；3001、3002、3003、5544、56380、56432 不得加入安全组。
4. 使用宝塔计划任务或系统配置创建 2 GiB swap，作为 OOM 保险而非日常容量。确认 `swapon --show`、`free -h` 和 `df -h /` 正常。
5. 记录服务器上现有 `pm2 ls`、`docker ps`、Nginx 站点和监听端口清单。后续命令只能操作 `nongchang-*` 进程/容器和本站目录。
6. 将归档内 `ops/logrotate/nongchang` 安装到 `/etc/logrotate.d/nongchang` 并运行 `logrotate --debug /etc/logrotate.d/nongchang`；该规则只处理本站 `shared/logs`，不改变已有 PM2 应用日志策略。

## 2. DNS 与 TLS

先在 DNS 控制台添加唯一 A 记录：

```text
farm.qingyouai.com -> 47.103.96.48
```

从至少两个公共解析器确认结果只有该 IP；本地代理返回的 `198.18.x.x` fake-IP 不能作为公网生效证据：

```bash
dig +short A farm.qingyouai.com @1.1.1.1
dig +short A farm.qingyouai.com @8.8.8.8
```

解析生效后再通过宝塔为 `farm.qingyouai.com` 申请证书并启用自动续期。证书 SAN/CN 必须覆盖该域名；服务器上原有 `fcy.qingyouai.com` 证书不能复用。安装 `ops/nginx/farm.qingyouai.com.conf.template` 前，先把 `ops/nginx/active-api.conf.example` 复制为 `/www/wwwroot/farm.qingyouai.com/shared/active-api.conf`，然后要求：

```bash
/www/server/nginx/sbin/nginx -t -c /www/server/nginx/conf/nginx.conf
curl --fail --resolve farm.qingyouai.com:443:47.103.96.48 https://farm.qingyouai.com/
```

`curl --resolve` 只能证明目标服务器站点和证书；DNS 未传播时仍不得正式切流。

## 3. 目录、运行时与机密文件

```bash
install -d -m 0750 /www/wwwroot/farm.qingyouai.com/{incoming,releases,shared,backups}
install -d -m 0750 /www/wwwroot/farm.qingyouai.com/shared/offsite-staging
```

通过宝塔安装独立 Node.js 20，记录 `node` 和 `pm2` 的绝对路径。必须确认 `node --version` 为 20.x；不要把服务器全局 Node 24 改成本站运行时，也不要重启已有 PM2 应用。

从发布归档中的模板创建以下文件，权限均为 `600`：

- `shared/production.env`：参考 `ops/runtime/production.env.example`；
- `shared/data-stack.env`：参考 `ops/data-stack/data-stack.env.example`；
- `shared/pgbouncer-userlist.txt`：只包含应用用户及其强密码，格式为 `"nongchang_app" "<APP_DATABASE_PASSWORD>"`；
- `shared/metrics-bearer-token`：只包含与 `METRICS_BEARER_TOKEN` 相同的 token 值，供本机 Prometheus 读取；
- 备份加密密钥：保存在独立密钥系统，不能与备份文件放在同一位置。

至少分别生成 PostgreSQL owner、应用、迁移、备份、Redis、JWT access、JWT refresh、应用加密、指标和备份加密密钥。URL 中的用户名/密码必须进行 URL 编码。关键连接关系为：

```dotenv
DATABASE_URL=postgresql://nongchang_app:<encoded-app-password>@127.0.0.1:56432/nongchang?schema=public&pgbouncer=true&connection_limit=10&pool_timeout=10
DIRECT_DATABASE_URL=postgresql://nongchang_migrator:<encoded-migration-password>@127.0.0.1:5544/nongchang?schema=public
REDIS_URL=redis://default:<encoded-redis-password>@127.0.0.1:56380/0
```

生产必须保持 `NODE_ENV=production`、`HOST=127.0.0.1`、`RUNTIME_STATE_DRIVER=redis`、`ALLOW_MANUAL_PAY=false`、`TRUST_PROXY_HOPS=1`。`DEPLOYED_GIT_SHA` 由发布脚本注入，不在共享环境文件中固定。

## 4. 接收并验证不可变归档

CI/tag release 同时提供 `nongchang-<sha>.tar.gz` 和 `nongchang-<sha>.manifest.json`。将二者传到 `incoming`，完整 SHA 必须是 40 位小写十六进制：

```bash
ROOT=/www/wwwroot/farm.qingyouai.com
SHA=<40-character-git-sha>
ARCHIVE="$ROOT/incoming/nongchang-$SHA.tar.gz"
MANIFEST="$ROOT/incoming/nongchang-$SHA.manifest.json"
RELEASE="$ROOT/releases/$SHA"

test "$(jq -r .gitSha "$MANIFEST")" = "$SHA"
test "$(jq -r .archive)" = "$(basename "$ARCHIVE")"
echo "$(jq -r .archiveSha256 "$MANIFEST")  $ARCHIVE" | sha256sum --check --strict
tar -tzf "$ARCHIVE" | awk '/(^\/|(^|\/)\.\.($|\/))/{bad=1} END{exit bad}'
install -d -m 0750 "$RELEASE"
tar --extract --gzip --file "$ARCHIVE" --directory "$RELEASE" --no-same-owner --no-same-permissions
node "$RELEASE/scripts/release/verify-artifact.mjs" \
  --archive "$ARCHIVE" --manifest "$MANIFEST" --release-dir "$RELEASE" --expected-sha "$SHA"
```

任何文件集或哈希不一致都要删除该候选目录并停止；不得在服务器上重新构建或 `pnpm install` 修补归档。

## 5. 启动隔离数据栈

首次启动时，`ops/postgres/init-roles.sh` 会创建 PostGIS 扩展以及相互分离的 app、migration、backup 角色。该初始化脚本只在空数据卷第一次启动时执行；已有卷修改密码或权限必须走受审计的 SQL 变更，不能假设重启会重跑初始化。

```bash
set -a
. "$ROOT/shared/data-stack.env"
set +a
docker compose --env-file "$ROOT/shared/data-stack.env" \
  -f "$RELEASE/ops/data-stack/compose.production.yml" config --quiet
docker compose --env-file "$ROOT/shared/data-stack.env" \
  -f "$RELEASE/ops/data-stack/compose.production.yml" --profile monitoring up -d
docker ps --filter name=nongchang-
```

必须验证 PostGIS 可用、Redis 未认证请求失败且认证后成功、PgBouncer 健康：

```bash
docker exec nongchang-postgis pg_isready -U nongchang_owner -d nongchang
docker exec nongchang-postgis psql -U nongchang_owner -d nongchang -Atc "show shared_preload_libraries; select extname from pg_extension where extname in ('postgis','pg_stat_statements') order by 1"
redis-cli -h 127.0.0.1 -p 56380 ping                       # 必须返回 NOAUTH
redis-cli --no-auth-warning -h 127.0.0.1 -p 56380 -a "$REDIS_PASSWORD" ping
PGPASSWORD="$APP_DATABASE_PASSWORD" psql -h 127.0.0.1 -p 56432 -U nongchang_app -d nongchang -c 'select 1'
```

## 6. 备份、迁移与原子发布

从 `shared/production.env` 加载变量，但不要打印环境：

```bash
set -a
. "$ROOT/shared/production.env"
set +a
```

先运行服务器预检。首次使用 3001，后续必须选择 `deploy-state.json` 中 activePort 的另一端口：

```bash
node "$RELEASE/scripts/release/server-preflight.mjs" \
  --hostname farm.qingyouai.com --target-ip 47.103.96.48 \
  --candidate-port 3001 --artifact "$ARCHIVE" --release-root "$ROOT" \
  --backup-bytes 5368709120 --expected-sha "$SHA"
```

在任何迁移前创建加密备份，验证校验和并成功复制到 OSS 或另一台主机；只保留在本机不算完成：

```bash
DATABASE_URL="$DIRECT_DATABASE_URL" BACKUP_ENCRYPTION_KEY='<runtime-only-key>' \
  node "$RELEASE/scripts/backup-postgres.mjs" --output-dir "$ROOT/backups" --retention 3
(cd "$ROOT/backups" && sha256sum --check '<timestamp>.sha256')
# 执行已批准的加密离机复制，并在远端核对 SHA-256；成功前不要迁移。
```

迁移只直连 PostGIS，不经过 PgBouncer：

```bash
node "$RELEASE/scripts/release/migration-preflight.mjs"
DATABASE_URL="$DIRECT_DATABASE_URL" "$RELEASE/node_modules/.bin/prisma" \
  migrate deploy --schema "$RELEASE/prisma/schema.prisma"
```

切换脚本会启动 inactive API、校验 readiness 和 Git SHA、执行候选烟测、暂存 Nginx include/current 链接、`nginx -t`、reload 和公网烟测。公网烟测失败会自动恢复旧 include/current 并清理候选进程；成功后才写 `deploy-state.json`、停止旧 API、重启唯一 worker，并保护 current/previous/known-stable 三个版本：

```bash
export NONGCHANG_SMOKE_ACCESS_TOKEN='<short-lived-read-only-token>'
node "$RELEASE/scripts/release/switch-release.mjs" \
  --release-root "$ROOT" --candidate-port 3001 --candidate-sha "$SHA" \
  --node-bin /absolute/path/to/node20 --pm2-bin /absolute/path/to/pm2 \
  --nginx-bin /www/server/nginx/sbin/nginx \
  --nginx-conf /www/server/nginx/conf/nginx.conf \
  --hostname farm.qingyouai.com --trace-code '<known-public-trace-code>'
unset NONGCHANG_SMOKE_ACCESS_TOKEN
```

切换后检查 `pm2 ls`，只能有一个 blue/green API 在线和一个 `nongchang-worker` 在线；检查公网 live/ready 返回候选 SHA。若脚本报告“traffic is active but post-switch lifecycle failed”，API 已切换但 worker 或旧进程收尾失败，发布状态为 degraded，必须立即修复并确认队列积压恢复，不能把该次发布标记成功。

发布锁为 `$ROOT/deploy.lock`。正常退出会自动删除；若机器或进程异常退出导致锁残留，必须先确认没有发布/回滚进程、核对 `deploy-state.json`、PM2、Nginx include 和 `current/previous` 一致，再由两人复核后删除锁，不能直接用 `rm -f` 绕过并发保护。

## 7. 上线验收

系统管理员后台“上线就绪检查”的 10 项必须全部通过：

1. 法律协议已发布；
2. 微信小程序已启用；
3. 对象存储已启用；
4. 地图服务已启用；
5. AI 服务商已启用；
6. 支付宝支付已启用；
7. 初始业务额度已配置；
8. 公网 API 域名已配置；
9. 小程序客服联系方式已配置；
10. 销售开通联系方式已配置。

“配置存在”不等于真实可用。发布接受前必须使用生产租户和受控小额/测试资源完成：微信真机登录和静默刷新、OSS 拍照上传与读取、天地图地块定位、AI 文本和图片诊断、讯飞语音（若启用）、支付宝沙箱或批准的小额支付/回调、公开溯源码跨网络扫码、农事记录/批次/地块/账单只读路径、一个 worker 任务完成并让队列指标回落。记录请求 ID、时间、租户、结果和 provider 侧证据，但不得记录 token、Cookie、图片、语音、提示词或密钥。

外部监控至少覆盖 HTTPS live/ready、磁盘、PostGIS、Redis、队列积压、PM2 重启、备份年龄和证书到期；必须实际触发一次测试告警并确认值班人员收到。

发布、回滚和灾备的逐次操作见 [release-runbook.md](../ops/release-runbook.md) 与 [disaster-recovery.md](../ops/disaster-recovery.md)。
