// pages/my-products/index.js
const { PRODUCT_CATEGORIES_V2 } = require('../../utils/constants')
const { callCloud, formatTime, getProvinceByCode, toast, showLoading, hideLoading, processImageUrl } = require('../../utils/util')

const STATUS_TABS = [
  { id: 'all', label: '全部' },
  { id: 'active', label: '展示中' },
  { id: 'in_swap', label: '分享中' },
  { id: 'swapped', label: '已分享' },
  { id: 'removed', label: '已下架' }
]

const STATUS_CONFIG = {
  active: { label: '展示中' },
  in_swap: { label: '分享中' },
  swapped: { label: '已分享' },
  removed: { label: '已下架' }
}

Page({
  data: {
    tabs: STATUS_TABS,
    activeTab: 'all',
    activeTabLabel: '',
    products: [],
    loading: false,
    loadingMore: false,
    refreshing: false,
    noMore: false,
    page: 1,
    pageSize: 20,
    totalCount: 0,
    featureDisabled: false
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  },

  onLoad() {
    if (!getApp().isFeatureEnabled('tab_publish')) {
      this.setData({ featureDisabled: true })
      return
    }
    this.loadProducts(true)
  },

  onShow() {
    this.loadProducts(true)
  },

  onPullDownRefresh() {
    this.setData({ refreshing: true })
    this.loadProducts(true).finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom() {
    if (!this.data.noMore && !this.data.loadingMore) {
      this.loadMore()
    }
  },

  switchTab(e) {
    const id = e.currentTarget.dataset.id
    const tab = STATUS_TABS.find(t => t.id === id)
    this.setData({ 
      activeTab: id,
      activeTabLabel: tab ? tab.label : ''
    })
    this.loadProducts(true)
  },

  async loadProducts(reset = false) {
    if (this.data.loading) return

    this.setData({ loading: true })
    if (reset) {
      this.setData({ page: 1, noMore: false, products: [] })
    }

    try {
      const params = {
        action: 'myList',
        page: this.data.page,
        pageSize: this.data.pageSize
      }

      // 如果不是全部，添加状态筛选
      if (this.data.activeTab !== 'all') {
        params.status = this.data.activeTab
      }

      const res = await callCloud('productMgr', params)

      if (!res.success) {
        toast(res.message || '加载失败')
        return
      }

      const newProducts = (res.list || []).map(item => this.formatProduct(item))
      const allProducts = reset ? newProducts : [...this.data.products, ...newProducts]

      this.setData({
        products: allProducts,
        totalCount: res.total || 0,
        noMore: newProducts.length < this.data.pageSize,
        page: this.data.page + 1
      })
    } catch (e) {
      console.error('加载特产失败', e)
      toast('加载失败')
    } finally {
      this.setData({ loading: false, refreshing: false })
    }
  },

  loadMore() {
    this.setData({ loadingMore: true })
    this.loadProducts(false).finally(() => {
      this.setData({ loadingMore: false })
    })
  },

  formatProduct(item) {
    const province = getProvinceByCode(item.province)
    const category = PRODUCT_CATEGORIES_V2.find(c => c.id === item.category)
    const statusConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG.active

    return {
      ...item,
      coverUrl: item.images?.[0] ? processImageUrl(item.images[0]) : '',
      provinceName: province?.name || item.province,
      categoryName: category?.name || '',
      categoryEmoji: category?.emoji || '',
      statusConfig,
      timeLabel: formatTime(item.createTime),
      viewCount: item.viewCount || 0,
      favCount: item.favCount || 0
    }
  },

  // 编辑特产
  editProduct(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/publish/index?edit=${id}`
    })
  },

  // 下架特产
  async removeProduct(e) {
    const { id, name } = e.currentTarget.dataset

    const res = await new Promise(resolve =>
      wx.showModal({
        title: '下架特产',
        content: `确认下架「${name}」吗？下架后其他人将无法看到此特产。`,
        confirmText: '下架',
        confirmColor: '#E63946',
        success: resolve
      })
    )

    if (!res.confirm) return

    showLoading('处理中...')
    try {
      const result = await callCloud('productMgr', {
        action: 'remove',
        productId: id
      })

      if (result.success) {
        toast('已下架', 'success')
        this.loadProducts(true)
      } else {
        toast(result.message || '操作失败')
      }
    } catch (e) {
      toast('网络错误')
    } finally {
      hideLoading()
    }
  },

  // 重新上架
  async reactivateProduct(e) {
    const { id } = e.currentTarget.dataset

    showLoading('处理中...')
    try {
      const result = await callCloud('productMgr', {
        action: 'updateStatus',
        productId: id,
        status: 'active'
      })

      if (result.success) {
        toast('已重新上架', 'success')
        this.loadProducts(true)
      } else {
        toast(result.message || '操作失败')
      }
    } catch (e) {
      toast('网络错误')
    } finally {
      hideLoading()
    }
  },

  // 删除特产
  async deleteProduct(e) {
    const { id, name } = e.currentTarget.dataset

    const res = await new Promise(resolve =>
      wx.showModal({
        title: '删除特产',
        content: `确认删除「${name}」吗？删除后将无法恢复。`,
        confirmText: '删除',
        confirmColor: '#E63946',
        success: resolve
      })
    )

    if (!res.confirm) return

    showLoading('删除中...')
    try {
      const result = await callCloud('productMgr', {
        action: 'delete',
        productId: id
      })

      if (result.success) {
        toast('已删除', 'success')
        this.loadProducts(true)
      } else {
        toast(result.message || '删除失败')
      }
    } catch (e) {
      toast('网络错误')
    } finally {
      hideLoading()
    }
  },

  // 查看详情
  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/detail/index?id=${id}`
    })
  },

  // 去发布
  goToPublish() {
    wx.reLaunch({ url: '/pages/publish/index' })
  }
})