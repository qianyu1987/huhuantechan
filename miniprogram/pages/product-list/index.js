// pages/product-list/index.js
const { callCloud, getProvinceByCode } = require('../../utils/util')
const { PRODUCT_CATEGORIES } = require('../../utils/constants')

const PAGE_SIZE = 20

Page({
  data: {
    category: '',
    title: '',
    products: [],
    page: 1,
    hasMore: true,
    loading: false,
    loadingMore: false,
    refreshing: false,
    activeFilter: '',
    // 平台统计数据
    platformStats: {
      productCount: 0,
      swapCount: 0,
      userCount: 0
    },
    // 分类列表
    categories: [],
    selectedCategory: '',
    totalCount: 0
  },

  onLoad(options) {
    const { category, title, isMystery } = options
    
    // 设置标题和分类信息
    let pageTitle = title
    let categoryEmoji = ''
    if (!pageTitle && category) {
      const cat = PRODUCT_CATEGORIES.find(c => c.id === category)
      pageTitle = cat ? cat.name : '特产列表'
      categoryEmoji = cat ? cat.emoji : ''
    }
    if (isMystery === 'true') {
      pageTitle = '惊喜特产'
      categoryEmoji = '🎁'
    }
    
    this.setData({
      category: category || '',
      selectedCategory: category || '',
      title: pageTitle || '特产列表',
      categoryEmoji: categoryEmoji,
      isMystery: isMystery === 'true',
      categories: PRODUCT_CATEGORIES
    })

    // 设置导航栏标题
    wx.setNavigationBarTitle({
      title: pageTitle || '特产列表'
    })

    // 加载平台统计数据和产品列表
    this.loadPlatformStats()
    this.loadProducts()
  },

  // 加载平台统计数据
  async loadPlatformStats() {
    try {
      console.log('[ProductList] 开始加载平台统计...')
      const res = await callCloud('productMgr', { action: 'getPlatformStats' })
      console.log('[ProductList] 平台统计响应:', res)
      if (res && res.success) {
        this.setData({
          platformStats: {
            productCount: res.productCount || 0,
            swapCount: res.swapCount || 0,
            userCount: res.userCount || 0
          }
        })
        console.log('[ProductList] 平台统计加载成功:', this.data.platformStats)
      } else {
        console.warn('[ProductList] 平台统计返回失败:', res?.message)
      }
    } catch (e) {
      console.error('[ProductList] 加载平台统计失败:', e)
      wx.showToast({
        title: '统计数据加载失败',
        icon: 'none'
      })
    }
  },

  // 加载产品列表
  async loadProducts(isRefresh = false) {
    if (this.data.loading) return

    const page = isRefresh ? 1 : this.data.page

    this.setData({ 
      loading: true,
      loadingMore: !isRefresh && page > 1
    })

    try {
      const params = {
        action: 'list',
        page: page,
        pageSize: PAGE_SIZE,
        status: this.data.activeFilter || undefined
      }

      // 分类筛选
      if (this.data.category) {
        params.category = this.data.category
      }

      // 惊喜特产筛选
      if (this.data.isMystery) {
        params.isMystery = true
      }

      console.log('[ProductList] 加载产品:', params)

      const res = await callCloud('productMgr', params)

      if (res && res.success) {
        // 格式化产品数据
        const formattedProducts = res.list.map(item => this.formatProduct(item))

        // 合并数据
        const products = isRefresh ? formattedProducts : [...this.data.products, ...formattedProducts]
        const hasMore = formattedProducts.length >= PAGE_SIZE

        this.setData({
          products: products,
          page: page + 1,
          hasMore: hasMore,
          loading: false,
          loadingMore: false,
          refreshing: false,
          totalCount: res.total || products.length
        })

        console.log('[ProductList] 加载完成:', formattedProducts.length, '条')
      } else {
        throw new Error(res?.message || '加载失败')
      }
    } catch (e) {
      console.error('[ProductList] 加载失败:', e)
      this.setData({
        loading: false,
        loadingMore: false,
        refreshing: false
      })
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  // 格式化产品数据
  formatProduct(p) {
    const category = PRODUCT_CATEGORIES.find(c => c.id === p.category)
    const province = getProvinceByCode(p.province)

    // 状态文本
    const statusMap = {
      'active': '可互换',
      'swapped': '已互换',
      'in_swap': '互换中',
      'inactive': '已下架'
    }

    // 惊喜特产颜色 - 使用统一的5种颜色
    const colorClasses = ['purple', 'blue', 'green', 'red', 'gold']
    const colorClass = p.isMystery ? colorClasses[Math.floor(Math.random() * colorClasses.length)] : ''

    // 惊喜特产emoji - 随机分配不同的礼盒/礼物emoji
    const mysteryEmojis = ['🎁', '🎀', '🎊', '🎉', '🎈', '🎆', '🎇', '✨', '💫', '⭐', '🌟', '💎', '🔮', '🧧', '🏮']
    const mysteryEmoji = p.isMystery ? (p.emoji || mysteryEmojis[Math.floor(Math.random() * mysteryEmojis.length)]) : ''

    // 处理图片URL - 云函数返回的images是字符串数组
    let coverUrl = ''
    if (p.images && Array.isArray(p.images) && p.images.length > 0) {
      // images可能是字符串数组或对象数组
      const firstImg = p.images[0]
      coverUrl = typeof firstImg === 'string' ? firstImg : (firstImg?.url || '')
    }

    return {
      ...p,
      categoryName: category?.name || '',
      categoryEmoji: category?.emoji || '',
      provinceName: province?.name || p.province || '未知',
      statusText: statusMap[p.status] || p.status,
      colorClass: p.colorClass || colorClass,
      coverUrl: coverUrl,
      emoji: mysteryEmoji
    }
  },

  // 切换分类
  switchCategory(e) {
    const id = e.currentTarget.dataset.code
    if (id === this.data.selectedCategory) return

    const category = PRODUCT_CATEGORIES.find(c => c.id === id)
    
    this.setData({
      selectedCategory: id,
      category: id,
      title: category ? category.name : '特产列表',
      categoryEmoji: category ? category.emoji : '',
      products: [],
      page: 1,
      hasMore: true
    })

    wx.setNavigationBarTitle({
      title: category ? category.name : '特产列表'
    })

    this.loadProducts(true)
  },

  // 下拉刷新
  onRefresh() {
    this.setData({ refreshing: true })
    this.loadPlatformStats()
    this.loadProducts(true)
  },

  // 加载更多
  loadMore() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadProducts()
    }
  },

  // 设置筛选
  setFilter(e) {
    const filter = e.currentTarget.dataset.filter
    if (filter === this.data.activeFilter) return

    this.setData({
      activeFilter: filter,
      products: [],
      page: 1,
      hasMore: true
    })

    this.loadProducts(true)
  },

  // 跳转到详情
  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/detail/index?id=${id}`
    })
  },

  // 返回
  goBack() {
    wx.navigateBack()
  },

  // 去发布
  goToPublish() {
    wx.switchTab({
      url: '/pages/publish/index'
    })
  },

  // 分享
  onShareAppMessage() {
    return {
      title: this.data.title || '特产列表',
      path: `/pages/product-list/index?category=${this.data.category}&title=${this.data.title}`
    }
  }
})
