# 云开发 HTTP API 配置指南

## 问题背景
多端开发生成的 Android APK 无法使用微信云开发 SDK，需要通过 HTTP API 访问云函数。

## 已完成的代码修改
`miniprogram/utils/util.js` 中的 `callCloud` 函数已支持：
- 微信小程序环境：使用 `wx.cloud.callFunction`
- APK/其他环境：使用 HTTP API 请求

HTTP API 基础 URL：`https://cloud1-3g4sjhqr5e28e54e.service.tcloudbase.com`

---

## 需要在云开发控制台操作

### 步骤 1：开启 HTTP 访问服务
1. 打开微信开发者工具
2. 点击「云开发」→「设置」→「环境设置」
3. 找到「HTTP 访问服务」→ 开启

### 步骤 2：为每个云函数创建 HTTP 路由
在「云开发」→「云函数」中，为以下云函数开启 HTTP 访问：

| 云函数名 | HTTP 路径 |
|---------|----------|
| userInit | /userInit |
| productMgr | /productMgr |
| orderMgr | /orderMgr |
| adminMgr | /adminMgr |
| migrateOpenid | /migrateOpenid |

**操作步骤：**
1. 点击云函数名 → 「函数配置」
2. 找到「HTTP 触发」或「HTTP 访问」
3. 点击「新建触发器」或「开启」
4. 路径填写：`/云函数名`
5. 方法选择：POST

### 步骤 3：配置权限（重要）
HTTP 访问默认需要鉴权，有两种方式：

**方式 A：允许匿名访问（简单但有安全风险）**
- 在云函数配置中勾选「允许未登录用户访问」

**方式 B：使用自定义鉴权（推荐）**
- 在云函数中验证请求头的 token
- APK 端登录后获取 token 并携带

---

## 云函数 HTTP 触发示例

修改云函数入口，支持 HTTP 请求：

```javascript
// cloudfunctions/userInit/index.js
exports.main = async (event, context) => {
  // HTTP 触发时，event 结构不同
  // 需要从 event.body 解析数据
  
  let action, data
  if (event.httpMethod) {
    // HTTP 触发
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body
    action = body.action
    data = body
  } else {
    // 云函数调用
    action = event.action
    data = event
  }
  
  // 原有逻辑...
}
```

---

## 验证 HTTP API 是否生效

使用 curl 或 Postman 测试：

```bash
curl -X POST https://cloud1-3g4sjhqr5e28e54e.service.tcloudbase.com/userInit \
  -H "Content-Type: application/json" \
  -d '{"action":"init"}'
```

如果返回用户数据，说明配置成功。

---

## 注意事项
1. HTTP API 有调用频率限制（免费版 1000次/天）
2. 建议生产环境使用自定义域名
3. 敏感操作需要鉴权，不要完全开放匿名访问