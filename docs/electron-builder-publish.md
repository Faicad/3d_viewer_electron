# electron-builder 发布配置

## 内置 Provider

| provider | 说明 |
|----------|------|
| `github` | GitHub Releases |
| `s3` | AWS S3 及兼容 S3 API 的服务 |
| `spaces` | DigitalOcean Spaces |
| `generic` | 任意 HTTP 服务器，手动上传 |
| `snapStore` | Snap 商店 (Linux) |
| `custom` | 自定义发布脚本 |

## S3 Provider 完整选项

| 选项 | 说明 |
|------|------|
| `bucket` | 存储桶名称 |
| `region` | 区域（自动检测或手动设置） |
| `endpoint` | S3 兼容服务的自定义 endpoint URL |
| `forcePathStyle` | 强制 path-style 寻址（大多数 S3 兼容服务需要设为 `true`） |
| `acl` | 访问控制：`public-read`、`private` 或 `null` |
| `encryption` | 服务端加密：`AES256` 或 `aws:kms` |
| `storageClass` | `STANDARD`、`REDUCED_REDUNDANCY`、`STANDARD_IA` |
| `accelerate` | S3 传输加速 |
| `channel` | 更新频道，默认 `latest` |
| `path` | 目录路径，默认 `/` |
| `publishAutoUpdate` | 是否发布自动更新元数据，默认 `true` |
| `timeout` | 请求超时毫秒数，默认 `120000` |
| `requestHeaders` | 自定义请求头 |

## 对接腾讯云 COS

### 方式 1：S3 Provider + 自定义 Endpoint（推荐）

COS 兼容 S3 API，直接用内置 s3 provider：

```json
{
  "build": {
    "publish": {
      "provider": "s3",
      "bucket": "your-bucket-1250000000",
      "endpoint": "https://cos.ap-guangzhou.myqcloud.com",
      "forcePathStyle": true,
      "region": "ap-guangzhou",
      "acl": "public-read"
    }
  }
}
```

设置环境变量映射密钥：

```bash
# Windows
set AWS_ACCESS_KEY_ID=你的SecretId
set AWS_SECRET_ACCESS_KEY=你的SecretKey

# macOS / Linux
export AWS_ACCESS_KEY_ID=你的SecretId
export AWS_SECRET_ACCESS_KEY=你的SecretKey
```

### 方式 2：专用包 electron-publisher-cos

```bash
npm install electron-publisher-cos --save-dev
```

```json
{
  "build": {
    "publish": {
      "provider": "cos",
      "secretId": "xxx",
      "secretKey": "xxx",
      "bucket": "your-bucket-1250000000",
      "region": "ap-guangzhou"
    }
  }
}
```

> 注意：该三方包版本较老（1.0.4），方式 1 的 S3 兼容方案更稳定可靠。

## Generic Server Provider

手动上传文件的方案，electron-builder 只生成 auto-update 元数据：

```json
{
  "build": {
    "publish": {
      "provider": "generic",
      "url": "https://your-cos-bucket.cos.ap-guangzhou.myqcloud.com",
      "channel": "latest",
      "useMultipleRangeRequest": true
    }
  }
}
```

文件上传到 COS 可通过 COSCLI、`cos-nodejs-sdk-v5` 或 CI/CD 脚本完成。

## 本地构建（禁用发布）

```json
{
  "build": {
    "publish": null
  }
}
```
