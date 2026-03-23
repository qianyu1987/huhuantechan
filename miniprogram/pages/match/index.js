// pages/match/index.js
const { PROVINCES, PRODUCT_CATEGORIES, VALUE_RANGES, MYSTERY_EMOJIS } = require('../../utils/constants')
const { callCloud, formatTime, getCreditLevel, getProvinceByCode, toast, processImageUrl, getTempUrls } = require('../../utils/util')

Page({
  data: {
    myProducts: [],
    selectedMyId: '',
    selectedProduct: null,
    recommends: [],
    loading: false,
    loadingMore: false,
    refreshing: false,
    noMore: false,
    page: 1,
    showRulesPopup: false,
    featureDisabled: false
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  },

  onLoad() {
    if (!getApp().isFeatureEnabled('tab_match')) {
      this.setData({ featureDisabled: true })
      return
    }
    this.loadMyProducts()
    this.loadRecommends(true)
  },

  onShow() {
    this.loadMyProducts()
  },

  // 加载我的特产（含 mystery 格式化）
  async loadMyProducts() {
    try {
      const res = await callCloud('productMgr', { action: 'myList', status: 'active' })
      const list = (res.list || []).map(item => {
        const province = getProvinceByCode(item.province)
        const isMystery = item.isMystery || false

        if (isMystery) {
          const provinceName = province ? province.name : item.province || '神秘'
          const code = provinceName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
          const colors = ['color-1','color-2','color-3','color-4','color-5','color-6','color-7','color-8','color-9','color-10']
          return {
            ...item,
            isMystery: true,
            name: '惊喜特产',
            coverUrl: '',
            provinceName,
            provinceColor: province ? province.color : '#999',
            colorClass: colors[code % colors.length],
            emoji: MYSTERY_EMOJIS[code % MYSTERY_EMOJIS.length]
          }
        }

        return {
          ...item,
          isMystery: false,
          coverUrl: item.images && item.images[0] ? processImageUrl(item.images[0]) : '/images/default-product.png',
          provinceName: province ? province.name : item.province,
          provinceColor: province ? province.color : '#999'
        }
      })

      // 客户端 cloud:// URL 批量转换
      await this.resolveCloudUrls(list)
      this.setData({ myProducts: list })
    } catch (e) {
      console.error('[Match] loadMyProducts 失败', e)
    }
  },

  selectMine(e) {
    const id = e.currentTarget.dataset.id
    const selected = this.data.selectedMyId === id ? '' : id
    
    // 获取选中产品的信息用于展示
    let selectedProduct = null
    if (selected) {
      selectedProduct = this.data.myProducts.find(p => p._id === selected) || null
    }
    
    this.setData({
      selectedMyId: selected,
      selectedProduct: selectedProduct
    })
    this.loadRecommends(true)
  },

  async loadRecommends(reset = false) {
    if (this.data.loading || this.data.loadingMore) return
    if (reset) {
      this.setData({ loading: true, page: 1, noMore: false })
    } else {
      if (this.data.noMore) return
      this.setData({ loadingMore: true })
    }

    try {
      const res = await callCloud('productMgr', {
        action: 'recommend',
        myProductId: this.data.selectedMyId || undefined,
        page: reset ? 1 : this.data.page,
        pageSize: 15
      })
      const list = res.list || []
      console.log('[Match] recommend返回', list.length, '条, 普通:', list.filter(p => !p.isMystery).length, '神秘:', list.filter(p => p.isMystery).length)
      const newItems = list.map(item => this.formatItem(item))

      // 客户端 cloud:// URL 批量转换
      await this.resolveCloudUrls(newItems)

      const all = reset ? newItems : [...this.data.recommends, ...newItems]
      this.setData({
        recommends: all,
        page: reset ? 2 : this.data.page + 1,
        noMore: newItems.length < 15
      })
    } catch (e) {
      console.error('[Match] loadRecommends 失败', e)
    } finally {
      this.setData({ loading: false, loadingMore: false, refreshing: false })
    }
  },

  formatItem(item) {
    const province = getProvinceByCode(item.province)
    const creditInfo = getCreditLevel(item.userCreditScore || 100)
    const valueRange = VALUE_RANGES.find(v => v.id === item.valueRange)

    const isMystery = item.isMystery || false
    let mysteryStyle = {}
    if (isMystery) {
      const provinceName = province ? province.name : item.province || '神秘'
      const code = provinceName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
      const colors = ['color-1','color-2','color-3','color-4','color-5','color-6','color-7','color-8','color-9','color-10']
      mysteryStyle = {
        isMystery: true,
        colorClass: colors[code % colors.length],
        emoji: MYSTERY_EMOJIS[code % MYSTERY_EMOJIS.length]
      }
    }

    return {
      ...item,
      coverUrl: item.images && item.images[0] ? processImageUrl(item.images[0]) : '/images/default-product.png',
      provinceName: province ? province.name : item.province,
      provinceColor: province ? province.color : '#999',
      provinceEmoji: province ? province.emoji : '',
      creditClass: creditInfo.class,
      timeLabel: formatTime(item.createTime),
      valueLabel: valueRange ? valueRange.label : '',
      ...mysteryStyle
    }
  },

  // 客户端 cloud:// URL 批量转换（每批50个）
  async resolveCloudUrls(items) {
    const cloudItems = []
    items.forEach((item, idx) => {
      if (item.coverUrl && item.coverUrl.startsWith('cloud://')) {
        cloudItems.push({ idx, fileID: item.coverUrl })
      }
    })
    if (cloudItems.length === 0) return
    try {
      const BATCH_SIZE = 50
      for (let i = 0; i < cloudItems.length; i += BATCH_SIZE) {
        const batch = cloudItems.slice(i, i + BATCH_SIZE)
        const res = await wx.cloud.getTempFileURL({ fileList: batch.map(c => c.fileID) })
        res.fileList.forEach((f, j) => {
          if (f.tempFileURL) items[batch[j].idx].coverUrl = f.tempFileURL
        })
      }
    } catch (e) {
      console.warn('[Match] resolveCloudUrls 失败:', e)
    }
  },

  onRefresh() {
    this.setData({ refreshing: true })
    this.loadRecommends(true)
  },

  loadMore() {
    this.loadRecommends(false)
  },

  async initiateSwap(e) {
    const targetId = e.currentTarget.dataset.id
    const targetName = e.currentTarget.dataset.name

    if (!this.data.selectedMyId) {
      toast('请先选择你要拿出去换的特产')
      return
    }

    wx.showModal({
      title: '发起分享',
      content: `确认与「${targetName}」互相分享特产？`,
      confirmText: '发起',
      confirmColor: '#0A84FF',
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await callCloud('orderMgr', {
              action: 'create',
              myProductId: this.data.selectedMyId,
              targetProductId: targetId
            })
            if (result && result.success) {
              toast('分享请求已发出！', 'success')
              wx.navigateTo({ url: `/pages/order/index?id=${result.orderId}` })
            } else {
              toast(result?.message || '发起失败，请重试')
            }
          } catch (err) {
            toast('网络错误，请重试')
          }
        }
      }
    })
  },

  goToDetail(e) {
    wx.navigateTo({ url: `/pages/detail/index?id=${e.currentTarget.dataset.id}` })
  },

  goToPublish() {
    wx.reLaunch({ url: '/pages/publish/index' })
  },

  showRules() {
    this.setData({ showRulesPopup: true })
  },

  hideRules() {
    this.setData({ showRulesPopup: false })
  }
})
