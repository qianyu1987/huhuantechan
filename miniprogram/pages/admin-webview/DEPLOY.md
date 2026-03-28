# admin-panel.html 接入真实数据部署指南

## 架构说明

```
管理员 → 小程序 admin 页面 → 点击"完整后台"
         ↓
     pages/admin-webview/index.js
         ↓ 调云函数（wx.cloud.callFunction）
     adminMgr 云函数返回数据
         ↓ 数据 JSON → URL hash 编码
     web-view 加载 admin-panel.html#data
         ↓
     HTML 读取 URL hash → injectRealData()
```

## 部署步骤

### 第一步：上传 admin-panel.html 到云存储

1. 打开微信开发者工具 → 云开发控制台
2. 进入「存储」菜单
3. 点击「上传文件」，选择：
   ```
   c:\Users\31849\AppData\Roaming\WorkBuddy\User\globalStorage\tencent-cloud.coding-copilot\brain\0d8c4adf82454db0a75b44851b378fa0\admin-panel.html
   ```
4. 上传路径填：`admin-panel.html`
5. 上传完成后，文件 ID 格式为：
   ```
   cloud://cloud1-3g4sjhqr5e28e54e.636c-cloud1-3g4sjhqr5e28e54e-APPID/admin-panel.html
   ```

### 第二步：更新 admin-webview/index.js 中的文件 ID

打开 `pages/admin-webview/index.js`，将第 6 行的 `ADMIN_PANEL_FILE_ID` 替换为实际文件 ID：

```js
// 从云开发控制台 → 存储 → 点击文件 → 复制"文件 ID"
const ADMIN_PANEL_FILE_ID = 'cloud://你的实际文件ID'
```

### 第三步：开启云开发「未登录」访问（可选）

如果需要 admin-panel.html 内嵌的 cloudbase.js 自动拉取数据（双重保险），则：

1. 云开发控制台 → 设置 → 安全配置
2. 开启「未登录访问」

> 注意：如果不开启，admin-panel.html 内置的 SDK 会 fallback 失败，但没关系，数据已经由 web-view 容器页通过 URL hash 传入。

### 第四步：配置云存储文件权限

1. 云开发控制台 → 存储 → 点击 `admin-panel.html`
2. 权限设置 → 改为「所有用户可读」（这样 web-view 才能加载）

## 数据流说明

| 数据模块 | 云函数接口 | 状态 |
|----------|-----------|------|
| KPI 看板 | `adminMgr/getStats` | ✅ |
| 省份排行/品类/漏斗 | `adminMgr/getDashboardData` | ✅ |
| 用户列表 | `adminMgr/getUsers` | ✅ |
| 特产列表 | `adminMgr/getProducts` | ✅ |
| 待审核列表 | `adminMgr/getPendingProducts` | ✅ |
| 订单列表 | `adminMgr/getOrders` | ✅ |
| 积分/信用排行 | 待 adminMgr 完善 | 🔄 |

## 进阶：数据刷新

目前 web-view 页面仅在首次加载时拉数据（因 URL 不变则 webview 不重载）。  
如需手动刷新，建议在 HTML 内点击刷新按钮时通过 `wx.miniProgram.postMessage` 通知小程序重新拉数据，再 `navigateTo` 重新进入页面。

或者升级为：HTML 内自带的 `cloudbase.js` SDK 直接调接口（已集成，需开启未登录访问）。
