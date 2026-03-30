// pages/daigou-order-list/index.js
const { callCloud, toast } = require('../../utils/util')

const app = getApp()

Page({
  data: {
    role: 'buyer',       // buyer | seller
    filterStatus: '',
    list: [],
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: false,
    loading: true,
    // 积分信息
    userPoints: 0,
    creditScore: 100,
    statusLabel: {
      pending_payment:  '待付款',
      pending_shipment: '待发货',
      shipped:          '已发货',
      completed:        '已完成',
      cancelled:        '已取消',
      refunding:        '退款中',
      refunded:         '已退款'
    },
    // 统计
    buyerStats: { total: 0, completed: 0, pending: 0 },
    sellerStats: { total: 0, completed: 0, pending: 0 }
  },

  onLoad(options) {
    if (options.role) {
      this.setData({ role: options.role })
    }
    this._loadUserInfo()
    this.loadList(true)
  },

  onShow() {
    // 刷新积分（从 globalData 实时读取）
    this._syncPoints()
  },

  onPullDownRefresh() {
    this._loadUserInfo()
    this.loadList(true).then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 同步全局积分
  _syncPoints() {
    const g = app.globalData
    this.setData({
      userPoints: g.points || 0,
      creditScore: g.creditScore || 100
    })
  },

  // 加载用户积分（从服务端刷新）
  async _loadUserInfo() {
    try {
      const res = await callCloud('userInit', { action: 'getStats' })
      if (res && res.success) {
        const points = res.points || (app.globalData.points || 0)
        const credit = res.creditScore || (app.globalData.creditScore || 100)
        app.globalData.points = points
        app.globalData.creditScore = credit
        this.setData({ userPoints: points, creditScore: credit })
      } else {
        this._syncPoints()
      }
    } catch (e) {
      this._syncPoints()
    }
  },

  switchRole(e) {
    const role = e.currentTarget.dataset.role
    if (role === this.data.role) return
    this.setData({ role, page: 1, list: [], filterStatus: '' })
    this.loadList(true)
  },

  switchStatus(e) {
    const status = e.currentTarget.dataset.status
    if (status === this.data.filterStatus) return
    this.setData({ filterStatus: status, page: 1, list: [] })
    this.loadList(true)
  },

  async loadList(reset = false) {
    if (!reset && !this.data.hasMore) return
    this.setData({ loading: true })
    const page = reset ? 1 : this.data.page + 1
    try {
      const res = await callCloud('daigouMgr', {
        action: 'getOrderList',
        role: this.data.role,
        status: this.data.filterStatus || undefined,
        page,
        pageSize: this.data.pageSize
      })
      if (res.success) {
        const newList = reset ? res.list : [...this.data.list, ...res.list]
        const total = res.total || 0

        // pending/completed 统计仅基于当前页（近似值），全量统计需后端扩展接口
        // 首屏加载时重置统计，翻页时保持原统计不变（避免数据跳动）
        if (reset) {
          const pending = newList.filter(o => ['pending_payment', 'pending_shipment', 'shipped'].includes(o.status)).length
          const completed = newList.filter(o => o.status === 'completed').length

          if (this.data.role === 'buyer') {
            this.setData({
              buyerStats: { total, completed, pending }
            })
          } else {
            this.setData({
              sellerStats: { total, completed, pending }
            })
          }
        } else {
          // 翻页时只更新 total
          if (this.data.role === 'buyer') {
            this.setData({ 'buyerStats.total': total })
          } else {
            this.setData({ 'sellerStats.total': total })
          }
        }

        this.setData({
          list: newList,
          page,
          total: res.total,
          hasMore: newList.length < res.total
        })
      } else {
        // 处理 success=false 的情况（如集合不存在）
        if (res.errCode === 'COLLECTION_NOT_EXIST') {
          // 集合未创建时静默处理，显示空列表
          this.setData({ list: [], total: 0, hasMore: false })
        } else {
          toast(res.message || '加载失败')
        }
      }
    } catch (e) {
      toast('加载失败')
    } finally {
      this.setData({ loading: false })
    }
  },

  loadMore() {
    this.loadList(false)
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/daigou-order/index?orderId=${id}` })
  },

  // 前往积分中心（预留）
  goPointsCenter() {
    wx.navigateTo({ url: '/pages/mine/index' })
  }
})
