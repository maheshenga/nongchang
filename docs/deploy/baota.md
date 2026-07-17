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

## Binding Production Cutover and Rollback Boundary

The production cutover and rollback boundary is identical across the approved design and deployment runbooks:

1. Before production, restore a current backup into a rehearsal database; record the `trace_events` row count and total relation size, migration duration, and observed lock behavior. Do not proceed without an operator-approved maintenance-window result.
2. At cutover, enable maintenance mode and write quiescence, stop every PM2 backend instance before `prisma:deploy`, and verify no old backend process listens on port `3001`; old and new versions must never serve writes concurrently.
3. While writes remain stopped, take and verify the pre-cutover database backup, deploy the migration, and start only the new build.
4. Pre-open smoke writes are allowed only as uniquely tagged, release-owned disposable fixtures; record the release ID and every created ID. Keep maintenance mode and write quiescence active while readiness and focused smoke checks run.
5. If any pre-open check fails, keep writes stopped and restore the pre-cutover backup; that restore removes the disposable smoke writes, and rollback to the old build is allowed only together with that backup restore.
6. If checks pass, remove every disposable smoke fixture in FK-safe order and verify zero residue before reopening user traffic.
7. The irreversible boundary is the first non-disposable user write accepted after maintenance mode is removed, not the controlled smoke write.
8. After that boundary, old-build/database rollback is forbidden; re-enter maintenance mode if necessary and forward-fix. Historical pending records have no completion timestamp that can safely distinguish missed mixed-version publication from intentional historical non-backfill.

No broad historical reconciler or automatic backfill is part of this cutover.

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
  WEB_BASE_URL=https://farm.example.com
  TRACE_PDF_FONT_PATH=/www/server/fonts/NotoSansSC-Regular.ttf
  ```

### 4.1 溯源标签 PDF 字体与上线 smoke

标签 PDF 由 backend 直接生成，中文字体必须是允许服务端嵌入的独立 `.ttf` 或 `.otf` 文件。不要配置系统字体集合 `.ttc`，也不要把字体二进制提交到仓库。

1. 在宝塔服务器准备字体目录并安装/上传 Noto Sans SC Regular：

   ```bash
   mkdir -p /www/server/fonts
   chmod 755 /www/server/fonts
   test -r /www/server/fonts/NotoSansSC-Regular.ttf
   file /www/server/fonts/NotoSansSC-Regular.ttf
   fc-scan /www/server/fonts/NotoSansSC-Regular.ttf | head -n 20
   sha256sum /www/server/fonts/NotoSansSC-Regular.ttf
   ```

   `file`/`fc-scan` 必须识别为单字体 TrueType/OpenType；若显示 TrueType Collection 或路径以 `.ttc` 结尾，停止部署并更换字体。确认字体许可证允许 PDF 嵌入。

2. 在 `packages/backend/.env` 配置真实公网 HTTPS 站点和字体绝对路径，随后通过宝塔 PM2 重启并保存进程列表。二维码地址只取 `WEB_BASE_URL`，不会从 `Host`、`Origin` 或代理请求头推导。

3. backend 发布后、Web 发布前，用具备 `trace:view` 权限的测试账号取得短期 access token，并对独立测试批次执行 smoke：

   ```bash
   TOKEN='替换为短期测试 token'
   BATCH_ID='替换为独立测试批次 UUID'
   curl -fsS -D /tmp/trace-labels.headers \
     -H "Authorization: Bearer ${TOKEN}" \
     -H 'Content-Type: application/json' \
     --data '{"paperSize":"A4"}' \
     "https://farm.example.com/api/trace/codes/${BATCH_ID}/labels.pdf" \
     -o /tmp/trace-labels-smoke.pdf
   head -c 5 /tmp/trace-labels-smoke.pdf
   file /tmp/trace-labels-smoke.pdf
   pdfinfo /tmp/trace-labels-smoke.pdf
   grep -Ei 'content-type|content-disposition|cache-control' /tmp/trace-labels.headers
   ```

   必须看到 `%PDF-`、正确页数、`application/pdf`、RFC 5987 文件名以及 `Cache-Control: private, no-store`。打开 PDF 检查中文无方框/乱码，并从不同页抽查至少 3 个二维码，确认都打开对应 code 的公开溯源页。

4. 只有 backend smoke 通过后才发布 Web。此功能没有数据库迁移；回滚时先回滚 Web，再回滚 backend。已经下载到用户本地的 PDF 不存储在服务器，不受回滚影响。

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
