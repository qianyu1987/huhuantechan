// pages/detail/index.js
const { PRODUCT_CATEGORIES_V2, VALUE_RANGES_V2, DESC_TAGS } = require('../../utils/constants')
const { callCloud, formatTime, getCreditLevel, getProvinceByCode, toast, processImageUrls } = require('../../utils/util')

const MYSTERY_EMOJIS = ['🎁', '🎀', '🎄', '🎃', '🎉', '🎈', '🎎', '🎏', '🎑', '🎭']

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
    // 神秘特产
    isMystery: false,
    mysteryEmoji: '🎁',
    mysteryColorClass: 'color-1',
    // 评价
    reviews: [],
    reviewCount: 0
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

      wx.setNavigationBarTitle({ title: isMystery ? '神秘特产' : p.name })
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
  }
})
