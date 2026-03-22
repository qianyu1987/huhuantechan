// pages/my-reviews/index.js - 我的评价记录（双Tab：发出的 + 收到的）
const { callCloud, processImageUrl, toast } = require('../../utils/util')

Page({
  data: {
    activeTab: 'sent', // 'sent' | 'received'
    // Tab 1: 我发出的
    sentReviews: [],
    sentLoading: false,
    sentPage: 1,
    sentNoMore: false,
    sentRefreshing: false,
    // Tab 2: 收到的
    receivedReviews: [],
    receivedLoading: false,
    receivedPage: 1,
    receivedNoMore: false,
    receivedRefreshing: false
  },

  onLoad() {
    this.loadSentReviews()
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return
    this.setData({ activeTab: tab })

    // 首次切换时加载数据
    if (tab === 'received' && this.data.receivedReviews.length === 0 && !this.data.receivedLoading) {
      this.loadReceivedReviews()
    }
  },

  // ===== 我发出的评价 =====
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
        const list = (res.list || []).map(item => ({
          ...item,
          coverUrl: item.productCover ? processImageUrl(item.productCover) : '',
          createTimeText: this.formatTime(item.createTime)
        }))
        this.setData({
          sentReviews: [...this.data.sentReviews, ...list],
          sentPage: this.data.sentPage + 1,
          sentNoMore: list.length < 20
        })
      }
    } catch (e) {
      console.error('加载发出的评价失败', e)
      toast('加载失败')
    } finally {
      this.setData({ sentLoading: false })
    }
  },

  refreshSent() {
    this.setData({ sentReviews: [], sentPage: 1, sentNoMore: false })
    this.loadSentReviews().then(() => {
      this.setData({ sentRefreshing: false })
    })
  },

  loadMoreSent() {
    if (!this.data.sentNoMore) this.loadSentReviews()
  },

  // ===== 收到的评价 =====
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
        const list = (res.list || []).map(item => ({
          ...item,
          coverUrl: item.productCover ? processImageUrl(item.productCover) : '',
          createTimeText: this.formatTime(item.createTime),
          reviewerName: item.reviewer?.nickName || '匿名用户',
          reviewerAvatar: item.reviewer?.avatarUrl || ''
        }))
        this.setData({
          receivedReviews: [...this.data.receivedReviews, ...list],
          receivedPage: this.data.receivedPage + 1,
          receivedNoMore: list.length < 20
        })
      }
    } catch (e) {
      console.error('加载收到的评价失败', e)
      toast('加载失败')
    } finally {
      this.setData({ receivedLoading: false })
    }
  },

  refreshReceived() {
    this.setData({ receivedReviews: [], receivedPage: 1, receivedNoMore: false })
    this.loadReceivedReviews().then(() => {
      this.setData({ receivedRefreshing: false })
    })
  },

  loadMoreReceived() {
    if (!this.data.receivedNoMore) this.loadReceivedReviews()
  },

  // ===== 通用方法 =====
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

  goBack() {
    wx.navigateBack()
  },

  goToOrderDetail(e) {
    const orderId = e.currentTarget.dataset.orderid
    wx.navigateTo({ url: `/pages/order-detail/index?id=${orderId}` })
  }
})
