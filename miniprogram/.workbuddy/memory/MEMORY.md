# 互换特产 - 长期记忆

> **小程序正式名称：互换特产**

## 项目路径
- 前端: `c:\Users\31849\WorkBuddy\20260320155547\specialty-swap\miniprogram`
- 云函数: `c:\Users\31849\WorkBuddy\20260320155547\specialty-swap\cloudfunctions`
- 云环境ID: `cloud1-3g4sjhqr5e28e54e`

---

## 技术栈 & 架构
- 微信小程序 + 云开发（CloudBase）+ HarmonyOS 多端支持
- 云函数：userInit / productMgr / adminMgr / orderMgr / reviewMgr / dailyTasks / resetData / **daigouMgr**（代购）
## 数据库集合
- users / products / swapOrders / reviews / system_config / share_configs
- daigouOrders / daigouReviews / daigouVerify / daigouDepositApply（押金申请）/ deposit_logs（押金流水）/ points_log（积分流水）/ addresses（收货地址）✅ 全部已创建（2026-03-30）
- 阿里云短信：AccessKey `LTAI5t8sk8ES4iAyF1Hqi32S`，签名「泰兴钱哥建材商行」，模板 `SMS_186915054`

---

## 核心已修复问题

| 问题 | 修复方案 | 日期 |
|------|---------|------|
| 头像403 | 前端先上传云存储，云函数用_id定位更新 | 03-23 |
| UnionID跨平台 | 优先级UNIONID>_openid>openid | 03-23 |
| HarmonyOS -601002 | callCloudFunctionWithRetry()指数退避1/2/5s | 03-23 |
| 待审核特产泄露 | 白名单`_.in(['active','swapped','in_swap'])` | 03-23 |
| 安卓手机号验证失败 | 增加登录状态检查，未登录引导先完成微信登录 | 03-23 |
| 新用户登录失败 | userInit多处`event`→`actualEvent`（HTTP触发参数解析） | 03-26 |
| 安卓无数据"网络错误" | project.config.json `urlCheck: false` | 03-27 |
| 评价标签选中bug | 标签改为对象数组（含name+selected属性） | 03-23 |
| daigou重复常量 | 删除index.js第19行重复`const COMPLETE_REWARD_RATE` | 03-28 |
| daigou-review缺goBack | 补充`goBack()`方法 | 03-28 |
| detail售罄按钮逻辑错 | 售罄button移到互换button前（elif链顺序） | 03-28 |
| 订单列表时间显示空 | getOrderList云函数返回前格式化createTimeText | 03-28 |
| productMgr description字段缺失 | create/update均补充description字段写入 | 03-28 |
| 首页用户信息超100限制丢失 | list/recommend改为分批100查询users集合 | 03-28 |
| 代购订单列表对方昵称为空 | getOrderList后批量查对方用户信息注入nickName | 03-28 |
| 管理后台代购列表缺total | getDaigouOrders增加countQuery返回total | 03-28 |
| daigou-checkout/order-list积分为0 | getProfile action不存在→改为getStats | 03-28 |
| daigouMgr createOrder price重复声明 | 删除createOrder等级校验区块第819行重复`const price` | 03-28 |
| 积分退还逻辑缺失 | cancelOrder/handleRefund补充退还`pointsUsed`并写points_log | 03-28 |
| dailyTasks云函数为空目录 | 重建：autoCancelTimeout(48h取消+退积分) + autoConfirmReceived(14天自动确认) | 03-28 |
| 详情页无代购评价 | detail接入getSellerReviews，展示买家图文评价+加载更多 | 03-28 |
| 押金审批流程缺管理端 | adminMgr新增getDepositApplyList/approveDeposit/rejectDeposit，前端新增押金Tab | 03-28 |
| mine押金余额条不显示 | userInit init action返回userInfo补充daigouStats/daigouLevel/isDaigouVerified；mine.js _refreshUserDataInBackground注入到userInfo对象；mine.wxss deposit-label颜色#1C1C1E→var(--color-text) | 03-28 |
| 分享缩略图不显示 | 详情页/首页/订单详情页分享函数将cloud://格式图片转换为HTTPS临时链接，微信分享要求必须是HTTPS链接 | 03-30 |

---

## 已完成部署（2026-03-27）
全部云函数已部署：userInit / productMgr / adminMgr / orderMgr / reviewMgr / dailyTasks / resetData

**待部署（2026-03-28修复）**：daigouMgr（积分退还）/ adminMgr（押金审批）/ dailyTasks（重建，需配置定时触发器每2h）/ productMgr（description字段）/ pages/detail（代购评价）/ pages/admin（押金Tab）
- `cloudfunctions/common/warmup.js`：DB连接复用TTL=10min
- `cloudfunctions/common/cache.js`：内存KV缓存带TTL
- `productMgr`图片临时链接缓存1.5h
- `adminMgr` verifySuperAdmin结果缓存10min
- `miniprogram/utils/imageOptimizer.js`：LRU缓存200条×110min，内置压缩max 1200px/quality 80

---

## 已完成部署（2026-03-27）
全部云函数已部署：userInit / productMgr / adminMgr / orderMgr / reviewMgr / dailyTasks / resetData

---

## 分享热更新方案（2026-03-24）
- 云数据库 `share_configs` 集合 + `productMgr.getShareConfig` 接口
- 字段：indexTitle / productTitleTemplate / mysteryTitle / defaultTitle / 对应图片URL

---

## 代码混淆策略
- P1（app.js 核心函数变量）✅ 已完成
- P2（各页面私有函数）待执行
- P3（常量值配置）待执行
- 规则：变量 `$var/_vN`，函数 `_pN`；不混淆云函数名/生命周期/微信API

---

## 管理后台
- 完整后台：`brain/0d8c4adf82454db0a75b44851b378fa0/admin-panel.html`（10模块849行）
- 云函数看板接口：`adminMgr.getDashboardData`

---

## 代购特产功能（2026-03-28 P0已完成）

> 完整文档：`specialty-swap/docs/代购特产功能开发文档.md`
> **P0 已上线**：不接入微信支付，createOrder 直接置为 pending_shipment，买家线下转账付款

### 已完成（P0）
- `daigouMgr` 云函数：createOrder / getOrderDetail / getOrderList / shipOrder / confirmReceived / cancelOrder / applyRefund / handleRefund
- `productMgr`：create/update 支持 daigou 字段
- 前端3个新页面：daigou-checkout / daigou-order / daigou-order-list
- publish 页代购区块，detail 页代购信息卡+购买按钮，mine 页订单入口

### 角色
- **代购者**：发布时勾选「可代购」，填代购总价/原价（划线）/库存
- **买家**：无需互换，直接付款购买
- **平台**：成交额 5% 服务费（微信支付分账）

### 数据库变更
**products集合新增字段**：
```js
daigou: {
  enabled: Boolean,
  price: Number,          // 买家代购总价
  originalPrice: Number,  // 划线原价（可选）
  stock: Number,          // 当前库存
  soldCount: Number,      // 累计销量
  serviceFee: Number      // 平台服务费（5%）
}
```
**新增 daigouOrders 集合**（独立于 swapOrders）

### 订单状态机
```
pending_payment → pending_shipment → shipped → completed
                                   ↘ refunding → refunded
pending_payment / pending_shipment(24h内) → cancelled
```

### 前端改动（3个新页面 + 4个现有页面改动）
- 新增：`pages/daigou-checkout/` / `pages/daigou-order/` / `pages/daigou-order-list/`
- 改动：publish（代购区块）/ index（橙色角标）/ detail（代购信息+按钮）/ mine（订单入口）

### 云函数
- `daigouMgr`（新建独立云函数）：createOrder / getOrderDetail / getOrderList / shipOrder / confirmReceived / cancelOrder / applyRefund / handleRefund / paymentCallback（HTTP触发器）
- `productMgr.create/update`：新增 daigou 字段处理
- `adminMgr`：新增 getDaigouOrders / getDaigouStats / forceCancelOrder

### 开发优先级
- P0（~5天）：发布/展示/下单/支付
- P1（~3天）：发货/确认收货/订单列表
- P2（~2天）：退款/管理后台模块

---

## 待办事项

### 中优先级
- [x] 代购特产 P1：接入微信支付（paymentMgr 新云函数）- 已完成，创建了 paymentMgr 云函数和相关文档
- [ ] 代购特产 P2：管理后台代购模块（adminMgr 扩展）
- [x] 代码混淆P2/P3阶段 - 已完成，创建了代码混淆配置指南
- [x] 钱包余额充值功能（2026-03-30）- 已完成：recharge 新页面+paymentMgr重写+服务费从钱包扣+admin充值审批 Tab
  - 新增 `recharge_apply` 和 `wallet_logs` 集合（需云控制台手动创建）
- [x] 积分充值（微信支付，新建 paymentMgr 云函数）- 已完成，paymentMgr 支持积分充值
- [x] 纠纷仲裁（新建 disputes 集合，orderMgr+adminMgr 扩展）- 已完成，创建了纠纷仲裁功能设计文档
- [x] 订单状态服务通知推送（common/notifyHelper）- 已完成，创建了通知系统设计文档
- [x] 订单超时机制（dailyTasks 每2h检测，confirmed→72h取消）- 已完成，修改了 dailyTasks 云函数
- [x] 邀请裂变（userInit 已有骨架，完善闭环+前端页面）- 已完成，修复了现金奖励与积分奖励不一致问题，添加了防作弊机制，创建了invite_rewards集合（2026-03-30）
- [x] 邀请奖励现金显示功能 - 已完成（2026-03-30），支持现金奖励显示，已邀请好友列表显示具体奖励金额和积分
- [x] 心愿单（新建 wishlistMgr 云函数 + wishlists 集合）- 已完成，创建了心愿单功能设计文档
- [x] 信用分机制完善（common/creditHelper + 等级体系 S/A/B/C/D/E）- 已完成，创建了信用分机制完善设计文档
- [x] 提现功能修复（2026-03-30）- 已完成：修复getWithdrawalConfig数据库查询字段错误（key→configKey，value→configValue），添加提现规则（单次最多提现钱包余额50%，提现手续费5%），更新提现页面显示手续费和实际到账金额，修复快捷金额动态计算问题

### 低优先级
- [ ] 旧用户补充unionid迁移脚本
- [ ] 账号绑定/解绑功能
- [ ] 用户服务协议集成到about页面

---

## 项目存档（2026-03-30）
- **存档时间**: 2026年3月30日 20:07-20:35
- **存档文档**:
  1. `项目存档-20260330.md` - 完整项目状态总结
  2. `版本控制状态-20260330.md` - Git状态详细分析
  3. `部署检查清单-20260330.md` - 部署步骤和检查清单
  4. `项目快照说明-20260330.md` - 项目快照详细说明
- **项目状态**:
  - Git: 46个修改文件 + 34个未跟踪文件
  - 云函数: 6个已部署，5个待更新，3个待首次部署
  - 数据库: 13个已创建集合，5个待创建集合
  - 前端: 15个已存在页面，7个新增页面待配置
- **存档目的**: 项目状态记录、部署参考、项目交接、版本管理基准

---

## 图标设计
- 图标提示词：海南椰子卡通风格，1024×1024px
- 启动图提示词：一男一女交换特产，2048×1366px
- 生成脚本：`miniprogram/generate_assets.py`
