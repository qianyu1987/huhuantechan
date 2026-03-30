// pages/order/index.js - 互换订单页
const { ORDER_STATUS } = require('../../utils/constants')
const { callCloud, formatTime, getCreditLevel, getProvinceByCode, toast, showLoading, hideLoading, processImageUrl } = require('../../utils/util')
const imageOptimizer = require('../../utils/imageOptimizer')

const MYSTERY_EMOJIS = ['🎁', '🎀', '🎉', '🎊', '🎄', '🎃', '🎈', '🎯', '🎲', '🎳']

// 订单状态配置
const STATUS_CONFIG = {
  [ORDER_STATUS.PENDING]: { label: '待确认', color: '#F4A261', bg: 'rgba(244, 162, 97, 0.12)' },
  [ORDER_STATUS.CONFIRMED]: { label: '等待发货', color: '#457B9D', bg: 'rgba(69, 123, 157, 0.12)' },
  [ORDER_STATUS.SHIPPED_A]: { label: '你已发货', color: '#F4A261', bg: 'rgba(244, 162, 97, 0.12)' },
  [ORDER_STATUS.SHIPPED_B]: { label: '对方已发货', color: '#FF6B35', bg: 'rgba(255, 107, 53, 0.12)' },
  [ORDER_STATUS.SHIPPED_BOTH]: { label: '运输中', color: '#457B9D', bg: 'rgba(69, 123, 157, 0.12)' },
  [ORDER_STATUS.RECEIVED_A]: { label: '你已收货', color: '#2D6A4F', bg: 'rgba(45, 106, 79, 0.12)' },
  [ORDER_STATUS.RECEIVED_B]: { label: '对方已收货', color: '#F4A261', bg: 'rgba(244, 162, 97, 0.12)' },
  [ORDER_STATUS.COMPLETED]: { label: '已完成', color: '#2D6A4F', bg: 'rgba(45, 106, 79, 0.12)' },
  [ORDER_STATUS.CANCELLED]: { label: '已取消', color: '#999', bg: 'rgba(153, 153, 153, 0.12)' },
  [ORDER_STATUS.DISPUTED]: { label: '纠纷中', color: '#E63946', bg: 'rgba(230, 57, 70, 0.12)' }
}

Page({
  data: {
    tabs: [
      { id: 'all', label: '全部', count: 0 },
      { id: 'pending', label: '待确认', count: 0 },
      { id: 'ongoing', label: '进行中', count: 0 },
      { id: 'completed', label: '已完成', count: 0 }
    ],
    activeTab: 'all',
    currentTabLabel: '',
    orders: [],
    loading: false,
    loadingMore: false,
    refreshing: false,
    noMore: false,
    page: 1,
    reviewedOrders: {},
    featureDisabled: false
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  },

  onLoad(options) {
    if (!getApp().isFeatureEnabled('tab_order')) {
      this.setData({ featureDisabled: true })
      return
    }
    const { status } = options
    if (status) {
      const tabMap = { pending: 'pending', confirmed: 'ongoing', shipped: 'ongoing', completed: 'completed' }
      this.setData({ activeTab: tabMap[status] || 'all' })
    }
    this.loadOrders(true)
  },

  onShow() {
    this.loadOrders(true)
  },

  switchTab(e) {
    const id = e.currentTarget.dataset.id
    const tab = this.data.tabs.find(t => t.id === id)
    this.setData({ activeTab: id, currentTabLabel: tab ? tab.label : '' })
    this.loadOrders(true)
  },

  async loadOrders(reset = false) {
    if (this.data.loading || this.data.loadingMore) return
    if (reset) {
      this.setData({ loading: true, page: 1, noMore: false })
    } else {
      if (this.data.noMore) return
      this.setData({ loadingMore: true })
    }

    try {
      const res = await callCloud('orderMgr', {
        action: 'list',
        tabFilter: this.data.activeTab,
        page: reset ? 1 : this.data.page,
        pageSize: 10
      })

      const list = res.list || []
      const newOrders = list.map(order => this.formatOrder(order))

      // 批量转换 cloud:// 产品图片和头像
      await this.resolveAllCloudUrls(newOrders)

      const all = reset ? newOrders : [...this.data.orders, ...newOrders]

      this.setData({
        orders: all,
        page: reset ? 2 : this.data.page + 1,
        noMore: newOrders.length < 10,
        tabs: res.tabCounts ? this.data.tabs.map(t => ({
          ...t,
          count: res.tabCounts[t.id] || 0
        })) : this.data.tabs
      })

      if (reset) {
        this.checkReviewStatusForOrders(all)
      }
    } catch (e) {
      console.error('[Order] loadOrders 失败', e)
    } finally {
      this.setData({ loading: false, loadingMore: false, refreshing: false })
    }
  },

  // 格式化订单（合并产品处理 + 状态处理）
  formatOrder(order) {
    const config = STATUS_CONFIG[order.status] || { label: order.status, color: '#999', bg: 'rgba(153, 153, 153, 0.12)' }
    const myProvince = getProvinceByCode(order.myProduct?.province)
    const theirProvince = getProvinceByCode(order.theirProduct?.province)

    // 双方用户信息
    const initiatorInfo = order.initiator || {}
    const receiverInfo = order.receiver || {}
    const initiatorCredit = getCreditLevel(initiatorInfo.creditScore || 100)
    const receiverCredit = getCreditLevel(receiverInfo.creditScore || 100)

    // 神秘特产样式
    const getMysteryStyle = (product, province) => {
      if (!product?.isMystery) return {}
      const provinceName = province?.name || product?.province || '神秘'
      const code = provinceName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
      const colors = ['color-1','color-2','color-3','color-4','color-5','color-6','color-7','color-8','color-9','color-10']
      return {
        isMystery: true,
        colorClass: colors[code % colors.length],
        emoji: MYSTERY_EMOJIS[code % MYSTERY_EMOJIS.length]
      }
    }

    // 产品图片处理
    const getProductCoverUrl = (product) => {
      if (!product || product.isMystery) return ''
      if (product.images && product.images[0]) return processImageUrl(product.images[0])
      return '/images/default-product.png'
    }

    return {
      ...order,
      statusLabel: config.label,
      statusColor: config.color,
      statusBg: config.bg,
      timeLabel: formatTime(order.updateTime || order.createTime),
      actions: this.generateActions(order),
      myProduct: {
        ...order.myProduct,
        isMystery: order.myProduct?.isMystery || false,
        coverUrl: getProductCoverUrl(order.myProduct),
        provinceName: myProvince?.name || order.myProduct?.province || '未知',
        provinceColor: myProvince?.color || '#999',
        ...getMysteryStyle(order.myProduct, myProvince)
      },
      theirProduct: {
        ...order.theirProduct,
        isMystery: order.theirProduct?.isMystery || false,
        coverUrl: getProductCoverUrl(order.theirProduct),
        provinceName: theirProvince?.name || order.theirProduct?.province || '未知',
        provinceColor: theirProvince?.color || '#999',
        ...getMysteryStyle(order.theirProduct, theirProvince)
      },
      initiatorInfo: {
        ...initiatorInfo,
        avatarUrl: initiatorInfo.avatarUrl || '',
        creditScore: initiatorInfo.creditScore || 100,
        creditClass: initiatorCredit.class,
        creditLevel: initiatorCredit.level
      },
      receiverInfo: {
        ...receiverInfo,
        avatarUrl: receiverInfo.avatarUrl || '',
        creditScore: receiverInfo.creditScore || 100,
        creditClass: receiverCredit.class,
        creditLevel: receiverCredit.level
      }
    }
  },

  // 批量转换所有 cloud:// URL（产品图片 + 头像），每批50个
  async resolveAllCloudUrls(orders) {
    const cloudItems = [] // { path: 'orders[i].xxx.yyy', fileID }

    orders.forEach((order, i) => {
      // 产品图片
      if (order.myProduct.coverUrl && order.myProduct.coverUrl.startsWith('cloud://')) {
        cloudItems.push({ orderIdx: i, field: 'myProduct.coverUrl', fileID: order.myProduct.coverUrl })
      }
      if (order.theirProduct.coverUrl && order.theirProduct.coverUrl.startsWith('cloud://')) {
        cloudItems.push({ orderIdx: i, field: 'theirProduct.coverUrl', fileID: order.theirProduct.coverUrl })
      }
      // 头像
      if (order.initiatorInfo.avatarUrl && order.initiatorInfo.avatarUrl.startsWith('cloud://')) {
        cloudItems.push({ orderIdx: i, field: 'initiatorInfo.avatarUrl', fileID: order.initiatorInfo.avatarUrl })
      }
      if (order.receiverInfo.avatarUrl && order.receiverInfo.avatarUrl.startsWith('cloud://')) {
        cloudItems.push({ orderIdx: i, field: 'receiverInfo.avatarUrl', fileID: order.receiverInfo.avatarUrl })
      }
    })

    if (cloudItems.length === 0) return

    // 分组：产品封面图用 240px 缩略，头像用 120px 缩略
    const productItems = cloudItems.filter(c => c.field.includes('coverUrl'))
    const avatarItems  = cloudItems.filter(c => c.field.includes('avatarUrl'))

    // 去重并分别获取缩略链接
    const productIDs = [...new Set(productItems.map(c => c.fileID))]
    const avatarIDs  = [...new Set(avatarItems.map(c => c.fileID))]

    const tempUrlMap = {}
    try {
      if (productIDs.length > 0) {
        const pMap = await imageOptimizer.batchResolve(productIDs, 240)
        Object.assign(tempUrlMap, pMap)
      }
      if (avatarIDs.length > 0) {
        const aMap = await imageOptimizer.batchResolve(avatarIDs, 120)
        Object.assign(tempUrlMap, aMap)
      }
    } catch (e) {
      console.warn('[Order] resolveAllCloudUrls 失败:', e)
    }

    // 写回
    cloudItems.forEach(item => {
      const url = tempUrlMap[item.fileID]
      if (!url) return
      const parts = item.field.split('.')
      orders[item.orderIdx][parts[0]][parts[1]] = url
    })
  },

  // 生成操作按钮
  generateActions(order) {
    const actions = []
    const isInitiator = order.isInitiator
    const status = order.status

    switch (status) {
      case 'pending':
        if (isInitiator) {
          actions.push({ id: 'cancel', label: '撤回请求', type: 'ghost' })
        } else {
          actions.push({ id: 'reject', label: '拒绝', type: 'secondary' })
          actions.push({ id: 'accept', label: '同意分享', type: 'primary' })
        }
        break
      case 'confirmed':
        actions.push({ id: 'ship', label: '填写快递', type: 'primary' })
        actions.push({ id: 'cancel', label: '取消', type: 'ghost' })
        break
      case 'shipped_a':
        if (isInitiator) {
          actions.push({ id: 'viewTracking', label: '查看物流', type: 'secondary' })
        } else {
          actions.push({ id: 'ship', label: '我也发货', type: 'primary' })
        }
        break
      case 'shipped_b':
        if (isInitiator) {
          actions.push({ id: 'ship', label: '我也发货', type: 'primary' })
        } else {
          actions.push({ id: 'viewTracking', label: '查看物流', type: 'secondary' })
        }
        break
      case 'shipped':
        actions.push({ id: 'receive', label: '确认收货', type: 'success' })
        actions.push({ id: 'viewTracking', label: '查看物流', type: 'secondary' })
        break
      case 'received_a':
      case 'received_b': {
        const myReceived = (isInitiator && status === 'received_a') || (!isInitiator && status === 'received_b')
        if (!myReceived) {
          actions.push({ id: 'receive', label: '确认收货', type: 'success' })
        }
        break
      }
      case 'completed':
        actions.push({ id: 'review', label: '去评价', type: 'primary' })
        break
      case 'cancelled':
        actions.push({ id: 'delete', label: '删除记录', type: 'ghost' })
        break
      case 'disputed':
        actions.push({ id: 'contact', label: '联系客服', type: 'secondary' })
        break
    }
    return actions
  },

  // 检查已完成订单的评价状态
  async checkReviewStatusForOrders(orders) {
    const completedOrders = orders.filter(o => o.status === 'completed')
    if (completedOrders.length === 0) return

    const reviewedOrders = { ...this.data.reviewedOrders }
    let hasChanges = false

    for (const order of completedOrders) {
      if (!reviewedOrders[order._id]) {
        try {
          const res = await callCloud('orderMgr', { action: 'detail', orderId: order._id })
          if (res.success && res.order) {
            const isInitiator = res.isInitiator
            const hasReviewed = isInitiator ? !!res.order.initiatorReview : !!res.order.receiverReview
            if (hasReviewed) {
              reviewedOrders[order._id] = true
              hasChanges = true
            }
          }
        } catch (e) {}
      }
    }

    if (hasChanges) {
      this.setData({ reviewedOrders })
      this.updateOrderActions(reviewedOrders)
    }
  },

  updateOrderActions(reviewedOrders) {
    const { orders } = this.data
    const updatedOrders = orders.map(order => {
      if (order.status === 'completed' && reviewedOrders[order._id]) {
        const actions = order.actions.map(act => {
          if (act.id === 'review') return { ...act, label: '已评价', type: 'default', disabled: true }
          return act
        })
        return { ...order, actions }
      }
      return order
    })
    this.setData({ orders: updatedOrders })
  },

  onRefresh() {
    this.setData({ refreshing: true })
    this.loadOrders(true)
  },

  loadMore() {
    this.loadOrders(false)
  },

  async handleAction(e) {
    const { orderid, action } = e.currentTarget.dataset
    switch (action) {
      case 'accept': await this.handleAccept(orderid); break
      case 'reject': await this.handleReject(orderid); break
      case 'cancel': await this.handleCancel(orderid); break
      case 'ship': this.goToShip(orderid); break
      case 'receive': await this.handleReceive(orderid); break
      case 'review': this.goToReview(orderid); break
      case 'viewTracking': this.goToTracking(orderid); break
      default: this.callOrderAction(orderid, action)
    }
  },

  async handleAccept(orderId) {
    const res = await new Promise(resolve =>
      wx.showModal({ title: '确认同意', content: '同意后双方将开始分享流程', confirmText: '同意', confirmColor: '#2D6A4F', success: resolve })
    )
    if (!res.confirm) return
    showLoading('处理中...')
    try {
      const result = await callCloud('orderMgr', { action: 'accept', orderId })
      hideLoading()
      if (result?.success) { toast('已同意', 'success'); this.loadOrders(true) }
      else { toast(result?.message || '操作失败') }
    } catch (e) { hideLoading(); toast('网络错误，请重试') }
  },

  async handleReject(orderId) {
    const res = await new Promise(resolve =>
      wx.showModal({ title: '确认拒绝', content: '拒绝后对方会收到通知', confirmText: '拒绝', confirmColor: '#E63946', success: resolve })
    )
    if (!res.confirm) return
    showLoading('处理中...')
    try {
      const result = await callCloud('orderMgr', { action: 'reject', orderId })
      hideLoading()
      if (result?.success) { toast('已拒绝', 'success'); this.loadOrders(true) }
      else { toast(result?.message || '操作失败') }
    } catch (e) { hideLoading(); toast('网络错误，请重试') }
  },

  async handleCancel(orderId) {
    const res = await new Promise(resolve =>
      wx.showModal({ title: '确认取消', content: '取消后订单将关闭，可能影响信用分', confirmText: '取消订单', confirmColor: '#E63946', success: resolve })
    )
    if (!res.confirm) return
    this.callOrderAction(orderId, 'cancel')
  },

  async handleReceive(orderId) {
    const res = await new Promise(resolve =>
      wx.showModal({ title: '确认收货', content: '确认已收到对方特产？', confirmText: '确认收货', confirmColor: '#2D6A4F', success: resolve })
    )
    if (!res.confirm) return
    this.callOrderAction(orderId, 'receive')
  },

  async callOrderAction(orderId, action) {
    showLoading('处理中...')
    try {
      const result = await callCloud('orderMgr', { action, orderId })
      hideLoading()
      if (result?.success) { toast(result.message || '操作成功', 'success'); this.loadOrders(true) }
      else { toast(result?.message || '操作失败') }
    } catch (e) { hideLoading(); toast('网络错误，请重试') }
  },

  goToShip(orderId) { wx.navigateTo({ url: `/pages/order-detail/index?id=${orderId}&action=ship` }) },
  goToReview(orderId) { wx.navigateTo({ url: `/pages/review/index?orderId=${orderId}` }) },
  goToTracking(orderId) { wx.navigateTo({ url: `/pages/order-detail/index?id=${orderId}&action=tracking` }) },
  goToOrderDetail(e) { wx.navigateTo({ url: `/pages/order-detail/index?id=${e.currentTarget.dataset.id}` }) },
  goToMatch() { wx.reLaunch({ url: '/pages/match/index' }) },

  handleAvatarError(e) {
    const index = e.currentTarget.dataset.index
    const field = e.currentTarget.dataset.field
    const { orders } = this.data
    if (orders[index] && orders[index][field + 'Info']) {
      orders[index][field + 'Info'].avatarUrl = '/images/default-avatar.png'
      this.setData({ orders })
    }
  },

  handleProductImageError(e) {
    const index = e.currentTarget.dataset.index
    const type = e.currentTarget.dataset.type
    const { orders } = this.data
    if (orders[index]) {
      if (type === 'my') orders[index].myProduct.coverUrl = '/images/default-product.png'
      else if (type === 'theirs') orders[index].theirProduct.coverUrl = '/images/default-product.png'
      this.setData({ orders })
    }
  }
})
