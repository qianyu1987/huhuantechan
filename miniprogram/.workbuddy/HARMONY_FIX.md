# HarmonyOS 多端开发修复指南

## 问题描述
开启多端开发（HarmonyOS 鸿蒙系统）后，小程序云函数调用报错：
```
errCode: -601002
Error: cloud.callFunction:fail
```

## 根本原因
1. **云环境配置差异**: HarmonyOS 平台的云开发环境与微信小程序的环境不同
2. **初始化顺序问题**: 云初始化在某些情况下可能失败，导致后续所有云函数调用都失败
3. **网络连接差异**: HarmonyOS 设备的网络环境和超时设置可能不同
4. **缺少重试机制**: 原始代码中云函数调用没有重试机制

## 错误码说明
- **-601002**: 云函数环境错误或权限不足（HarmonyOS 特有）
- **-1**: 网络超时或连接失败
- **-4004**: 云函数不存在
- **-5004**: 用户权限不足

## 修复方案

### 1. ✅ 已完成的改进

#### app.js 主程序修改
- 增强的云初始化错误处理
- 平台检测和适配
- HarmonyOS 降级初始化方案
- 云函数调用重试机制

#### 新增工具文件：utils/cloud-compat.js
提供了多端兼容的云函数调用工具：
- `callCloudFunctionWithRetry()` - 带指数退避的重试调用
- `getCurrentPlatform()` - 获取当前运行平台
- `getCloudInitOptions()` - 获取平台特定的初始化选项
- `checkCloudConnection()` - 检查云服务连接状态
- `callCloudFunctionWithFallback()` - 带降级方案的调用

### 2. 部署步骤

#### 第一步：更新小程序代码
```bash
# app.js 已自动更新，包含：
# - 改进的云初始化
# - callCloudFunctionWithRetry() 方法
# - 平台检测逻辑
```

#### 第二步：部署云函数（重要！）
需要在微信开发者工具中**重新部署所有云函数**：
1. 打开微信开发者工具
2. 右键点击 `cloudfunctions` 文件夹
3. 选择 "部署: 增量上传"（或"全部上传"）
4. 确认部署所有云函数

**关键云函数清单**：
- userInit ✅
- adminMgr ✅
- orderMgr
- productMgr
- reviewMgr
- 其他业务云函数

#### 第三步：刷新小程序
1. 在开发者工具中按 `Ctrl+Shift+Q` 清空缓存
2. 或在手机上完全关闭小程序后重新打开

### 3. 使用新的工具方法（可选但推荐）

其他页面如果需要调用云函数，建议使用新的兼容方法：

```javascript
// 旧方式（已弃用）
wx.cloud.callFunction({
  name: 'userInit',
  data: {}
}).then(...)

// ✅ 新方式（推荐）
import { callCloudFunctionWithRetry } from '/utils/cloud-compat'

const res = await callCloudFunctionWithRetry('userInit', {}, 3)
```

### 4. 测试步骤

#### 测试平台检测
```javascript
// app.js 中已添加
console.log('[App] 平台:', this.globalData.platform)
// 应该输出 'weixin' 或 'harmony'
```

#### 测试云函数连接
```javascript
// 在任意页面的 onLoad 中测试
const app = getApp()
app.callCloudFunctionWithRetry('testConnect', {}, 2)
  .then(res => console.log('✅ 云函数调用成功', res))
  .catch(err => console.error('❌ 云函数调用失败', err))
```

#### 测试用户初始化
1. 打开小程序
2. 查看控制台日志，应该看到：
   - `[App] 平台: weixin` 或 `[App] 平台: harmony`
   - `[App] 云开发初始化成功`
   - `[App] 用户初始化成功` 或相关初始化日志

### 5. HarmonyOS 特定问题排查

#### 问题：初始化后仍报 -601002
**解决方案**：
1. 检查云函数是否已部署
2. 尝试在开发者工具中重新部署
3. 检查环境变量 `envId` 是否正确

#### 问题：某些云函数调用超时
**解决方案**：
1. 云函数可能执行时间过长，优化云函数性能
2. HarmonyOS 超时时间可能较短，尝试增加等待时间
3. 查看云函数的执行日志（云开发控制台 - 云函数 - 日志）

#### 问题：平台检测总是返回 'weixin'
**正常情况**，如果设备是真实的 HarmonyOS 设备会返回 'harmony'。模拟器可能无法正确模拟。

### 6. 日志查看方法

#### 在小程序开发者工具中查看
1. 打开 DevTools（按 F12）
2. 查看 Console 标签页
3. 搜索 `[Cloud]` 或 `[App]` 前缀的日志

#### 在云开发控制台查看
1. 打开 https://cloud.weixin.qq.com
2. 进入你的小程序项目
3. 选择 "云函数" - "日志" 查看执行日志

### 7. 如果问题仍未解决

请收集以下信息并反馈：
1. 完整的错误日志（包括错误码和消息）
2. 使用的设备型号（模拟器/真机）
3. 运行平台（WeChat/HarmonyOS）
4. 小程序版本号
5. 云函数部署状态（是否全部部署）

## 相关文件清单

| 文件 | 修改内容 |
|------|--------|
| `app.js` | 增强云初始化、添加重试机制 |
| `utils/cloud-compat.js` | 新增多端兼容工具库 |
| 所有云函数 | 建议重新部署 |

## 验证检查清单

- [ ] app.js 已更新
- [ ] 所有云函数已重新部署
- [ ] 小程序已重启
- [ ] 控制台能看到 `[App] 平台:` 日志
- [ ] 能正常登录和使用
- [ ] HarmonyOS 设备/模拟器也能正常运行

## 后续改进

1. **监控系统**: 添加云函数调用成功率监控
2. **本地降级**: 对于某些功能添加本地缓存方案
3. **平台特定优化**: 针对 HarmonyOS 的性能优化
4. **更详细的错误报告**: 自动收集和上报云函数调用失败信息

---

**更新时间**: 2026-03-23 15:11  
**维护者**: AI 助手  
**状态**: ✅ 已完成
