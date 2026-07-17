# 宝塔(Baota)部署指南

本指南面向本仓库(pnpm workspace 单仓多包):`packages/backend`(NestJS)、`packages/web`(Vite + React)、`packages/shared`(共享类型/枚举)。在宝塔面板的 Linux 服务器上按下列步骤部署。

## 1. 安装 PostgreSQL 并启用 PostGIS

1. 宝塔「软件商店」安装 PostgreSQL(建议 14+)。
2. 创建数据库与专用用户:
   ```sql
   CREATE DATABASE nongchang;
   CREATE USER nongchang_app WITH PASSWORD '替换为强密码';
   GRANT ALL PRIVILEGES ON DATABASE nongchang TO nongchang_app;
   ```
3. 连接到 `nongchang` 库,启用 PostGIS 扩展:
   ```sql
   \c nongchang
   CREATE EXTENSION postgis;
   ```
   (若软件商店无 PostGIS,可通过系统包管理器安装 `postgresql-XX-postgis-3` 后再执行。)

## 2. Node 环境

1. 宝塔「Node 版本管理器」安装 Node 20+ 并设为默认。
2. 全局安装 pnpm:
   ```bash
   npm i -g pnpm
   ```

## 3. 拉取代码并构建后端

在项目根目录执行:

Before deploying a production-hardening branch, run the non-e2e gate from the repository root:

```bash
pnpm verify:local
```

For the full local release gate, including PostGIS e2e setup, follow [docs/ops/production-verification.md](../ops/production-verification.md).

```bash
pnpm install
pnpm build:shared
pnpm build:backend
psql "$DATABASE_URL" -f packages/backend/prisma/audit-data-consistency.sql
# prisma:deploy 只能在下述原子切换流程中、全部后端停止后执行
```
`audit-data-consistency.sql` 应返回 0 行。若返回跨商家/跨租户脏数据或重复微信 appId,先备份并清洗数据,再执行迁移。
可选:初始化演示数据:
```bash
pnpm --filter @nongchang/backend prisma:seed
```

After migrations finish and the service is restarted, run the deployment smoke checks from [docs/ops/production-verification.md](../ops/production-verification.md). Do not treat e2e as passing unless `pnpm test:e2e` exits `0` against a prepared PostGIS database.

### 3.1 原子数据库/后端切换(强制)

涉及 `FarmRecord` 自动发布迁移时,以下步骤是绑定流程,不得在旧/新后端同时提供写入的情况下滚动迁移:

1. **生产前演练:**将当前生产备份恢复到独立演练库。记录 `trace_events` 的行数和总关系大小,并记录 `prisma:deploy` 的耗时与锁等待/阻塞情况。只有运维确认结果适合计划维护窗口后才能继续。
   ```sql
   SELECT count(*) AS trace_events_rows FROM trace_events;
   SELECT pg_size_pretty(pg_total_relation_size('trace_events')) AS trace_events_total_size;
   ```
2. **停止写入:**启用维护模式或等效的写入静默,然后停止所有 PM2 后端实例。迁移前不得保留任何旧后端写进程。
3. **验证端口:**确认没有旧进程监听 `3001`;下列命令必须无输出。旧/新后端绝不能同时接受写入。
   ```bash
   ss -ltnp | grep ':3001 ' || true
   ```
4. **停写备份与迁移:**在写入仍停止时生成数据库备份并用 `pg_restore --list`(custom 格式)或等效恢复校验确认备份可读,然后执行 `pnpm --filter @nongchang/backend prisma:deploy`,只启动新构建。
5. **开放前验证:**运行 readiness 以及农事记录完成/公开溯源的聚焦 smoke;全部通过后才能移除维护模式。
6. **开放前失败:**保持写入停止,恢复切换前数据库备份和旧构建,验证旧版本 readiness 后再决定是否开放流量。
7. **开放后边界:**新构建一旦接受任何生产写入,不得回滚到功能前后端,也不得删除该关系。必要时重新进入维护模式并前向修复。历史 pending 记录没有完成时间戳,无法安全区分混合版本漏发布与有意不回填。

本次切换不运行广义历史修复器或自动回填。备份路径和凭据只保存在受限服务器配置中,不要写入仓库或操作记录。

## 4. PM2 管理器启动后端

宝塔「PM2 管理器」添加项目:

- 启动文件:`packages/backend/dist/src/main.js`
  > 注意:`nest build` 实际产出在 `dist/src/`,而非 `dist/main.js`。务必使用 `dist/src/main.js`。
- 运行目录(工作目录):`packages/backend`
- 监听端口:`3001`
- 在 `packages/backend/.env` 配置环境变量,至少包含:
  ```env
  DATABASE_URL=postgresql://nongchang_app:密码@127.0.0.1:5432/nongchang
  JWT_SECRET=强随机值
  JWT_REFRESH_SECRET=另一个强随机值
  PORT=3001
  ALLOW_MANUAL_PAY=false
  ```

## 5. 构建前端

```bash
pnpm --filter web build
```
产物在 `packages/web/dist`。在宝塔为站点设置网站根目录指向该目录。

## 6. Nginx 反向代理

后端已设置全局前缀 `api`,因此 `/api/` 直接转发到 3001 端口。在站点配置中加入:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
location / {
    try_files $uri $uri/ /index.html;
}
```

## 7. 安全提醒

- `JWT_SECRET` / `JWT_REFRESH_SECRET` 使用强随机值,例如:
  ```bash
  openssl rand -base64 48
  ```
- PostgreSQL 仅监听 `127.0.0.1`,不对公网开放。
- `.env` 不入库(已在 `.gitignore` 中通过 `.env*` 排除)。
- Keep `ALLOW_MANUAL_PAY=false` in production. The backend env validator rejects `ALLOW_MANUAL_PAY=true` when `NODE_ENV=production`.
- 定期备份数据库(宝塔「计划任务」可配置定时 `pg_dump`)。
