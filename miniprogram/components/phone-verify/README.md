# 手机号验证组件

## 简化说明(2026-03-23)

已简化为**微信原生方案**,无需短信验证码!

### 新方案优势
- ✅ 一键授权,无需验证码
- ✅ 无需付费短信服务
- ✅ 更快的验证流程
- ✅ 更好的用户体验

### 使用方式

```xml
<phone-verify 
  phone="{{phoneNumber}}" 
  verified="{{phoneVerified}}"
  bind:verified="onPhoneVerified"
/>
```

### 验证流程

1. 用户点击"快速验证手机号"按钮
2. 微信弹出授权框
3. 用户同意后,直接获取手机号并完成验证
4. 首次验证奖励信用分 +5

### 云函数支持

新增 action: `verifyPhoneNumber`

支持三种方式获取手机号:
- **code**: 微信新版本推荐方式
- **cloudID**: 云开发方式
- **encryptedData**: 旧版本方式(已不推荐)

### 已废弃功能

以下 action 已废弃,保留仅为兼容:
- `sendPhoneVerifyCode`: 发送短信验证码
- `resendPhoneVerifyCode`: 重发验证码
- `verifyPhoneCode`: 验证验证码

### 已移除依赖

- ❌ 阿里云短信 SDK (`@alicloud/dysmsapi20170525`)
- ❌ 阿里云 OpenAPI Client
- ❌ 短信服务模块 (`cloudfunctions/common/sms/`)

### 迁移指南

如果数据库中已有用户通过旧方式验证过手机号,无需任何操作。

新用户将使用新的微信原生方案。
