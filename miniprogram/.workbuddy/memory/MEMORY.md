# 互换特产 - 长期记忆

> **小程序正式名称：互换特产**

## 项目路径
- 前端: `c:\Users\31849\WorkBuddy\20260320155547\specialty-swap\miniprogram`
- 云函数: `c:\Users\31849\WorkBuddy\20260320155547\specialty-swap\cloudfunctions`
- 云环境ID: `cloud1-3g4sjhqr5e28e54e`

---

## 技术栈 & 架构
- 微信小程序 + 云开发（CloudBase）+ HarmonyOS 多端支持
- 云函数：userInit / productMgr / adminMgr / orderMgr / reviewMgr / dailyTasks / resetData
- 数据库集合：users / products / swapOrders / reviews / system_config / share_configs
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

---

## 性能优化（2026-03-27）
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
- [ ] 代购特产 P1：接入微信支付（paymentMgr 新云函数）
- [ ] 代购特产 P2：管理后台代购模块（adminMgr 扩展）
- [ ] 代码混淆P2/P3阶段
- [ ] 积分充值（微信支付，新建 paymentMgr 云函数）
- [ ] 纠纷仲裁（新建 disputes 集合，orderMgr+adminMgr 扩展）
- [ ] 订单状态服务通知推送（common/notifyHelper）
- [ ] 订单超时机制（dailyTasks 每2h检测，confirmed→72h取消）
- [ ] 邀请裂变（userInit 已有骨架，完善闭环+前端页面）
- [ ] 心愿单（新建 wishlistMgr 云函数 + wishlists 集合）
- [ ] 信用分机制完善（common/creditHelper + 等级体系 S/A/B/C/D/E）

### 低优先级
- [ ] 旧用户补充unionid迁移脚本
- [ ] 账号绑定/解绑功能
- [ ] 用户服务协议集成到about页面

---

## 图标设计
- 图标提示词：海南椰子卡通风格，1024×1024px
- 启动图提示词：一男一女交换特产，2048×1366px
- 生成脚本：`miniprogram/generate_assets.py`
