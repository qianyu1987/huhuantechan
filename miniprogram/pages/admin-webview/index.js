// pages/admin-webview/index.js
// web-view 容器：加载运营管理后台 HTML，并通过 URL hash 注入真实云数据
// ✅ 修复：裁剪 payload 控制 hash 长度（≤4000字节），避免被截断

const app = getApp()

// ⚙️ 云存储中 admin-panel.html 的访问地址
const ADMIN_PANEL_FILE_ID = 'cloud://cloud1-3g4sjhqr5e28e54e.636c-cloud1-3g4sjhqr5e28e54e-1348466332/admin-panel.html'

Page({
  data: {
    webviewUrl: '',
    loading: true,
    errMsg: ''
  },

  async onLoad() {
    try {
      // 1. 获取 admin-panel.html 的临时访问 URL
      const { fileList } = await wx.cloud.getTempFileURL({
        fileList: [ADMIN_PANEL_FILE_ID]
      })
      const htmlUrl = fileList[0] && fileList[0].tempFileURL
      if (!htmlUrl) throw new Error('获取文件链接失败')

      // 2. 并行拉取真实数据
      const [statsRes, detailRes, usersRes, productsRes, pendingRes, ordersRes] =
        await Promise.allSettled([
          wx.cloud.callFunction({ name: 'adminMgr', data: { action: 'getStats' } }),
          wx.cloud.callFunction({ name: 'adminMgr', data: { action: 'getDashboardData' } }),
          wx.cloud.callFunction({ name: 'adminMgr', data: { action: 'getUsers',           page: 1, pageSize: 10 } }),
          wx.cloud.callFunction({ name: 'adminMgr', data: { action: 'getProducts',        page: 1, pageSize: 10, filter: 'active' } }),
          wx.cloud.callFunction({ name: 'adminMgr', data: { action: 'getPendingProducts', page: 1, pageSize: 10 } }),
          wx.cloud.callFunction({ name: 'adminMgr', data: { action: 'getOrders',          page: 1, pageSize: 10, filter: 'all' } })
        ])

      const ok = r => r.status === 'fulfilled' ? (r.value.result || {}) : {}
      const stats    = ok(statsRes)
      const detail   = ok(detailRes)
      const userList = ok(usersRes)
      const prodList = ok(productsRes)
      const pendList = ok(pendingRes)
      const ordList  = ok(ordersRes)

      // 3. 构造精简 payload（只保留 KPI + 前10条列表，控制 hash 长度）
      const payload = {
        stats: {
          totalUsers:          stats.totalUsers          || 0,
          totalProducts:       stats.totalProducts       || 0,
          activeSwaps:         stats.activeSwaps         || 0,
          pendingReviews:      stats.pendingReviews      || 0,
          mysteryCount:        stats.mysteryCount        || 0,
          pendingProductCount: stats.pendingProductCount || 0,
          completedSwaps:      detail.completedSwaps     || 0,
          totalReviews:        detail.totalReviews       || 0
        },
        users:           (userList.list    || []).map(u => ({
          _id: u._id, _openid: u._openid, nickName: u.nickName,
          creditScore: u.creditScore, province: u.province,
          points: u.points, isBanned: u.isBanned
        })),
        products:        (prodList.list    || []).map(p => ({
          _id: p._id, name: p.name, province: p.province,
          category: p.category, status: p.status, value: p.value
        })),
        pendingProducts: (pendList.list    || []).map(p => ({
          _id: p._id, name: p.name, province: p.province,
          category: p.category, publisherName: p.publisherName
        })),
        orders:          (ordList.list     || []).map(o => ({
          _id: o._id, status: o.status, productName: o.productName,
          initiatorName: o.initiatorName, createTime: o.createTime
        })),
        provinces:  detail.provinces  || [],
        categories: detail.categories || [],
        funnel:     detail.funnel     || []
      }

      // 4. 将精简数据编码到 URL hash
      const hash = encodeURIComponent(JSON.stringify(payload))
      console.log('[AdminWebview] hash length:', hash.length)

      if (hash.length <= 8000) {
        // hash 在安全范围内，直接带上
        this.setData({ webviewUrl: `${htmlUrl}#${hash}`, loading: false })
      } else {
        // hash 过长，不带数据，让 HTML 内 SDK 自行拉取
        console.warn('[AdminWebview] hash too long, fallback to SDK mode')
        this.setData({ webviewUrl: htmlUrl, loading: false })
      }

    } catch (err) {
      console.error('[AdminWebview] 初始化失败', err)
      this._loadFallback()
    }
  },

  // 降级：直接用云存储 URL（HTML 内 cloudbase.js 会自动拉取数据）
  async _loadFallback() {
    try {
      const { fileList } = await wx.cloud.getTempFileURL({
        fileList: [ADMIN_PANEL_FILE_ID]
      })
      const htmlUrl = fileList[0] && fileList[0].tempFileURL
      if (htmlUrl) {
        this.setData({ webviewUrl: htmlUrl, loading: false })
      } else {
        this.setData({ errMsg: '无法获取后台页面链接，请检查云存储', loading: false })
      }
    } catch (e) {
      this.setData({ errMsg: '网络异常：' + (e.message || e), loading: false })
    }
  },

  // web-view 向小程序发送消息（分享时触发）
  onMessage(e) {
    console.log('[AdminWebview] message from webview:', e.detail)
  },

  // webview 加载完成（仅做日志，不改 src 避免循环重载）
  onWebviewLoad() {
    console.log('[AdminWebview] webview loaded')
  },

  // 错误处理
  onWebviewError(e) {
    console.error('[AdminWebview] webview error:', e)
    this.setData({ errMsg: 'WebView 加载失败' })
  }
})
