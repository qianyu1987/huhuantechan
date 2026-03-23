# 特产互换小程序 - 长期记忆

## 项目路径
- 工作区: `c:\Users\31849\WorkBuddy\20260320155547\specialty-swap\miniprogram`
- 云函数: `c:\Users\31849\WorkBuddy\20260320155547\specialty-swap\cloudfunctions`

## 核心修复记录

### 用户系统
- **头像403问题**: 前端改为先上传云存储，云函数不再转换cloud://链接，用_id精准定位更新（2026-03-23）
- **UnionID跨平台**: 新增unionid字段，优先级UNIONID>_openid>openid，实现微信小程序与HarmonyOS数据同步（2026-03-23）
- **手机号验证**: 集成阿里云短信API，组件路径`components/phone-verify/`，云函数新增sendPhoneVerifyCode/verifyPhoneCode（2026-03-23）

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

## 待办事项

### 高优先级
- [ ] 验证UnionID跨平台同步是否正常（HarmonyOS端能否获取UNIONID，数据是否完全同步）
- [ ] 部署所有修改的云函数（userInit, productMgr, adminMgr, orderMgr, reviewMgr）
- [ ] 用户服务协议集成到about页面和首次登录弹窗

### 中优先级
- [ ] 代码混淆P2阶段（各页面私有函数混淆）
- [ ] 代码混淆P3阶段（常量值和配置混淆）
- [ ] 添加数据迁移脚本，为所有旧用户补充unionid

### 低优先级
- [ ] 前端显示"跨平台同步"状态提示
- [ ] 添加账号绑定/解绑功能

## 部署检查清单
- [ ] cloudfunctions/userInit（UnionID + 手机号验证）
- [ ] cloudfunctions/productMgr（状态过滤修复）
- [ ] cloudfunctions/adminMgr（管理后台UI）
- [ ] cloudfunctions/orderMgr（订单管理）
- [ ] cloudfunctions/reviewMgr（评价系统）
- [ ] cloudfunctions/resetData（测试工具）
