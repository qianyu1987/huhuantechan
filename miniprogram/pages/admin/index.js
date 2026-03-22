// pages/admin/index.js
const { callCloud, toast } = require('../../utils/util')
const { PROVINCES, PRODUCT_CATEGORIES, VALUE_RANGES, DEFAULT_FEATURE_FLAGS } = require('../../utils/constants')

Page({
  data: {
    currentTab: 0,
    tabs: ['概览', '用户', '特产', '订单', '审核', '积分', '信用'],
    isSuperAdmin: false,
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
    // 审核列表
    reviews: [],
    reviewPage: 1,
    reviewLoading: false,
    reviewNoMore: false,
    // 积分管理
    selectedUser: null,
    pointsModalVisible: false,
    pointsAction: 'add',
    pointsValue: '',
    pointsReason: '',
    // 信用分管理
    creditModalVisible: false,
    creditValue: '',
    creditReason: '',
    // 神秘特产
    mysteryProducts: [],
    mysteryPage: 1,
    mysteryLoading: false,
    mysteryNoMore: false,
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
    statusOptions: ['active', 'removed', 'banned'],
    statusLabels: ['展示中', '已下架', '已封禁'],
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
    } else if (index === 4 && this.data.reviews.length === 0) {
      this.loadReviews()
    } else if (index === 5 && this.data.users.length === 0) {
      this.loadUsers()
    } else if (index === 6 && this.data.users.length === 0) {
      this.loadUsers()
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
      const res = await callCloud('adminMgr', {
        action: 'getProducts',
        page: this.data.productPage,
        pageSize: 20,
        filter: this.data.productFilter || 'all'
      })

      const list = (res.list || []).map(p => ({
        ...p,
        coverUrl: p.images && p.images[0] ? p.images[0] : '',
        statusText: p.status === 'active' ? '展示中' : p.status === 'in_swap' ? '分享中' : '已分享'
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
        pageSize: 20
      })

      const list = (res.list || []).map(o => ({
        ...o,
        statusText: this.getOrderStatusText(o.status)
      }))

      this.setData({
        orders: [...this.data.orders, ...list],
        orderPage: this.data.orderPage + 1,
        orderNoMore: list.length < 20
      })
    } catch (e) {
      toast('加载订单失败')
    } finally {
      this.setData({ orderLoading: false })
    }
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

    try {
      const action = pointsAction === 'add' ? 'addPoints' : 'deductPoints'
      const reason = pointsReason || (pointsAction === 'add' ? '管理员增加积分' : '管理员扣除积分')
      
      const res = await callCloud('adminMgr', {
        action,
        openid: selectedUser.openid || selectedUser._openid,
        points,
        reason
      })

      if (res.error) {
        toast(res.error)
        return
      }

      toast(res.message || '操作成功', 'success')
      this.setData({ pointsModalVisible: false })
      // 刷新用户列表
      this.setData({ users: [], userPage: 1, userNoMore: false })
      this.loadUsers()
    } catch (e) {
      toast('操作失败')
    }
  },

  // 关闭积分弹窗
  closePointsModal() {
    this.setData({ pointsModalVisible: false })
  },

  // ========== 信用分管理 ==========
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

    try {
      const res = await callCloud('adminMgr', {
        action: 'adjustCredit',
        openid: selectedUser.openid || selectedUser._openid,
        creditScore,
        reason: creditReason || '管理员调整信用分'
      })

      if (res.error) {
        toast(res.error)
        return
      }

      toast(res.message || '操作成功', 'success')
      this.setData({ creditModalVisible: false })
      // 刷新用户列表
      this.setData({ users: [], userPage: 1, userNoMore: false })
      this.loadUsers()
    } catch (e) {
      toast('操作失败')
    }
  },

  // 关闭信用分弹窗
  closeCreditModal() {
    this.setData({ creditModalVisible: false })
  },

  // ========== 神秘特产管理 ==========
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
        pageSize: 20
      })

      const list = (res.list || []).map(p => ({
        ...p,
        coverUrl: p.images && p.images[0] ? p.images[0] : '',
        statusText: p.status === 'active' ? '展示中' : p.status === 'in_swap' ? '分享中' : '已下架'
      }))

      this.setData({
        mysteryProducts: [...this.data.mysteryProducts, ...list],
        mysteryPage: this.data.mysteryPage + 1,
        mysteryNoMore: list.length < 20
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
      mysteryProducts: [],
      mysteryPage: 1,
      mysteryNoMore: false
    })
    this.loadStats()
    const tab = this.data.currentTab
    if (tab === 1 || tab === 5 || tab === 6) this.loadUsers()
    else if (tab === 2) this.loadProducts()
    else if (tab === 3) this.loadOrders()
    else if (tab === 4) this.loadReviews()
    else if (tab === 7) this.loadMysteryProducts()
    else if (tab === 8) this.loadFeatureFlags()
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    const tab = this.data.currentTab
    if (tab === 1 || tab === 5 || tab === 6) this.loadUsers()
    else if (tab === 2) this.loadProducts()
    else if (tab === 3) this.loadOrders()
    else if (tab === 4) this.loadReviews()
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
    const value = e.detail.value
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
    if (!editingUser || !editingUser.openid) {
      toast('参数错误')
      return
    }

    try {
      wx.showLoading({ title: '保存中...' })
      const res = await callCloud('adminMgr', {
        action: 'editUser',
        openid: editingUser.openid,
        updates: {
          nickName: editingUser.nickName,
          province: editingUser.province
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
      'editingProduct.status': ['active', 'removed', 'banned'][idx]
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
