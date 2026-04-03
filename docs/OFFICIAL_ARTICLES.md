# 公众号文章同步说明

## 当前方案

目前使用**示例文章**作为演示数据。要从真实公众号拉取文章，有以下几种方案：

## 方案一：微信公众号 API（推荐）

需要公众号管理员权限，获取 `access_token` 后调用微信接口。

### 步骤：
1. 登录[微信公众平台](https://mp.weixin.qq.com)
2. 进入"开发"-"基本配置"获取 AppID 和 AppSecret
3. 在云函数中配置：

```javascript
const OFFICIAL_ACCOUNT = {
  ghId: '你的公众号原始ID',
  appId: '你的AppID',
  appSecret: '你的AppSecret',
  name: '公众号名称'
}
```

4. 调用微信 API 获取文章列表：

```javascript
// 获取 access_token
const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`

// 获取素材列表
const mediaUrl = `https://api.weixin.qq.com/cgi-bin/material/batchget_material?access_token=${access_token}`
```

## 方案二：手动添加（简单）

在小程序管理后台手动添加文章：

1. 进入"文章管理"页面
2. 点击"添加文章"
3. 填写标题、摘要、封面、内容
4. 保存后即可在文章列表中显示

## 方案三：RSS 订阅（自动化）

如果公众号有 RSS 订阅源，可以定时抓取：

1. 使用第三方 RSS 服务（如 Feeddd）获取公众号 RSS
2. 云函数定时触发，解析 RSS 内容
3. 自动同步到数据库

## 部署步骤

### 1. 部署云函数

```bash
# 在微信开发者工具中
# 1. 右键 cloudfunctions/syncOfficialArticles 文件夹
# 2. 选择"创建并部署：云端安装依赖"
```

### 2. 创建数据库集合

```javascript
// 在云开发控制台 - 数据库中创建集合：official_articles
// 添加索引：
// - publishTime（降序）
// - isTop（降序）
// - viewCount（降序）
```

### 3. 同步文章

```javascript
// 在小程序中调用
wx.cloud.callFunction({
  name: 'syncOfficialArticles',
  data: { action: 'sync' }
}).then(res => {
  console.log(res.result.message)
})
```

### 4. 设置定时触发（可选）

```json
// 在 cloudfunctions/syncOfficialArticles/config.json 中添加
{
  "triggers": [
    {
      "name": "syncArticles",
      "type": "timer",
      "config": "0 0 9 * * * *"
    }
  ]
}
```

## 数据结构

```javascript
{
  _id: '文章ID',
  title: '文章标题',
  summary: '文章摘要',
  coverUrl: '封面图片URL',
  content: '文章内容（HTML或纯文本）',
  sourceUrl: '原文链接',
  officialAccount: {
    ghId: '公众号原始ID',
    appId: '公众号AppID',
    name: '公众号名称'
  },
  publishTime: '发布时间',
  createTime: '创建时间',
  updateTime: '更新时间',
  viewCount: 0,
  isTop: false
}
```

## 注意事项

1. **版权问题**：确保有权限使用公众号内容
2. **图片存储**：建议使用云存储保存文章图片
3. **内容审核**：添加敏感词过滤，避免违规内容
4. **频率限制**：微信 API 有调用频率限制，注意控制

## 下一步

1. 部署云函数
2. 创建数据库集合
3. 同步示例文章
4. 根据需要接入真实公众号 API
