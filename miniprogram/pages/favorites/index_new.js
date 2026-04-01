// pages/favorites/index_new.js - 我的收藏（全新设计）
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
    showManage: false,
    
    // 筛选
    activeFilter: 'all',
    
    // 统计
    activeCount: 0,
    daigouCount: 0,
    mysteryCount: 0,
    
    // 管理
    selectedFavorites: [],
    selectedAll: false,
    selectedCount: 0
  },

  onLoad() {
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
          coverUrl: item.images?.[0] ? processImageUrl(item.images[0]) : '',
          provinceName: province?.name || '未知',
          provinceColor: province?.color || '#999',
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
      case 'province':
        // 按省份分组（这里简单实现为按省份排序）
        filtered.sort((a, b) => (a.provinceName || '').localeCompare(b.provinceName || ''))
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

  // 显示管理面板
  showManagePanel() {
    this.setData({ showManage: true })
  },

  // 隐藏管理面板
  hideManagePanel() {
    this.setData({ showManage: false })
  },

  // 全选
  selectAllFavorites() {
    const selectedAll = !this.data.selectedAll
    const selectedFavorites = selectedAll ? this.data.favorites.map(item => item._id) : []
    
    this.setData({
      selectedAll,
      selectedFavorites,
      selectedCount: selectedFavorites.length
    })
  },

  // 批量删除
  batchRemoveFavorites() {
    const { selectedFavorites } = this.data
    
    if (selectedFavorites.length === 0) {
      toast('请先选择要删除的收藏')
      return
    }
    
    wx.showModal({
      title: '批量删除',
      content: `确定要删除选中的${selectedFavorites.length}个收藏吗？`,
      confirmText: '删除',
      confirmColor: '#FF453A',
      success: async (res) => {
        if (res.confirm) {
          await this.doBatchRemove(selectedFavorites)
        }
      }
    })
  },

  // 执行批量删除
  async doBatchRemove(ids) {
    try {
      // 这里可以优化为批量操作，但云函数可能不支持
      // 暂时逐个删除
      for (const id of ids) {
        await callCloud('productMgr', { action: 'removeFavorite', productId: id })
      }
      
      // 重新加载数据
      await this.loadFavorites()
      
      // 重置选择状态
      this.setData({
        selectedFavorites: [],
        selectedAll: false,
        selectedCount: 0
      })
      
      toast(`已删除${ids.length}个收藏`)
      
    } catch (e) {
      console.error('批量删除失败', e)
      toast('删除失败，请重试')
    }
  },

  // 按时间排序
  sortByTime() {
    const filtered = [...this.data.filteredFavorites]
    filtered.sort((a, b) => new Date(b.collectTime) - new Date(a.collectTime))
    this.setData({ filteredFavorites: filtered })
    this.hideManagePanel()
    toast('已按收藏时间排序')
  },

  // 按省份排序
  sortByProvince() {
    const filtered = [...this.data.filteredFavorites]
    filtered.sort((a, b) => (a.provinceName || '').localeCompare(b.provinceName || ''))
    this.setData({ filteredFavorites: filtered })
    this.hideManagePanel()
    toast('已按省份排序')
  },

  // 仅显示可分享
  showOnlyActive() {
    this.setData({ activeFilter: 'active' })
    this.applyFilter('active')
    this.hideManagePanel()
    toast('已筛选可分享特产')
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
  },

  // 长按卡片（预留功能）
  onCardLongPress(e) {
    const id = e.currentTarget.dataset.id
    wx.showActionSheet({
      itemList: ['取消收藏', '分享给好友', '查看详情'],
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
        }
      }
    })
  }
})