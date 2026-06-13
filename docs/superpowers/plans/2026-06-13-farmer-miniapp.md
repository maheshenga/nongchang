# 农户小程序(子项目 3)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付农户在微信小程序里"登录 → 看自己批次 → 提交带图农事记录"的端到端闭环,后端仅新增受保护的图片上传端点。

**Architecture:** 新建 monorepo 第 4 个包 `packages/miniapp`(Taro + React + TS,本期只编译 weapp),复用 `@nongchang/shared` 的 DTO/类型。后端新增独立 `upload` 模块(`POST /api/uploads`,JWT 保护,转存阿里云 OSS),其余后端逻辑零改动。农事/批次/地块接口沿用子项目 1 已有的 ScopeService owner 级隔离。

**Tech Stack:** NestJS 10 + ali-oss + multer(FileInterceptor);Vitest + Supertest(真实 PG);Taro 4 + React + TypeScript;pnpm workspace。

---

## 文件结构

**后端新增(`packages/backend/`):**
- `src/modules/upload/oss.service.ts` — 封装 ali-oss,`put(key, buffer): Promise<string>` 返回公开 URL,配置读 `process.env`
- `src/modules/upload/upload.service.ts` — 校验类型/大小、生成 key、调 OssService
- `src/modules/upload/upload.controller.ts` — `POST /api/uploads`,FileInterceptor 收单文件 `file`
- `src/modules/upload/upload.module.ts` — 模块声明
- `src/modules/upload/upload.service.spec.ts` — 单元测试(mock OssService)
- `test/upload.e2e-spec.ts` — e2e(覆盖 OssService 为 mock,验鉴权+校验)
- 修改 `src/app.module.ts` — 注册 UploadModule
- 修改 `.env.example`、`docs/baota.md` — OSS 配置说明

**shared 新增(`packages/shared/`):**
- `src/dto/upload.dto.ts` — `UploadResponse { url: string }`
- 修改 `src/index.ts` — 导出 upload.dto

**小程序新建(`packages/miniapp/`):**
- `package.json`、`tsconfig.json`、`project.config.json`、`babel.config.js`
- `config/index.ts`、`config/dev.ts`、`config/prod.ts` — Taro 编译配置
- `src/app.config.ts`、`src/app.ts`、`src/app.scss`
- `src/api/request.ts` — 统一请求封装(JWT 注入、401 处理)
- `src/api/auth.ts` — `login(username, password)`
- `src/api/farm.ts` — `listBatches / listFarmRecords / createFarmRecord / uploadImage`
- `src/store/auth.ts` — token 存取
- `src/constants/actions.ts` — 预设动作清单
- `src/pages/login/index.{tsx,config.ts}`
- `src/pages/index/index.{tsx,config.ts}` — 批次列表
- `src/pages/batch/index.{tsx,config.ts}` — 批次详情+记录列表
- `src/pages/record/index.{tsx,config.ts}` — 新增记录表单
- 修改根 `package.json` — 加 `build:miniapp` 脚本

**任务顺序**:先后端(Task 1-3,小程序依赖其契约)→ 再小程序脚手架与页面(Task 4-8)。后端任务可独立验证;小程序任务以编译通过为自动化验收,联调为手动验收。

---

## Task 1: shared 上传响应契约

**Files:**
- Create: `packages/shared/src/dto/upload.dto.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 写 DTO 文件**

`packages/shared/src/dto/upload.dto.ts`:
```ts
import { z } from 'zod';

export const uploadResponseSchema = z.object({
  url: z.string().url(),
});
export type UploadResponse = z.infer<typeof uploadResponseSchema>;
```

- [ ] **Step 2: 在 index.ts 导出**

在 `packages/shared/src/index.ts` 的 `export * from './dto/public-trace.dto';` 之后新增一行:
```ts
export * from './dto/upload.dto';
```

- [ ] **Step 3: 构建 shared 验证**

Run: `pnpm --filter @nongchang/shared build`
Expected: 构建成功,无类型错误。

- [ ] **Step 4: Commit**

```bash
git -c user.name='nongchang' -c user.email='noreply@local' add packages/shared/src/dto/upload.dto.ts packages/shared/src/index.ts
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(shared): add UploadResponse dto for miniapp upload endpoint"
```

---

## Task 2: 后端 OSS 服务 + 上传服务(TDD)

**Files:**
- Create: `packages/backend/src/modules/upload/oss.service.ts`
- Create: `packages/backend/src/modules/upload/upload.service.ts`
- Test: `packages/backend/src/modules/upload/upload.service.spec.ts`

OssService 是对 `ali-oss` 的薄封装(外部副作用集中在此,便于在测试里整体 mock)。UploadService 负责校验与 key 生成这些纯逻辑,是单元测试重点。

- [ ] **Step 1: 安装 ali-oss 依赖**

Run: `pnpm --filter @nongchang/backend add ali-oss && pnpm --filter @nongchang/backend add -D @types/ali-oss`
Expected: 安装成功,backend package.json 出现 ali-oss。

- [ ] **Step 2: 写 OssService(薄封装,无单测,逻辑最小)**

`packages/backend/src/modules/upload/oss.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import OSS from 'ali-oss';

@Injectable()
export class OssService {
  private client(): OSS {
    return new OSS({
      region: process.env.OSS_REGION,
      bucket: process.env.OSS_BUCKET,
      accessKeyId: process.env.OSS_ACCESS_KEY_ID!,
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET!,
    });
  }

  // 上传并返回可访问 URL。若配置了 OSS_BASE_URL(CDN/自定义域名)优先用之。
  async put(key: string, buffer: Buffer): Promise<string> {
    const res = await this.client().put(key, buffer);
    const base = process.env.OSS_BASE_URL;
    return base ? `${base.replace(/\/$/, '')}/${key}` : res.url;
  }
}
```

- [ ] **Step 3: 写失败的单元测试**

`packages/backend/src/modules/upload/upload.service.spec.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { UploadService } from './upload.service';

function makeOss() {
  return { put: vi.fn().mockResolvedValue('https://cdn.example.com/farm-records/202606/x.jpg') } as any;
}
const jpg = { originalname: 'a.jpg', mimetype: 'image/jpeg', size: 1024, buffer: Buffer.from('x') } as any;

describe('UploadService.upload', () => {
  it('合法 jpeg 调 Oss.put 并返回 { url }', async () => {
    const oss = makeOss();
    const svc = new UploadService(oss);
    const res = await svc.upload(jpg);
    expect(oss.put).toHaveBeenCalledOnce();
    expect(res.url).toBe('https://cdn.example.com/farm-records/202606/x.jpg');
  });

  it('png/webp 也允许', async () => {
    const oss = makeOss();
    const svc = new UploadService(oss);
    await expect(svc.upload({ ...jpg, mimetype: 'image/png', originalname: 'a.png' })).resolves.toBeTruthy();
    await expect(svc.upload({ ...jpg, mimetype: 'image/webp', originalname: 'a.webp' })).resolves.toBeTruthy();
  });

  it('不支持的类型(pdf)抛 400 且不调 OSS', async () => {
    const oss = makeOss();
    const svc = new UploadService(oss);
    await expect(svc.upload({ ...jpg, mimetype: 'application/pdf', originalname: 'a.pdf' }))
      .rejects.toThrow(BadRequestException);
    expect(oss.put).not.toHaveBeenCalled();
  });

  it('超过 5MB 抛 400', async () => {
    const oss = makeOss();
    const svc = new UploadService(oss);
    await expect(svc.upload({ ...jpg, size: 5 * 1024 * 1024 + 1 }))
      .rejects.toThrow(BadRequestException);
  });

  it('缺少文件抛 400', async () => {
    const svc = new UploadService(makeOss());
    await expect(svc.upload(undefined as any)).rejects.toThrow(BadRequestException);
  });

  it('生成的 key 符合 farm-records/<yyyymm>/<uuid>.<ext> 规则', async () => {
    const oss = makeOss();
    const svc = new UploadService(oss);
    await svc.upload(jpg);
    const key = oss.put.mock.calls[0][0] as string;
    expect(key).toMatch(/^farm-records\/\d{6}\/[0-9a-f-]{36}\.jpg$/);
  });
});
```

- [ ] **Step 4: 运行测试确认失败**

Run: `pnpm --filter @nongchang/backend test -- upload.service`
Expected: FAIL(UploadService 尚不存在 / 无法导入)。

- [ ] **Step 5: 写 UploadService 实现**

`packages/backend/src/modules/upload/upload.service.ts`:
```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { UploadResponse } from '@nongchang/shared';
import { OssService } from './oss.service';

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// multer 内存存储文件的最小形状(避免依赖 @types/multer)
interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class UploadService {
  constructor(private oss: OssService) {}

  async upload(file: UploadedFile): Promise<UploadResponse> {
    if (!file) throw new BadRequestException('未收到文件');
    const ext = ALLOWED[file.mimetype];
    if (!ext) throw new BadRequestException('仅支持 jpg/png/webp 图片');
    if (file.size > MAX_SIZE) throw new BadRequestException('图片不得超过 5MB');

    const yyyymm = new Date().toISOString().slice(0, 7).replace('-', '');
    const key = `farm-records/${yyyymm}/${randomUUID()}.${ext}`;
    const url = await this.oss.put(key, file.buffer);
    return { url };
  }
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm --filter @nongchang/backend test -- upload.service`
Expected: PASS(6 个用例全绿)。

- [ ] **Step 7: Commit**

```bash
git -c user.name='nongchang' -c user.email='noreply@local' add packages/backend/src/modules/upload packages/backend/package.json
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(backend): add upload service with oss wrapper and validation (TDD)"
```

---

## Task 3: 上传 Controller + Module + 注册 + e2e

**Files:**
- Create: `packages/backend/src/modules/upload/upload.controller.ts`
- Create: `packages/backend/src/modules/upload/upload.module.ts`
- Create: `packages/backend/test/upload.e2e-spec.ts`
- Modify: `packages/backend/src/app.module.ts`
- Modify: `packages/backend/.env.example`、`docs/baota.md`

控制器受全局 JwtAuthGuard 保护(不加 @Public,即必须登录);RolesGuard 因无 @Roles 装饰器放行任意已登录角色。`FileInterceptor('file')` 用 multer 内存存储,文件落在 `req`,通过 `@UploadedFile()` 注入。

- [ ] **Step 1: 写 Controller**

`packages/backend/src/modules/upload/upload.controller.ts`:
```ts
import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';

@Controller('uploads')
export class UploadController {
  constructor(private svc: UploadService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: any) {
    return this.svc.upload(file);
  }
}
```

- [ ] **Step 2: 写 Module**

`packages/backend/src/modules/upload/upload.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { OssService } from './oss.service';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';

@Module({
  providers: [OssService, UploadService],
  controllers: [UploadController],
})
export class UploadModule {}
```

- [ ] **Step 3: 在 AppModule 注册**

在 `packages/backend/src/app.module.ts`:
- import 行(在 `PublicTraceModule` import 之后):
```ts
import { UploadModule } from './modules/upload/upload.module';
```
- imports 数组(在 `PublicTraceModule,` 之后)加入:
```ts
    UploadModule,
```

- [ ] **Step 4: 写 e2e 测试(OssService 用 mock 覆盖,不连真 OSS)**

`packages/backend/test/upload.e2e-spec.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { OssService } from '../src/modules/upload/oss.service';

let app: INestApplication;

async function token(username: string) {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login').send({ username, password: 'password123' });
  return res.body.accessToken as string;
}

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] })
    // 用 mock 覆盖 OssService,避免连真实 OSS
    .overrideProvider(OssService)
    .useValue({ put: async (key: string) => `https://cdn.test/${key}` })
    .compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
});
afterAll(async () => { await app.close(); });

describe('POST /api/uploads(受保护图片上传)', () => {
  it('未带 token → 401', async () => {
    await request(app.getHttpServer())
      .post('/api/uploads')
      .attach('file', Buffer.from('x'), { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(401);
  });

  it('带 token + 非图片类型 → 400', async () => {
    const t = await token('merchantA');
    await request(app.getHttpServer())
      .post('/api/uploads').set('Authorization', `Bearer ${t}`)
      .attach('file', Buffer.from('%PDF'), { filename: 'a.pdf', contentType: 'application/pdf' })
      .expect(400);
  });

  it('带 token + 合法 jpg → 201 且返回 url', async () => {
    const t = await token('merchantA');
    const res = await request(app.getHttpServer())
      .post('/api/uploads').set('Authorization', `Bearer ${t}`)
      .attach('file', Buffer.from('fakejpeg'), { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(201);
    expect(res.body.url).toMatch(/^https:\/\/cdn\.test\/farm-records\/\d{6}\/[0-9a-f-]{36}\.jpg$/);
  });
});
```

- [ ] **Step 5: 运行 upload e2e 确认通过**

Run: `pnpm --filter @nongchang/backend test -- upload.e2e`
Expected: PASS(3 个用例全绿)。需本机 PostgreSQL 已起且已 seed(merchantA 存在)。

- [ ] **Step 6: 更新 .env.example 与部署文档**

在 `packages/backend/.env.example` 末尾追加:
```
# 阿里云 OSS(图片上传,生产在宝塔 .env 填真实值,勿提交真实凭据)
OSS_REGION=oss-cn-hangzhou
OSS_BUCKET=your-bucket
OSS_ACCESS_KEY_ID=
OSS_ACCESS_KEY_SECRET=
OSS_BASE_URL=
```

在 `docs/baota.md` 增一节(若文件不存在则创建):说明上传端点 `POST /api/uploads` 需要在宝塔 `.env` 填上述 OSS 五项;`OSS_BASE_URL` 可选(填 CDN/自定义域名时返回的 URL 走该域名,否则用 OSS 默认 URL);单元/e2e 测试不连真 OSS,生产填好后用真机小程序或 curl 手动验证一次真实上传。

- [ ] **Step 7: 全量后端测试 + 构建**

Run: `pnpm --filter @nongchang/backend test && pnpm build`
Expected: 全部测试通过(原有 + 新增 upload 单元 6 + e2e 3),shared 与 backend 构建通过。

- [ ] **Step 8: Commit**

```bash
git -c user.name='nongchang' -c user.email='noreply@local' add packages/backend/src/modules/upload packages/backend/src/app.module.ts packages/backend/test/upload.e2e-spec.ts packages/backend/.env.example docs/baota.md
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(backend): expose protected POST /api/uploads to OSS with e2e"
```

---

## Task 4: 小程序 Taro 脚手架(packages/miniapp)

**Files:**
- Create: `packages/miniapp/package.json`、`tsconfig.json`、`project.config.json`、`babel.config.js`
- Create: `packages/miniapp/config/index.ts`、`config/dev.ts`、`config/prod.ts`
- Create: `packages/miniapp/src/app.config.ts`、`src/app.ts`、`src/app.scss`
- Modify: 根 `package.json`

本任务搭出能 `build:weapp` 通过的最小 Taro 应用(空页面占位),后续任务往里填页面。验收点是编译成功,不是功能。

- [ ] **Step 1: 写 packages/miniapp/package.json**

```json
{
  "name": "@nongchang/miniapp",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "build:weapp": "taro build --type weapp",
    "dev:weapp": "taro build --type weapp --watch"
  },
  "dependencies": {
    "@nongchang/shared": "workspace:*",
    "@tarojs/components": "4.0.9",
    "@tarojs/helper": "4.0.9",
    "@tarojs/plugin-framework-react": "4.0.9",
    "@tarojs/plugin-platform-weapp": "4.0.9",
    "@tarojs/react": "4.0.9",
    "@tarojs/runtime": "4.0.9",
    "@tarojs/shared": "4.0.9",
    "@tarojs/taro": "4.0.9",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tarojs/cli": "4.0.9",
    "@types/react": "^18.3.1",
    "babel-preset-taro": "4.0.9",
    "react-refresh": "^0.14.0"
  }
}
```

- [ ] **Step 2: 写 babel.config.js**

`packages/miniapp/babel.config.js`:
```js
module.exports = {
  presets: [['taro', { framework: 'react', ts: true }]],
};
```

- [ ] **Step 3: 写 tsconfig.json**

`packages/miniapp/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "module": "ESNext",
    "moduleResolution": "node",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] },
    "types": ["@tarojs/taro"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: 写 project.config.json(微信开发者工具)**

`packages/miniapp/project.config.json`:
```json
{
  "miniprogramRoot": "dist/",
  "projectname": "nongchang-farmer",
  "description": "农户农事记录小程序",
  "appid": "touristappid",
  "setting": {
    "urlCheck": false,
    "es6": false,
    "postcss": false,
    "minified": false
  },
  "compileType": "miniprogram"
}
```

- [ ] **Step 5: 写 Taro 编译配置 config/index.ts**

`packages/miniapp/config/index.ts`:
```ts
import { defineConfig } from '@tarojs/cli';
import devConfig from './dev';
import prodConfig from './prod';

export default defineConfig(async (merge, { mode }) => {
  const baseConfig = {
    projectName: 'miniapp',
    date: '2026-6-13',
    designWidth: 750,
    deviceRatio: { 640: 2.34 / 2, 750: 1, 828: 1.81 / 2 },
    sourceRoot: 'src',
    outputRoot: 'dist',
    plugins: [],
    defineConstants: {},
    framework: 'react',
    compiler: 'webpack5',
    cache: { enable: false },
    mini: {
      postcss: {
        pxtransform: { enable: true, config: {} },
        cssModules: { enable: false },
      },
    },
  };
  if (mode === 'development') {
    return merge({}, baseConfig, devConfig);
  }
  return merge({}, baseConfig, prodConfig);
});
```

- [ ] **Step 6: 写 config/dev.ts 与 config/prod.ts**

`packages/miniapp/config/dev.ts`:
```ts
export default { mini: {}, h5: {} };
```

`packages/miniapp/config/prod.ts`:
```ts
export default { mini: {}, h5: {} };
```

- [ ] **Step 7: 写应用入口 src/app.config.ts、src/app.ts、src/app.scss**

`packages/miniapp/src/app.config.ts`:
```ts
export default {
  pages: [
    'pages/login/index',
    'pages/index/index',
    'pages/batch/index',
    'pages/record/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#2e7d32',
    navigationBarTitleText: '农事记录',
    navigationBarTextStyle: 'white',
  },
};
```

`packages/miniapp/src/app.ts`:
```ts
import { PropsWithChildren } from 'react';
import './app.scss';

function App({ children }: PropsWithChildren) {
  return children;
}

export default App;
```

`packages/miniapp/src/app.scss`:
```scss
page {
  background: #f5f5f5;
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
}
```

- [ ] **Step 8: 加占位页面让首次编译通过**

为 `app.config.ts` 里声明的 4 个页面各建一个最小占位(后续任务替换)。每个页面建两个文件,例如登录页:

`packages/miniapp/src/pages/login/index.config.ts`:
```ts
export default { navigationBarTitleText: '登录' };
```

`packages/miniapp/src/pages/login/index.tsx`:
```tsx
import { View, Text } from '@tarojs/components';

export default function Login() {
  return <View><Text>login</Text></View>;
}
```

对其余三个页面重复相同的两文件结构,只改标题、组件名与占位文字:
- `pages/index/index`:标题"我的批次",组件 `Index`,文字 `index`
- `pages/batch/index`:标题"批次详情",组件 `Batch`,文字 `batch`
- `pages/record/index`:标题"记一笔",组件 `Record`,文字 `record`

- [ ] **Step 9: 根 package.json 加 build:miniapp 脚本**

在根 `package.json` 的 `scripts` 里,`"build": ...` 之后加一行:
```json
    "build:miniapp": "pnpm --filter @nongchang/miniapp build:weapp",
```

- [ ] **Step 10: 安装依赖并编译**

Run: `pnpm install && pnpm --filter @nongchang/miniapp build:weapp`
Expected: 安装成功;Taro 编译产出 `packages/miniapp/dist/`,无报错。若 Taro CLI 提示缺插件,按报错补 `@tarojs/plugin-*` 依赖后重试。

- [ ] **Step 11: Commit**

```bash
git -c user.name='nongchang' -c user.email='noreply@local' add packages/miniapp package.json pnpm-lock.yaml
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(miniapp): scaffold Taro weapp project with placeholder pages"
```

---

## Task 5: 小程序 API 封装层 + token store + 动作常量

**Files:**
- Create: `packages/miniapp/src/store/auth.ts`
- Create: `packages/miniapp/src/api/request.ts`
- Create: `packages/miniapp/src/api/auth.ts`
- Create: `packages/miniapp/src/api/farm.ts`
- Create: `packages/miniapp/src/constants/actions.ts`

无自动化测试(Taro 端按 spec 不引入测试栈),验收为下一编译步骤通过。所有请求经 `request.ts` 统一注入 JWT 并处理 401。

- [ ] **Step 1: 写 token store**

`packages/miniapp/src/store/auth.ts`:
```ts
import Taro from '@tarojs/taro';

const TOKEN_KEY = 'access_token';

export function getToken(): string {
  try { return Taro.getStorageSync(TOKEN_KEY) || ''; } catch { return ''; }
}
export function setToken(token: string): void {
  Taro.setStorageSync(TOKEN_KEY, token);
}
export function clearToken(): void {
  Taro.removeStorageSync(TOKEN_KEY);
}
```

- [ ] **Step 2: 写统一请求封装**

`packages/miniapp/src/api/request.ts`:
```ts
import Taro from '@tarojs/taro';
import { getToken, clearToken } from '../store/auth';

// 开发:微信开发者工具勾"不校验合法域名"连本机后端。
// 生产:改成线上 https 域名(需在小程序后台配置合法域名)。
export const BASE_URL = 'http://localhost:3001/api';

interface RequestOptions {
  url: string;
  method?: 'GET' | 'POST';
  data?: Record<string, unknown>;
}

export async function request<T>({ url, method = 'GET', data }: RequestOptions): Promise<T> {
  const token = getToken();
  const res = await Taro.request({
    url: `${BASE_URL}${url}`,
    method,
    data,
    header: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.statusCode === 401) {
    clearToken();
    Taro.redirectTo({ url: '/pages/login/index' });
    throw new Error('登录已失效,请重新登录');
  }
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const msg = (res.data as any)?.message || `请求失败(${res.statusCode})`;
    throw new Error(Array.isArray(msg) ? msg.join(',') : msg);
  }
  return res.data as T;
}

// 单文件上传(multipart),走 Taro.uploadFile 而非 request
export async function uploadFile(filePath: string): Promise<string> {
  const token = getToken();
  const res = await Taro.uploadFile({
    url: `${BASE_URL}/uploads`,
    filePath,
    name: 'file',
    header: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`图片上传失败(${res.statusCode})`);
  }
  const body = JSON.parse(res.data) as { url: string };
  return body.url;
}
```

- [ ] **Step 3: 写 auth API**

`packages/miniapp/src/api/auth.ts`:
```ts
import { request } from './request';
import { setToken } from '../store/auth';
import type { TokenPair } from '@nongchang/shared';

export async function login(username: string, password: string): Promise<void> {
  const res = await request<TokenPair>({
    url: '/auth/login',
    method: 'POST',
    data: { username, password },
  });
  setToken(res.accessToken);
}
```

- [ ] **Step 4: 写 farm API**

`packages/miniapp/src/api/farm.ts`:
```ts
import { request, uploadFile } from './request';
import type { CreateFarmRecordDto } from '@nongchang/shared';

// 后端实体类型未在 shared 导出,这里按 GET 响应声明所需字段。
export interface Batch {
  id: string; ownerId: string; fieldId: string; batchNo: string;
  cropName: string; plantDate: string; expectedHarvest: string; status: string;
}
export interface FarmRecord {
  id: string; batchId: string; fieldId: string; action: string;
  detail?: Record<string, unknown> | null; images?: string[] | null;
  location?: string | null; recordedAt: string; source: string;
}

export function listBatches(): Promise<Batch[]> {
  return request<Batch[]>({ url: '/batches' });
}

// 后端 GET /api/farm-records 返回该 owner 全部记录,无 batchId 参数,客户端过滤。
export async function listFarmRecords(batchId: string): Promise<FarmRecord[]> {
  const all = await request<FarmRecord[]>({ url: '/farm-records' });
  return all.filter(r => r.batchId === batchId);
}

export function createFarmRecord(dto: CreateFarmRecordDto): Promise<FarmRecord> {
  return request<FarmRecord>({ url: '/farm-records', method: 'POST', data: dto });
}

export function uploadImage(filePath: string): Promise<string> {
  return uploadFile(filePath);
}
```

- [ ] **Step 5: 写预设动作常量**

`packages/miniapp/src/constants/actions.ts`:
```ts
export const FARM_ACTIONS = [
  '浇水', '施肥', '打药', '除草', '移栽', '采收', '巡田',
] as const;
```

- [ ] **Step 6: 编译验证**

Run: `pnpm --filter @nongchang/miniapp build:weapp`
Expected: 编译通过(API 层尚未被页面引用也应能编过)。

- [ ] **Step 7: Commit**

```bash
git -c user.name='nongchang' -c user.email='noreply@local' add packages/miniapp/src/api packages/miniapp/src/store packages/miniapp/src/constants
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(miniapp): add api layer, token store, and farm action constants"
```

---

## Task 6: 登录页 + 批次列表页

**Files:**
- Modify: `packages/miniapp/src/pages/login/index.tsx`
- Modify: `packages/miniapp/src/pages/index/index.tsx`

替换 Task 4 的占位实现为真实页面。登录成功后 `redirectTo` 批次列表;批次列表进入时校验 token,无 token 跳登录。

- [ ] **Step 1: 写登录页**

`packages/miniapp/src/pages/login/index.tsx`:
```tsx
import { useState } from 'react';
import { View, Input, Button, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { login } from '../../api/auth';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    if (!username || !password) {
      Taro.showToast({ title: '请输入账号和密码', icon: 'none' });
      return;
    }
    setLoading(true);
    try {
      await login(username, password);
      Taro.redirectTo({ url: '/pages/index/index' });
    } catch (e: any) {
      Taro.showToast({ title: e.message || '登录失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ padding: '48px 32px' }}>
      <Text style={{ fontSize: '40px', fontWeight: 'bold', color: '#2e7d32' }}>农事记录</Text>
      <View style={{ marginTop: '48px' }}>
        <Input
          placeholder="账号"
          value={username}
          onInput={e => setUsername(e.detail.value)}
          style={{ background: '#fff', padding: '24px', borderRadius: '8px', marginBottom: '24px' }}
        />
        <Input
          password
          placeholder="密码"
          value={password}
          onInput={e => setPassword(e.detail.value)}
          style={{ background: '#fff', padding: '24px', borderRadius: '8px' }}
        />
      </View>
      <Button
        loading={loading}
        onClick={onSubmit}
        style={{ marginTop: '48px', background: '#2e7d32', color: '#fff' }}
      >
        登录
      </Button>
    </View>
  );
}
```

- [ ] **Step 2: 写批次列表页**

`packages/miniapp/src/pages/index/index.tsx`:
```tsx
import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { listBatches, type Batch } from '../../api/farm';
import { getToken } from '../../store/auth';

export default function Index() {
  const [batches, setBatches] = useState<Batch[]>([]);

  useDidShow(() => {
    if (!getToken()) {
      Taro.redirectTo({ url: '/pages/login/index' });
      return;
    }
    listBatches()
      .then(setBatches)
      .catch(e => Taro.showToast({ title: e.message || '加载失败', icon: 'none' }));
  });

  function openBatch(b: Batch) {
    Taro.navigateTo({
      url: `/pages/batch/index?id=${b.id}&fieldId=${b.fieldId}&cropName=${encodeURIComponent(b.cropName)}&batchNo=${encodeURIComponent(b.batchNo)}`,
    });
  }

  return (
    <View style={{ padding: '24px' }}>
      {batches.length === 0 && (
        <Text style={{ color: '#999' }}>暂无批次</Text>
      )}
      {batches.map(b => (
        <View
          key={b.id}
          onClick={() => openBatch(b)}
          style={{ background: '#fff', padding: '32px', borderRadius: '8px', marginBottom: '20px' }}
        >
          <Text style={{ fontSize: '32px', fontWeight: 'bold' }}>{b.cropName}</Text>
          <View style={{ marginTop: '12px' }}>
            <Text style={{ color: '#666', fontSize: '26px' }}>批次 {b.batchNo} · {b.status}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
```

- [ ] **Step 3: 编译验证**

Run: `pnpm --filter @nongchang/miniapp build:weapp`
Expected: 编译通过。

- [ ] **Step 4: Commit**

```bash
git -c user.name='nongchang' -c user.email='noreply@local' add packages/miniapp/src/pages/login packages/miniapp/src/pages/index
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(miniapp): implement login and batch list pages"
```

---

## Task 7: 批次详情页 + 记一笔表单页

**Files:**
- Modify: `packages/miniapp/src/pages/batch/index.tsx`
- Modify: `packages/miniapp/src/pages/record/index.tsx`

批次详情展示该批次已有农事记录,底部"记一笔"跳记录页;记录页选预设动作 + 备注 + 选图上传 + 提交。两页通过 URL query 传 `batchId` 与 `fieldId`。

- [ ] **Step 1: 写批次详情页**

`packages/miniapp/src/pages/batch/index.tsx`:
```tsx
import { useState } from 'react';
import { View, Text, Button, Image } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { listFarmRecords, type FarmRecord } from '../../api/farm';

export default function Batch() {
  const router = useRouter();
  const { id, fieldId, cropName, batchNo } = router.params as Record<string, string>;
  const [records, setRecords] = useState<FarmRecord[]>([]);

  useDidShow(() => {
    listFarmRecords(id)
      .then(setRecords)
      .catch(e => Taro.showToast({ title: e.message || '加载失败', icon: 'none' }));
  });

  function addRecord() {
    Taro.navigateTo({ url: `/pages/record/index?batchId=${id}&fieldId=${fieldId}` });
  }

  return (
    <View style={{ padding: '24px', paddingBottom: '140px' }}>
      <View style={{ background: '#fff', padding: '32px', borderRadius: '8px', marginBottom: '24px' }}>
        <Text style={{ fontSize: '32px', fontWeight: 'bold' }}>{decodeURIComponent(cropName || '')}</Text>
        <View style={{ marginTop: '8px' }}>
          <Text style={{ color: '#666', fontSize: '26px' }}>批次 {decodeURIComponent(batchNo || '')}</Text>
        </View>
      </View>

      <Text style={{ fontSize: '28px', color: '#333' }}>农事记录</Text>
      {records.length === 0 && (
        <View style={{ marginTop: '16px' }}><Text style={{ color: '#999' }}>暂无记录</Text></View>
      )}
      {records.map(r => (
        <View key={r.id} style={{ background: '#fff', padding: '28px', borderRadius: '8px', marginTop: '16px' }}>
          <Text style={{ fontWeight: 'bold' }}>{r.action}</Text>
          <View style={{ marginTop: '8px' }}>
            <Text style={{ color: '#666', fontSize: '24px' }}>{r.recordedAt}</Text>
          </View>
          {r.detail?.note ? (
            <View style={{ marginTop: '8px' }}><Text style={{ fontSize: '26px' }}>{String(r.detail.note)}</Text></View>
          ) : null}
          {(r.images || []).map(url => (
            <Image key={url} src={url} mode="widthFix" style={{ width: '200px', marginTop: '12px', borderRadius: '6px' }} />
          ))}
        </View>
      ))}

      <View style={{ position: 'fixed', left: '24px', right: '24px', bottom: '32px' }}>
        <Button onClick={addRecord} style={{ background: '#2e7d32', color: '#fff' }}>记一笔</Button>
      </View>
    </View>
  );
}
```

- [ ] **Step 2: 写记一笔表单页**

`packages/miniapp/src/pages/record/index.tsx`:
```tsx
import { useState } from 'react';
import { View, Text, Textarea, Button, Image } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { createFarmRecord, uploadImage } from '../../api/farm';
import { FARM_ACTIONS } from '../../constants/actions';
import { FarmRecordSource } from '@nongchang/shared';

export default function Record() {
  const router = useRouter();
  const { batchId, fieldId } = router.params as Record<string, string>;
  const [action, setAction] = useState<string>('');
  const [note, setNote] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function chooseAndUpload() {
    const r = await Taro.chooseImage({ count: 1, sizeType: ['compressed'] });
    const filePath = r.tempFilePaths[0];
    try {
      const url = await uploadImage(filePath);
      setImages(prev => [...prev, url]);
    } catch (e: any) {
      Taro.showToast({ title: e.message || '上传失败', icon: 'none' });
    }
  }

  async function submit() {
    if (!action) {
      Taro.showToast({ title: '请选择农事动作', icon: 'none' });
      return;
    }
    setSubmitting(true);
    try {
      await createFarmRecord({
        batchId,
        fieldId,
        action,
        detail: note ? { note } : undefined,
        images: images.length ? images : undefined,
        recordedAt: new Date().toISOString(),
        source: FarmRecordSource.MINIAPP,
      });
      Taro.showToast({ title: '已保存', icon: 'success' });
      Taro.navigateBack();
    } catch (e: any) {
      Taro.showToast({ title: e.message || '保存失败', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ padding: '24px' }}>
      <Text style={{ fontSize: '28px' }}>农事动作</Text>
      <View style={{ display: 'flex', flexWrap: 'wrap', marginTop: '16px' }}>
        {FARM_ACTIONS.map(a => (
          <View
            key={a}
            onClick={() => setAction(a)}
            style={{
              padding: '16px 28px', marginRight: '16px', marginBottom: '16px', borderRadius: '32px',
              background: action === a ? '#2e7d32' : '#fff',
              color: action === a ? '#fff' : '#333',
            }}
          >
            <Text>{a}</Text>
          </View>
        ))}
      </View>

      <Text style={{ fontSize: '28px' }}>备注</Text>
      <Textarea
        value={note}
        onInput={e => setNote(e.detail.value)}
        placeholder="可填写补充说明(可选)"
        style={{ background: '#fff', padding: '24px', borderRadius: '8px', marginTop: '16px', width: '100%', height: '160px' }}
      />

      <Text style={{ fontSize: '28px', display: 'block', marginTop: '24px' }}>照片</Text>
      <View style={{ display: 'flex', flexWrap: 'wrap', marginTop: '16px' }}>
        {images.map(url => (
          <Image key={url} src={url} mode="aspectFill" style={{ width: '160px', height: '160px', marginRight: '16px', borderRadius: '6px' }} />
        ))}
        <View
          onClick={chooseAndUpload}
          style={{ width: '160px', height: '160px', background: '#fff', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: '#2e7d32', fontSize: '48px' }}>+</Text>
        </View>
      </View>

      <Button loading={submitting} onClick={submit} style={{ marginTop: '48px', background: '#2e7d32', color: '#fff' }}>
        保存记录
      </Button>
    </View>
  );
}
```

- [ ] **Step 3: 编译验证**

Run: `pnpm --filter @nongchang/miniapp build:weapp`
Expected: 编译通过,产出完整 weapp 包。

- [ ] **Step 4: Commit**

```bash
git -c user.name='nongchang' -c user.email='noreply@local' add packages/miniapp/src/pages/batch packages/miniapp/src/pages/record
git -c user.name='nongchang' -c user.email='noreply@local' commit -m "feat(miniapp): implement batch detail and farm-record form pages"
```

---

## 验收标准

完成全部 7 个任务后:

1. **后端测试全绿**:`pnpm --filter @nongchang/backend test` 通过(原有测试 + upload 单元 6 + e2e 3)。
2. **构建通过**:`pnpm build`(shared + backend)与 `pnpm --filter @nongchang/miniapp build:weapp` 均成功。
3. **凭据不入库**:OSS 真实凭据不出现在 git;仅 `.env.example` 占位 + `docs/baota.md` 说明。
4. **手动联调**(微信开发者工具,勾"不校验合法域名",后端本机起 + 已 seed):
   - 用 `merchantA` / `password123` 登录成功 → 落地批次列表。
   - 批次列表显示 merchantA 自己的批次(隔离正确,看不到 merchantB)。
   - 进入某批次 → 看到该批次农事记录(客户端按 batchId 过滤)。
   - 记一笔:选动作 + 填备注 + 拍一张照(经 `POST /api/uploads` 拿到 OSS URL)→ 保存。
   - 返回批次详情,列表刷新出现新记录,含图片 URL;后端 `GET /api/farm-records` 可查到、`source=miniapp`。

## 留作后续(明确不在本期)

- 微信登录(`code2session` + openid 关联)。
- farm-records 后端 batchId 查询参数(本期客户端过滤)。
- 自动 token refresh、离线缓存、图片压缩/水印。
- 多端编译(支付宝 / H5 / 抖音)。
- 子项目 1 遗留安全硬化项(#20、#22-28),按触及相关性处理。
