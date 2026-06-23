# 农昌(Nongchang)— 芍药溯源农事 SaaS 平台

多租户 SaaS 农产品溯源平台,覆盖农作物全生命周期:农户/商家 → 地块 → 批次种植 → 农事记录(Web/小程序/语音)→ 溯源码生成 → 消费者扫码溯源 → 防伪监控。

## 仓库结构(pnpm workspace monorepo)

```
packages/
├── backend/    NestJS 10 + Prisma 5 + PostgreSQL/PostGIS — SaaS Core API
├── shared/     共享 DTO / 枚举 / 类型(zod 校验,前后端单一真相源)
├── web/        React 19 + Vite 6 + Tailwind 4 — Web 管理后台
└── miniapp/    Taro 4 + React 18 — 多端小程序(微信农户端 + 消费者扫码)
```

## 技术栈

- 后端:NestJS 10、Prisma 5、PostgreSQL 16 + PostGIS、JWT(access + refresh)、bcryptjs、@nestjs/throttler 限流
- 支付/存储/AI:支付宝 SDK、阿里云 OSS、讯飞语音、Gemini
- 前端:React 19 + Vite + Tailwind(web)、Taro 4 + React 18(miniapp)
- 校验:zod(shared 包定义 schema,前后端共享)
- 测试:Vitest + supertest

## 环境要求

- Node.js >= 20
- pnpm(本仓库用 pnpm workspace,勿用 npm/yarn)
- 本地数据库:Docker(PostgreSQL + PostGIS)

## 本地开发

```bash
# 1. 安装依赖(仓库根目录)
pnpm install

# 2. 启动本地数据库(PostgreSQL + PostGIS + pgAdmin)
docker compose -f docker-compose.dev.yml up -d
#   连接串: postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public
#   pgAdmin: http://localhost:5050 (admin@admin.com / admin)

# 3. 配置后端环境变量
cp packages/backend/.env.example packages/backend/.env
#   按注释填写 DATABASE_URL / JWT_SECRET / JWT_REFRESH_SECRET / APP_ENCRYPTION_KEY 等

# 4. 迁移 + 种子数据
pnpm --filter @nongchang/backend prisma:migrate
pnpm --filter @nongchang/backend prisma:seed

# 5. 构建共享层(backend/web/miniapp 都依赖它)
pnpm build:shared

# 6. 启动各端
pnpm --filter @nongchang/backend start:dev    # 后端 http://localhost:3001
pnpm --filter web dev                         # Web 后台(Vite)
pnpm --filter @nongchang/miniapp dev:weapp    # 小程序(微信开发者工具打开 packages/miniapp/dist)
```

## 常用脚本(仓库根目录)

| 命令 | 说明 |
|------|------|
| `pnpm build` | 构建 shared + backend |
| `pnpm build:shared` | 仅构建共享层 |
| `pnpm build:backend` | 构建后端 |
| `pnpm build:miniapp` | 构建微信小程序 |
| `pnpm test` | 跑后端测试套件(Vitest) |

各包内还有 `test` / `lint` / `dev` 等脚本,见对应 `package.json`。

## 部署

生产部署在宝塔服务器(Nginx 反代 + PM2 + 面板 PostgreSQL),详见 [docs/deploy/baota.md](docs/deploy/baota.md)。

## 设计文档

各子系统的设计规格与实现计划见 [docs/superpowers/](docs/superpowers/)(specs / plans)。
