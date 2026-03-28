// pages/detail/index.js
const { PRODUCT_CATEGORIES_V2, VALUE_RANGES_V2, DESC_TAGS, MYSTERY_EMOJIS } = require('../../utils/constants')
const { callCloud, formatTime, getCreditLevel, getProvinceByCode, toast, processImageUrls } = require('../../utils/util')

Page({
  data: {
    product: null,
    publisher: {},
    isMine: false,
    publisherSwapCount: 0,
    loading: true,
    isFav: false,
    // 展示字段
    locationText: '',
    valueLabel: '',
    valueEmoji: '',
    categoryName: '',
    categoryEmoji: '',
    descTagList: [],
    wantLocationText: '',
    wantCategoryName: '',
    wantCategoryEmoji: '',
    timeLabel: '',
    creditClass: 'credit-high',
    // 惊喜特产
    isMystery: false,
    mysteryEmoji: '🎁',
    mysteryColorClass: 'color-1',
    // 评价
    reviews: [],
    reviewCount: 0,
    // 代购卖家信息（异步加载）
    sellerDaigouInfo: null
  },

  getMysteryColor(name) {
    if (!name) return 'color-1'
    const code = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    return 'color-' + (code % 10 + 1)
  },

  getMysteryEmoji(name) {
    if (!name) return MYSTERY_EMOJIS[0]
    const code = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    return MYSTERY_EMOJIS[code % MYSTERY_EMOJIS.length]
  },

  onLoad(options) {
    const app = getApp()
    this.setData({ featureFlags: app.globalData.featureFlags || {} })

    // 预加载云端分享配置（热更新：不改代码就能调整分享话术）
    this._loadShareConfig()

    // 开启右上角分享按钮
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] })

    const { id } = options
    if (id) {
      this.loadDetail(id)
    } else {
      toast('参数错误')
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  async loadDetail(id) {
    this.setData({ loading: true })
    try {
      const res = await callCloud('productMgr', { action: 'detail', productId: id })
      if (!res.success) {
        toast(res.banned ? '该特产已被下架' : '加载失败')
        if (res.banned) setTimeout(() => wx.navigateBack(), 1500)
        return
      }

      const p = res.product
      
      // 检查产品状态
      if (p.status === 'pending_review') {
        toast('该特产待审核中', 'none')
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }
      if (p.status === 'rejected') {
        toast('该特产未通过审核', 'none')
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }
      if (p.status === 'banned') {
        toast('该特产已被下架')
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }
      const province = getProvinceByCode(p.province)
      const valueRange = VALUE_RANGES_V2.find(v => v.id === p.valueRange)
      const category = PRODUCT_CATEGORIES_V2.find(c => c.id === p.category)
      const wantProvince = getProvinceByCode(p.wantProvince)
      const wantCategory = PRODUCT_CATEGORIES_V2.find(c => c.id === p.wantCategory)
      const creditInfo = getCreditLevel(res.publisher?.creditScore || 100)

      // 处理图片
      p.images = processImageUrls(p.images)

      // 地区文本：省 市 区
      const locParts = [province?.name, p.city, p.district].filter(Boolean)
      const locationText = locParts.join(' ') || '未知地区'

      // 想换地区文本
      const wantLocParts = [wantProvince?.name, p.wantCity, p.wantDistrict].filter(Boolean)
      const wantLocationText = wantLocParts.join(' ') || ''

      // 描述标签匹配
      const descTagList = (p.descTags || []).map(tagId => {
        const tag = DESC_TAGS.find(t => t.id === tagId)
        return tag || null
      }).filter(Boolean)

      // 神秘特产
      const isMystery = p.isMystery === true
      const provName = province?.name || ''

      this.setData({
        product: p,
        publisher: res.publisher || {},
        isMine: res.isMine,
        publisherSwapCount: res.publisherSwapCount || 0,
        loading: false,
        locationText,
        valueLabel: valueRange?.label || '',
        valueEmoji: valueRange?.emoji || '',
        categoryName: category?.name || '',
        categoryEmoji: category?.emoji || '',
        descTagList,
        wantLocationText,
        wantCategoryName: wantCategory?.name || '',
        wantCategoryEmoji: wantCategory?.emoji || '',
        timeLabel: formatTime(p.createTime),
        creditClass: creditInfo.class,
        isMystery,
        mysteryColorClass: this.getMysteryColor(provName),
        mysteryEmoji: this.getMysteryEmoji(provName)
      })

      // 加载收藏状态
      if (!res.isMine) {
        this.checkFavStatus(p._id)
      }

      // 加载发布者评价
      this.loadReviews(res.product.openid)

      // 若商品支持代购且非自己发布，异步加载代购卖家信息
      if (!res.isMine && p.daigou && p.daigou.enabled) {
        this.loadSellerDaigouInfo(p.openid || p._openid)
      }

      wx.setNavigationBarTitle({ title: isMystery ? '惊喜特产' : p.name })
    } catch (e) {
      toast('加载失败')
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadReviews(targetOpenid) {
    try {
      const res = await callCloud('reviewMgr', {
        action: 'list',
        targetOpenid,
        pageSize: 3
      })
      if (res.success && res.list && res.list.length > 0) {
        const reviews = res.list.map(r => {
          // 兼容 1-5 评分制（orders嵌入）和 0/1 评分制（reviews集合）
          const isGood = r.rating === 1 || r.rating >= 4
          return {
            ...r,
            reviewerName: r.reviewer?.nickName || '匿名用户',
            reviewerAvatar: r.reviewer?.avatarUrl || '',
            ratingLabel: isGood ? '👍 好评' : '👎 差评',
            ratingClass: isGood ? 'good' : 'bad',
            timeText: formatTime(r.createTime)
          }
        })
        this.setData({
          reviews,
          reviewCount: res.total || reviews.length
        })
      }
    } catch (e) {
      // 静默失败
    }
  },

  // 异步加载代购卖家等级/评分信息
  async loadSellerDaigouInfo(sellerOpenid) {
    if (!sellerOpenid) return
    try {
      const res = await callCloud('daigouMgr', {
        action: 'getSellerDaigouInfo',
        sellerOpenid
      })
      if (res.success && res.seller) {
        this.setData({ sellerDaigouInfo: res.seller })
      }
    } catch (e) {
      // 静默失败，不影响主要功能
    }
  },

  previewImages(e) {
    const idx = e.currentTarget.dataset.index
    wx.previewImage({ urls: this.data.product.images, current: this.data.product.images[idx] })
  },

  toggleFav() {
    const productId = this.data.product?._id
    if (!productId || this.data._favLoading) return
    this.setData({ _favLoading: true })
    const newFav = !this.data.isFav
    this.setData({ isFav: newFav })
    const action = newFav ? 'addFavorite' : 'removeFavorite'
    callCloud('productMgr', { action, productId }).then(res => {
      if (!res.success) {
        this.setData({ isFav: !newFav })
        toast('操作失败')
      } else {
        toast(newFav ? '已收藏' : '已取消收藏')
      }
    }).catch(() => {
      this.setData({ isFav: !newFav })
      toast('操作失败')
    }).finally(() => {
      this.setData({ _favLoading: false })
    })
  },

  async checkFavStatus(productId) {
    try {
      const res = await callCloud('productMgr', { action: 'checkFavorite', productId })
      if (res.isFav) this.setData({ isFav: true })
    } catch (e) {}
  },

  initiateSwap() {
    wx.navigateTo({ url: `/pages/match/index?targetId=${this.data.product._id}` })
  },

  // 代购：跳转下单页
  initiateBuy() {
    const product = this.data.product
    if (!product || !product.daigou || !product.daigou.enabled) return
    if (product.daigou.stock <= 0) {
      toast('该特产已售罄')
      return
    }
    wx.navigateTo({
      url: `/pages/daigou-checkout/index?productId=${product._id}`
    })
  },

  editProduct() {
    wx.navigateTo({ url: `/pages/publish/index?edit=${this.data.product._id}` })
  },

  async removeProduct() {
    const res = await new Promise(resolve =>
      wx.showModal({ title: '下架特产', content: '确认下架这个特产吗？', confirmColor: '#FF453A', success: resolve })
    )
    if (!res.confirm) return
    try {
      await callCloud('productMgr', { action: 'remove', productId: this.data.product._id })
      toast('已下架', 'success')
      setTimeout(() => wx.navigateBack(), 1200)
    } catch (e) {
      toast('操作失败')
    }
  },

  goToUserProfile(e) {
    wx.navigateTo({ url: `/pages/user-profile/index?openid=${e.currentTarget.dataset.openid}` })
  },

  // ========== 分享功能 ==========

  /**
   * 分享给朋友（转发）
   * 标题：商品名 + 来自省份
   * 图片：商品第一张图（https链接）
   * 路径：直接跳转到该商品详情，支持深链
   */
  onShareAppMessage() {
    const p = this.data.product
    const cfg = this.data._shareConfig || {}

    if (!p) {
      // 商品未加载完成时降级到默认分享
      return {
        title: cfg.defaultTitle || '来特产互换平台，发现全国好物！',
        path: '/pages/index/index',
        imageUrl: cfg.defaultImage || '/images/share-default.png'
      }
    }

    // 惊喜特产单独处理
    if (p.isMystery) {
      const province = this.data.locationText || ''
      return {
        title: cfg.mysteryTitle
          ? cfg.mysteryTitle.replace('{province}', province)
          : `🎁 来自${province}的惊喜特产，猜猜是什么？`,
        path: `/pages/detail/index?id=${p._id}`,
        imageUrl: cfg.mysteryImage || '/images/mystery-share.png'
      }
    }

    // 普通特产：拼接标题
    const province = this.data.locationText || ''
    const category = this.data.categoryName ? `【${this.data.categoryEmoji}${this.data.categoryName}】` : ''
    const titleTemplate = cfg.productTitleTemplate || '{name} · 来自{province} {category}'
    const title = titleTemplate
      .replace('{name}', p.name || '特产')
      .replace('{province}', province)
      .replace('{category}', category)
      .trim()
      .replace(/\s+/g, ' ')

    // 图片：优先用商品第一张图，其次用云端配置的默认图
    const imageUrl = (p.images && p.images[0] && !p.images[0].startsWith('cloud://'))
      ? p.images[0]
      : (cfg.defaultProductImage || '/images/share-default.png')

    return {
      title,
      path: `/pages/detail/index?id=${p._id}`,
      imageUrl
    }
  },

  /**
   * 分享到朋友圈（小程序码）
   * 注意：朋友圈分享只支持自定义标题，路径固定为当前页
   */
  onShareTimeline() {
    const p = this.data.product
    const cfg = this.data._shareConfig || {}

    if (!p) {
      return { title: cfg.defaultTitle || '来特产互换平台，发现全国好物！' }
    }

    if (p.isMystery) {
      const province = this.data.locationText || ''
      return {
        title: `🎁 来自${province}的惊喜特产等你揭晓`,
        query: `id=${p._id}`
      }
    }

    const province = this.data.locationText || ''
    return {
      title: `${p.name} · 来自${province}，快来跟我互换特产！`,
      query: `id=${p._id}`
    }
  },

  /**
   * 预加载云端分享配置（热更新入口）
   * 云数据库 share_configs 集合中可随时修改话术，无需发版
   */
  async _loadShareConfig() {
    try {
      const res = await callCloud('productMgr', { action: 'getShareConfig' })
      if (res && res.success && res.config) {
        this.data._shareConfig = res.config  // 直接写 data，不触发渲染
      }
    } catch (e) {
      // 静默失败，降级用本地默认值
    }
  }
})
