// pages/search/index.js
const { callCloud, formatTimeAgo, getProvinceByCode, getCreditLevel, processImageUrl } = require('../../utils/util')

Page({
  data: {
    keyword: '',
    history: [],
    hotKeywords: ['四川腊肉', '新疆红枣', '云南普洱茶', '东北大米', '福建铁观音', '广西螺蛳粉', '内蒙古牛肉干', '湖南剁椒'],
    products: [],
    loading: false,
    loadingMore: false,
    noMore: false,
    page: 1,
    pageSize: 10,
    activeFilter: 'all'
  },

  onLoad() {
    this.loadHistory()
  },

  loadHistory() {
    const history = wx.getStorageSync('searchHistory') || []
    this.setData({ history })
  },

  saveHistory(keyword) {
    if (!keyword.trim()) return
    let history = wx.getStorageSync('searchHistory') || []
    history = history.filter(item => item !== keyword)
    history.unshift(keyword)
    history = history.slice(0, 10)
    wx.setStorageSync('searchHistory', history)
    this.setData({ history })
  },

  clearHistory() {
    wx.showModal({
      title: '提示',
      content: '确定要清空搜索历史吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('searchHistory')
          this.setData({ history: [] })
        }
      }
    })
  },

  onInput(e) {
    const keyword = e.detail.value
    this.setData({ keyword })
    if (!keyword.trim()) {
      this.setData({ products: [], page: 1, noMore: false })
    }
  },

  clearKeyword() {
    this.setData({ keyword: '', products: [], page: 1, noMore: false })
  },

  onSearch() {
    const { keyword } = this.data
    if (!keyword.trim()) {
      wx.showToast({ title: '请输入搜索关键词', icon: 'none' })
      return
    }
    this.saveHistory(keyword)
    this.setData({ products: [], page: 1, noMore: false, loading: true })
    this.searchProducts()
  },

  onHistoryTap(e) {
    const keyword = e.currentTarget.dataset.keyword
    this.setData({ keyword, products: [], page: 1, noMore: false, loading: true })
    this.saveHistory(keyword)
    this.searchProducts()
  },

  changeFilter(e) {
    const type = e.currentTarget.dataset.type
    if (type === this.data.activeFilter) return
    this.setData({ activeFilter: type, products: [], page: 1, noMore: false, loading: true })
    this.searchProducts()
  },

  async searchProducts() {
    const { keyword, page, pageSize, activeFilter } = this.data

    try {
      const res = await callCloud('productMgr', {
        action: 'search',
        keyword,
        page,
        pageSize,
        sort: activeFilter === 'newest' ? 'newest' : 'default'
      })

      if (!res.success) {
        this.setData({ loading: false, loadingMore: false })
        wx.showToast({ title: '搜索失败', icon: 'none' })
        return
      }

      const list = (res.list || []).map(item => {
        const province = getProvinceByCode(item.province)
        const creditInfo = getCreditLevel(item.userCreditScore || 100)
        return {
          ...item,
          coverUrl: item.images?.[0] ? processImageUrl(item.images[0]) : '',
          provinceName: province?.name || '未知',
          provinceColor: province?.color || '#999',
          creditClass: creditInfo.class,
          creditScore: item.userCreditScore || 100,
          userAvatar: item.userAvatar || '',
          timeLabel: formatTimeAgo(item.createTime),
          wantLabel: item.wantCategory === 'any' ? '任意特产' : (item.wantCategoryName || item.wantCategory || '')
        }
      })

      this.setData({
        products: page === 1 ? list : [...this.data.products, ...list],
        loading: false,
        loadingMore: false,
        noMore: list.length < pageSize
      })
    } catch (err) {
      console.error('搜索失败:', err)
      this.setData({ loading: false, loadingMore: false })
      wx.showToast({ title: '搜索失败', icon: 'none' })
    }
  },

  loadMore() {
    if (this.data.loadingMore || this.data.noMore) return
    this.setData({ page: this.data.page + 1, loadingMore: true })
    this.searchProducts()
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/detail/index?id=${id}` })
  },

  goBack() {
    wx.navigateBack()
  }
})
