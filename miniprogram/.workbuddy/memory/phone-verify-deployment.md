# 手机号验证功能简化部署说明

## 变更概述

已将手机号验证从**短信验证码方案**简化为**微信原生一键授权方案**。

## 主要变更

### 1. 组件简化
- **文件**: `components/phone-verify/index.js`
- **变化**: 移除验证码输入逻辑,改为一键授权
- **优势**: 用户体验更好,无需等待验证码

### 2. 云函数更新
- **文件**: `cloudfunctions/userInit/index.js`
- **新增**: `verifyPhoneNumber` action
- **支持**: code、cloudID、encryptedData 三种方式
- **废弃**: sendPhoneVerifyCode、resendPhoneVerifyCode、verifyPhoneCode

### 3. 依赖移除
- **删除**: `cloudfunctions/common/sms/` 整个目录
- **移除**: `@alicloud/dysmsapi20170525` 等阿里云 SDK
- **优势**: 无需付费短信服务,降低成本

## 部署步骤

### 必须操作

1. **部署云函数**
   ```bash
   # 在微信开发者工具中
   右键 cloudfunctions/userInit → 上传并部署: 云端安装依赖
   ```

2. **重启小程序**
   - 完全关闭小程序
   - 重新打开并等待 3-5 秒

3. **测试验证**
   - 访问测试页面: `pages/test-phone/index`
   - 点击"快速验证手机号"按钮
   - 授权后应立即完成验证

### 可选操作

4. **清理旧数据**(如需)
   - 如果数据库中有 `phone_verify_temp` 集合,可以删除
   - 该集合仅用于旧的验证码方案

## 验证方式对比

| 特性 | 旧方案(短信验证码) | 新方案(微信原生) |
|------|-------------------|-----------------|
| 步骤 | 3步(授权→输入验证码→验证) | 1步(授权) |
| 时间 | ~30秒 | ~3秒 |
| 成本 | ¥0.045/条短信 | 免费 |
| 依赖 | 阿里云短信服务 | 无 |
| 体验 | 较复杂 | 极简 |

## 技术细节

### 云函数三种获取方式

```javascript
// 方式1: code (推荐,微信新版本)
const res = await cloud.openapi.phonenumber.getPhoneNumber({
  code: code
})
phoneNumber = res.phoneInfo.phoneNumber

// 方式2: cloudID (云开发)
const res = await cloud.getOpenData({
  list: [cloudID]
})
phoneNumber = res.list[0].data.phoneNumber

// 方式3: encryptedData (旧版本,已不推荐)
// 需要解密,建议引导用户更新微信
```

### 前端调用

```javascript
// 组件自动处理,无需额外代码
<button 
  open-type="getPhoneNumber" 
  bindgetphonenumber="onGetPhoneNumber"
>
  快速验证手机号
</button>
```

## 回滚方案

如需回滚到短信验证码方案:

1. 恢复 `components/phone-verify/index.js` 和 `index.wxml`
2. 恢复 `cloudfunctions/userInit/package.json` 中的阿里云依赖
3. 恢复 `cloudfunctions/common/sms/` 目录
4. 重新部署云函数

## 注意事项

1. **微信版本要求**: 建议微信版本 8.0.0 及以上
2. **小程序认证**: 需要完成微信小程序认证
3. **云开发环境**: 确保云开发环境已开通
4. **权限配置**: 确保 `phonenumber.getPhoneNumber` 接口权限已开通

## 成本节省

- 短信费用: ¥0.045/条 × 预计 1000 次/月 = ¥45/月
- 节省: **¥540/年**

## 问题排查

### 问题: 授权后无反应

**检查**:
1. 云函数是否已部署
2. 控制台是否有错误日志
3. 微信版本是否过低

### 问题: 提示"请更新微信版本"

**原因**: 微信版本过低,不支持新的 code 方式

**解决**: 引导用户更新微信

## 联系支持

如有问题,请查看:
- 微信官方文档: [手机号快速验证组件](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/getPhoneNumber.html)
- 项目记忆文件: `miniprogram/.workbuddy/memory/MEMORY.md`
