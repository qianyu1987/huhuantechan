// pages/index/index.js
const { PROVINCES, PRODUCT_CATEGORIES, VALUE_RANGES, MYSTERY_EMOJIS } = require('../../utils/constants')
const { callCloud, formatTime, getCreditLevel, formatValue, getProvinceByCode, processImageUrl } = require('../../utils/util')
const imageOptimizer = require('../../utils/imageOptimizer')

const PAGE_SIZE = 20
const ALL_PRODUCTS_LIMIT = 500  // "全部"选项最多显示500条特产

Page({
  data: {
    provinceList: PROVINCES,
    categories: PRODUCT_CATEGORIES,
    activeProvince: '',
    activeStatus: '',  // ''=全部, 'active'=未换, 'swapped'=已换, 'mystery'=神秘
    products: [],
    leftColumn: [],
    rightColumn: [],
    loading: false,
    loadingMore: false,
    refreshing: false,
    noMore: false,
    page: 1,
    unreadCount: 0,
    scrollTop: 0,
    featureFlags: {}   // 功能开关，从 app.globalData 同步
  },

  onLoad(options) {
    // 同步功能开关到页面 data（优先从 globalData 读，若未就绪则监听）
    this._syncFeatureFlags()

    // 检查云开发状态（异步，不阻塞）
    this.checkCloudStatus()
    
    // 优先加载特产列表（用户最关心）
    this.loadProducts(true)
    
    // 后台并行加载其他数据（不阻塞主流程）
    this._loadAuxiliaryData()
    
    // 处理邀请码
    if (options.inviteCode) {
      this.handleInviteCode(options.inviteCode)
    }
    if (options.scene) {
      try {
        const scene = decodeURIComponent(options.scene)
        const match = scene.match(/inviteCode=(\w+)/)
        if (match && match[1]) {
          this.handleInviteCode(match[1])
        }
      } catch (e) {
        console.warn('[Index] 解析 scene 参数失败:', e)
      }
    }
  },

  // 同步功能开关到页面 data
  _syncFeatureFlags() {
    try {
      const app = getApp()
      if (!app) {
        console.warn('[Index] getApp() 返回 undefined，延迟重试')
        setTimeout(() => this._syncFeatureFlags(), 100)
        return
      }
      
      const flags = app.globalData && app.globalData.featureFlags
      if (flags) {
        this.setData({ featureFlags: flags })
      } else {
        // featureFlags 尚未加载完毕，轮询等待（最多等 3s）
        let tries = 0
        const timer = setInterval(() => {
          tries++
          const f = getApp() && getApp().globalData.featureFlags
          if (f) {
            this.setData({ featureFlags: f })
            clearInterval(timer)
          } else if (tries >= 30) {
            clearInterval(timer)
          }
        }, 100)
      }
    } catch (e) {
      console.error('[Index] _syncFeatureFlags 出错:', e)
    }
  },

  // 后台加载辅助数据
  _loadAuxiliaryData() {
    // 并行加载：未读数 + 分享配置
    Promise.all([
      this.loadUnread(),
      this._loadShareConfig()
    ]).catch(() => {})
  },

  // 处理邀请码
  async handleInviteCode(inviteCode) {
    try {
      // 获取本地存储的邀请码
      const savedInviteCode = wx.getStorageSync('myInviteCode')
      const boundInvite = wx.getStorageSync('boundInvite')

      // 如果已经绑定过邀请关系，或者是自己邀请自己，不处理
      if (boundInvite || (savedInviteCode && savedInviteCode === inviteCode)) {
        return
      }

      // 保存邀请码到本地
      wx.setStorageSync('pendingInviteCode', inviteCode)

      // 尝试自动绑定（如果已登录）
      const app = getApp()
      if (app && app.globalData && app.globalData.openid) {
        await this.bindInvite(inviteCode)
      }
    } catch (e) {
      console.warn('[Index] handleInviteCode 出错:', e)
    }
  },

  // 绑定邀请关系（支持重试）
  async bindInvite(inviteCode) {
    try {
      const app = getApp()
      if (!app || !app.callCloudFunctionWithRetry) {
        console.warn('[Index] app 或 callCloudFunctionWithRetry 不可用')
        return
      }
      const res = await app.callCloudFunctionWithRetry('userInit', {
        action: 'bindInvite',
        inviteCode: inviteCode
      }, 3)

      if (res.result && res.result.success) {
        wx.setStorageSync('boundInvite', inviteCode)
        wx.removeStorageSync('pendingInviteCode')

        // 提示获得积分
        if (res.result.reward > 0) {
          wx.showModal({
            title: '邀请成功',
            content: `恭喜获得 ${res.result.reward} 积分奖励！`,
            showCancel: false
          })
        }
      }
    } catch (e) {
      console.warn('[Index] 绑定邀请失败（将在后续重试）:', e)
    }
  },

  // 检查云开发状态（完全异步，不阻塞）
  checkCloudStatus() {
    try {
      if (!wx.cloud) {
        console.error('[Index] wx.cloud 不可用')
        return
      }
      
      const app = getApp()
      if (!app || !app.globalData) {
        console.warn('[Index] getApp() 返回 undefined，延迟重试')
        setTimeout(() => this.checkCloudStatus(), 500)
        return
      }
      
      const envId = app.globalData.envId
      const platform = app.globalData.platform || 'weixin'
      console.log('[Index] 云开发环境ID:', envId, ', 平台:', platform)
      
      // 完全后台执行，不等待结果
      wx.cloud.callFunction({
        name: 'testConnect',
        data: {},
        timeout: 5000  // 减少超时时间
      }).then(res => {
        console.log('[Index] 云函数连通性测试成功:', res.result)
      }).catch(err => {
        // 不显示任何弹窗，静默失败
        console.warn('[Index] 云函数连通性测试失败:', err.errCode, err.errMsg)
      })
    } catch (e) {
      console.error('[Index] checkCloudStatus 出错:', e)
    }
  },

  onShow() {
    try {
      // 每次显示时同步最新功能开关（管理员可能已修改）
      this._syncFeatureFlags()

      // 节流：距离上次刷新少于 10 秒不刷新
      if (this._lastShowTime && Date.now() - this._lastShowTime < 10000) {
        return
      }
      this._lastShowTime = Date.now()
      
      // 只刷新未读数
      this.loadUnread()
    } catch (e) {
      console.error('[Index] onShow 出错:', e)
    }
  },

  // 加载特产列表
  async loadProducts(reset = false) {
    if (this.data.loading || this.data.loadingMore) return
    
    const isReset = reset
    if (isReset) {
      this.setData({ loading: true, page: 1, noMore: false, scrollTop: 0 })
    } else {
      if (this.data.noMore) return
      this.setData({ loadingMore: true })
    }

    try {
      console.log('[Index] 加载特产列表, isReset:', isReset, 'status:', this.data.activeStatus)
      
      // 根据状态筛选参数
      let statusFilter = this.data.activeStatus
      let isMystery = undefined
      if (statusFilter === 'mystery') {
        isMystery = true
        statusFilter = 'active'  // 神秘特产只看 active 状态的
      }
      
      // "全部"选项不筛选状态，显示所有状态的特产
      if (statusFilter === '') {
        statusFilter = undefined
      }
      
      // 判断是否是"全部"模式（无省份筛选 + 无状态筛选）
      const isAllMode = !this.data.activeProvince && !this.data.activeStatus
      const queryPageSize = isAllMode ? ALL_PRODUCTS_LIMIT : PAGE_SIZE
      
      const res = await callCloud('productMgr', {
        action: 'list',
        province: this.data.activeProvince || undefined,
        status: statusFilter,
        isMystery: isMystery,
        page: isReset ? 1 : this.data.page,
        pageSize: queryPageSize,
        random: isReset && !isAllMode  // 全部模式不随机，保持稳定排序
      })

      console.log('[Index] 特产列表返回:', res)

      if (!res) {
        console.error('[Index] 返回为空')
        wx.showToast({ title: '服务器无响应', icon: 'none' })
        return
      }
      
      if (!res.success) {
        console.warn('[Index] 接口返回失败:', res.message)
        wx.showToast({ title: res.message || '加载失败', icon: 'none' })
        return
      }

      let newItems = (res.list || []).map(item => this.formatProduct(item))
      
      // 刷新时随机排序（非全部模式）
      if (isReset && !isAllMode && newItems.length > 1) {
        newItems = this.shuffleArray(newItems)
      }
      
      const allItems = isReset ? newItems : [...this.data.products, ...newItems]
      
      // 先渲染 UI（不等待图片解析）
      this.setData({
        products: allItems,
        page: isReset ? 2 : this.data.page + 1,
        noMore: isAllMode ? true : (newItems.length < PAGE_SIZE),
        ...this.splitWaterfall(allItems),
        scrollTop: isReset ? 1 : undefined  // 刷新后滚动到顶部
      })
      
      // 图片链接解析放到后台执行（不阻塞渲染）
      if (isReset) {
        this._resolveImagesInBackground(newItems)
      }
      
      console.log('[Index] 加载完成, products:', allItems.length)
    } catch (e) {
      console.error('[Index] 加载特产失败', e)
      wx.showToast({ title: '网络错误，请稍后重试', icon: 'none' })
    } finally {
      this.setData({ loading: false, loadingMore: false, refreshing: false })
      wx.stopPullDownRefresh()
    }
  },

  // 后台解析图片链接（不阻塞 UI）
  _resolveImagesInBackground(items) {
    // 使用 setTimeout 延迟执行，让 UI 先渲染
    setTimeout(async () => {
      await this.resolveCloudUrls(items)
      // 重新渲染（只更新需要变化的图片）
      if (items.some(item => item.coverUrl && item.coverUrl.startsWith('cloud://'))) {
        // 还有未解析的，递归继续
        this._resolveImagesInBackground(items)
      }
    }, 100)
  },

  // 格式化单个特产数据
  formatProduct(item) {
    const province = getProvinceByCode(item.province)
    const creditInfo = getCreditLevel(item.userCreditScore || 100)
    const valueRange = VALUE_RANGES.find(v => v.id === item.valueRange)
    const wantCat = PRODUCT_CATEGORIES.find(c => c.id === item.wantCategory)

    const isMystery = item.isMystery || false
    const provinceName = province ? province.name : item.province || '惊喜'

    // 惊喜特产：使用彩色渐变卡片
    if (isMystery) {
      // 根据省份生成稳定的颜色和emoji
      const code = provinceName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
      const colors = ['color-1', 'color-2', 'color-3', 'color-4', 'color-5',
                      'color-6', 'color-7', 'color-8', 'color-9', 'color-10']

      return {
        ...item,
        isMystery: true,
        name: '惊喜特产',
        desc: '',
        category: '',
        wantCategory: '',
        wantProvince: '',
        images: [],
        coverUrl: '',
        provinceName: provinceName,
        provinceColor: province ? province.color : '#999',
        creditClass: '',
        timeLabel: '',
        valueLabel: valueRange ? valueRange.label : '',
        wantLabel: '',
        // 惊喜特产专属属性
        colorClass: colors[code % colors.length],
        emoji: MYSTERY_EMOJIS[code % MYSTERY_EMOJIS.length]
      }
    }
    
    // 普通特产：处理图片URL - 过滤掉无效路径
    let processedImages = []
    if (item.images && Array.isArray(item.images)) {
      processedImages = item.images
        .map(img => processImageUrl(img))
        .filter(url => {
          // 过滤掉空值和本地临时路径
          if (!url) return false
          // 过滤本地临时路径（开发工具产生的无效路径）
          if (url.startsWith('http://127.0.0.1') || 
              url.startsWith('wxfile://') || 
              url.startsWith('file://')) {
            console.warn('过滤掉无效图片路径:', url)
            return false
          }
          return true
        })
    }
    
    return {
      ...item,
      images: processedImages,
      coverUrl: processedImages[0] || '/images/default-product.png',
      provinceName: province ? province.name : item.province,
      provinceColor: province ? province.color : '#999',
      creditClass: creditInfo.class,
      timeLabel: formatTime(item.createTime),
      valueLabel: valueRange ? valueRange.label : '',
      wantLabel: wantCat ? wantCat.name : ''
    }
  },

  // 瀑布流分列
  splitWaterfall(items) {
    const left = [], right = []
    items.forEach((item, i) => {
      if (i % 2 === 0) left.push(item)
      else right.push(item)
    })
    return { leftColumn: left, rightColumn: right }
  },

  // 省份筛选
  filterProvince(e) {
    const code = e.currentTarget.dataset.code
    this.setData({ activeProvince: code })
    this.loadProducts(true)
  },

  // 状态筛选（未换/已换/神秘）
  filterStatus(e) {
    const status = e.currentTarget.dataset.status
    this.setData({ activeStatus: status })
    this.loadProducts(true)
  },

  // 数组随机打乱
  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]]
    }
    return array
  },

  // 原生下拉刷新
  onPullDownRefresh() {
    this.loadProducts(true)
  },

  // 原生触底加载
  onReachBottom() {
    this.loadProducts(false)
  },

  // 下拉刷新（兼容旧引用）
  onRefresh() {
    this.loadProducts(true)
  },

  // 加载更多
  loadMore() {
    this.loadProducts(false)
  },

  // 未读消息数
  async loadUnread() {
    try {
      const res = await callCloud('orderMgr', { action: 'unreadCount' })
      this.setData({ unreadCount: res.count || 0 })
    } catch (e) {}
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/detail/index?id=${id}` })
  },

  goToPublish() {
    wx.reLaunch({ url: '/pages/publish/index' })
  },

  goToSearch() {
    wx.navigateTo({ url: '/pages/search/index' })
  },

  goToMessages() {
    wx.navigateTo({ url: '/pages/order/index' })
  },

  // 客户端侧批量转换 cloud:// URL 为临时链接（带 LRU 缓存，避免重复请求）
  // thumbW=240：列表卡片约 320rpx 宽，240px 已足够清晰且节省 60%+ 流量
  async resolveCloudUrls(items, thumbW = 240) {
    const fileIDs = items
      .filter(item => item.coverUrl && item.coverUrl.startsWith('cloud://'))
      .map(item => item.coverUrl)

    if (fileIDs.length === 0) return

    const urlMap = await imageOptimizer.batchResolve([...new Set(fileIDs)], thumbW)
    items.forEach(item => {
      if (item.coverUrl && urlMap[item.coverUrl]) {
        item.coverUrl = urlMap[item.coverUrl]
      }
    })
  },

  // 图片加载失败处理
  onImageError(e) {
    const index = e.currentTarget.dataset.index
    if (index !== undefined && this.data.products[index]) {
      const products = this.data.products
      products[index].coverUrl = '/images/default-product.png'
      this.setData({ products })
    }
  },

  // ========== 分享功能 ==========

  /**
   * 分享给朋友
   * 首页分享：展示当前筛选省份，吸引特定地区的用户
   */
  async onShareAppMessage() {
    const cfg = this.data._shareConfig || {}
    const province = this.data.activeProvince

    let title = cfg.indexTitle || '朋友你愿意和我换家乡特产吗，没有金钱交易，只有真心款待！❤️'
    let path = '/pages/index/index'
    let imageUrl = cfg.indexImage || '/images/share-default.png'

    // 如果用户正在看某个省的特产，分享时带上省份参数
    if (province) {
      const pInfo = (this.data.provinceList || []).find(p => p.code === province)
      const pName = pInfo ? pInfo.name : province
      title = cfg.indexProvinceTitle
        ? cfg.indexProvinceTitle.replace('{province}', pName)
        : `朋友，想尝尝${pName}的特产吗？没有金钱交易，只有真心款待！❤️`
      path = `/pages/index/index?province=${province}`
    }

    // 尝试获取浏览最多的特产图片作为分享图
    try {
      const hotProduct = await this._getHotProductImage()
      if (hotProduct) {
        imageUrl = hotProduct
      }
    } catch (e) {
      console.log('获取热门特产图片失败，使用默认图片', e)
    }

    return {
      title,
      path,
      imageUrl
    }
  },

  /**
   * 获取浏览最多的特产图片
   */
  async _getHotProductImage() {
    try {
      const res = await callCloud('productMgr', {
        action: 'list',
        page: 1,
        pageSize: 1,
        sortBy: 'viewCount',
        sortOrder: 'desc',
        status: 'active'
      })
      
      if (res.success && res.list && res.list.length > 0) {
        const product = res.list[0]
        // 获取第一张图片
        let imageUrl = null
        if (product.images && product.images.length > 0) {
          imageUrl = product.images[0]
        } else if (product.coverUrl) {
          imageUrl = product.coverUrl
        }
        
        // 如果是 cloud:// 格式，转换为临时链接
        if (imageUrl && imageUrl.startsWith('cloud://')) {
          try {
            const tempRes = await wx.cloud.getTempFileURL({
              fileList: [imageUrl]
            })
            if (tempRes.fileList && tempRes.fileList[0] && tempRes.fileList[0].tempFileURL) {
              return tempRes.fileList[0].tempFileURL
            }
          } catch (tempErr) {
            console.error('转换图片临时链接失败:', tempErr)
            return null
          }
        }
        
        return imageUrl
      }
    } catch (e) {
      console.error('获取热门特产失败', e)
    }
    return null
  },

  /**
   * 分享到朋友圈
   */
  async onShareTimeline() {
    const cfg = this.data._shareConfig || {}
    const province = this.data.activeProvince
    const pInfo = province
      ? (this.data.provinceList || []).find(p => p.code === province)
      : null
    const pName = pInfo ? pInfo.name : ''

    // 尝试获取热门特产图片作为分享图
    let imageUrl = cfg.indexImage || '/images/share-default.png'
    try {
      const hotProduct = await this._getHotProductImage()
      if (hotProduct) {
        imageUrl = hotProduct
      }
    } catch (e) {
      console.log('获取热门特产图片失败，使用默认图片', e)
    }

    return {
      title: pName
        ? `${pName}的特产，快来互换吧！`
        : (cfg.timelineTitle || '特产互换，让美食走遍全国 🌏'),
      query: province ? `province=${province}` : '',
      imageUrl
    }
  },

  /**
   * 预加载云端分享配置（热更新入口）
   */
  async _loadShareConfig() {
    try {
      const res = await callCloud('productMgr', { action: 'getShareConfig' })
      if (res && res.success && res.config) {
        this.data._shareConfig = res.config
      }
    } catch (e) {
      // 静默失败
    }
  }
})
