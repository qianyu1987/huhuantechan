// pages/favorites/index.js - 我的收藏（全新设计）
const { callCloud, processImageUrl, getProvinceByCode, toast, formatTime } = require('../../utils/util')

// 价值区间映射
const VALUE_RANGE_MAP = {
  'under_20': '20元以内',
  '20_50': '20-50元',
  '50_100': '50-100元',
  '100_200': '100-200元',
  '200_500': '200-500元',
  '500_1000': '500-1000元',
  'over_1000': '1000元以上'
}

// 状态文本映射
const STATUS_TEXT_MAP = {
  'active': '可分享',
  'pending_review': '审核中',
  'rejected': '已拒绝',
  'in_swap': '分享中',
  'swapped': '已分享',
  'removed': '已下架'
}

Page({
  data: {
    // 数据
    favorites: [],
    filteredFavorites: [],
    
    // 状态
    loading: true,
    refreshing: false,
    
    // 筛选
    activeFilter: 'all',
    
    // 统计
    activeCount: 0,
    daigouCount: 0,
    mysteryCount: 0
  },

  onLoad() {
    // 初始化主题
    const savedTheme = wx.getStorageSync('appTheme') || 'dark'
    this.setData({ pageTheme: savedTheme })

    this.loadFavorites()
  },

  onShow() {
    // 如果已经加载过，刷新数据
    if (this.data._hasLoaded) {
      this.loadFavorites()
    }
  },

  onPullDownRefresh() {
    this.onRefresh()
  },

  // 返回上一页
  goBack() {
    wx.navigateBack()
  },

  // 刷新数据
  async onRefresh() {
    if (this.data.refreshing) return
    
    this.setData({ refreshing: true })
    await this.loadFavorites()
    this.setData({ refreshing: false })
    
    // 停止下拉刷新
    wx.stopPullDownRefresh()
  },

  // 加载收藏数据
  async loadFavorites() {
    this.setData({ loading: true })
    
    try {
      const res = await callCloud('productMgr', { action: 'myFavorites' })
      const list = (res.list || []).map(item => {
        const province = getProvinceByCode(item.province)
        return {
          ...item,
          coverUrl: (item.images && item.images[0]) ? processImageUrl(item.images[0]) : '',
          provinceName: (province && province.name) ? province.name : '未知',
          provinceColor: (province && province.color) ? province.color : '#999',
          categoryName: this.getCategoryName(item.category),
          collectTime: item.collectTime || item.createTime || new Date().toISOString()
        }
      })
      
      // 计算统计
      const activeCount = list.filter(item => item.status === 'active').length
      const daigouCount = list.filter(item => item.daigou).length
      const mysteryCount = list.filter(item => item.isMystery).length
      
      this.setData({
        favorites: list,
        filteredFavorites: list,
        activeCount,
        daigouCount,
        mysteryCount,
        loading: false,
        _hasLoaded: true
      })
      
      this.applyFilter('all')
      
    } catch (e) {
      console.error('加载收藏失败', e)
      toast('加载失败，请重试')
      this.setData({ loading: false })
    }
  },

  // 获取分类名称
  getCategoryName(categoryId) {
    const categories = require('../../utils/constants').PRODUCT_CATEGORIES || []
    const category = categories.find(c => c.id === categoryId)
    return category ? category.name : ''
  },

  // 获取状态文本
  getStatusText(status) {
    return STATUS_TEXT_MAP[status] || status
  },

  // 获取价值区间文本
  getValueRangeText(valueRange) {
    return VALUE_RANGE_MAP[valueRange] || valueRange
  },

  // 格式化收藏时间
  formatCollectTime(timeStr) {
    if (!timeStr) return '刚刚'
    
    try {
      const time = new Date(timeStr)
      const now = new Date()
      const diffMs = now - time
      const diffMins = Math.floor(diffMs / (1000 * 60))
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      
      if (diffMins < 1) return '刚刚'
      if (diffMins < 60) return `${diffMins}分钟前`
      if (diffHours < 24) return `${diffHours}小时前`
      if (diffDays < 7) return `${diffDays}天前`
      
      return formatTime(time)
    } catch (e) {
      return '未知时间'
    }
  },

  // 切换筛选
  changeFilter(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({ activeFilter: filter })
    this.applyFilter(filter)
  },

  // 应用筛选
  applyFilter(filter) {
    let filtered = [...this.data.favorites]
    
    switch (filter) {
      case 'active':
        filtered = filtered.filter(item => item.status === 'active')
        break
      case 'daigou':
        filtered = filtered.filter(item => item.daigou)
        break
      case 'mystery':
        filtered = filtered.filter(item => item.isMystery)
        break
      case 'all':
      default:
        // 默认按收藏时间倒序
        filtered.sort((a, b) => new Date(b.collectTime) - new Date(a.collectTime))
        break
    }
    
    this.setData({ filteredFavorites: filtered })
  },

  // 跳转到详情
  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/detail/index?id=${id}` })
  },

  // 跳转到发现页
  goToDiscover() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  // 跳转到匹配页
  goToMatch() {
    wx.switchTab({ url: '/pages/match/index' })
  },

  // 使用收藏的产品进行匹配
  goToMatchWithProduct(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ 
      url: `/pages/match/index?fromFavorite=${id}`,
      success: () => {
        toast('已跳转到匹配页面')
      }
    })
  },

  // 分享产品
  shareProduct(e) {
    const id = e.currentTarget.dataset.id
    const product = this.data.favorites.find(item => item._id === id)
    
    if (!product) return
    
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
    
    toast('已准备分享，请点击右上角分享按钮')
  },

  // 取消收藏
  removeFavorite(e) {
    const id = e.currentTarget.dataset.id
    const product = this.data.favorites.find(item => item._id === id)
    
    if (!product) return
    
    wx.showModal({
      title: '取消收藏',
      content: `确定要取消收藏"${product.name || '神秘特产'}"吗？`,
      confirmText: '取消收藏',
      confirmColor: '#FF453A',
      success: async (res) => {
        if (res.confirm) {
          await this.doRemoveFavorite(id)
        }
      }
    })
  },

  // 执行取消收藏
  async doRemoveFavorite(id) {
    try {
      await callCloud('productMgr', { action: 'removeFavorite', productId: id })
      
      // 更新数据
      const favorites = this.data.favorites.filter(item => item._id !== id)
      const filteredFavorites = this.data.filteredFavorites.filter(item => item._id !== id)
      
      // 重新计算统计
      const activeCount = favorites.filter(item => item.status === 'active').length
      const daigouCount = favorites.filter(item => item.daigou).length
      
      this.setData({
        favorites,
        filteredFavorites,
        activeCount,
        daigouCount
      })
      
      toast('已取消收藏')
      
    } catch (e) {
      console.error('取消收藏失败', e)
      toast('操作失败，请重试')
    }
  },

  // 长按卡片
  onCardLongPress(e) {
    const id = e.currentTarget.dataset.id
    const product = this.data.favorites.find(item => item._id === id)
    
    if (!product) return
    
    wx.showActionSheet({
      itemList: ['取消收藏', '分享给好友', '查看详情', '使用匹配'],
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            this.removeFavorite({ currentTarget: { dataset: { id } } })
            break
          case 1:
            this.shareProduct({ currentTarget: { dataset: { id } } })
            break
          case 2:
            this.goToDetail({ currentTarget: { dataset: { id } } })
            break
          case 3:
            this.goToMatchWithProduct({ currentTarget: { dataset: { id } } })
            break
        }
      }
    })
  },

  // 清理无效收藏
  clearInactiveFavorites() {
    const inactiveFavorites = this.data.favorites.filter(item => 
      item.status !== 'active' && item.status !== 'pending_review'
    )
    
    if (inactiveFavorites.length === 0) {
      toast('没有无效收藏')
      return
    }
    
    wx.showModal({
      title: '清理无效收藏',
      content: `发现${inactiveFavorites.length}个已下架或已分享的特产，是否清理？`,
      confirmText: '清理',
      confirmColor: '#FF453A',
      success: async (res) => {
        if (res.confirm) {
          await this.doClearInactive(inactiveFavorites.map(item => item._id))
        }
      }
    })
  },

  // 执行清理无效收藏
  async doClearInactive(ids) {
    try {
      for (const id of ids) {
        await callCloud('productMgr', { action: 'removeFavorite', productId: id })
      }
      
      await this.loadFavorites()
      toast(`已清理${ids.length}个无效收藏`)
      
    } catch (e) {
      console.error('清理失败', e)
      toast('清理失败，请重试')
    }
  },

  // 导出收藏（模拟功能）
  exportFavorites() {
    const { favorites } = this.data
    
    if (favorites.length === 0) {
      toast('没有收藏可导出')
      return
    }
    
    // 构建导出数据
    const exportData = favorites.map(item => ({
      名称: item.name || '神秘特产',
      省份: item.provinceName,
      状态: this.getStatusText(item.status),
      收藏时间: this.formatCollectTime(item.collectTime),
      是否代购: item.daigou ? '是' : '否',
      是否神秘: item.isMystery ? '是' : '否'
    }))
    
    // 在实际应用中，这里可以生成文件或分享
    wx.showModal({
      title: '导出收藏',
      content: `共${favorites.length}个收藏，已复制到剪贴板`,
      showCancel: false,
      success: () => {
        // 复制到剪贴板
        const text = exportData.map(item => 
          `${item.名称} | ${item.省份} | ${item.状态}`
        ).join('\n')
        
        wx.setClipboardData({
          data: text,
          success: () => {
            toast('已复制到剪贴板')
          }
        })
      }
    })
  }
})