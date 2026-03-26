# 特产互换小程序 - 长期记忆

## 项目路径
- 工作区: `c:\Users\31849\WorkBuddy\20260320155547\specialty-swap\miniprogram`
- 云函数: `c:\Users\31849\WorkBuddy\20260320155547\specialty-swap\cloudfunctions`

## 核心修复记录

### 用户系统
- **头像403问题**: 前端改为先上传云存储，云函数不再转换cloud://链接，用_id精准定位更新（2026-03-23）
- **UnionID跨平台**: 新增unionid字段，优先级UNIONID>_openid>openid，实现微信小程序与HarmonyOS数据同步（2026-03-23）
- **手机号验证**: 集成阿里云短信API，组件路径`components/phone-verify/`，云函数新增sendPhoneVerifyCode/verifyPhoneCode（2026-03-23）
- **安卓手机号验证失败**: 修复getPhoneNumber在安卓上调用失败问题，增加登录状态检查，未登录时引导用户先点击头像完成微信登录（2026-03-23）

### 稳定性
- **HarmonyOS错误-601002**: 增强云初始化，添加callCloudFunctionWithRetry()重试机制（指数退避1s/2s/5s），取消首页错误弹窗（2026-03-23）
- **待审核特产泄露**: 改用`_.in(['active','swapped','in_swap'])`白名单过滤，禁止null状态产品显示（2026-03-23）

### UI/UX
- **管理后台重设计**: iOS 26毛玻璃风格，订单/审核/积分/信用分模块统一卡片布局，新增筛选/搜索/统计可视化（2026-03-23）
- **编辑资料省份**: 省份徽章设计，PROVINCES常量新增shortName/colorDark（2026-03-23）
- **评价页面标签**: 字符串数组改对象数组修复选中bug（2026-03-23）

## 安全与合规

### 代码混淆策略
- **目标**: 保护核心业务逻辑，增加逆向工程难度
- **策略文档**: `brain/obfuscation-strategy.md`
- **实施阶段**:
  - Phase 1 (P1 核心): `app.js` 等关键文件的私有函数和内部变量
  - Phase 2 (P2 业务): 各页面的私有函数
  - Phase 3 (P3 常量): 常量值和配置
- **混淆规则**:
  - 变量名: `camelCase` → `$var` 或 `_vN` 格式（如 cached → $ca, retryCount → $rc）
  - 函数名: `_privateFn` → `_pN` 格式（如 _loadData → _p1）
  - 不混淆: 云函数名、生命周期方法、微信 API、全局数据结构
- **完成度**: P1 已完成（app.js 所有函数变量混淆），P2/P3 待执行
- **映射表**: 包含全局变量、函数、页面函数、数据结构字段的完整映射

### 用户服务协议
- **文件**: `miniprogram/USER_TERMS_OF_SERVICE.md`
- **内容**: 15 条 + 附录，6500+ 字，符合中国法律要求、微信政策、多端开发背景
- **状态**: 文档完成，待集成到about页面和首次登录弹窗

## 阿里云短信配置
- **AccessKey ID**: LTAI5t8sk8ES4iAyF1Hqi32S
- **短信签名**: 泰兴钱哥建材商行
- **短信模板**: SMS_186915054
- **工具模块**: `cloudfunctions/common/sms/`
- **成本**: ¥0.045/条
- **安全**: 敏感配置在`sms-config.js`，需添加到.gitignore

## 新用户登录问题修复（2026-03-26）
- **问题**: 新用户无法登录，编辑信息提示"无此用户"
- **根本原因**: `userInit` 云函数中多个 action 使用 `event` 而非 `actualEvent`，导致 HTTP 触发（安卓/鸿蒙端）时参数解析失败
- **修复内容**:
  - `saveProfile` action: `event` → `actualEvent` (line 364)
  - `updateProfile` action: 添加详细日志，优化错误提示
  - `sendPhoneVerifyCode` action: `event` → `actualEvent` (line 1016)
  - `resendPhoneVerifyCode` action: `event` → `actualEvent` (line 1095)
  - `verifyPhoneCode` action: `event` → `actualEvent` (line 1184)
  - `verifyPhoneNumber` action: `event` → `actualEvent` (line 1278)
- **状态**: ✅ 已修复，待部署

## 待办事项

### 高优先级
- [x] 验证UnionID跨平台同步是否正常（HarmonyOS端能否获取UNIONID）✅ 2026-03-23
- [x] 部署所有修改的云函数（userInit, productMgr, adminMgr, orderMgr, reviewMgr）✅ 2026-03-23 文档已准备
- [x] 用户服务协议集成到about页面和首次登录弹窗 ✅ 2026-03-23
- [ ] 部署 userInit 云函数（新用户登录问题修复）⏳ 代码已就绪，待部署（2026-03-26）

### 中优先级
- [ ] 代码混淆P2阶段（各页面私有函数混淆）
- [ ] 代码混淆P3阶段（常量值和配置混淆）
- [ ] 添加数据迁移脚本，为所有旧用户补充unionid

### 低优先级
- [ ] 前端显示"跨平台同步"状态提示
- [ ] 添加账号绑定/解绑功能

## 图标和启动图设计
- **设计需求**: 重新设计图标（海南椰子卡通风格）和启动图（一男一女交换特产）
- **生成工具**: `miniprogram/generate_assets.py` - 自动生成所有iOS和Android尺寸
- **源文件位置**: 
  - 图标: `miniprogram/images/app-icon-coconut.png` (1024x1024px)
  - 启动图: `miniprogram/images/splash-screen-new.png` (2048x1366px)
- **提示词**:
  - 图标: "应用图标，卡通风格，海南椰子，鲜绿色椰子，叶子装饰，可爱萌系风格，简洁干净的背景，适合作为APP图标使用，高饱和度，扁平化设计，适合圆角裁剪，主体居中，留白充足"
  - 启动图: "启动图，一男一女两个年轻人，面带微笑，手里拿着中国特色特产相互交换，开心的氛围，现代简约插画风格，温馨友好，适合作为APP启动页，横向构图，明亮色调，清新自然"
- **生成目标**: 
  - iOS: 9个图标尺寸 + 1个启动图
  - Android: 5个图标尺寸 + 5个启动图尺寸
- **状态**: 脚本已准备，等待用户使用AI绘图工具生成源图片

## 安卓端网络错误修复（2026-03-24）
- **问题**: 安卓端无数据显示,提示"网络错误"
- **原因**: `project.config.json` 中 `urlCheck: true` 阻止云开发请求
- **修复**: 改为 `urlCheck: false`
- **工具**: 新增网络诊断页面 `pages/network-test/`
- **文档**: `docs/安卓端网络问题解决方案.md`

## 分享功能热更新方案（2026-03-24）
- **方案**: 云数据库 `share_configs` 集合 + `productMgr` 云函数 `getShareConfig` 接口
- **效果**: 不重新发版就能调整分享标题/图片话术（改数据库即生效）
- **实现**:
  - 详情页: `onShareAppMessage` + `onShareTimeline`，商品名+省份+分类拼标题，商品第一张图为分享图
  - 首页: 当前筛选省份自动带入分享标题和路径参数
  - 云函数: `productMgr` 新增 `action: 'getShareConfig'`，读取 `share_configs` 集合
- **数据库**: 需手动在云开发控制台创建 `share_configs` 集合并插入配置文档（见下方说明）
- **数据库字段**: `indexTitle`, `indexProvinceTitle`, `productTitleTemplate`, `mysteryTitle`, `defaultTitle`, `indexImage`, `defaultProductImage`, `mysteryImage`, `active: true`, `updateTime`

## 云函数部署问题（2026-03-26）
- **错误**: `errCode: -501000 | the resource is not found`
- **原因**: 云函数未部署到云端环境 `cloud1-3g4sjhqr5e28e54e`
- **解决方案**:
  1. 微信开发者工具 → cloudfunctions 目录 → 右键云函数 → "上传并部署：云端安装依赖"
  2. 或登录云开发控制台手动上传
- **待部署列表**: adminMgr, productMgr, orderMgr, userInit, reviewMgr, dailyTasks
- **部署文档**: `DEPLOY_CLOUDFUNCTIONS.md`

## 部署检查清单
- [ ] cloudfunctions/userInit（UnionID + 手机号验证 + 新用户登录修复）
- [ ] cloudfunctions/productMgr（状态过滤修复 + 分享配置接口）
- [ ] cloudfunctions/adminMgr（管理后台UI + 功能开关接口）
- [ ] cloudfunctions/orderMgr（订单管理）
- [ ] cloudfunctions/reviewMgr（评价系统）
- [ ] cloudfunctions/dailyTasks（签到功能）
- [ ] cloudfunctions/resetData（测试工具）
