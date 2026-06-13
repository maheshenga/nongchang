# 宝塔部署补充说明

## 图片上传(阿里云 OSS)

`POST /api/uploads` 受全局 JwtAuthGuard 保护(需登录),内部把图片转存到阿里云 OSS。
生产环境需在宝塔站点的 `.env` 中配置以下五个变量:

```
OSS_REGION=oss-cn-hangzhou
OSS_BUCKET=your-bucket
OSS_ACCESS_KEY_ID=真实 AccessKeyId
OSS_ACCESS_KEY_SECRET=真实 AccessKeySecret
OSS_BASE_URL=
```

- `OSS_REGION` / `OSS_BUCKET` / `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET`:必填,缺失会导致上传失败。
- `OSS_BASE_URL`:可选。设置后(CDN/自定义域名),返回的 URL 使用该域名;留空则返回 OSS 默认 URL。
- 切勿把真实 AccessKey 凭据提交到仓库,仅在服务器 `.env` 中填写。

## 测试与凭据

- 单元测试 / e2e 测试不会连接真实 OSS(`OssService` 在测试里被 mock 替换),因此本地与 CI 无需任何 OSS 凭据。
- 在生产填好真实凭据后,需通过小程序或 curl 手动验证一次真实上传,确认链路打通。

示例 curl(替换 token 与文件路径):

```bash
curl -X POST https://your-domain/api/uploads \
  -H "Authorization: Bearer <accessToken>" \
  -F "file=@/path/to/photo.jpg"
```

成功返回:`{ "url": "https://.../farm-records/yyyymm/<uuid>.jpg" }`
