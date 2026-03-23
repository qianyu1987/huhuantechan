// pages/admin/index.js
const { callCloud, toast } = require('../../utils/util')
const { PROVINCES, PRODUCT_CATEGORIES, VALUE_RANGES, DEFAULT_FEATURE_FLAGS } = require('../../utils/constants')

Page({
  data: {
    currentTab: 0,
    tabs: ['概览', '用户', '特产', '订单', '审核', '积分', '信用'],
    isSuperAdmin: false,
    defaultAvatar: '/images/default-avatar.png',
    // 概览数据
    stats: {
      totalUsers: 0,
      totalProducts: 0,
      activeSwaps: 0,
      pendingReviews: 0,
      mysteryCount: 0
    },
    // 用户列表
    users: [],
    userPage: 1,
    userLoading: false,
    userNoMore: false,
    userKeyword: '',
    // 特产列表
    products: [],
    productPage: 1,
    productLoading: false,
    productNoMore: false,
    productFilter: 'all', // all, active, mystery
    // 订单列表
    orders: [],
    orderPage: 1,
    orderLoading: false,
    orderNoMore: false,
    orderFilter: 'all',
    orderStats: { pending: 0, shipping: 0, completed: 0 },
    // 审核列表
    reviews: [],
    reviewPage: 1,
    reviewLoading: false,
    reviewNoMore: false,
    // 待审核产品列表
    pendingProducts: [],
    pendingPage: 1,
    pendingLoading: false,
    pendingNoMore: false,
    auditFilter: 'all',
    pendingStats: { autoBlocked: 0, manualReview: 0 },
    // 积分管理
    selectedUser: null,
    pointsModalVisible: false,
    pointsAction: 'add',
    pointsValue: '',
    pointsReason: '',
    pointsUsers: [],
    pointsPage: 1,
    pointsLoading: false,
    pointsNoMore: false,
    pointsKeyword: '',
    pointsFilter: 'all',
    pointsStats: { totalUsers: 0, totalPoints: 0, avgPoints: 0 },
    // 信用分管理
    creditModalVisible: false,
    creditValue: '',
    creditReason: '',
    creditUsers: [],
    creditPage: 1,
    creditLoading: false,
    creditNoMore: false,
    creditKeyword: '',
    creditFilter: 'all',
    creditDist: { excellent: 0, good: 0, normal: 0, poor: 0 },
    // 神秘特产
    mysteryProducts: [],
    mysteryPage: 1,
    mysteryLoading: false,
    mysteryNoMore: false,
    mysteryFilter: 'all',
    mysteryStats: { total: 0, active: 0, inSwap: 0 },
    mysteryModalVisible: false,
    editingMystery: null,
    // 用户编辑
    userEditModalVisible: false,
    editingUser: null,
    provinceList: PROVINCES,
    provinceIndex: -1,
    // 特产编辑
    productEditModalVisible: false,
    editingProduct: null,
    categoryList: PRODUCT_CATEGORIES,
    categoryIndex: -1,
    valueRangeList: VALUE_RANGES,
    valueRangeIndex: -1,
    statusOptions: ['active', 'pending_review', 'rejected', 'removed', 'banned'],
    statusLabels: ['展示中', '待审核', '已拒绝', '已下架', '已封禁'],
    statusIndex: 0,
    // 功能开关
    featureFlags: {},
    flagsLoading: false,
    flagList: [
      { key: 'tab_match', label: '匹配页面', desc: '底部Tab是否显示匹配入口' },
      { key: 'tab_order', label: '订单页面', desc: '底部Tab是否显示订单入口' },
      { key: 'tab_publish', label: '发布页面', desc: '底部Tab是否显示发布入口' },
      { key: 'feature_mystery', label: '神秘特产', desc: '首页是否显示神秘特产筛选' },
      { key: 'feature_value_display', label: '估值显示', desc: '是否显示特产估值标签' },
      { key: 'feature_swap', label: '分享功能', desc: '详情页是否显示分享按钮' }
    ]
  },

  onLoad() {
    this.loadStats()
    this.checkAdminStatus()
  },

  onUnload() {
    if (this._searchTimer) clearTimeout(this._searchTimer)
    if (this._pointsSearchTimer) clearTimeout(this._pointsSearchTimer)
    if (this._creditSearchTimer) clearTimeout(this._creditSearchTimer)
  },

  // ========== 数据维护工具 ==========
  // 清理重复用户记录
  async cleanupDuplicateUsers() {
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '确认操作',
        content: '此操作将清理数据库中重复的用户记录，统一使用 _openid 字段。是否继续？',
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false)
      })
    })
    
    if (!confirmed) return
    
    wx.showLoading({ title: '清理中...', mask: true })
    
    try {
      const res = await callCloud('resetData', { action: 'cleanupDuplicateUsers' })
      wx.hideLoading()
      
      if (res.success) {
        const msg = `清理完成！\n总用户: ${res.totalUsers}\n删除重复: ${res.duplicatesRemoved}\n字段迁移: ${res.migratedToOpenid}`
        wx.showModal({
          title: '清理成功',
          content: msg,
          showCancel: false,
          success: () => {
            // 刷新用户列表
            this.setData({
              users: [],
              userPage: 1,
              userNoMore: false,
              pointsUsers: [],
              pointsPage: 1,
              pointsNoMore: false,
              creditUsers: [],
              creditPage: 1,
              creditNoMore: false
            })
            this.loadStats()
          }
        })
      } else {
        wx.showToast({ title: res.error || '清理失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '操作失败', icon: 'none' })
      console.error('清理重复用户失败:', e)
    }
  },

  // 检查管理员权限
  async checkAdminStatus() {
    try {
      const res = await callCloud('adminMgr', { action: 'getAdminStatus' })
      this.setData({ isSuperAdmin: res.isSuperAdmin })
      
      // 如果是超级管理员，添加神秘特产Tab和开关Tab
      if (res.isSuperAdmin) {
        this.setData({ tabs: ['概览', '用户', '特产', '订单', '审核', '积分', '信用', '神秘特产', '开关'] })
      }
    } catch (e) {
      console.error('检查管理员状态失败', e)
    }
  },

  // 设为超级管理员
  async initSuperAdmin() {
    try {
      wx.showLoading({ title: '设置中...' })
      const res = await callCloud('adminMgr', { action: 'initSuperAdmin' })
      wx.hideLoading()
      
      if (res.success) {
        wx.showToast({ title: '已设为超级管理员', icon: 'success' })
        this.setData({ isSuperAdmin: true, tabs: ['概览', '用户', '特产', '订单', '审核', '积分', '信用', '神秘特产', '开关'] })
      } else {
        wx.showToast({ title: res.error || '设置失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      console.error('设置超级管理员失败', e)
      wx.showToast({ title: '设置失败', icon: 'none' })
    }
  },

  // 切换Tab
  switchTab(e) {
    const index = Number(e.currentTarget.dataset.index)
    this.setData({ currentTab: index })

    if (index === 1 && this.data.users.length === 0) {
      this.loadUsers()
    } else if (index === 2 && this.data.products.length === 0) {
      this.loadProducts()
    } else if (index === 3 && this.data.orders.length === 0) {
      this.loadOrders()
    } else if (index === 4 && this.data.pendingProducts.length === 0) {
      this.loadPendingProducts()
    } else if (index === 5 && this.data.pointsUsers.length === 0) {
      this.loadPointsUsers()
    } else if (index === 6 && this.data.creditUsers.length === 0) {
      this.loadCreditUsers()
    } else if (index === 7 && this.data.mysteryProducts.length === 0) {
      this.loadMysteryProducts()
    } else if (index === 8) {
      this.loadFeatureFlags()
    }
  },

  // 加载统计数据
  async loadStats() {
    try {
      const res = await callCloud('adminMgr', { action: 'getStats' })
      if (res) {
        this.setData({ stats: res })
      }
    } catch (e) {
      console.error('加载统计失败', e)
    }
  },

  // 加载用户列表
  async loadUsers() {
    if (this.data.userLoading || this.data.userNoMore) return

    this.setData({ userLoading: true })
    try {
      const res = await callCloud('adminMgr', {
        action: 'getUsers',
        page: this.data.userPage,
        pageSize: 20,
        keyword: this.data.userKeyword || ''
      })

      const list = (res.list || []).map(u => ({
        ...u,
        creditLevel: this.getCreditLevel(u.creditScore || 100)
      }))

      this.setData({
        users: [...this.data.users, ...list],
        userPage: this.data.userPage + 1,
        userNoMore: list.length < 20
      })
    } catch (e) {
      toast('加载用户失败')
    } finally {
      this.setData({ userLoading: false })
    }
  },

  // 加载特产列表
  async loadProducts() {
    if (this.data.productLoading || this.data.productNoMore) return

    this.setData({ productLoading: true })
    try {
      const params = {
        action: 'getProducts',
        page: this.data.productPage,
        pageSize: 20
      }
      
      // 根据筛选条件传递参数
      if (this.data.productFilter === 'active') {
        params.status = 'active'
      } else if (this.data.productFilter === 'mystery') {
        params.isMystery = 'true'
      }

      const res = await callCloud('adminMgr', params)

      const list = (res.list || []).map(p => ({
        ...p,
        coverUrl: p.images && p.images[0] ? p.images[0] : '',
        statusText: p.status === 'active' ? '展示中' : p.status === 'pending_review' ? '待审核' : p.status === 'rejected' ? '已拒绝' : p.status === 'in_swap' ? '分享中' : p.status === 'swapped' ? '已分享' : p.status === 'removed' ? '已下架' : p.status === 'banned' ? '已封禁' : '未知'
      }))

      this.setData({
        products: [...this.data.products, ...list],
        productPage: this.data.productPage + 1,
        productNoMore: list.length < 20
      })
    } catch (e) {
      toast('加载特产失败')
    } finally {
      this.setData({ productLoading: false })
    }
  },

  // 加载订单列表
  async loadOrders() {
    if (this.data.orderLoading || this.data.orderNoMore) return

    this.setData({ orderLoading: true })
    try {
      const res = await callCloud('adminMgr', {
        action: 'getOrders',
        page: this.data.orderPage,
        pageSize: 20,
        filter: this.data.orderFilter
      })

      const list = (res.list || []).map(o => ({
        ...o,
        statusText: this.getOrderStatusText(o.status),
        productCover: o.productCover || (o.productImages && o.productImages[0] ? o.productImages[0] : ''),
        createTimeStr: o.createdAt ? this.formatTime(o.createdAt) : (o._createTime ? this.formatTime(o._createTime) : '')
      }))

      this.setData({
        orders: [...this.data.orders, ...list],
        orderPage: this.data.orderPage + 1,
        orderNoMore: list.length < 20,
        orderStats: res.stats || this.data.orderStats
      })
    } catch (e) {
      toast('加载订单失败')
    } finally {
      this.setData({ orderLoading: false })
    }
  },

  // 切换订单筛选
  changeOrderFilter(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({
      orderFilter: filter,
      orders: [],
      orderPage: 1,
      orderNoMore: false
    })
    this.loadOrders()
  },

  // 格式化时间
  formatTime(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now - date
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
    const month = date.getMonth() + 1
    const day = date.getDate()
    return `${month}月${day}日`
  },

  // 加载审核列表
  async loadReviews() {
    if (this.data.reviewLoading || this.data.reviewNoMore) return

    this.setData({ reviewLoading: true })
    try {
      const res = await callCloud('adminMgr', {
        action: 'getPendingReviews',
        page: this.data.reviewPage,
        pageSize: 20
      })

      this.setData({
        reviews: [...this.data.reviews, ...(res.list || [])],
        reviewPage: this.data.reviewPage + 1,
        reviewNoMore: (res.list || []).length < 20
      })
    } catch (e) {
      toast('加载审核失败')
    } finally {
      this.setData({ reviewLoading: false })
    }
  },

  // ========== 待审核产品 ==========
  async loadPendingProducts() {
    if (this.data.pendingLoading || this.data.pendingNoMore) return
    this.setData({ pendingLoading: true })
    try {
      const res = await callCloud('adminMgr', {
        action: 'getPendingProducts',
        page: this.data.pendingPage,
        pageSize: 20,
        filter: this.data.auditFilter
      })
      if (res.success) {
        const list = (res.list || []).map(p => ({
          ...p,
          coverUrl: p.images && p.images[0] ? p.images[0] : '',
          categoryName: this.getCategoryName(p.category)
        }))
        this.setData({
          pendingProducts: [...this.data.pendingProducts, ...list],
          pendingPage: this.data.pendingPage + 1,
          pendingNoMore: list.length < 20,
          pendingStats: res.stats || { autoBlocked: 0, manualReview: 0 }
        })
      }
    } catch (e) {
      toast('加载待审产品失败')
    } finally {
      this.setData({ pendingLoading: false })
    }
  },

  // 切换审核筛选
  changeAuditFilter(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({
      auditFilter: filter,
      pendingProducts: [],
      pendingPage: 1,
      pendingNoMore: false
    })
    this.loadPendingProducts()
  },

  // 获取分类名称
  getCategoryName(categoryId) {
    const category = PRODUCT_CATEGORIES.find(c => c.id === categoryId)
    return category ? category.name : '未分类'
  },

  // 审核通过（产品）
  async approvePendingProduct(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认通过',
      content: '确定要让该产品通过审核吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await callCloud('adminMgr', { action: 'approveProduct', productId: id })
            toast('已通过', 'success')
            this.setData({ pendingProducts: [], pendingPage: 1, pendingNoMore: false })
            this.loadPendingProducts()
          } catch (e) {
            toast('操作失败')
          }
        }
      }
    })
  },

  // 审核拒绝（产品）
  async rejectPendingProduct(e) {
    const id = e.currentTarget.dataset.id
    
    // 弹出输入拒绝原因
    const res = await new Promise(resolve => {
      wx.showModal({
        title: '拒绝原因',
        content: '请输入拒绝原因（选填）',
        editable: true,
        placeholderText: '拒绝原因（选填）',
        confirmText: '确认拒绝',
        confirmColor: '#E63946',
        success: resolve
      })
    })

    if (!res.confirm) return

    try {
      await callCloud('adminMgr', { 
        action: 'rejectProduct', 
        productId: id,
        reason: res.content || '管理员审核拒绝'
      })
      toast('已拒绝', 'success')
      this.setData({ pendingProducts: [], pendingPage: 1, pendingNoMore: false })
      this.loadPendingProducts()
    } catch (e) {
      toast('操作失败')
    }
  },

  // 查看待审核产品详情
  goToPendingProductDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/detail/index?id=${id}` })
  },

  // 审核特产下架
  async banProduct(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认下架',
      content: '确定要下架该特产吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await callCloud('adminMgr', { action: 'banProduct', productId: id })
            toast('已下架', 'success')
            // 刷新列表
            this.setData({ products: [], productPage: 1, productNoMore: false })
            this.loadProducts()
          } catch (e) {
            toast('操作失败')
          }
        }
      }
    })
  },

  // 审核通过
  async approveReview(e) {
    const id = e.currentTarget.dataset.id
    try {
      await callCloud('adminMgr', { action: 'approveReview', reviewId: id })
      toast('审核通过', 'success')
      this.setData({ reviews: [], reviewPage: 1, reviewNoMore: false })
      this.loadReviews()
    } catch (e) {
      toast('操作失败')
    }
  },

  // 审核拒绝
  async rejectReview(e) {
    const id = e.currentTarget.dataset.id
    try {
      await callCloud('adminMgr', { action: 'rejectReview', reviewId: id })
      toast('已拒绝', 'success')
      this.setData({ reviews: [], reviewPage: 1, reviewNoMore: false })
      this.loadReviews()
    } catch (e) {
      toast('操作失败')
    }
  },

  // 查看用户详情
  goToUserDetail(e) {
    const openid = e.currentTarget.dataset.openid
    wx.navigateTo({ url: `/pages/user-profile/index?openid=${openid}` })
  },

  // 查看特产详情
  goToProductDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/detail/index?id=${id}` })
  },

  // 查看订单详情
  goToOrderDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/order-detail/index?id=${id}` })
  },

  // 辅助方法
  getCreditLevel(score) {
    if (score >= 90) return { text: '优秀', class: 'credit-excellent' }
    if (score >= 80) return { text: '良好', class: 'credit-good' }
    if (score >= 60) return { text: '一般', class: 'credit-normal' }
    return { text: '较差', class: 'credit-poor' }
  },

  getOrderStatusText(status) {
    const map = {
      pending: '待确认',
      confirmed: '待发货',
      shipped: '待收货',
      completed: '已完成',
      cancelled: '已取消'
    }
    return map[status] || status
  },

  // ========== 积分管理 ==========
  // 加载积分用户列表
  async loadPointsUsers() {
    if (this.data.pointsLoading || this.data.pointsNoMore) return

    this.setData({ pointsLoading: true })
    try {
      const res = await callCloud('adminMgr', {
        action: 'getUsers',
        page: this.data.pointsPage,
        pageSize: 20,
        keyword: this.data.pointsKeyword,
        filter: this.data.pointsFilter
      })

      const list = (res.list || []).map((u, idx) => ({
        ...u,
        rank: (this.data.pointsPage - 1) * 20 + idx + 1
      }))

      this.setData({
        pointsUsers: [...this.data.pointsUsers, ...list],
        pointsPage: this.data.pointsPage + 1,
        pointsNoMore: list.length < 20,
        pointsStats: res.stats || { totalUsers: list.length, totalPoints: 0, avgPoints: 0 }
      })
    } catch (e) {
      toast('加载用户失败')
    } finally {
      this.setData({ pointsLoading: false })
    }
  },

  // 积分搜索
  onPointsSearch(e) {
    if (this._pointsSearchTimer) clearTimeout(this._pointsSearchTimer)
    const keyword = e.detail.value
    this._pointsSearchTimer = setTimeout(() => {
      this.setData({
        pointsKeyword: keyword,
        pointsUsers: [],
        pointsPage: 1,
        pointsNoMore: false
      })
      this.loadPointsUsers()
    }, 500)
  },

  // 切换积分筛选
  changePointsFilter(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({
      pointsFilter: filter,
      pointsUsers: [],
      pointsPage: 1,
      pointsNoMore: false
    })
    this.loadPointsUsers()
  },

  // 打开积分弹窗
  openPointsModal(e) {
    const { user, action } = e.currentTarget.dataset
    this.setData({
      selectedUser: user,
      pointsModalVisible: true,
      pointsAction: action || 'add',
      pointsValue: '',
      pointsReason: ''
    })
  },

  // 切换积分操作类型
  switchPointsAction(e) {
    this.setData({ pointsAction: e.currentTarget.dataset.action })
  },

  // 输入积分值
  onPointsInput(e) {
    this.setData({ pointsValue: e.detail.value })
  },

  // 输入原因
  onPointsReasonInput(e) {
    this.setData({ pointsReason: e.detail.value })
  },

  // 确认积分操作
  async confirmPoints() {
    const { selectedUser, pointsAction, pointsValue, pointsReason } = this.data
    const points = parseInt(pointsValue)

    if (!points || points <= 0) {
      toast('请输入有效的积分数量')
      return
    }

    // 确保使用 _openid 字段
    const openid = selectedUser._openid
    if (!openid) {
      toast('用户数据异常，缺少 _openid')
      return
    }

    try {
      const action = pointsAction === 'add' ? 'addPoints' : 'deductPoints'
      const reason = pointsReason || (pointsAction === 'add' ? '管理员增加积分' : '管理员扣除积分')

      const res = await callCloud('adminMgr', {
        action,
        openid,  // 只使用 _openid
        points,
        reason
      })

      if (res.error) {
        toast(res.error)
        return
      }

      toast(res.message || '操作成功', 'success')
      this.setData({ pointsModalVisible: false })
      // 刷新积分用户列表
      this.setData({ pointsUsers: [], pointsPage: 1, pointsNoMore: false })
      this.loadPointsUsers()
    } catch (e) {
      toast('操作失败')
    }
  },

  // 关闭积分弹窗
  closePointsModal() {
    this.setData({ pointsModalVisible: false })
  },

  // ========== 信用分管理 ==========
  // 加载信用分用户列表
  async loadCreditUsers() {
    if (this.data.creditLoading || this.data.creditNoMore) return

    this.setData({ creditLoading: true })
    try {
      const res = await callCloud('adminMgr', {
        action: 'getUsers',
        page: this.data.creditPage,
        pageSize: 20,
        keyword: this.data.creditKeyword,
        filter: this.data.creditFilter
      })

      const list = (res.list || []).map(u => ({
        ...u,
        creditLevel: this.getCreditLevel(u.creditScore || 100)
      }))

      this.setData({
        creditUsers: [...this.data.creditUsers, ...list],
        creditPage: this.data.creditPage + 1,
        creditNoMore: list.length < 20,
        creditDist: res.creditDist || { excellent: 0, good: 0, normal: 0, poor: 0 }
      })
    } catch (e) {
      toast('加载用户失败')
    } finally {
      this.setData({ creditLoading: false })
    }
  },

  // 计算信用分布
  calculateCreditDist(users) {
    if (!users || users.length === 0) return { excellent: 0, good: 0, normal: 0, poor: 0 }
    let excellent = 0, good = 0, normal = 0, poor = 0
    users.forEach(u => {
      const score = u.creditScore || 100
      if (score >= 90) excellent++
      else if (score >= 80) good++
      else if (score >= 60) normal++
      else poor++
    })
    const total = users.length
    return {
      excellent: Math.round(excellent / total * 100),
      good: Math.round(good / total * 100),
      normal: Math.round(normal / total * 100),
      poor: Math.round(poor / total * 100)
    }
  },

  // 信用分搜索
  onCreditSearch(e) {
    if (this._creditSearchTimer) clearTimeout(this._creditSearchTimer)
    const keyword = e.detail.value
    this._creditSearchTimer = setTimeout(() => {
      this.setData({
        creditKeyword: keyword,
        creditUsers: [],
        creditPage: 1,
        creditNoMore: false
      })
      this.loadCreditUsers()
    }, 500)
  },

  // 切换信用分筛选
  changeCreditFilter(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({
      creditFilter: filter,
      creditUsers: [],
      creditPage: 1,
      creditNoMore: false
    })
    this.loadCreditUsers()
  },

  // 打开信用分弹窗
  openCreditModal(e) {
    const user = e.currentTarget.dataset.user
    this.setData({
      selectedUser: user,
      creditModalVisible: true,
      creditValue: String(user.creditScore || 100),
      creditReason: ''
    })
  },

  // 输入信用分
  onCreditInput(e) {
    let value = parseInt(e.detail.value) || 0
    value = Math.max(0, Math.min(100, value))
    this.setData({ creditValue: String(value) })
  },

  // 输入原因
  onCreditReasonInput(e) {
    this.setData({ creditReason: e.detail.value })
  },

  // 确认信用分调整
  async confirmCredit() {
    const { selectedUser, creditValue, creditReason } = this.data
    const creditScore = parseInt(creditValue)

    if (isNaN(creditScore) || creditScore < 0 || creditScore > 100) {
      toast('信用分范围为0-100')
      return
    }

    // 确保使用 _openid 字段
    const openid = selectedUser._openid
    if (!openid) {
      toast('用户数据异常，缺少 _openid')
      return
    }

    try {
      const res = await callCloud('adminMgr', {
        action: 'adjustCredit',
        openid,  // 只使用 _openid
        creditScore,
        reason: creditReason || '管理员调整信用分'
      })

      if (res.error) {
        toast(res.error)
        return
      }

      toast(res.message || '操作成功', 'success')
      this.setData({ creditModalVisible: false })
      // 刷新信用分用户列表
      this.setData({ creditUsers: [], creditPage: 1, creditNoMore: false })
      this.loadCreditUsers()
    } catch (e) {
      toast('操作失败')
    }
  },

  // 关闭信用分弹窗
  closeCreditModal() {
    this.setData({ creditModalVisible: false })
  },

  // ========== 神秘特产管理 ==========
  // 切换神秘特产筛选
  changeMysteryFilter(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({
      mysteryFilter: filter,
      mysteryProducts: [],
      mysteryPage: 1,
      mysteryNoMore: false
    })
    this.loadMysteryProducts()
  },

  // 加载神秘特产列表
  async loadMysteryProducts() {
    if (!this.data.isSuperAdmin) {
      toast('需要超级管理员权限')
      return
    }
    if (this.data.mysteryLoading || this.data.mysteryNoMore) return

    this.setData({ mysteryLoading: true })
    try {
      const res = await callCloud('adminMgr', {
        action: 'getMysteryProducts',
        page: this.data.mysteryPage,
        pageSize: 20,
        filter: this.data.mysteryFilter
      })

      const list = (res.list || []).map(p => ({
        ...p,
        coverUrl: p.images && p.images[0] ? p.images[0] : '',
        statusText: p.status === 'active' ? '展示中' : p.status === 'in_swap' ? '分享中' : '已下架'
      }))

      this.setData({
        mysteryProducts: [...this.data.mysteryProducts, ...list],
        mysteryPage: this.data.mysteryPage + 1,
        mysteryNoMore: list.length < 20,
        mysteryStats: res.stats || { total: 0, active: 0, inSwap: 0 }
      })
    } catch (e) {
      toast('加载神秘特产失败')
    } finally {
      this.setData({ mysteryLoading: false })
    }
  },

  // 编辑神秘特产
  openMysteryEdit(e) {
    const product = e.currentTarget.dataset.product
    this.setData({
      editingMystery: { ...product },
      mysteryModalVisible: true
    })
  },

  // 更新神秘特产字段
  updateMysteryField(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    const updated = { ...this.data.editingMystery, [field]: value }
    this.setData({ editingMystery: updated })
  },

  // 保存神秘特产
  async saveMystery() {
    const { editingMystery } = this.data
    if (!editingMystery || !editingMystery._id) {
      toast('参数错误')
      return
    }

    try {
      const res = await callCloud('adminMgr', {
        action: 'editMysteryProduct',
        productId: editingMystery._id,
        updates: {
          name: editingMystery.name,
          description: editingMystery.description,
          province: editingMystery.province,
          city: editingMystery.city,
          status: editingMystery.status
        }
      })

      if (res.error) {
        toast(res.error)
        return
      }

      toast('保存成功', 'success')
      this.setData({ mysteryModalVisible: false, editingMystery: null })
      // 刷新列表
      this.setData({ mysteryProducts: [], mysteryPage: 1, mysteryNoMore: false })
      this.loadMysteryProducts()
    } catch (e) {
      toast('保存失败')
    }
  },

  // 关闭神秘特产弹窗
  closeMysteryModal() {
    this.setData({ mysteryModalVisible: false, editingMystery: null })
  },

  // 删除神秘特产
  deleteMystery(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个神秘特产吗？此操作不可恢复！',
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await callCloud('adminMgr', {
              action: 'deleteMysteryProduct',
              productId: id
            })
            if (result.error) {
              toast(result.error)
              return
            }
            toast('删除成功', 'success')
            this.setData({ mysteryProducts: [], mysteryPage: 1, mysteryNoMore: false })
            this.loadMysteryProducts()
          } catch (e) {
            toast('删除失败')
          }
        }
      }
    })
  },

  // 切换特产筛选
  changeProductFilter(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({
      productFilter: filter,
      products: [],
      productPage: 1,
      productNoMore: false
    })
    this.loadProducts()
  },

  // 用户搜索（防抖 500ms）
  onUserSearch(e) {
    if (this._searchTimer) clearTimeout(this._searchTimer)
    const keyword = e.detail.value
    this._searchTimer = setTimeout(() => {
      this.setData({
        userKeyword: keyword,
        users: [],
        userPage: 1,
        userNoMore: false
      })
      this.loadUsers()
    }, 500)
  },

  onPullDownRefresh() {
    this.setData({
      users: [],
      userPage: 1,
      userNoMore: false,
      products: [],
      productPage: 1,
      productNoMore: false,
      orders: [],
      orderPage: 1,
      orderNoMore: false,
      reviews: [],
      reviewPage: 1,
      reviewNoMore: false,
      pendingProducts: [],
      pendingPage: 1,
      pendingNoMore: false,
      pointsUsers: [],
      pointsPage: 1,
      pointsNoMore: false,
      creditUsers: [],
      creditPage: 1,
      creditNoMore: false,
      mysteryProducts: [],
      mysteryPage: 1,
      mysteryNoMore: false
    })
    this.loadStats()
    const tab = this.data.currentTab
    if (tab === 1) this.loadUsers()
    else if (tab === 2) this.loadProducts()
    else if (tab === 3) this.loadOrders()
    else if (tab === 4) this.loadPendingProducts()
    else if (tab === 5) this.loadPointsUsers()
    else if (tab === 6) this.loadCreditUsers()
    else if (tab === 7) this.loadMysteryProducts()
    else if (tab === 8) this.loadFeatureFlags()
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    const tab = this.data.currentTab
    if (tab === 1) this.loadUsers()
    else if (tab === 2) this.loadProducts()
    else if (tab === 3) this.loadOrders()
    else if (tab === 4) this.loadPendingProducts()
    else if (tab === 5) this.loadPointsUsers()
    else if (tab === 6) this.loadCreditUsers()
    else if (tab === 7) this.loadMysteryProducts()
  },

  // ========== 编辑用户 ==========
  openUserEdit(e) {
    const user = e.currentTarget.dataset.user
    const provinceIndex = PROVINCES.findIndex(p => p.code === user.province)
    this.setData({
      editingUser: { ...user },
      userEditModalVisible: true,
      provinceIndex: provinceIndex >= 0 ? provinceIndex : -1
    })
  },

  updateUserField(e) {
    const field = e.currentTarget.dataset.field
    // 优先使用 data-value（用于性别选择），其次使用 e.detail.value
    const value = e.currentTarget.dataset.value !== undefined ? e.currentTarget.dataset.value : e.detail.value
    this.setData({ [`editingUser.${field}`]: value })
  },

  onUserProvinceChange(e) {
    const idx = Number(e.detail.value)
    this.setData({
      provinceIndex: idx,
      'editingUser.province': PROVINCES[idx].code
    })
  },

  async saveUserEdit() {
    const { editingUser } = this.data
    // 兼容 openid 和 _openid 两种字段
    const openid = editingUser.openid || editingUser._openid
    if (!editingUser || !openid) {
      toast('参数错误')
      return
    }

    try {
      wx.showLoading({ title: '保存中...' })
      const res = await callCloud('adminMgr', {
        action: 'editUser',
        openid: openid,
        updates: {
          nickName: editingUser.nickName,
          province: editingUser.province,
          gender: editingUser.gender,
          birthday: editingUser.birthday,
          zodiac: editingUser.zodiac,
          zodiacAnimal: editingUser.zodiacAnimal,
          points: editingUser.points,
          creditScore: editingUser.creditScore
        }
      })
      wx.hideLoading()

      if (res.error) {
        toast(res.error)
        return
      }

      toast('保存成功', 'success')
      this.setData({ userEditModalVisible: false, editingUser: null })
      this.setData({ users: [], userPage: 1, userNoMore: false })
      this.loadUsers()
    } catch (e) {
      wx.hideLoading()
      toast('保存失败')
    }
  },

  closeUserEditModal() {
    this.setData({ userEditModalVisible: false, editingUser: null })
  },

  // ========== 编辑特产 ==========
  openProductEdit(e) {
    const product = e.currentTarget.dataset.product
    const categoryIndex = PRODUCT_CATEGORIES.findIndex(c => c.id === product.category)
    const valueRangeIndex = VALUE_RANGES.findIndex(v => v.id === product.valueRange)
    const statusIndex = ['active', 'removed', 'banned'].indexOf(product.status)
    this.setData({
      editingProduct: { ...product },
      productEditModalVisible: true,
      categoryIndex: categoryIndex >= 0 ? categoryIndex : -1,
      valueRangeIndex: valueRangeIndex >= 0 ? valueRangeIndex : -1,
      statusIndex: statusIndex >= 0 ? statusIndex : 0
    })
  },

  updateProductField(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({ [`editingProduct.${field}`]: value })
  },

  onProductCategoryChange(e) {
    const idx = Number(e.detail.value)
    this.setData({
      categoryIndex: idx,
      'editingProduct.category': PRODUCT_CATEGORIES[idx].id
    })
  },

  onProductValueRangeChange(e) {
    const idx = Number(e.detail.value)
    this.setData({
      valueRangeIndex: idx,
      'editingProduct.valueRange': VALUE_RANGES[idx].id
    })
  },

  onProductStatusChange(e) {
    const idx = Number(e.detail.value)
    this.setData({
      statusIndex: idx,
      'editingProduct.status': ['active', 'pending_review', 'rejected', 'removed', 'banned'][idx]
    })
  },

  async saveProductEdit() {
    const { editingProduct } = this.data
    if (!editingProduct || !editingProduct._id) {
      toast('参数错误')
      return
    }

    try {
      wx.showLoading({ title: '保存中...' })
      const res = await callCloud('adminMgr', {
        action: 'editProduct',
        productId: editingProduct._id,
        updates: {
          name: editingProduct.name,
          province: editingProduct.province,
          city: editingProduct.city,
          category: editingProduct.category,
          valueRange: editingProduct.valueRange,
          status: editingProduct.status
        }
      })
      wx.hideLoading()

      if (res.error) {
        toast(res.error)
        return
      }

      toast('保存成功', 'success')
      this.setData({ productEditModalVisible: false, editingProduct: null })
      this.setData({ products: [], productPage: 1, productNoMore: false })
      this.loadProducts()
    } catch (e) {
      wx.hideLoading()
      toast('保存失败')
    }
  },

  closeProductEditModal() {
    this.setData({ productEditModalVisible: false, editingProduct: null })
  },

  // ========== 功能开关管理 ==========
  async loadFeatureFlags() {
    this.setData({ flagsLoading: true })
    try {
      const res = await callCloud('adminMgr', { action: 'getFeatureFlags' })
      const flags = { ...DEFAULT_FEATURE_FLAGS, ...(res.flags || {}) }
      this.setData({ featureFlags: flags })
    } catch (e) {
      toast('加载开关失败')
      this.setData({ featureFlags: { ...DEFAULT_FEATURE_FLAGS } })
    } finally {
      this.setData({ flagsLoading: false })
    }
  },

  async toggleFlag(e) {
    const key = e.currentTarget.dataset.key
    const value = e.detail.value
    const oldFlags = { ...this.data.featureFlags }
    const newFlags = { ...oldFlags, [key]: value }

    this.setData({ featureFlags: newFlags })

    try {
      const res = await callCloud('adminMgr', { action: 'setFeatureFlags', flags: newFlags })
      if (res.error) {
        toast(res.error)
        this.setData({ featureFlags: oldFlags })
        return
      }
      toast(`${value ? '已开启' : '已关闭'}`, 'success')
      // 刷新全局缓存
      getApp().refreshFeatureFlags()
    } catch (e) {
      toast('操作失败')
      this.setData({ featureFlags: oldFlags })
    }
  },

  async enableReviewMode() {
    if (this.data.featureFlags.review_mode) return

    const res = await new Promise(resolve =>
      wx.showModal({
        title: '开启审核模式',
        content: '将关闭：匹配、订单、发布、分享功能，仅保留浏览。确认开启？',
        confirmColor: '#FF453A',
        success: resolve
      })
    )
    if (!res.confirm) return

    const reviewFlags = {
      ...this.data.featureFlags,
      review_mode: true,
      tab_match: false,
      tab_order: false,
      tab_publish: false,
      feature_swap: false
    }

    this.setData({ featureFlags: reviewFlags })
    try {
      const saveRes = await callCloud('adminMgr', { action: 'setFeatureFlags', flags: reviewFlags })
      if (saveRes.error) {
        toast(saveRes.error)
        this.loadFeatureFlags()
        return
      }
      toast('审核模式已开启', 'success')
      getApp().refreshFeatureFlags()
    } catch (e) {
      toast('操作失败')
      this.loadFeatureFlags()
    }
  },

  async restoreNormal() {
    if (!this.data.featureFlags.review_mode) return

    const res = await new Promise(resolve =>
      wx.showModal({
        title: '恢复正常模式',
        content: '将恢复所有功能为开启状态，确认恢复？',
        success: resolve
      })
    )
    if (!res.confirm) return

    const normalFlags = { ...DEFAULT_FEATURE_FLAGS, review_mode: false }

    this.setData({ featureFlags: normalFlags })
    try {
      const saveRes = await callCloud('adminMgr', { action: 'setFeatureFlags', flags: normalFlags })
      if (saveRes.error) {
        toast(saveRes.error)
        this.loadFeatureFlags()
        return
      }
      toast('已恢复正常', 'success')
      getApp().refreshFeatureFlags()
    } catch (e) {
      toast('操作失败')
      this.loadFeatureFlags()
    }
  }
})
