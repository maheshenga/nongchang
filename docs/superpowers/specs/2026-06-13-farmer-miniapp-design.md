# 芍药溯源农事系统重构 — 子项目 3:农户小程序设计

> 范围:整体平台重构的第三个子项目(共 5 个)。在子项目 1(SaaS Core 后端)与子项目 2(溯源闭环)地基上,交付农户(merchant)在**微信小程序**里的"登录 → 看自己批次/地块 → 提交带图农事记录"闭环。

## 1. 背景与目标

子项目 1 已交付多租户后端,含受 JWT + ScopeService 隔离保护的:`POST /api/auth/login`(用户名/密码)、`GET /api/batches`、`GET /api/fields`、`GET /api/farm-records`(均自动按登录 merchant 的 `ownerId` 过滤,只看自己的)、`POST /api/farm-records`(`Role.MERCHANT` 可调,`source` 枚举已含 `miniapp`/`voice`)。子项目 2 交付了消费者扫码读闭环。

**本子项目目标**:农户在微信小程序里完成一条**带图农事记录**的端到端提交,这是小程序相对 Web 后台的独特价值(田间随手记 + 拍照)。

**关键现状**:`packages/miniapp` **尚不存在**,本子项目从零脚手架 Taro 应用(monorepo 第 4 个包)。后端绝大部分接口已就绪,**唯一新增**是图片上传端点 `POST /api/uploads`。

**不做**(留后续子项目):
- 微信登录(`code2session` + openid)——本期用用户名/密码,微信登录留后续(需真实 AppID/Secret)。
- 自动 token refresh、离线缓存。
- 溯源事件录入(农户补 `POST /api/trace/events`)——留子项目 5。
- 多端编译(支付宝/H5/抖音)——本期只 `build:weapp`,Taro 配置保留多端能力。
- 图片压缩/水印。

## 2. 架构与范围

两个改动面:

1. **新建 `packages/miniapp`** —— Taro + React + TypeScript 小程序,从零脚手架。monorepo 第 4 个包,与 web/backend/shared 并列,依赖 `@nongchang/shared`(复用 zod DTO + 类型 + 枚举)。本期只编译微信小程序(`build:weapp`),Taro 配置保留多端扩展能力。

2. **后端新增图片上传** —— 加 `POST /api/uploads`(受 JWT 保护,multipart 单文件),后端用阿里云 OSS SDK 转存文件到 OSS,返回可访问 URL。OSS 凭据走 `.env`(不进 git),单元测试 mock OSS client。**其余后端逻辑零改动**,避免破坏子项目 1/2 的隔离保证。

**复用的现有后端接口**(均已上线、受鉴权 + ScopeService 隔离):
- `POST /api/auth/login` — 用户名/密码登录,返回 `accessToken`/`refreshToken`。
- `GET /api/batches`、`GET /api/fields`、`GET /api/farm-records` — 自动按登录 merchant 的 `ownerId` 过滤。
- `POST /api/farm-records` — `Role.MERCHANT` 可调,`source` 枚举已含 `miniapp`。

**关键边界:**
- 小程序所有 API 调用走统一封装(类似 web 的 `api/` 层),带 JWT、统一错误处理(401 清 token 跳登录页)。
- 后端唯一新增是上传端点;农事/批次/地块逻辑不动。

## 3. 小程序页面结构与数据流

**页面(4 个,Taro 约定路由):**

1. **登录页 `pages/login`** — 用户名 + 密码输入,调 `POST /api/auth/login`,token 存本地缓存(`Taro.setStorageSync`),跳首页。已登录则跳过。
2. **首页/批次列表 `pages/index`** — 登录后落地页。调 `GET /api/batches` 列出该农户自己的批次(作物名/批次号/状态)。点某批次进详情。
3. **批次详情 `pages/batch`** — 显示批次信息 + 该批次已有农事记录列表。注意:现有 `GET /api/farm-records` **无 batchId 查询参数**,返回该 merchant 的全部记录;为保持"后端零改动",小程序拉全部后**在客户端按 batchId 过滤**(本期记录量小,无碍)。底部"记一笔"按钮进记录页。
4. **农事记录页 `pages/record`** — 表单:预设动作清单(浇水/施肥/打药/除草/移栽/采收/巡田)点选 → 可选文字备注 → `Taro.chooseImage` 选图 → 逐张 `Taro.uploadFile` 到 `POST /api/uploads` 拿 URL → 组装 `CreateFarmRecordDto`(`source: 'miniapp'`)提交 `POST /api/farm-records` → 成功返回批次详情。

**数据流(提交一条记录):**
```
选图 → Taro.uploadFile(/api/uploads, JWT) → 后端转存 OSS → 返回 url
     → 组装 { batchId, fieldId, action, detail:{note}, images:[url...],
             location?, recordedAt, source:'miniapp' }
     → POST /api/farm-records (JWT) → 201 → 回批次详情刷新列表
```

**关键依赖**:`fieldId` 从批次详情带入(批次已含其 `fieldId`);`recordedAt` 取提交时刻 ISO;`action` 存中文动作名;备注进 `detail.note`。

**鉴权流转**:封装 `request()` 统一注入 `Authorization: Bearer <token>`;遇 401 清 token 跳登录页(本期不做自动 refresh)。

## 4. Taro 工程结构与 API 封装层

**`packages/miniapp` 工程结构:**
```
packages/miniapp/
  config/            Taro 编译配置(index/dev/prod),仅 weapp targets 联调
  src/
    app.config.ts    页面路由注册 + 窗口配置
    app.ts           应用入口
    pages/login | index | batch | record   4 个页面
    api/
      request.ts     统一请求封装(注入 JWT、baseURL、401 处理)
      auth.ts        login()
      farm.ts        listBatches() / listFarmRecords(batchId) / createFarmRecord() / uploadImage()
    store/auth.ts    token 存取(Taro.setStorageSync 封装)
  package.json       name: @nongchang/miniapp,依赖 @tarojs/* + @nongchang/shared
  tsconfig.json
  project.config.json 微信开发者工具项目配置(appid 占位,联调时填)
```

**API 封装 `request.ts`** — 包一层 `Taro.request`:
- baseURL 从环境配置取(开发指向本机后端 `http://localhost:3001/api`,生产指向线上域名)。微信小程序真机要求 https + 配置合法域名;开发用微信开发者工具勾「不校验合法域名」即可连 localhost。
- 自动注入 `Authorization: Bearer <token>`(从 store 读)。
- 响应非 2xx 统一抛错;401 清 token + `Taro.redirectTo` 登录页。

**类型复用**:`api/farm.ts` 直接 import `@nongchang/shared` 的 `CreateFarmRecordDto` 等类型,保证前后端契约一致。`uploadImage` 用 `Taro.uploadFile`(非 `Taro.request`,multipart),单独封装。

**根 package.json**:加 `build:miniapp`(`pnpm --filter @nongchang/miniapp build:weapp`)。注意 monorepo 里 Taro 依赖较重,会显著增加 `node_modules`。

## 5. 后端上传端点 + 阿里云 OSS

后端本期**唯一**新增,独立模块,不碰现有逻辑。

**新建 `packages/backend/src/modules/upload/`:**
- `oss.service.ts` —— 封装阿里云 OSS SDK(`ali-oss`),`put(key, buffer)` 上传并返回公开 URL。OSS 配置(region/bucket/accessKeyId/accessKeySecret/可选 cdn 域名)全部从 `process.env` 读,**不进 git**。
- `upload.controller.ts` —— `POST /api/uploads`,受全局 JWT 守卫保护(非 `@Public`),仅登录用户可上传。用 NestJS `FileInterceptor`(multer,内存存储)接收 multipart 单文件字段 `file`。
- `upload.service.ts` —— 校验(类型限 jpg/png/webp、大小限 5MB)→ 生成 key(`farm-records/<yyyymm>/<uuid>.<ext>`)→ 调 `oss.service.put` → 返回 `{ url }`。
- `upload.module.ts` —— 模块声明,注册到 AppModule。
- `upload.service.spec.ts` —— 单元测试(mock OssService:校验通过/类型超限拒绝/大小超限拒绝/key 生成规则)。

**响应契约**(放 shared,前后端共用):`UploadResponse { url: string }`。

**依赖与配置:**
- 新增依赖:`ali-oss` + `@types/ali-oss`(后端);`@nestjs/platform-express` 的 `FileInterceptor`/multer(NestJS 自带 express 平台)。
- `.env` 增 `OSS_REGION / OSS_BUCKET / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BASE_URL`;`.env.example` 同步占位;部署文档(baota.md)记如何填。

**可测性约束**:OSS 是外部服务,需真实凭据。单元测试**全程 mock** OssService,不连真 OSS。e2e 对上传端点**只验鉴权与校验**(未带 token→401、超大/错类型→400),OSS put 用 mock。生产由用户在宝塔 `.env` 填真实凭据后手动验证真实上传。

**安全点**:上传端点必须受 JWT 保护(防匿名刷存储);校验文件类型/大小防滥用;key 用 uuid 防覆盖/遍历。

## 6. 测试策略与验收标准

**后端(上传模块):**
- **单元测试** `upload.service.spec.ts`(Vitest,mock OssService):
  - 合法 jpg/png/webp + 合规大小 → 调 `Oss.put`,返回 `{ url }`。
  - 类型不允许(如 gif/pdf)→ 抛 `BadRequestException`(400),不调 OSS。
  - 超过大小上限 → 抛 400。
  - key 生成符合 `farm-records/<yyyymm>/<uuid>.<ext>` 规则。
- **e2e** `test/upload.e2e-spec.ts`(真实 Nest 应用,OSS 用 mock,不连真服务):
  - 未带 token → 401(验证受保护)。
  - 带 token + 非法类型/超大 → 400。
  - 带 token + 合法小文件 → 200 且返回 url(OssService 在测试里被 mock 替换)。
- 不破坏现有 31 个测试。

**小程序端:**
- Taro 项目本期**不引入前端测试栈**(与 web 一致),正确性靠:① 后端契约由后端测试保证;② 编译通过 `pnpm --filter @nongchang/miniapp build:weapp`;③ 手动验证(微信开发者工具)。
- 手动验证步骤写进计划:开发者工具勾「不校验合法域名」连本机后端 → 用种子农户账号(merchantA/password123)登录 → 看到自己批次 → 进详情 → 提交一条带图农事记录 → 后端 `GET /api/farm-records` 能查到、`source=miniapp`、images 有 OSS URL。

**验收标准:**
- `pnpm --filter @nongchang/backend test` 全绿(现有 31 + 上传单元 ~4 + e2e ~3)。
- `pnpm --filter @nongchang/miniapp build:weapp` 成功产出 weapp 包。
- 三处原构建(shared/backend/web)仍全绿;shared 新增 `UploadResponse` 也要 build 通过。
- 手动:农户小程序端到端记一笔带图农事记录,后端可查、隔离正确(只能看/写自己的批次)。

**留作后续(明确不做)**:微信登录、自动 token refresh、离线缓存、溯源事件录入、多端(支付宝/H5)、图片压缩/水印。
