// pages/my-reviews/index.js - 我的评价（全新设计）
const { callCloud, processImageUrl, toast } = require('../../utils/util')

// 评分映射
const RATING_INFO = {
  5: { text: '超级满意', class: 'excellent', emoji: '🌟' },
  4: { text: '满意', class: 'good', emoji: '⭐' },
  3: { text: '一般', class: 'normal', emoji: '✨' },
  2: { text: '不满意', class: 'bad', emoji: '⚠️' },
  1: { text: '非常差', class: 'terrible', emoji: '❌' }
}

Page({
  data: {
    // 当前激活的Tab
    activeTab: 'sent',
    
    // 我发出的评价
    sentReviews: [],
    sentLoading: false,
    sentNoMore: false,
    sentRefreshing: false,
    sentPage: 1,
    
    // 我收到的评价
    receivedReviews: [],
    receivedLoading: false,
    receivedNoMore: false,
    receivedRefreshing: false,
    receivedPage: 1,
    
    // 统计数据
    stats: {
      sentCount: 0,
      receivedCount: 0,
      avgRating: 0,
      excellentCount: 0
    }
  },

  onLoad() {
    this.loadSentReviews()
    this.calculateStats()
  },

  onShow() {
    // 如果已经加载过，刷新数据
    if (this.data._hasLoaded) {
      this.refreshCurrentTab()
    }
  },

  onPullDownRefresh() {
    this.refreshCurrentTab()
  },

  // 返回上一页
  goBack() {
    wx.navigateBack()
  },

  // 切换Tab
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return
    
    this.setData({ activeTab: tab })
    
    // 首次切换时加载数据
    if (tab === 'received' && this.data.receivedReviews.length === 0 && !this.data.receivedLoading) {
      this.loadReceivedReviews()
    }
  },

  // 刷新当前Tab
  refreshCurrentTab() {
    if (this.data.activeTab === 'sent') {
      this.refreshSent()
    } else {
      this.refreshReceived()
    }
  },

  // ========== 我发出的评价 ==========
  async loadSentReviews() {
    if (this.data.sentLoading || this.data.sentNoMore) return
    this.setData({ sentLoading: true })
    
    try {
      const res = await callCloud('reviewMgr', {
        action: 'myReviews',
        page: this.data.sentPage,
        pageSize: 20
      })
      
      if (res.success) {
        const list = (res.list || []).map(item => {
          const ratingInfo = RATING_INFO[item.rating] || RATING_INFO[3]
          return {
            ...item,
            coverUrl: item.productCover ? processImageUrl(item.productCover) : '',
            ratingInfo,
            createTimeText: this.formatTime(item.createTime),
            tags: item.tags || []
          }
        })
        
        this.setData({
          sentReviews: [...this.data.sentReviews, ...list],
          sentPage: this.data.sentPage + 1,
          sentNoMore: list.length < 20,
          _hasLoaded: true
        })
        
        this.calculateStats()
      }
    } catch (e) {
      console.error('加载发出的评价失败', e)
      toast('加载失败，请重试')
    } finally {
      this.setData({ sentLoading: false })
    }
  },

  refreshSent() {
    this.setData({ 
      sentReviews: [], 
      sentPage: 1, 
      sentNoMore: false,
      sentRefreshing: true 
    })
    
    this.loadSentReviews().then(() => {
      this.setData({ sentRefreshing: false })
      wx.stopPullDownRefresh()
    })
  },

  loadMoreSent() {
    if (!this.data.sentNoMore && !this.data.sentLoading) {
      this.loadSentReviews()
    }
  },

  // ========== 我收到的评价 ==========
  async loadReceivedReviews() {
    if (this.data.receivedLoading || this.data.receivedNoMore) return
    this.setData({ receivedLoading: true })
    
    try {
      const res = await callCloud('reviewMgr', {
        action: 'receivedReviews',
        page: this.data.receivedPage,
        pageSize: 20
      })
      
      if (res.success) {
        const list = (res.list || []).map(item => {
          const ratingInfo = RATING_INFO[item.rating] || RATING_INFO[3]
          return {
            ...item,
            coverUrl: item.productCover ? processImageUrl(item.productCover) : '',
            ratingInfo,
            createTimeText: this.formatTime(item.createTime),
            tags: item.tags || [],
            reviewerName: (item.reviewer && item.reviewer.nickName) ? item.reviewer.nickName : '匿名用户',
            reviewerAvatar: (item.reviewer && item.reviewer.avatarUrl) ? processImageUrl(item.reviewer.avatarUrl) : ''
          }
        })
        
        this.setData({
          receivedReviews: [...this.data.receivedReviews, ...list],
          receivedPage: this.data.receivedPage + 1,
          receivedNoMore: list.length < 20
        })
        
        this.calculateStats()
      }
    } catch (e) {
      console.error('加载收到的评价失败', e)
      toast('加载失败，请重试')
    } finally {
      this.setData({ receivedLoading: false })
    }
  },

  refreshReceived() {
    this.setData({ 
      receivedReviews: [], 
      receivedPage: 1, 
      receivedNoMore: false,
      receivedRefreshing: true 
    })
    
    this.loadReceivedReviews().then(() => {
      this.setData({ receivedRefreshing: false })
      wx.stopPullDownRefresh()
    })
  },

  loadMoreReceived() {
    if (!this.data.receivedNoMore && !this.data.receivedLoading) {
      this.loadReceivedReviews()
    }
  },

  // ========== 通用方法 ==========
  formatTime(time) {
    if (!time) return ''
    const date = new Date(time)
    const now = new Date()
    const diff = now - date
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return '刚刚'
    if (minutes < 60) return minutes + '分钟前'
    if (hours < 24) return hours + '小时前'
    if (days < 30) return days + '天前'

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  // 计算统计数据
  calculateStats() {
    const { sentReviews, receivedReviews } = this.data
    
    // 我发出的评价数量
    const sentCount = sentReviews.length
    
    // 我收到的评价数量
    const receivedCount = receivedReviews.length
    
    // 平均评分（只计算收到的评价）
    let totalRating = 0
    let excellentCount = 0
    
    receivedReviews.forEach(review => {
      totalRating += review.rating || 0
      if (review.rating === 5) {
        excellentCount++
      }
    })
    
    const avgRating = receivedCount > 0 ? (totalRating / receivedCount).toFixed(1) : 0
    
    this.setData({
      stats: {
        sentCount,
        receivedCount,
        avgRating,
        excellentCount
      }
    })
  },

  // 跳转到订单详情
  goToOrderDetail(e) {
    const orderId = e.currentTarget.dataset.orderid
    if (orderId) {
      wx.navigateTo({ url: `/pages/order-detail/index?id=${orderId}` })
    }
  },

  // 跳转到用户主页
  goToUserProfile(e) {
    const openid = e.currentTarget.dataset.openid
    if (openid) {
      wx.navigateTo({ url: `/pages/user-profile/index?openid=${openid}` })
    }
  },

  // 分享评价
  shareReview(e) {
    const review = e.currentTarget.dataset.review
    if (!review) return
    
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
    
    toast('已准备分享，请点击右上角分享按钮')
  },

  // 长按评价卡片
  onReviewLongPress(e) {
    const review = e.currentTarget.dataset.review
    const type = e.currentTarget.dataset.type // 'sent' or 'received'
    
    if (!review) return
    
    const actions = ['查看订单详情']
    
    if (type === 'received') {
      actions.push('感谢评价')
      actions.push('回复评价')
    }
    
    wx.showActionSheet({
      itemList: actions,
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            this.goToOrderDetail({ currentTarget: { dataset: { orderid: review.orderId } } })
            break
          case 1:
            if (type === 'received') {
              this.thankReviewer(review)
            }
            break
          case 2:
            if (type === 'received') {
              this.replyToReview(review)
            }
            break
        }
      }
    })
  },

  // 感谢评价者
  thankReviewer(review) {
    wx.showModal({
      title: '感谢评价',
      content: `向${review.reviewerName || '用户'}发送感谢消息？`,
      success: (res) => {
        if (res.confirm) {
          toast('感谢消息已发送')
          // 这里可以调用云函数发送消息
        }
      }
    })
  },

  // 回复评价
  replyToReview(review) {
    wx.showModal({
      title: '回复评价',
      editable: true,
      placeholderText: '输入回复内容...',
      success: (res) => {
        if (res.confirm && res.content) {
          toast('回复已发送')
          // 这里可以调用云函数保存回复
        }
      }
    })
  },

  // 查看所有好评
  viewExcellentReviews() {
    const excellentReviews = this.data.receivedReviews.filter(r => r.rating === 5)
    if (excellentReviews.length === 0) {
      toast('暂无超级满意评价')
      return
    }
    
    wx.showModal({
      title: '超级满意评价',
      content: `共有${excellentReviews.length}个超级满意评价`,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  // 导出评价记录
  exportReviews() {
    const { sentReviews, receivedReviews } = this.data
    const allReviews = [...sentReviews, ...receivedReviews]
    
    if (allReviews.length === 0) {
      toast('没有评价记录可导出')
      return
    }
    
    // 构建导出文本
    const exportText = allReviews.map(review => {
      const type = review.reviewerOpenid ? '发出的评价' : '收到的评价'
      const target = review.reviewerName || (review.reviewee && review.reviewee.nickName) ? review.reviewee.nickName : '用户'
      const rating = (review.ratingInfo && review.ratingInfo.text) ? review.ratingInfo.text : '未评价'
      const time = review.createTimeText
      const product = review.productName || '特产'
      
      return `${type} | ${target} | ${product} | ${rating} | ${time}`
    }).join('\n')
    
    wx.setClipboardData({
      data: exportText,
      success: () => {
        toast('评价记录已复制到剪贴板')
      }
    })
  },

  // 跳转到订单页面
  goToOrders() {
    wx.switchTab({ url: '/pages/orders/index' })
  }
})