# 举报系统设计文档

## 一、举报类型

### 1. 商品举报
| 类型代码 | 类型名称 | 说明 |
|---------|---------|------|
| product_fake | 虚假商品 | 商品信息与实际不符 |
| product_prohibited | 违禁品 | 售卖违禁物品 |
| product_infringement | 侵权 | 侵犯知识产权 |
| product_fraud | 诈骗 | 涉嫌诈骗行为 |
| product_quality | 质量问题 | 商品质量低劣 |
| product_other | 其他 | 其他商品问题 |

### 2. 用户举报
| 类型代码 | 类型名称 | 说明 |
|---------|---------|------|
| user_harassment | 骚扰 | 骚扰其他用户 |
| user_fraud | 诈骗 | 涉嫌诈骗 |
| user_fake | 虚假信息 | 使用虚假身份 |
| user_inappropriate | 不当言行 | 发布不当内容 |
| user_cheating | 作弊 | 利用系统漏洞 |
| user_other | 其他 | 其他用户问题 |

## 二、举报流程

```
用户点击举报按钮
    ↓
选择举报类型
    ↓
填写举报描述（必填）
    ↓
上传凭证图片（选填，最多3张）
    ↓
提交举报
    ↓
系统通知被举报方
    ↓
管理员审核
    ↓
处理结果（成立/不成立）
```

## 三、处罚机制

### 1. 举报成立 - 商品举报
| 违规程度 | 处罚措施 |
|---------|---------|
| 轻微 | 警告，商品下架 |
| 一般 | 商品下架，扣除10积分，扣除5信用分 |
| 严重 | 商品下架，扣除50积分，扣除20信用分，扣除10%押金 |
| 极其严重 | 永久封号，扣除全部押金 |

### 2. 举报成立 - 用户举报
| 违规程度 | 处罚措施 |
|---------|---------|
| 轻微 | 警告 |
| 一般 | 扣除20积分，扣除10信用分 |
| 严重 | 扣除100积分，扣除50信用分，扣除30%押金，限制功能7天 |
| 极其严重 | 永久封号，扣除全部押金 |

### 3. 信用分规则
- 初始信用分：100分
- 60分以下：限制发布商品
- 40分以下：限制互换功能
- 20分以下：限制提现
- 0分：永久封号

### 4. 积分规则
- 积分可用于平台特权
- 积分不足时无法使用某些功能

## 四、数据库设计

### 集合：reports
```javascript
{
  _id: String,           // 举报ID
  type: String,          // 举报类型：product/user
  targetId: String,      // 被举报对象ID（商品ID或用户ID）
  targetType: String,    // 具体举报类型代码
  reporterId: String,    // 举报人ID
  description: String,   // 举报描述
  images: Array,         // 凭证图片URL数组
  status: String,        // 状态：pending/processing/resolved/rejected
  result: String,        // 处理结果
  punishment: Object,    // 处罚信息
  handlerId: String,     // 处理人ID
  createTime: Date,      // 创建时间
  updateTime: Date,      // 更新时间
  handleTime: Date       // 处理时间
}
```

### 集合：report_punishments（处罚记录）
```javascript
{
  _id: String,
  reportId: String,      // 关联举报ID
  userId: String,        // 被处罚用户ID
  type: String,          // 处罚类型
  severity: String,      // 严重程度
  points: Number,        // 扣除积分
  credit: Number,        // 扣除信用分
  deposit: Number,       // 扣除押金金额
  productId: String,     // 下架商品ID（如果有）
  banDays: Number,       // 封号天数（0为永久）
  reason: String,        // 处罚原因
  createTime: Date
}
```

## 五、页面设计

### 1. 举报按钮位置
- 商品详情页右上角
- 用户资料页右上角
- 按钮样式：小图标 + "举报"文字

### 2. 举报提交页
- 标题：举报商品/用户
- 被举报对象信息展示
- 举报类型选择（单选）
- 详细描述输入框
- 图片上传（最多3张）
- 提交按钮

### 3. 管理后台 - 举报管理
- Tab：全部/待处理/处理中/已处理/已驳回
- 列表展示：举报人、被举报人、类型、时间、状态
- 详情页：完整信息 + 处理操作
- 处理操作：
  - 选择严重程度
  - 选择处罚措施
  - 填写处理说明
  - 确认/驳回

## 六、API接口

### 前端接口
- `POST /submitReport` - 提交举报
- `GET /getMyReports` - 获取我的举报记录
- `GET /getReportDetail` - 获取举报详情

### 管理后台接口
- `GET /admin/getReports` - 获取举报列表
- `POST /admin/handleReport` - 处理举报
- `GET /admin/getPunishmentRules` - 获取处罚规则

## 七、安全机制

1. **防刷机制**：同一用户24小时内最多举报5次
2. **防恶意举报**：举报不成立3次以上，限制举报功能
3. **证据保全**：所有举报凭证永久保存
4. **申诉机制**：被处罚用户可申诉
