# 云函数部署指南

## 当前错误
```
errCode: -501000 | the resource is not found
```
**原因**: 云函数未部署到云端

## 部署步骤

### 方法1: 微信开发者工具手动部署（推荐）

1. 打开微信开发者工具
2. 展开 `cloudfunctions` 目录
3. 右键点击以下文件夹，选择"上传并部署：云端安装依赖"：
   - `adminMgr` - 管理后台功能
   - `productMgr` - 特产管理
   - `orderMgr` - 订单/互换管理
   - `userInit` - 用户初始化（已修复新用户登录问题）
   - `reviewMgr` - 评价系统
   - `dailyTasks` - 签到功能

### 方法2: 使用云开发控制台

1. 登录[微信云开发控制台](https://cloud.weixin.qq.com/)
2. 选择环境 `cloud1-3g4sjhqr5e28e54e`
3. 进入"云函数"管理页面
4. 检查是否已部署上述云函数

## 待部署云函数清单

根据 git status 和项目需求，以下云函数需要部署：

| 云函数名 | 功能 | 状态 |
|---------|------|------|
| adminMgr | 管理后台（功能开关、审核等） | ❌ 未部署 |
| productMgr | 特产CRUD、分享配置 | ❌ 未部署 |
| orderMgr | 订单管理、未读消息 | ❌ 未部署 |
| userInit | 用户初始化、手机验证 | ❌ 未部署（已修复bug） |
| reviewMgr | 评价系统 | ❌ 未部署 |
| dailyTasks | 签到功能 | ❌ 未部署 |

## 部署后验证

部署完成后，在微信开发者工具控制台运行：
```javascript
wx.cloud.callFunction({
  name: 'adminMgr',
  data: { action: 'getFeatureFlags' }
}).then(console.log).catch(console.error)
```

成功返回：`{ result: { success: true, flags: {...} } }`

## 注意事项

- 每个云函数部署约需30秒-1分钟
- 首次部署会自动安装 `wx-server-sdk` 依赖
- 部署后需要重新编译小程序才能生效
- Windows 开发工具云函数部署可能较慢，请耐心等待
