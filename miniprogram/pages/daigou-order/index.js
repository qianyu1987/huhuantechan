// pages/daigou-order/index.js
const { callCloud, toast, formatTime } = require('../../utils/util')

const app = getApp()

const STATUS_MAP = {
  pending_payment:  { text: '等待付款',   desc: '请尽快完成线下付款，卖家收款后即开始备货',    icon: '⏳', color: '#FF9500' },
  pending_shipment: { text: '等待发货',   desc: '卖家正在准备发货，请耐心等待',                icon: '📦', color: '#0A84FF' },
  shipped:          { text: '已发货',     desc: '商品在途中，确认收货后将获得积分奖励',         icon: '🚚', color: '#5856D6' },
  completed:        { text: '交易完成',   desc: '感谢购买！已发放积分奖励',                    icon: '✅', color: '#30D158' },
  cancelled:        { text: '已取消',     desc: '订单已取消',                                 icon: '❌', color: 'rgba(60,60,67,0.4)' },
  refunding:        { text: '退款中',     desc: '退款申请处理中，请等待卖家处理',               icon: '🔄', color: '#FF9500' },
  refunded:         { text: '已退款',     desc: '退款已完成，金额将在1-3个工作日返回',          icon: '💸', color: '#5856D6' }
}

// 完成订单积分奖励（与后端保持一致）
const COMPLETE_REWARD_RATE = 0.05  // 消费金额 5% 换算成积分，向上取整最少5分

Page({
  data: {
    orderId: '',
    order: null,
    isBuyer: true,
    loading: true,
    // 状态显示
    statusIcon: '',
    statusText: '',
    statusDesc: '',
    statusColor: '#FF9500',
    // 时间文本
    createTimeText: '',
    payTimeText: '',
    shipTimeText: '',
    completeTimeText: '',
    // 积分
    userPoints: 0,
    pointsRewarded: 0,
    estimatedReward: 0,
    // 评价状态
    needReview: false,
    myReviewed: false,
    otherReviewed: false,
    // 发货弹窗
    showShipPanel: false,
    shipForm: { company: '', no: '' },
    shipping: false,
    // 弹窗动画
    panelVisible: false,
    // 卖家信息（展示等级/认证）
    sellerInfo: null,
    // 买家信息
    buyerNickName: '',
    buyerOpenidShort: ''
  },

  onLoad(options) {
    const { orderId } = options
    if (!orderId) {
      toast('参数错误')
      setTimeout(() => wx.navigateBack(), 1200)
      return
    }
    this.setData({ orderId })
    this._needRefresh = false  // 初始化刷新标志
    this.loadOrder(orderId)
  },

  onShow() {
    // 仅当从评价页/发货页返回时才刷新（通过标志位控制）
    if (this.data.orderId && !this.data.loading && this._needRefresh) {
      this._needRefresh = false
      this.loadOrder(this.data.orderId)
    }
    // 同步全局积分
    this.setData({ userPoints: app.globalData.points || 0 })
  },

  async loadOrder(orderId) {
    this.setData({ loading: true })
    try {
      const res = await callCloud('daigouMgr', { action: 'getOrderDetail', orderId })
      if (!res.success) {
        toast(res.message || '加载失败')
        this.setData({ loading: false })
        return
      }
      const order = res.order
      const statusInfo = STATUS_MAP[order.status] || { text: order.status, desc: '', icon: '📋', color: '#888' }

      // 计算预估积分奖励
      const price = order.price || 0
      const estimatedReward = Math.max(5, Math.ceil(price * COMPLETE_REWARD_RATE))
      const pointsRewarded = order.pointsRewarded || 0

      // 评价状态
      const isBuyer = res.isBuyer
      const myReviewed = isBuyer ? !!order.buyerReviewed : !!order.sellerReviewed
      const otherReviewed = isBuyer ? !!order.sellerReviewed : !!order.buyerReviewed
      const needReview = order.status === 'completed' && !myReviewed

      // 归一化收货地址字段（兼容多种命名）
      const addr = order.shippingAddress || {}
      const normalizedAddr = {
        name:     addr.name     || addr.contactName  || addr.receiverName  || '',
        phone:    addr.phone    || addr.contactPhone || addr.receiverPhone || '',
        province: addr.province || '',
        city:     addr.city     || '',
        district: addr.district || addr.area         || '',
        detail:   addr.detail   || addr.detailAddress || addr.address       || ''
      }
      order.shippingAddress = normalizedAddr

      // 买家信息（昵称/openid）
      const buyerInfo = order.buyerInfo || {}
      const buyerNickName = buyerInfo.nickName || buyerInfo.name || '未知'
      const buyerOpenidShort = order.buyerOpenid || ''

      this.setData({
        order,
        isBuyer,
        statusIcon: statusInfo.icon,
        statusText: statusInfo.text,
        statusDesc: statusInfo.desc,
        statusColor: statusInfo.color,
        createTimeText:   order.createTime  ? formatTime(order.createTime) : '',
        payTimeText:      order.payTime     ? formatTime(order.payTime) : '',
        shipTimeText:     order.shipTime    ? formatTime(order.shipTime) : '',
        completeTimeText: order.completeTime ? formatTime(order.completeTime) : '',
        estimatedReward,
        pointsRewarded,
        needReview,
        myReviewed,
        otherReviewed,
        sellerInfo: order.sellerInfo || null,
        buyerNickName,
        buyerOpenidShort,
        loading: false
      })

      // 同步最新积分
      this.setData({ userPoints: app.globalData.points || 0 })
    } catch (e) {
      toast('加载失败')
      this.setData({ loading: false })
    }
  },

  copyOrderNo() {
    wx.setClipboardData({ data: this.data.order.orderNo, success: () => toast('已复制', 'success') })
  },

  copyExpressNo() {
    wx.setClipboardData({ data: this.data.order.expressNo, success: () => toast('已复制', 'success') })
  },

  // 跳转卖家主页（买家查看卖家资料以便联系）
  goSellerProfile() {
    const sellerOpenid = this.data.order?.sellerOpenid
    if (!sellerOpenid) { toast('卖家信息不存在'); return }
    wx.navigateTo({ url: `/pages/user-profile/index?openid=${sellerOpenid}` })
  },

  // ══ 买家操作 ══

  async cancelOrder() {
    const res = await new Promise(resolve =>
      wx.showModal({ title: '取消订单', content: '确认取消这笔代购订单吗？', confirmText: '确认取消', confirmColor: '#FF453A', success: resolve })
    )
    if (!res.confirm) return
    wx.showLoading({ title: '处理中...' })
    try {
      const r = await callCloud('daigouMgr', { action: 'cancelOrder', orderId: this.data.orderId, reason: '买家主动取消' })
      if (r.success) {
        toast('订单已取消', 'success')
        this.loadOrder(this.data.orderId)
      } else {
        toast(r.message || '取消失败')
      }
    } catch (e) {
      toast('操作失败')
    } finally {
      wx.hideLoading()
    }
  },

  async confirmReceived() {
    const { estimatedReward } = this.data
    const res = await new Promise(resolve =>
      wx.showModal({
        title: '确认收货',
        content: `确认已收到商品吗？确认后将奖励您 ${estimatedReward} 积分 🎉\n\n⚠️ 确认后请对本次购物进行评价（必须上传3张收货图）`,
        confirmText: '确认收货',
        success: resolve
      })
    )
    if (!res.confirm) return
    wx.showLoading({ title: '确认中...' })
    try {
      const r = await callCloud('daigouMgr', { action: 'confirmReceived', orderId: this.data.orderId })
      if (r.success) {
        // 更新全局积分
        if (r.pointsRewarded) {
          app.globalData.points = (app.globalData.points || 0) + r.pointsRewarded
          this.setData({ userPoints: app.globalData.points, pointsRewarded: r.pointsRewarded })
        }
        wx.hideLoading()
        wx.showToast({ title: `收货成功！+${r.pointsRewarded || estimatedReward} 积分`, icon: 'success', duration: 2000 })
        // 刷新订单，然后跳转评价
        await this.loadOrder(this.data.orderId)
        setTimeout(() => this.goReview(), 2200)
      } else {
        wx.hideLoading()
        toast(r.message || '操作失败')
      }
    } catch (e) {
      wx.hideLoading()
      toast('操作失败')
    }
  },

  // 跳转评价页
  goReview() {
    const { orderId, order, isBuyer } = this.data
    this._needRefresh = true  // 从评价页返回时刷新订单状态
    wx.navigateTo({
      url: `/pages/daigou-review/index?orderId=${orderId}&isBuyer=${isBuyer}&role=${isBuyer ? 'buyer' : 'seller'}&productName=${encodeURIComponent(order.productName || '')}&orderNo=${encodeURIComponent(order.orderNo || '')}`
    })
  },

  async applyRefund() {
    const res = await new Promise(resolve =>
      wx.showModal({ title: '申请退款', content: '确认申请退款？卖家将会收到退款申请。', confirmText: '申请退款', confirmColor: '#FF453A', success: resolve })
    )
    if (!res.confirm) return
    wx.showLoading({ title: '提交中...' })
    try {
      const r = await callCloud('daigouMgr', { action: 'applyRefund', orderId: this.data.orderId, reason: '买家申请退款' })
      if (r.success) {
        toast('退款申请已提交', 'success')
        this.loadOrder(this.data.orderId)
      } else {
        toast(r.message || '申请失败')
      }
    } catch (e) {
      toast('操作失败')
    } finally {
      wx.hideLoading()
    }
  },

  // ══ 卖家操作 ══

  showShipModal() {
    this.setData({ showShipPanel: true })
    setTimeout(() => this.setData({ panelVisible: true }), 20)
  },

  hideShipModal() {
    this.setData({ panelVisible: false })
    setTimeout(() => this.setData({ showShipPanel: false }), 300)
  },

  onShipInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`shipForm.${field}`]: e.detail.value })
  },

  async doShipOrder() {
    const { company, no } = this.data.shipForm
    if (!company.trim()) { toast('请填写快递公司'); return }
    if (!no.trim()) { toast('请填写快递单号'); return }
    this.setData({ shipping: true })
    try {
      const r = await callCloud('daigouMgr', {
        action: 'shipOrder',
        orderId: this.data.orderId,
        expressCompany: company.trim(),
        expressNo: no.trim()
      })
      if (r.success) {
        toast('发货成功！买家已收到通知', 'success')
        this.hideShipModal()
        this.setData({ shipForm: { company: '', no: '' } })
        this._needRefresh = false  // 直接刷新，无需标志
        this.loadOrder(this.data.orderId)
      } else {
        toast(r.message || '发货失败')
      }
    } catch (e) {
      toast('操作失败')
    } finally {
      this.setData({ shipping: false })
    }
  },

  async rejectRefund() {
    const res = await new Promise(resolve =>
      wx.showModal({ title: '拒绝退款', content: '确认拒绝买家的退款申请？', confirmColor: '#FF453A', success: resolve })
    )
    if (!res.confirm) return
    wx.showLoading({ title: '处理中...' })
    try {
      const r = await callCloud('daigouMgr', { action: 'handleRefund', orderId: this.data.orderId, approve: false, rejectReason: '卖家拒绝' })
      if (r.success) {
        toast('已拒绝退款申请')
        this.loadOrder(this.data.orderId)
      } else {
        toast(r.message || '操作失败')
      }
    } catch (e) {
      toast('操作失败')
    } finally {
      wx.hideLoading()
    }
  },

  async agreeRefund() {
    const res = await new Promise(resolve =>
      wx.showModal({ title: '同意退款', content: '确认同意退款？', success: resolve })
    )
    if (!res.confirm) return
    wx.showLoading({ title: '处理中...' })
    try {
      const r = await callCloud('daigouMgr', { action: 'handleRefund', orderId: this.data.orderId, approve: true })
      if (r.success) {
        toast('已同意退款', 'success')
        this.loadOrder(this.data.orderId)
      } else {
        toast(r.message || '操作失败')
      }
    } catch (e) {
      toast('操作失败')
    } finally {
      wx.hideLoading()
    }
  }
})
