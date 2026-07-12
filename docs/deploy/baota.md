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
pnpm --filter @nongchang/backend prisma:deploy   # 生产用 deploy,切勿用 migrate dev
```
`audit-data-consistency.sql` 应返回 0 行。若返回跨商家/跨租户脏数据或重复微信 appId,先备份并清洗数据,再执行迁移。
可选:初始化演示数据:
```bash
pnpm --filter @nongchang/backend prisma:seed
```

After migrations finish and the service is restarted, run the deployment smoke checks from [docs/ops/production-verification.md](../ops/production-verification.md). Do not treat e2e as passing unless `pnpm test:e2e` exits `0` against a prepared PostGIS database.

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
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
location / {
    try_files $uri $uri/ /index.html;
}
```

在同一个 HTTPS `server` 块中加入以下响应头。Web 管理端与 `/api` 必须保持同源，
这样 `nc_refresh` HttpOnly Cookie 才只会发送到 `/api/auth/web`：

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(self)" always;
add_header X-Frame-Options "DENY" always;
add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data: https:; connect-src 'self' https:; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; form-action 'self' https://*.alipay.com https://*.alipaydev.com" always;
```

不要给 `script-src` 添加 `'unsafe-inline'`。当前页面中的 `application/ld+json`
是结构化数据而非可执行脚本。发布后应在浏览器控制台确认无 CSP 违规，并完成登录、
静默刷新、主要管理页面加载和支付宝跳转的冒烟验证。

## 7. 安全提醒

- `JWT_SECRET` / `JWT_REFRESH_SECRET` 使用强随机值,例如:
  ```bash
  openssl rand -base64 48
  ```
- PostgreSQL 仅监听 `127.0.0.1`,不对公网开放。
- `.env` 不入库(已在 `.gitignore` 中通过 `.env*` 排除)。
- Keep `ALLOW_MANUAL_PAY=false` in production. The backend env validator rejects `ALLOW_MANUAL_PAY=true` when `NODE_ENV=production`.
- 定期备份数据库(宝塔「计划任务」可配置定时 `pg_dump`)。
