# 数据库索引优化配置

## 概述

本文档记录了小程序数据库的索引配置，用于优化查询性能。在云开发控制台中配置。

---

## users 用户集合

### 必需索引

| 索引名称 | 字段 | 类型 | 说明 |
|---------|------|------|------|
| idx_openid | `_openid` | ASC | 用户主键查询（默认已创建） |
| idx_createtime | `createTime` | DESC | 按创建时间排序 |
| idx_nickname | `nickName` | TEXT | 用户昵称搜索 |

### 推荐索引

| 索引名称 | 字段 | 类型 | 说明 |
|---------|------|------|------|
| idx_createtime_points | `createTime` DESC, `points` DESC | 复合 | 积分排行榜 |
| idx_credit | `creditScore` | DESC | 信用分排序 |
| idx_createtime_credit | `createTime` DESC, `creditScore` DESC | 复合 | 新用户+高信用 |

---

## products 特产集合

### 必需索引

| 索引名称 | 字段 | 类型 | 说明 |
|---------|------|------|------|
| idx_openid | `openid` | ASC | 我的特产查询 |
| idx_createtime | `createTime` | DESC | 按发布时间排序 |
| idx_status | `status` | ASC | 按状态筛选 |

### 推荐索引

| 索引名称 | 字段 | 类型 | 说明 |
|---------|------|------|------|
| idx_category_status | `category` ASC, `status` ASC | 复合 | 分类+状态筛选 |
| idx_category_createtime | `category` ASC, `createTime` DESC | 复合 | 分类+时间排序 |
| idx_province | `province` | ASC | 省份筛选（集章功能） |
| idx_hot | `viewCount` DESC, `createTime` DESC | 复合 | 热门特产排行 |

---

## swapOrders 互换订单集合

### 必需索引

| 索引名称 | 字段 | 类型 | 说明 |
|---------|------|------|------|
| idx_initiator | `initiatorOpenid` | ASC | 我发起的订单 |
| idx_receiver | `receiverOpenid` | ASC | 我接收的订单 |
| idx_status | `status` | ASC | 按状态筛选 |
| idx_createtime | `createTime` | DESC | 按创建时间排序 |

### 推荐索引

| 索引名称 | 字段 | 类型 | 说明 |
|---------|------|------|------|
| idx_status_createtime | `status` ASC, `createTime` DESC | 复合 | 状态+时间排序 |
| idx_updatetime | `updateTime` | DESC | 最近更新订单 |
| idx_disputetime | `disputeTime` | DESC | 纠纷订单查询 |

---

## daigouOrders 代购订单集合

### 必需索引

| 索引名称 | 字段 | 类型 | 说明 |
|---------|------|------|------|
| idx_buyer | `buyerOpenid` | ASC | 我的代购（买家视角） |
| idx_seller | `sellerOpenid` | ASC | 我的代购（卖家视角） |
| idx_status | `status` | ASC | 按状态筛选 |
| idx_createtime | `createTime` | DESC | 按创建时间排序 |

### 推荐索引

| 索引名称 | 字段 | 类型 | 说明 |
|---------|------|------|------|
| idx_status_createtime | `status` ASC, `createTime` DESC | 复合 | 状态+时间排序 |
| idx_shiptime | `shipTime` | DESC | 发货时间（自动确认用） |

---

## points_log 积分日志集合

### 必需索引

| 索引名称 | 字段 | 类型 | 说明 |
|---------|------|------|------|
| idx_openid | `_openid` | ASC | 我的积分记录 |
| idx_createtime | `createTime` | DESC | 按时间排序 |
| idx_type | `type` | ASC | 按类型筛选 |

### 推荐索引

| 索引名称 | 字段 | 类型 | 说明 |
|---------|------|------|------|
| idx_openid_createtime | `_openid` ASC, `createTime` DESC | 复合 | 我的积分记录+时间 |
| idx_openid_type | `_openid` ASC, `type` ASC | 复合 | 我的某种类型积分 |

---

## reviews 评价集合

### 必需索引

| 索引名称 | 字段 | 类型 | 说明 |
|---------|------|------|------|
| idx_orderid | `orderId` | ASC | 订单关联评价 |
| idx_reviewer | `reviewerOpenid` | ASC | 我的评价 |
| idx_reviewee | `revieweeOpenid` | ASC | 收到的评价 |
| idx_createtime | `createTime` | DESC | 按时间排序 |

---

## admin_log 管理日志集合

### 必需索引

| 索引名称 | 字段 | 类型 | 说明 |
|---------|------|------|------|
| idx_openid | `openid` | ASC | 管理员操作日志 |
| idx_createtime | `createTime` | DESC | 按时间排序 |
| idx_action | `action` | ASC | 按操作类型筛选 |

---

## action_logs 行为日志集合

### 推荐索引

| 索引名称 | 字段 | 类型 | 说明 |
|---------|------|------|------|
| idx_openid | `openid` | ASC | 用户行为日志 |
| idx_createtime | `createTime` | DESC | 按时间排序 |
| idx_actiontype | `actionType` | ASC | 按行为类型筛选 |

---

## system_locks 系统锁集合（dailyTasks用）

| 索引名称 | 字段 | 类型 | 说明 |
|---------|------|------|------|
| idx_lockname | `lockName` | ASC | 锁名称 |
| idx_expiretime | `expireTime` | ASC | 过期时间 |

---

## 配置方法

### 云开发控制台配置

1. 登录 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/console.html)
2. 进入「云开发」→ 「数据库」
3. 选择对应集合
4. 点击「索引管理」
5. 点击「新建索引」
6. 选择字段、索引类型
7. 点击「确认」

### CLI 配置（可选）

使用云开发 CLI 工具批量配置：

```bash
# 安装
npm install -g @cloudbase/cli

# 登录
tcb login

# 导出当前索引配置
tcb db index list -e your-env-id -c products

# 导入索引配置
tcb db index create -e your-env-id -c products -f indexes.json
```

---

## 注意事项

1. **复合索引顺序很重要**：复合索引 `(a, b)` 只能命中 `a` 或 `a+b` 的查询，不能单独命中 `b`
2. **避免过多索引**：每个索引都会影响写入性能，只创建必要的索引
3. **监控慢查询**：部署后关注云函数日志中的慢查询
4. **定期检查**：根据实际使用情况调整索引

---

## 性能测试

配置索引后，建议在云开发控制台「云函数日志」中查看：

- 查询是否使用了索引（日志中会显示）
- 响应时间是否明显改善
- 是否出现新的性能问题
