// pages/admin/index.js
const { callCloud, toast } = require('../../utils/util')
const { PROVINCES, PRODUCT_CATEGORIES, VALUE_RANGES, DEFAULT_FEATURE_FLAGS } = require('../../utils/constants')

Page({
  data: {
    currentTab: 0,
    tabs: ['概览', '用户', '特产', '订单', '审核', '日志', '积分', '信用', '神秘特产', '代购', '押金审批', '提现审批', '充值审批', '功能开关', '等级管理', '邀请裂变', '数据看板', '纠纷处理', '举报管理', '消息测试'],
    verifyTabIndex: 99, // 超管后更新为 5
    isSuperAdmin: false,
    defaultAvatar: '/images/default-avatar.png',
    // 消息测试
    msgTestLoading: '',
    msgTestLogs: [],
    // 用户操作日志
    operationLogs: [],
    logsLoading: false,
    logsStats: {},
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
    // 代购管理
    daigouOrders: [],
    daigouOrderPage: 1,
    daigouOrderLoading: false,
    daigouOrderNoMore: false,
    daigouOrderTotal: 0,
    daigouOrderFilter: 'all',
    daigouOrderKeyword: '',
    daigouStats: {
      total: 0,
      pendingShipment: 0,
      shipped: 0,
      completed: 0,
      refunding: 0,
      totalAmount: 0
    },
    // 代购实名审核队列
    daigouVerifyList: [],
    daigouVerifyPage: 1,
    daigouVerifyLoading: false,
    daigouVerifyNoMore: false,
    daigouVerifyFilter: 'all',
    daigouVerifyStats: { pending: 0, approved: 0, rejected: 0 },
    // 押金审批队列
    depositApplyList: [],
    depositApplyPage: 1,
    depositApplyLoading: false,
    depositApplyNoMore: false,
    depositApplyFilter: 'pending',
    depositApplyStats: { pending: 0, approved: 0, rejected: 0 },
    depositApplyTotal: 0,
    depositRequestCount: 0,  // 待审核押金申请数量
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
    ],
    // ===== 客服配置 =====
    serviceConfig: {
      phone: '',
      wechat: ''
    },
    serviceConfigLoading: false,
    // ===== 等级管理 =====
    levelUsers: [],
    levelUserPage: 1,
    levelUserLoading: false,
    levelUserNoMore: false,
    levelUserFilter: 'all',
    levelUserKeyword: '',
    // 调整等级弹窗
    levelModalVisible: false,
    // ===== 邀请裂变配置 =====
    inviteConfig: {
      inviterReward: 0.3,
      inviteeReward: 0.1,
      withdrawalThreshold: 30,
      inviterPoints: 0,
      inviteePoints: 0
    },
    levelModalUser: null,
    levelOptions: ['LV0 新人（待认证）', 'LV1 初级代购', 'LV2 进阶代购', 'LV3 资深代购', 'LV4 金牌代购', 'LV5 钻石代购', 'LV6 官方认证代购'],
    levelPickerIndex: 0,
    levelReason: '',
    // 录入押金弹窗
    depositInputModalVisible: false,
    depositInputUser: null,
    depositInputAmount: '',
    depositInputNote: '',
    depositInputMode: 'set',  // set=录入/修改  add=补押金  refund=退押金
    // ===== 充值审批 =====
    rechargeList: [],
    rechargePage: 1,
    rechargeLoading: false,
    rechargeNoMore: false,
    rechargeFilter: 'pending',   // pending / approved / rejected / all
    rechargeTotal: 0,
    rechargeStats: { pending: 0, approved: 0, rejected: 0 },
    // 审批弹窗
    rechargeModalVisible: false,
    rechargeModalItem: null,
    rechargeModalAction: 'approve',  // approve / reject
    rechargeAdminNote: '',
    // ===== 提现审批 =====
    withdrawalList: [],
    withdrawalPage: 1,
    withdrawalLoading: false,
    withdrawalNoMore: false,
    withdrawalFilter: 'pending',   // pending / approved / rejected / all
    withdrawalTotal: 0,
    withdrawalStats: { pending: 0, approved: 0, rejected: 0 },
    // 提现审批弹窗
    withdrawalModalVisible: false,
    withdrawalModalItem: null,
    withdrawalModalAction: 'approve',  // approve / reject
    withdrawalAdminNote: '',
    // ===== 统一待处理通知 =====
    notifications: {
      pendingReview: 0,       // 待审核特产
      daigouVerify: 0,        // 待实名认证
      depositApply: 0,       // 待押金审批
      rechargeApply: 0,      // 待充值审批
      withdrawalApply: 0,     // 待提现审批
      userDisputes: 0,        // 待处理纠纷
      reports: 0,             // 待处理举报
      totalCount: 0          // 总待处理数
    },
    // ===== 纠纷处理 =====
    disputeList: [],
    disputePage: 1,
    disputeLoading: false,
    disputeNoMore: false,
    disputeFilter: '',  // ''=全部, pending=待处理, processing=处理中, resolved=已解决, closed=已关闭
    disputeStats: { pending: 0, processing: 0, resolved: 0, closed: 0 },
    // 纠纷处理弹窗
    disputeModalVisible: false,
    disputeModalItem: null,
    disputeModalAction: 'resolve',  // resolve / close
    disputeResult: '',
    disputeNote: '',
    disputePunishmentType: 'none',  // none / points / credit / deposit
    disputePunishmentValue: '',
    disputeResponsibleParty: '',  // initiator / responder / both
    // ===== 举报管理 =====
    reportList: [],
    reportPage: 1,
    reportLoading: false,
    reportNoMore: false,
    reportFilter: 'pending',  // pending=待处理, handled=已处理, rejected=已驳回, all=全部
    reportStats: { pending: 0, handled: 0, rejected: 0 },
    // 举报处理弹窗
    reportModalVisible: false,
    reportModalItem: null,
    reportModalAction: 'handle',  // handle / reject
    reportPunishmentLevel: 'minor',  // minor=轻微, normal=一般, serious=严重, critical=极其严重
    reportAdminNote: ''
  },

  onLoad() {
    this.loadStats()
    this.checkAdminStatus()
    // loadDaigouVerifyStats 在 checkAdminStatus 确认超管后调用
  },


  onUnload() {
    if (this._searchTimer) clearTimeout(this._searchTimer)
    if (this._pointsSearchTimer) clearTimeout(this._pointsSearchTimer)
    if (this._creditSearchTimer) clearTimeout(this._creditSearchTimer)
  },

  // 阻止事件冒泡
  stopPropagation() {
    // 空方法，用于阻止事件冒泡
  },

  // page-container 的 beforeleave 事件处理
  onModalBeforeLeave() {
    // 空方法，允许弹窗关闭
    // page-container 的 close-on-slide-down="true" 会自动关闭弹窗
  },

  // ========== 邀请裂变配置 ==========
  // 加载邀请配置
  async loadInviteConfig() {
    try {
      const res = await callCloud('adminMgr', { action: 'getInviteConfig' })
      if (res && res.success) {
        this.setData({
          inviteConfig: {
            inviterReward: res.configs.invite_reward_inviter || 0.3,
            inviteeReward: res.configs.invite_reward_invitee || 0.1,
            withdrawalThreshold: res.configs.withdrawal_threshold || 30,
            inviterPoints: res.configs.invite_points_inviter || 0,
            inviteePoints: res.configs.invite_points_invitee || 0
          }
        })
      }
    } catch (e) {
      console.error('加载邀请配置失败', e)
    }
  },

  // 输入框事件处理
  onInviterRewardInput(e) {
    const value = parseFloat(e.detail.value) || 0
    this.setData({ 'inviteConfig.inviterReward': value })
  },

  onInviteeRewardInput(e) {
    const value = parseFloat(e.detail.value) || 0
    this.setData({ 'inviteConfig.inviteeReward': value })
  },

  onWithdrawalThresholdInput(e) {
    const value = parseFloat(e.detail.value) || 0
    this.setData({ 'inviteConfig.withdrawalThreshold': value })
  },

  onInviterPointsInput(e) {
    const value = parseInt(e.detail.value) || 0
    this.setData({ 'inviteConfig.inviterPoints': value })
  },

  onInviteePointsInput(e) {
    const value = parseInt(e.detail.value) || 0
    this.setData({ 'inviteConfig.inviteePoints': value })
  },

  // 保存邀请配置
  async saveInviteConfig() {
    const { inviterReward, inviteeReward, withdrawalThreshold, inviterPoints, inviteePoints } = this.data.inviteConfig
    
    if (inviterReward < 0 || inviteeReward < 0 || withdrawalThreshold < 0) {
      toast('金额不能为负数', 'error')
      return
    }

    wx.showLoading({ title: '保存中...' })
    
    try {
      const res = await callCloud('adminMgr', {
        action: 'updateInviteConfig',
        inviteRewardInviter: inviterReward,
        inviteRewardInvitee: inviteeReward,
        withdrawalThreshold: withdrawalThreshold,
        invitePointsInviter: inviterPoints,
        invitePointsInvitee: inviteePoints
      })
      
      wx.hideLoading()
      
      if (res && res.success) {
        toast('配置保存成功', 'success')
        // 重新加载配置
        this.loadInviteConfig()
      } else {
        toast(res.error || '保存失败', 'error')
      }
    } catch (e) {
      wx.hideLoading()
      console.error('保存邀请配置失败', e)
      toast('保存失败，请重试', 'error')
    }
  },

  // ========== 纠纷处理 ==========
  async loadDisputes(reset = false) {
    if (this.data.disputeLoading) return

    const isReset = reset
    if (isReset) {
      this.setData({ disputeLoading: true, disputePage: 1, disputeNoMore: false })
    } else {
      if (this.data.disputeNoMore) return
      this.setData({ disputeLoading: true })
    }

    try {
      const res = await callCloud('adminMgr', {
        action: 'getDisputes',
        page: isReset ? 1 : this.data.disputePage,
        pageSize: 20,
        status: this.data.disputeFilter
      })

      if (res && res.success) {
        const newList = res.list || []
        const allList = isReset ? newList : [...this.data.disputeList, ...newList]
        this.setData({
          disputeList: allList,
          disputePage: isReset ? 2 : this.data.disputePage + 1,
          disputeNoMore: newList.length < 20,
          disputeStats: res.stats || { pending: 0, processing: 0, resolved: 0, closed: 0 }
        })
      } else {
        toast(res.error || '加载失败', 'error')
      }
    } catch (e) {
      console.error('加载纠纷列表失败', e)
      toast('加载失败', 'error')
    } finally {
      this.setData({ disputeLoading: false })
    }
  },

  // 切换纠纷筛选
  switchDisputeFilter(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({ disputeFilter: filter })
    this.loadDisputes(true)
  },

  // 显示纠纷处理弹窗
  showDisputeModal(e) {
    const item = e.currentTarget.dataset.item
    const action = e.currentTarget.dataset.action
    this.setData({
      disputeModalVisible: true,
      disputeModalItem: item,
      disputeModalAction: action,
      disputeResult: '',
      disputeNote: ''
    })
  },

  // 关闭纠纷处理弹窗
  closeDisputeModal() {
    this.setData({
      disputeModalVisible: false,
      disputeModalItem: null,
      disputeResult: '',
      disputeNote: '',
      disputePunishmentType: 'none',
      disputePunishmentValue: '',
      disputeResponsibleParty: ''
    })
  },

  // 选择纠纷处罚方式
  selectDisputePunishment(e) {
    const type = e.currentTarget.dataset.type
    this.setData({
      disputePunishmentType: type,
      disputePunishmentValue: '',
      disputeResponsibleParty: type === 'none' ? '' : this.data.disputeResponsibleParty
    })
  },

  // 输入处罚数值
  onDisputePunishmentValueInput(e) {
    this.setData({ disputePunishmentValue: e.detail.value })
  },

  // 选择责任方
  selectDisputeResponsible(e) {
    this.setData({ disputeResponsibleParty: e.currentTarget.dataset.party })
  },

  // 输入处理结果
  onDisputeResultInput(e) {
    this.setData({ disputeResult: e.detail.value })
  },

  // 输入备注
  onDisputeNoteInput(e) {
    this.setData({ disputeNote: e.detail.value })
  },

  // 预览纠纷凭证图片
  previewDisputeImage(e) {
    const url = e.currentTarget.dataset.url
    const images = this.data.disputeModalItem?.images || []
    wx.previewImage({
      current: url,
      urls: images
    })
  },

  // 复制订单号
  copyOrderId(e) {
    const id = e.currentTarget.dataset.id
    wx.setClipboardData({
      data: id,
      success: () => {
        toast('订单号已复制', 'success')
      }
    })
  },

  // 提交纠纷处理
  async submitDisputeHandle() {
    const { disputeModalItem, disputeModalAction, disputeResult, disputeNote, disputePunishmentType, disputePunishmentValue, disputeResponsibleParty } = this.data
    if (!disputeModalItem) return

    // 验证：如果选择了处罚方式（非none），必须选择责任方
    if (disputeModalAction === 'resolve' && disputePunishmentType && disputePunishmentType !== 'none' && !disputeResponsibleParty) {
      toast('请选择责任方', 'error')
      return
    }

    // 验证：如果选择了处罚方式（非none），必须填写处罚数值
    if (disputeModalAction === 'resolve' && disputePunishmentType && disputePunishmentType !== 'none') {
      if (!disputePunishmentValue || parseFloat(disputePunishmentValue) <= 0) {
        toast('请输入有效的处罚数值', 'error')
        return
      }
    }

    wx.showLoading({ title: '处理中...' })

    try {
      const res = await callCloud('adminMgr', {
        action: 'handleDispute',
        disputeId: disputeModalItem._id,
        disputeAction: disputeModalAction,
        result: disputeResult,
        note: disputeNote,
        punishment: disputeModalAction === 'resolve' ? {
          type: disputePunishmentType || 'none',
          value: disputePunishmentType === 'none' ? 0 : parseFloat(disputePunishmentValue),
          responsibleParty: disputeResponsibleParty
        } : null
      })

      wx.hideLoading()

      if (res && res.success) {
        toast('处理成功', 'success')
        this.closeDisputeModal()
        this.loadDisputes(true)
      } else {
        toast(res.error || '处理失败', 'error')
      }
    } catch (e) {
      wx.hideLoading()
      console.error('处理纠纷失败', e)
      toast('处理失败', 'error')
    }
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
      
      // 如果是超级管理员，添加实名审核Tab、神秘特产Tab、代购管理Tab和开关Tab
      // Tab顺序：概览(0) 用户(1) 特产(2) 订单(3) 审核(4) 实名(5) 积分(6) 信用(7) 神秘特产(8) 代购(9) 押金(10) 提现(11) 充值(12) 开关(13) 等级管理(14) 邀请裂变(15) 数据看板(16) 纠纷处理(17)
      if (res.isSuperAdmin) {
        this.setData({
          tabs: ['概览', '用户', '特产', '订单', '审核', '实名', '积分', '信用', '神秘特产', '代购', '押金', '提现', '充值', '开关', '等级管理', '邀请裂变', '数据看板', '纠纷处理'],
          verifyTabIndex: 5
        })
        // 权限确认后再加载实名审核统计
        this.loadDaigouVerifyStats()
      }
    } catch (e) {
      console.error('检查管理员状态失败', e)
    }
  },

  // 刷新管理员权限状态（清除缓存后重新检查）
  async refreshAdminStatus() {
    try {
      wx.showLoading({ title: '刷新中...' })
      // 先清除云函数缓存
      await callCloud('adminMgr', { action: 'clearAdminCache' })
      // 重新检查权限
      const res = await callCloud('adminMgr', { action: 'getAdminStatus' })
      wx.hideLoading()
      
      this.setData({ isSuperAdmin: res.isSuperAdmin })
      
      if (res.isSuperAdmin) {
        wx.showToast({ title: '已是超级管理员', icon: 'success' })
        this.setData({
          tabs: ['概览', '用户', '特产', '订单', '审核', '实名', '积分', '信用', '神秘特产', '代购', '押金', '提现', '充值', '开关', '等级管理', '邀请裂变', '数据看板', '纠纷处理'],
          verifyTabIndex: 5
        })
        this.loadDaigouVerifyStats()
      } else {
        wx.showToast({ title: '暂无超管权限', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '刷新失败', icon: 'none' })
      console.error('刷新管理员状态失败', e)
    }
  },

  // 刷新通知列表
  async refreshNotifications() {
    wx.showLoading({ title: '刷新中...' })
    await this.loadAllNotifications()
    wx.hideLoading()
    wx.showToast({ title: '已刷新', icon: 'success' })
  },

  // 设为超级管理员
  async initSuperAdmin() {
    try {
      wx.showLoading({ title: '设置中...' })
      const res = await callCloud('adminMgr', { action: 'initSuperAdmin' })
      wx.hideLoading()
      
      if (res.success) {
        wx.showToast({ title: '已设为超级管理员', icon: 'success' })
        this.setData({
          isSuperAdmin: true,
          tabs: ['概览', '用户', '特产', '订单', '审核', '实名', '积分', '信用', '神秘特产', '代购', '押金', '提现', '充值', '开关', '等级管理', '邀请裂变', '数据看板', '纠纷处理'],
          verifyTabIndex: 5
        })
      } else {
        wx.showToast({ title: res.error || '设置失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      console.error('设置超级管理员失败', e)
      wx.showToast({ title: '设置失败', icon: 'none' })
    }
  },

  // 跳转到数据看板
  goDashboard() {
    wx.navigateTo({ url: '/pages/dashboard/index' })
  },

  // 跳转到押金申请审核
  goToDepositRequests() {
    this.setData({ 
      currentTab: 10,
      depositApplyList: [],
      depositApplyPage: 1,
      depositApplyNoMore: false
    })
    this.loadDepositApplyList()
  },

  // goModule - 供卡片网格和返回按钮使用（data-tab）
  goModule(e) {
    const index = Number(e.currentTarget.dataset.tab)
    this.setData({ currentTab: index })

    if (index === 1 && this.data.users.length === 0) {
      this.loadUsers()
    } else if (index === 2 && this.data.products.length === 0) {
      this.loadProducts()
    } else if (index === 3 && this.data.orders.length === 0) {
      this.loadOrders()
    } else if (index === 4 && this.data.pendingProducts.length === 0) {
      this.loadPendingProducts()
    } else if (index === 5) {
      // 日志 Tab
      if (this.data.operationLogs.length === 0) this.loadUserOperationLogs()
    } else if (index === 6) {
      if (this.data.daigouVerifyList.length === 0) this.loadDaigouVerifyList()
    } else if (index === 7 && this.data.pointsUsers.length === 0) {
      this.loadPointsUsers()
    } else if (index === 8 && this.data.creditUsers.length === 0) {
      this.loadCreditUsers()
    } else if (index === 9 && this.data.mysteryProducts.length === 0) {
      this.loadMysteryProducts()
    } else if (index === 10) {
      if (this.data.daigouOrders.length === 0) this.loadDaigouOrders()
      this.loadDaigouStats()
    } else if (index === 10) {
      if (this.data.depositApplyList.length === 0) this.loadDepositApplyList()
    } else if (index === 11) {
      // 提现审批
      if (this.data.withdrawalList.length === 0) this.loadWithdrawalList(true)
    } else if (index === 12) {
      // 充值审批
      if (this.data.rechargeList.length === 0) this.loadRechargeList(true)
    } else if (index === 13) {
      this.loadFeatureFlags()
      this.loadServiceConfig()
    } else if (index === 14) {
      if (this.data.levelUsers.length === 0) this.loadLevelUsers()
    } else if (index === 15) {
      this.loadInviteConfig()
    } else if (index === 17) {
      // 纠纷处理
      if (this.data.disputeList.length === 0) this.loadDisputes()
    } else if (index === 18) {
      // 举报管理
      if (this.data.reportList.length === 0) this.loadReports()
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
    } else if (index === 5) {
      // 日志 Tab
      if (this.data.operationLogs.length === 0) this.loadUserOperationLogs()
    } else if (index === 6) {
      // 实名审核 Tab
      if (this.data.daigouVerifyList.length === 0) this.loadDaigouVerifyList()
    } else if (index === 7 && this.data.pointsUsers.length === 0) {
      // 积分管理 Tab
      this.loadPointsUsers()
    } else if (index === 8 && this.data.creditUsers.length === 0) {
      // 信用分管理 Tab
      this.loadCreditUsers()
    } else if (index === 9 && this.data.mysteryProducts.length === 0) {
      // 神秘特产管理 Tab
      this.loadMysteryProducts()
    } else if (index === 10) {
      // 代购管理：加载统计 + 订单
      if (this.data.daigouOrders.length === 0) this.loadDaigouOrders()
      this.loadDaigouStats()
    } else if (index === 11) {
      // 押金审批
      if (this.data.depositApplyList.length === 0) this.loadDepositApplyList()
    } else if (index === 12) {
      // 提现审批
      if (this.data.withdrawalList.length === 0) this.loadWithdrawalList(true)
    } else if (index === 13) {
      // 充值审批
      if (this.data.rechargeList.length === 0) this.loadRechargeList(true)
    } else if (index === 14) {
      // 功能开关
      this.loadFeatureFlags()
      this.loadServiceConfig()
    } else if (index === 15) {
      // 等级管理
      if (this.data.levelUsers.length === 0) this.loadLevelUsers()
    } else if (index === 16) {
      // 邀请裂变
      this.loadInviteConfig()
    } else if (index === 17) {
      // 纠纷处理
      if (this.data.disputeList.length === 0) this.loadDisputes()
    }
  },

  // 加载统计数据
  async loadStats() {
    try {
      const res = await callCloud('adminMgr', { action: 'getStats' })
      if (res) {
        // 处理最新数据的时间格式
        if (res.latestUsers) {
          res.latestUsers = res.latestUsers.map(u => ({
            ...u,
            createTime: u.createTime ? this.formatTime(u.createTime) : ''
          }))
        }
        if (res.latestProducts) {
          res.latestProducts = res.latestProducts.map(p => ({
            ...p,
            createTime: p.createTime ? this.formatTime(p.createTime) : ''
          }))
        }
        if (res.latestOrders) {
          res.latestOrders = res.latestOrders.map(o => ({
            ...o,
            createTime: o.createTime ? this.formatTime(o.createTime) : ''
          }))
        }
        this.setData({ stats: res })
      }
      // 加载所有待处理通知
      this.loadAllNotifications()
    } catch (e) {
      console.error('加载统计失败', e)
    }
  },

  // 加载所有待处理通知
  async loadAllNotifications() {
    try {
      // 并行加载所有待处理数量
      const [depositRes, rechargeRes, daigouVerifyRes, withdrawalRes, disputeRes, reportRes] = await Promise.all([
        callCloud('adminMgr', { 
          action: 'getDepositApplyList',
          page: 1,
          pageSize: 1,
          filter: 'pending'
        }),
        callCloud('paymentMgr', {
          action: 'adminGetRechargeApplies',
          page: 1,
          pageSize: 1,
          status: 'pending'
        }),
        callCloud('daigouMgr', {
          action: 'getVerifyList',
          page: 1,
          pageSize: 1,
          filter: 'pending'
        }),
        callCloud('paymentMgr', {
          action: 'adminGetWithdrawalApplies',
          page: 1,
          pageSize: 1,
          status: 'pending'
        }),
        callCloud('adminMgr', {
          action: 'getDisputes',
          page: 1,
          pageSize: 1,
          status: 'pending'
        }),
        callCloud('reportMgr', {
          action: 'adminGetReports',
          page: 1,
          pageSize: 1,
          status: 'pending'
        })
      ])
      
      // 收集各项待处理数量
      const pendingReview = this.data.stats?.pendingReviews || 0
      const daigouVerify = daigouVerifyRes?.list?.length || 0
      const depositApply = depositRes?.stats?.pending || 0
      const rechargeApply = rechargeRes?.total || 0
      const withdrawalApply = withdrawalRes?.total || 0  // 使用total作为pending数量（查询时已过滤status）
      const userDisputes = disputeRes?.stats?.pending || 0
      const reports = reportRes?.stats?.pending || 0
      
      // 计算总数
      const totalCount = pendingReview + daigouVerify + depositApply + rechargeApply + withdrawalApply + userDisputes + reports
      
      this.setData({
        notifications: {
          pendingReview,
          daigouVerify,
          depositApply,
          rechargeApply,
          withdrawalApply,
          userDisputes,
          reports,
          totalCount
        },
        depositRequestCount: depositApply,
        'depositApplyStats.pending': depositApply,
        'withdrawalStats.pending': withdrawalApply,
        'rechargeStats.pending': rechargeApply,
        'disputeStats.pending': userDisputes,
        'reportStats.pending': reports
      })
    } catch (e) {
      console.error('加载通知失败', e)
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

      // 按时间倒序排序（最新的在前）
      const sortedList = (res.list || []).sort((a, b) => {
        const timeA = new Date(a.createTime || 0).getTime()
        const timeB = new Date(b.createTime || 0).getTime()
        return timeB - timeA
      })
      
      const startIndex = (this.data.userPage - 1) * 20
      const list = sortedList.map((u, index) => {
        // 处理时间字段 - 统一使用 createTime
        let timeValue = u.createTime
        if (timeValue instanceof Date) {
          timeValue = timeValue.getTime()
        } else if (typeof timeValue === 'string') {
          timeValue = new Date(timeValue).getTime()
        }
        
        return {
          ...u,
          creditLevel: this.getCreditLevel(u.creditScore || 100),
          registerTime: timeValue ? this.formatTime(timeValue) : '',
          userIndex: startIndex + index + 1
        }
      })

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

  // 加载用户操作日志
  async loadUserOperationLogs() {
    if (this.data.logsLoading) return
    
    this.setData({ logsLoading: true })
    try {
      const res = await callCloud('adminMgr', {
        action: 'getUserOperationLogs',
        page: 1,
        pageSize: 50,
        timeRange: 120  // 最近2小时
      })
      
      if (res.success !== false) {
        // 格式化时间显示
        const list = (res.list || []).map(log => {
          const time = log.createTime ? new Date(log.createTime) : new Date()
          return {
            ...log,
            timeStr: `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}`,
            actionText: this.getActionText(log.action)
          }
        })
        
        this.setData({
          operationLogs: list,
          logsStats: res.stats || {}
        })
      }
    } catch (e) {
      console.error('加载操作日志失败', e)
    } finally {
      this.setData({ logsLoading: false })
    }
  },

  // 获取操作描述文本
  getActionText(action) {
    const actionMap = {
      'user_register': '👤 新用户注册',
      'publish_product': '📝 发布特产',
      'delete_product': '🗑️ 删除特产',
      'create_order': '📦 创建订单',
      'accept_order': '✅ 接受订单',
      'reject_order': '❌ 拒绝订单',
      'ship_order': '🚚 发货',
      'receive_order': '📥 确认收货',
      'complete_order': '🎉 订单完成',
      'recharge': '💳 充值',
      'withdraw': '💰 提现',
      'deposit_apply': '💵 押金申请',
      'daigou_verify': '🪪 实名认证'
    }
    return actionMap[action] || action
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

  // 格式化时间 - 显示为 几月几日几点几分
  formatTime(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const month = date.getMonth() + 1
    const day = date.getDate()
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `${month}月${day}日 ${hours}:${minutes}`
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
          pendingStats: {
            autoBlocked: res.stats?.autoBlocked || 0,
            manualReview: res.stats?.manualReview || 0,
            total: res.stats?.total || 0
          }
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

  // 删除特产
  deleteProduct(e) {
    const productId = e.currentTarget.dataset.id
    const productName = e.currentTarget.dataset.name || '该特产'
    
    wx.showModal({
      title: '确认删除',
      content: `确定要删除"${productName}"吗？此操作不可恢复。`,
      confirmText: '删除',
      confirmColor: '#FF3B30',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' })
            const result = await callCloud('productMgr', {
              action: 'adminRemove',
              productId: productId
            })
            wx.hideLoading()
            
            if (result.success) {
              wx.showToast({ title: '删除成功', icon: 'success' })
              // 从列表中移除该特产
              const products = this.data.products.filter(p => p._id !== productId)
              this.setData({ products })
            } else {
              wx.showToast({ title: result.message || '删除失败', icon: 'none' })
            }
          } catch (err) {
            wx.hideLoading()
            wx.showToast({ title: '删除失败', icon: 'none' })
            console.error('[admin] deleteProduct error:', err)
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

  // 删除订单
  deleteOrder(e) {
    const orderId = e.currentTarget.dataset.id
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个订单吗？此操作不可恢复。',
      confirmText: '删除',
      confirmColor: '#FF3B30',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' })
            const result = await callCloud('orderMgr', {
              action: 'deleteOrder',
              orderId: orderId
            })
            wx.hideLoading()
            
            if (result.success) {
              wx.showToast({ title: '删除成功', icon: 'success' })
              // 从列表中移除该订单
              const orders = this.data.orders.filter(o => o._id !== orderId)
              this.setData({ orders })
            } else {
              wx.showToast({ title: result.message || '删除失败', icon: 'none' })
            }
          } catch (err) {
            wx.hideLoading()
            wx.showToast({ title: '删除失败', icon: 'none' })
            console.error('[admin] deleteOrder error:', err)
          }
        }
      }
    })
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

  // 更新神秘特产状态（picker 回调）
  updateMysteryStatus(e) {
    const idx = Number(e.detail.value)
    const status = idx === 0 ? 'active' : 'removed'
    this.setData({ 'editingMystery.status': status })
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
      mysteryNoMore: false,
      daigouOrders: [],
      daigouOrderPage: 1,
      daigouOrderNoMore: false,
      daigouVerifyList: [],
      daigouVerifyPage: 1,
      daigouVerifyNoMore: false
    })
    this.loadStats()
    const tab = this.data.currentTab
    if (tab === 1) this.loadUsers()
    else if (tab === 2) this.loadProducts()
    else if (tab === 3) this.loadOrders()
    else if (tab === 4) this.loadPendingProducts()
    else if (tab === 5) {
      // 实名审核 Tab
      this.setData({ daigouVerifyList: [], daigouVerifyPage: 1, daigouVerifyNoMore: false })
      this.loadDaigouVerifyList()
    }
    else if (tab === 6) this.loadPointsUsers()
    else if (tab === 7) this.loadCreditUsers()
    else if (tab === 8) this.loadMysteryProducts()
    else if (tab === 9) {
      this.loadDaigouStats()
      this.loadDaigouOrders()
      this.loadDaigouVerifyList()
    }
    else if (tab === 10) {
      this.setData({ depositApplyList: [], depositApplyPage: 1, depositApplyNoMore: false })
      this.loadDepositApplyList()
    }
    else if (tab === 11) {
      this.setData({ withdrawalList: [], withdrawalPage: 1, withdrawalNoMore: false })
      this.loadWithdrawalList(true)
    }
    else if (tab === 12) {
      this.setData({ rechargeList: [], rechargePage: 1, rechargeNoMore: false })
      this.loadRechargeList(true)
    }
    else if (tab === 13) this.loadFeatureFlags()
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    const tab = this.data.currentTab
    if (tab === 1) this.loadUsers()
    else if (tab === 2) this.loadProducts()
    else if (tab === 3) this.loadOrders()
    else if (tab === 4) this.loadPendingProducts()
    else if (tab === 5) this.loadDaigouVerifyList()
    else if (tab === 6) this.loadPointsUsers()
    else if (tab === 7) this.loadCreditUsers()
    else if (tab === 8) this.loadMysteryProducts()
    else if (tab === 9) {
      if (this.data.daigouSubTab === 0) this.loadDaigouOrders()
      else this.loadDaigouVerifyList()
    }
    else if (tab === 10) {
      if (!this.data.depositApplyLoading && !this.data.depositApplyNoMore) this.loadDepositApplyList()
    }
    else if (tab === 11) {
      if (!this.data.withdrawalLoading && !this.data.withdrawalNoMore) this.loadWithdrawalList(false)
    }
    else if (tab === 12) {
      if (!this.data.rechargeLoading && !this.data.rechargeNoMore) this.loadRechargeList(false)
    }
  },

  // ========== 编辑用户 ==========
  openUserEdit(e) {
    console.log('点击编辑按钮:', e)
    const user = e.currentTarget.dataset.user
    console.log('获取到的用户数据:', user)
    
    if (!user) {
      wx.showToast({ title: '用户数据获取失败', icon: 'none' })
      return
    }
    
    // 确保有 openid（兼容 _openid 和 openid 字段）
    const userOpenid = user._openid || user.openid
    if (!userOpenid) {
      wx.showToast({ title: '用户缺少openid', icon: 'none' })
      console.error('用户数据缺少 openid:', user)
      return
    }
    
    try {
      // 省份匹配：同时支持 code 和 name
      let provinceIndex = PROVINCES.findIndex(p => p.code === user.province)
      if (provinceIndex < 0) {
        provinceIndex = PROVINCES.findIndex(p => p.name === user.province)
      }
      console.log('省份索引:', provinceIndex, '用户省份:', user.province)
      
      this.setData({
        editingUser: { 
          ...user, 
          _openid: userOpenid  // 确保 _openid 存在
        },
        userEditModalVisible: true,
        provinceIndex: provinceIndex >= 0 ? provinceIndex : -1
      })
      console.log('弹窗已打开, editingUser:', this.data.editingUser)
    } catch (err) {
      console.error('打开用户编辑弹窗失败:', err)
      wx.showToast({ title: '打开编辑弹窗失败', icon: 'none' })
    }
  },

  // 清除所有非管理员用户
  cleanupNonAdminUsers() {
    wx.showModal({
      title: '⚠️ 危险操作',
      content: '确定要删除所有非管理员用户吗？此操作不可恢复！所有特产、订单、收藏数据都将被删除。',
      confirmText: '确认清除',
      confirmColor: '#FF3B30',
      success: async (res) => {
        if (res.confirm) {
          // 二次确认
          wx.showModal({
            title: '最后确认',
            content: '真的要清除所有非管理员用户吗？',
            confirmText: '确认清除',
            confirmColor: '#FF3B30',
            success: async (res2) => {
              if (res2.confirm) {
                try {
                  wx.showLoading({ title: '清理中...', mask: true })
                  const result = await callCloud('cleanupUsers', {})
                  wx.hideLoading()
                  
                  if (result.success) {
                    wx.showModal({
                      title: '清理完成',
                      content: `已删除 ${result.deletedCount} 个用户，保留 ${result.keptCount} 个管理员`,
                      showCancel: false,
                      success: () => {
                        // 刷新用户列表
                        this.loadUsers()
                      }
                    })
                  } else {
                    wx.showToast({ title: result.error || '清理失败', icon: 'none' })
                  }
                } catch (err) {
                  wx.hideLoading()
                  wx.showToast({ title: '清理失败', icon: 'none' })
                  console.error('[admin] cleanupNonAdminUsers error:', err)
                }
              }
            }
          })
        }
      }
    })
  },

  // 删除用户
  deleteUser(e) {
    const user = e.currentTarget.dataset.user
    const userId = user._id || user._openid
    const userName = user.nickName || '该用户'
    
    wx.showModal({
      title: '确认删除',
      content: `确定要删除用户"${userName}"吗？此操作不可恢复，相关特产和订单数据也将被删除。`,
      confirmText: '删除',
      confirmColor: '#FF3B30',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' })
            const result = await callCloud('adminMgr', {
              action: 'deleteUser',
              userId: userId
            })
            wx.hideLoading()
            
            if (result.success) {
              wx.showToast({ title: '删除成功', icon: 'success' })
              // 从列表中移除该用户
              const users = this.data.users.filter(u => (u._id || u._openid) !== userId)
              this.setData({ users })
            } else {
              wx.showToast({ title: result.message || '删除失败', icon: 'none' })
            }
          } catch (err) {
            wx.hideLoading()
            wx.showToast({ title: '删除失败', icon: 'none' })
            console.error('[admin] deleteUser error:', err)
          }
        }
      }
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
    console.log('保存用户编辑, editingUser:', editingUser)
    
    // 兼容 openid 和 _openid 两种字段
    const openid = editingUser?.openid || editingUser?._openid
    if (!editingUser || !openid) {
      toast('参数错误：缺少用户openid')
      console.error('saveUserEdit 参数错误, editingUser:', editingUser)
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
          points: editingUser.points ? parseInt(editingUser.points) : 0,
          creditScore: editingUser.creditScore ? parseInt(editingUser.creditScore) : 100
        }
      })
      wx.hideLoading()
      console.log('editUser 云函数返回:', res)

      if (res.error) {
        toast(res.error)
        return
      }
      
      if (!res.success) {
        toast('保存失败')
        return
      }

      toast('保存成功', 'success')
      this.setData({ userEditModalVisible: false, editingUser: null })
      this.setData({ users: [], userPage: 1, userNoMore: false })
      this.loadUsers()
    } catch (e) {
      wx.hideLoading()
      console.error('saveUserEdit 异常:', e)
      toast('保存失败：' + (e.message || '未知错误'))
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

  // ========== 代购管理 ==========

  // 跳转代购订单详情
  goToDaigouOrderDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/daigou-order/index?orderId=${id}` })
  },

  // 加载代购统计
  async loadDaigouStats() {
    try {
      const res = await callCloud('adminMgr', { action: 'getDaigouStats' })
      if (res.success) {
        this.setData({ daigouStats: res.stats })
      }
    } catch (e) {
      console.error('loadDaigouStats error', e)
    }
  },

  // 加载代购订单列表
  async loadDaigouOrders() {
    if (this.data.daigouOrderLoading || this.data.daigouOrderNoMore) return
    this.setData({ daigouOrderLoading: true })
    try {
      const res = await callCloud('adminMgr', {
        action: 'getDaigouOrders',
        page: this.data.daigouOrderPage,
        pageSize: 20,
        filter: this.data.daigouOrderFilter,
        keyword: this.data.daigouOrderKeyword || ''
      })
      if (res.success) {
          const list = (res.list || []).map(o => {
          // 地址拼接
          let addressText = ''
          if (o.address) {
            const a = o.address
            addressText = [a.provinceName, a.cityName, a.countyName, a.detailInfo].filter(Boolean).join(' ')
          }
          // 物流信息归一化
          const shipInfo = o.shipInfo || {}
          // 收货人/手机号归一化
          const receiverName = o.receiverName || (o.address && o.address.receiverName) || (o.address && o.address.userName) || ''
          const receiverPhone = o.receiverPhone || (o.address && o.address.receiverPhone) || (o.address && o.address.telNumber) || ''
          return {
            ...o,
            statusText: this.getDaigouOrderStatusText(o.status),
            statusClass: this.getDaigouOrderStatusClass(o.status),
            createTimeStr: o.createTime ? this.formatTime(o.createTime) : '',
            payTimeStr: o.payTime ? this.formatTime(o.payTime) : '',
            shipTimeStr: o.shipTime ? this.formatTime(o.shipTime) : '',
            completeTimeStr: o.completeTime ? this.formatTime(o.completeTime) : '',
            refundTimeStr: o.refundTime ? this.formatTime(o.refundTime) : '',
            addressText,
            receiverName,
            receiverPhone,
            shipInfo,
            expressCompany: o.expressCompany || shipInfo.company || '',
            expressNo: o.expressNo || shipInfo.trackingNo || '',
            // 用户信息（云函数已关联查询）
            buyerNickName: o.buyerNickName || '',
            buyerAvatarUrl: o.buyerAvatarUrl || '',
            buyerPhone: o.buyerPhone || '',
            sellerNickName: o.sellerNickName || '',
            sellerAvatarUrl: o.sellerAvatarUrl || '',
            sellerPhone: o.sellerPhone || '',
            // 单价归一化
            unitPrice: o.unitPrice || 0,
            expanded: false  // 默认折叠
          }
        })
        this.setData({
          daigouOrders: [...this.data.daigouOrders, ...list],
          daigouOrderPage: this.data.daigouOrderPage + 1,
          daigouOrderNoMore: list.length < 20,
          daigouOrderTotal: res.total || (this.data.daigouOrders.length + list.length)
        })
      }
    } catch (e) {
      toast('加载代购订单失败')
    } finally {
      this.setData({ daigouOrderLoading: false })
    }
  },

  // 加载更多代购订单
  loadMoreDaigouOrders() {
    this.loadDaigouOrders()
  },

  // 切换代购订单展开/折叠
  toggleDaigouOrderExpand(e) {
    const id = e.currentTarget.dataset.id
    const orders = this.data.daigouOrders.map(o => {
      if (o._id === id) return { ...o, expanded: !o.expanded }
      return o
    })
    this.setData({ daigouOrders: orders })
  },

  // 切换代购订单筛选
  changeDaigouOrderFilter(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({
      daigouOrderFilter: filter,
      daigouOrders: [],
      daigouOrderPage: 1,
      daigouOrderNoMore: false
    })
    this.loadDaigouOrders()
  },

  // 代购订单关键词搜索
  onDaigouOrderSearch(e) {
    if (this._daigouSearchTimer) clearTimeout(this._daigouSearchTimer)
    const keyword = e.detail.value
    this._daigouSearchTimer = setTimeout(() => {
      this.setData({
        daigouOrderKeyword: keyword,
        daigouOrders: [],
        daigouOrderPage: 1,
        daigouOrderNoMore: false
      })
      this.loadDaigouOrders()
    }, 500)
  },

  // 管理员强制取消代购订单
  forceCancelDaigouOrder(e) {
    const orderId = e.currentTarget.dataset.id
    wx.showModal({
      title: '强制取消订单',
      content: '确定要强制取消这个代购订单吗？',
      editable: true,
      placeholderText: '请输入取消原因',
      confirmText: '确认取消',
      confirmColor: '#FF3B30',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '操作中...' })
            const result = await callCloud('adminMgr', {
              action: 'forceCancelDaigouOrder',
              orderId,
              reason: res.content || '管理员强制取消'
            })
            wx.hideLoading()
            if (result.success) {
              wx.showToast({ title: '已取消', icon: 'success' })
              this.setData({ daigouOrders: [], daigouOrderPage: 1, daigouOrderNoMore: false })
              this.loadDaigouOrders()
              this.loadDaigouStats()
            } else {
              wx.showToast({ title: result.error || '操作失败', icon: 'none' })
            }
          } catch (err) {
            wx.hideLoading()
            wx.showToast({ title: '操作失败', icon: 'none' })
          }
        }
      }
    })
  },

  // 管理员处理退款申请
  adminHandleRefund(e) {
    const { id, approve } = e.currentTarget.dataset
    const title = approve ? '确认同意退款' : '确认拒绝退款'
    const content = approve ? '确定要同意这个退款申请吗？' : '确定要拒绝退款吗？请输入拒绝原因。'
    wx.showModal({
      title,
      content,
      editable: !approve,
      placeholderText: approve ? '' : '请输入拒绝原因',
      confirmText: approve ? '同意退款' : '确认拒绝',
      confirmColor: approve ? '#30D158' : '#FF3B30',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '操作中...' })
            const result = await callCloud('adminMgr', {
              action: 'handleDaigouRefund',
              orderId: id,
              approve,
              rejectReason: approve ? '' : (res.content || '管理员拒绝退款')
            })
            wx.hideLoading()
            if (result.success) {
              wx.showToast({ title: approve ? '已同意退款' : '已拒绝', icon: 'success' })
              this.setData({ daigouOrders: [], daigouOrderPage: 1, daigouOrderNoMore: false })
              this.loadDaigouOrders()
              this.loadDaigouStats()
            } else {
              wx.showToast({ title: result.error || '操作失败', icon: 'none' })
            }
          } catch (err) {
            wx.hideLoading()
            wx.showToast({ title: '操作失败', icon: 'none' })
          }
        }
      }
    })
  },

  // 删除代购订单
  deleteDaigouOrder(e) {
    const orderId = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个代购订单吗？此操作不可恢复。',
      confirmText: '删除',
      confirmColor: '#FF3B30',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' })
            const result = await callCloud('adminMgr', {
              action: 'deleteDaigouOrder',
              orderId
            })
            wx.hideLoading()
            if (result.success) {
              wx.showToast({ title: '删除成功', icon: 'success' })
              const orders = this.data.daigouOrders.filter(o => o._id !== orderId)
              this.setData({ daigouOrders: orders })
              this.loadDaigouStats()
            } else {
              wx.showToast({ title: result.error || '删除失败', icon: 'none' })
            }
          } catch (err) {
            wx.hideLoading()
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      }
    })
  },

  // ---- 实名认证审核 ----

  // 仅加载统计数字（概览页用）
  async loadDaigouVerifyStats() {
    try {
      const res = await callCloud('adminMgr', {
        action: 'getDaigouVerifyList',
        page: 1,
        pageSize: 1,
        filter: 'all'
      })
      if (res.success) {
        this.setData({ daigouVerifyStats: res.stats || { pending: 0, approved: 0, rejected: 0 } })
      }
    } catch (e) {
      console.error('loadDaigouVerifyStats error', e)
    }
  },

  // 加载实名审核队列
  async loadDaigouVerifyList() {
    if (this.data.daigouVerifyLoading || this.data.daigouVerifyNoMore) return
    this.setData({ daigouVerifyLoading: true })
    try {
      const res = await callCloud('adminMgr', {
        action: 'getDaigouVerifyList',
        page: this.data.daigouVerifyPage,
        pageSize: 20,
        filter: this.data.daigouVerifyFilter
      })
      if (res.success) {
        this.setData({
          daigouVerifyList: [...this.data.daigouVerifyList, ...(res.list || [])],
          daigouVerifyPage: this.data.daigouVerifyPage + 1,
          daigouVerifyNoMore: (res.list || []).length < 20,
          daigouVerifyStats: res.stats || { pending: 0, approved: 0, rejected: 0 }
        })
      }
    } catch (e) {
      toast('加载认证列表失败')
    } finally {
      this.setData({ daigouVerifyLoading: false })
    }
  },

  // 切换实名审核筛选
  changeDaigouVerifyFilter(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({
      daigouVerifyFilter: filter,
      daigouVerifyList: [],
      daigouVerifyPage: 1,
      daigouVerifyNoMore: false
    })
    this.loadDaigouVerifyList()
  },

  // 审核通过实名认证
  async approveDaigouVerify(e) {
    const { id, openid } = e.currentTarget.dataset
    wx.showModal({
      title: '确认通过',
      content: '确定要通过该用户的实名认证吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '操作中...' })
            const result = await callCloud('adminMgr', {
              action: 'approveDaigouVerify',
              verifyId: id,
              userOpenid: openid
            })
            wx.hideLoading()
            if (result.success) {
              wx.showToast({ title: '已通过', icon: 'success' })
              this.setData({ daigouVerifyList: [], daigouVerifyPage: 1, daigouVerifyNoMore: false })
              this.loadDaigouVerifyList()
            } else {
              wx.showToast({ title: result.error || '操作失败', icon: 'none' })
            }
          } catch (err) {
            wx.hideLoading()
            wx.showToast({ title: '操作失败', icon: 'none' })
          }
        }
      }
    })
  },

  // 拒绝实名认证
  async rejectDaigouVerify(e) {
    const { id, openid } = e.currentTarget.dataset
    const res = await new Promise(resolve => {
      wx.showModal({
        title: '拒绝原因',
        content: '请输入拒绝原因',
        editable: true,
        placeholderText: '请输入拒绝理由（必填）',
        confirmText: '确认拒绝',
        confirmColor: '#FF3B30',
        success: resolve
      })
    })
    if (!res.confirm) return
    if (!res.content || !res.content.trim()) {
      toast('请填写拒绝原因')
      return
    }
    try {
      wx.showLoading({ title: '操作中...' })
      const result = await callCloud('adminMgr', {
        action: 'rejectDaigouVerify',
        verifyId: id,
        userOpenid: openid,
        reason: res.content.trim()
      })
      wx.hideLoading()
      if (result.success) {
        wx.showToast({ title: '已拒绝', icon: 'success' })
        this.setData({ daigouVerifyList: [], daigouVerifyPage: 1, daigouVerifyNoMore: false })
        this.loadDaigouVerifyList()
      } else {
        wx.showToast({ title: result.error || '操作失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  // ──────────────────────────────────────────────
  // ---- 押金审批 ----
  // ──────────────────────────────────────────────

  async loadDepositApplyList() {
    if (this.data.depositApplyLoading || this.data.depositApplyNoMore) return
    this.setData({ depositApplyLoading: true })
    try {
      const res = await callCloud('adminMgr', {
        action: 'getDepositApplyList',
        page: this.data.depositApplyPage,
        pageSize: 20,
        filter: this.data.depositApplyFilter
      })
      if (res.success) {
        this.setData({
          depositApplyList: [...this.data.depositApplyList, ...(res.list || [])],
          depositApplyPage: this.data.depositApplyPage + 1,
          depositApplyNoMore: (res.list || []).length < 20,
          depositApplyStats: res.stats || { pending: 0, approved: 0, rejected: 0 },
          depositApplyTotal: res.total || 0
        })
      }
    } catch (e) {
      toast('加载押金列表失败')
    } finally {
      this.setData({ depositApplyLoading: false })
    }
  },

  changeDepositFilter(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({
      depositApplyFilter: filter,
      depositApplyList: [],
      depositApplyPage: 1,
      depositApplyNoMore: false
    })
    this.loadDepositApplyList()
  },

  async approveDeposit(e) {
    const { id, openid, amount } = e.currentTarget.dataset
    wx.showModal({
      title: '确认通过',
      content: `确认通过该押金申请（¥${amount}）？审批通过后将更新用户押金状态。`,
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '操作中...' })
        try {
          const result = await callCloud('adminMgr', {
            action: 'approveDeposit',
            applyId: id,
            userOpenid: openid,
            depositAmount: amount
          })
          wx.hideLoading()
          if (result.success) {
            wx.showToast({ title: '已通过', icon: 'success' })
            this.setData({ depositApplyList: [], depositApplyPage: 1, depositApplyNoMore: false })
            this.loadDepositApplyList()
          } else {
            wx.showToast({ title: result.error || '操作失败', icon: 'none' })
          }
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: '操作失败', icon: 'none' })
        }
      }
    })
  },

  async rejectDeposit(e) {
    const { id, openid } = e.currentTarget.dataset
    const res = await new Promise(resolve => {
      wx.showModal({
        title: '拒绝押金申请',
        content: '请输入拒绝原因（将通知用户）',
        editable: true,
        placeholderText: '例如：转账金额有误',
        success: resolve,
        fail: () => resolve({ confirm: false })
      })
    })
    if (!res.confirm) return
    if (!res.content || !res.content.trim()) {
      toast('请填写拒绝原因')
      return
    }
    wx.showLoading({ title: '操作中...' })
    try {
      const result = await callCloud('adminMgr', {
        action: 'rejectDeposit',
        applyId: id,
        userOpenid: openid,
        reason: res.content.trim()
      })
      wx.hideLoading()
      if (result.success) {
        wx.showToast({ title: '已拒绝', icon: 'success' })
        this.setData({ depositApplyList: [], depositApplyPage: 1, depositApplyNoMore: false })
        this.loadDepositApplyList()
      } else {
        wx.showToast({ title: result.error || '操作失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  // 辅助：代购订单状态文本
  getDaigouOrderStatusText(status) {
    const map = {
      pending_payment: '待付款',
      pending_shipment: '待发货',
      shipped: '已发货',
      completed: '已完成',
      cancelled: '已取消',
      refunding: '退款中',
      refunded: '已退款'
    }
    return map[status] || status
  },

  // 辅助：代购订单状态样式
  getDaigouOrderStatusClass(status) {
    const map = {
      pending_payment: 'status-pending',
      pending_shipment: 'status-confirmed',
      shipped: 'status-shipped',
      completed: 'status-completed',
      cancelled: 'status-cancelled',
      refunding: 'status-refunding',
      refunded: 'status-refunded'
    }
    return map[status] || 'status-pending'
  },

  // 处理退款（通过/拒绝）
  async processRefund(e) {
    const orderId = e.currentTarget.dataset.id
    wx.showModal({
      title: '处理退款',
      content: '请选择退款处理方式',
      cancelText: '拒绝退款',
      confirmText: '同意退款',
      success: async (res) => {
        wx.showLoading({ title: '处理中...' })
        try {
          const result = await callCloud('adminMgr', {
            action: 'handleDaigouRefund',
            orderId,
            approve: res.confirm,
            remark: res.confirm ? '管理员同意退款' : '管理员拒绝退款'
          })
          wx.hideLoading()
          if (result.success) {
            wx.showToast({ title: res.confirm ? '退款已通过' : '退款已拒绝', icon: 'success' })
            this.setData({ daigouOrders: [], daigouOrderPage: 1, daigouOrderNoMore: false })
            this.loadDaigouOrders()
            this.loadDaigouStats()
          } else {
            wx.showToast({ title: result.error || '操作失败', icon: 'none' })
          }
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: '操作失败', icon: 'none' })
        }
      }
    })
  },

  // 预览实名审核图片
  previewVerifyImg(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.previewImage({ current: url, urls: [url] })
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
  },

  // ========== 客服配置 ==========
  async loadServiceConfig() {
    this.setData({ serviceConfigLoading: true })
    try {
      const res = await callCloud('adminMgr', {
        action: 'getSystemConfig',
        configKey: null  // 获取全部
      })
      if (res && res.success) {
        this.setData({
          'serviceConfig.phone': res.configs.service_phone || '',
          'serviceConfig.wechat': res.configs.service_wechat || ''
        })
      }
    } catch (e) {
      console.error('[loadServiceConfig]', e)
    } finally {
      this.setData({ serviceConfigLoading: false })
    }
  },

  onServicePhoneInput(e) {
    this.setData({ 'serviceConfig.phone': e.detail.value })
  },

  onServiceWechatInput(e) {
    this.setData({ 'serviceConfig.wechat': e.detail.value })
  },

  async saveServiceConfig() {
    const { phone, wechat } = this.data.serviceConfig
    wx.showLoading({ title: '保存中...' })
    try {
      // 同时保存两个配置
      const [r1, r2] = await Promise.all([
        callCloud('adminMgr', { action: 'updateSystemConfig', configKey: 'service_phone', configValue: phone }),
        callCloud('adminMgr', { action: 'updateSystemConfig', configKey: 'service_wechat', configValue: wechat })
      ])
      wx.hideLoading()
      if (r1.success && r2.success) {
        toast('客服配置已保存', 'success')
      } else {
        toast((r1.error || r2.error) || '保存失败', 'error')
      }
    } catch (e) {
      wx.hideLoading()
      console.error('[saveServiceConfig]', e)
      toast('保存失败，请重试', 'error')
    }
  },

  // ========== 等级管理 ==========

  // 加载代购者列表
  async loadLevelUsers() {
    if (this.data.levelUserLoading || this.data.levelUserNoMore) return
    this.setData({ levelUserLoading: true })
    try {
      const res = await callCloud('adminMgr', {
        action: 'getDaigouLevelUsers',
        page: this.data.levelUserPage,
        pageSize: 20,
        keyword: this.data.levelUserKeyword || '',
        filter: this.data.levelUserFilter || 'all'
      })
      if (res.success) {
        this.setData({
          levelUsers: [...this.data.levelUsers, ...(res.list || [])],
          levelUserPage: this.data.levelUserPage + 1,
          levelUserNoMore: (res.list || []).length < 20
        })
      }
    } catch (e) {
      toast('加载等级用户失败')
    } finally {
      this.setData({ levelUserLoading: false })
    }
  },

  // 切换等级筛选
  changeLevelUserFilter(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({ levelUserFilter: filter, levelUsers: [], levelUserPage: 1, levelUserNoMore: false })
    this.loadLevelUsers()
  },

  // 搜索
  onLevelUserSearch(e) {
    if (this._levelSearchTimer) clearTimeout(this._levelSearchTimer)
    const keyword = e.detail.value
    this._levelSearchTimer = setTimeout(() => {
      this.setData({ levelUserKeyword: keyword, levelUsers: [], levelUserPage: 1, levelUserNoMore: false })
      this.loadLevelUsers()
    }, 500)
  },

  // 打开调整等级弹窗
  openLevelModal(e) {
    const openid = e.currentTarget.dataset.openid
    const idx = e.currentTarget.dataset.index
    console.log('[openLevelModal] openid:', openid, 'index:', idx)
    
    // 三级匹配：openid -> _id -> index
    let user = openid
      ? this.data.levelUsers.find(u =>
          (u.openid && u.openid === openid) ||
          (u._openid && u._openid === openid) ||
          (u._id && u._id === openid)
        )
      : null
    
    if (!user && typeof idx !== 'undefined') {
      user = this.data.levelUsers[Number(idx)] || null
    }
    
    if (!user) {
      console.error('[openLevelModal] 找不到用户, openid=', openid, 'idx=', idx)
      wx.showToast({ title: '用户数据获取失败', icon: 'none' })
      return
    }
    this.setData({
      levelModalUser: user,
      levelModalVisible: true,
      levelPickerIndex: user.daigouLevel || 0,
      levelReason: ''
    })
  },

  closeLevelModal() {
    this.setData({ levelModalVisible: false, levelModalUser: null })
  },

  onLevelPickerChange(e) {
    this.setData({ levelPickerIndex: Number(e.detail.value) })
  },

  onLevelReasonInput(e) {
    this.setData({ levelReason: e.detail.value })
  },

  async confirmLevelAdjust() {
    const { levelModalUser, levelPickerIndex, levelReason } = this.data
    if (!levelModalUser) return
    try {
      wx.showLoading({ title: '保存中...' })
      const res = await callCloud('adminMgr', {
        action: 'adjustDaigouLevel',
        userOpenid: levelModalUser.openid,
        level: levelPickerIndex,
        reason: levelReason || '管理员手动调整'
      })
      wx.hideLoading()
      if (res.success) {
        wx.showToast({ title: res.message || '调整成功', icon: 'success' })
        this.setData({ levelModalVisible: false, levelUsers: [], levelUserPage: 1, levelUserNoMore: false })
        this.loadLevelUsers()
      } else {
        wx.showToast({ title: res.error || '操作失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  // ===== 押金录入弹窗 =====
  openDepositInputModal(e) {
    const openid = e.currentTarget.dataset.openid
    const idx = e.currentTarget.dataset.index
    const mode = e.currentTarget.dataset.mode || 'set'  // set / add / refund
    console.log('[openDepositInputModal] openid:', openid, 'index:', idx, 'mode:', mode)
    
    // 三级匹配：openid -> _id -> index
    let user = openid
      ? this.data.levelUsers.find(u =>
          (u.openid && u.openid === openid) ||
          (u._openid && u._openid === openid) ||
          (u._id && u._id === openid)
        )
      : null
    
    if (!user && typeof idx !== 'undefined') {
      user = this.data.levelUsers[Number(idx)] || null
    }
    
    if (!user) {
      console.error('[openDepositInputModal] 找不到用户, openid=', openid, 'idx=', idx)
      wx.showToast({ title: '用户数据获取失败', icon: 'none' })
      return
    }
    this.setData({
      depositInputUser: user,
      depositInputModalVisible: true,
      depositInputMode: mode,
      depositInputAmount: mode === 'set' ? String(user.depositPaid || '') : '',
      depositInputNote: ''
    })
  },

  closeDepositInputModal() {
    this.setData({ depositInputModalVisible: false, depositInputUser: null })
  },

  onDepositAmountInput(e) {
    this.setData({ depositInputAmount: e.detail.value })
  },

  onDepositNoteInput(e) {
    this.setData({ depositInputNote: e.detail.value })
  },

  async confirmDepositInput() {
    const { depositInputUser, depositInputAmount, depositInputNote, depositInputMode } = this.data
    if (!depositInputUser) return
    const amount = parseFloat(depositInputAmount)
    if (isNaN(amount) || amount <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' })
      return
    }
    const targetOpenid = depositInputUser._openid || depositInputUser.openid
    wx.showLoading({ title: '提交中...' })
    try {
      let result
      if (depositInputMode === 'add') {
        // 补押金：在现有基础上增加
        result = await callCloud('adminMgr', {
          action: 'adminAdjustDeposit',
          targetOpenid,
          adjustAmount: amount,
          adjustType: 'add',
          note: depositInputNote || '管理员补押金'
        })
      } else if (depositInputMode === 'refund') {
        // 退押金：在现有基础上减少
        result = await callCloud('adminMgr', {
          action: 'adminAdjustDeposit',
          targetOpenid,
          adjustAmount: amount,
          adjustType: 'refund',
          note: depositInputNote || '管理员退押金'
        })
      } else {
        // set：直接设置总押金
        result = await callCloud('adminMgr', {
          action: 'adminSetDeposit',
          targetOpenid,
          depositAmount: amount,
          note: depositInputNote || ''
        })
      }
      wx.hideLoading()
      if (result.success) {
        wx.showToast({ title: result.message || '操作成功', icon: 'success' })
        this.setData({ depositInputModalVisible: false, depositInputUser: null })
        // 刷新列表
        this.setData({ levelUsers: [], levelUserPage: 1, levelUserNoMore: false })
        this.loadLevelUsers()
      } else {
        wx.showToast({ title: result.error || '操作失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      console.error('[confirmDepositInput] error:', e)
      wx.showToast({ title: '网络错误，请重试', icon: 'none' })
    }
  },

  // ──────────────────────────────────────────────
  // ---- 充值审批 ----
  // ──────────────────────────────────────────────

  async loadRechargeList(refresh = false) {
    if (this.data.rechargeLoading) return
    if (!refresh && this.data.rechargeNoMore) return
    const page = refresh ? 1 : this.data.rechargePage
    this.setData({ rechargeLoading: true })
    try {
      const res = await callCloud('adminMgr', {
        action: 'getRechargeApplies',
        page,
        pageSize: 20,
        status: this.data.rechargeFilter === 'all' ? '' : this.data.rechargeFilter
      })
      if (res.success) {
        const list = refresh ? (res.list || []) : [...this.data.rechargeList, ...(res.list || [])]
        this.setData({
          rechargeList: list,
          rechargePage: page + 1,
          rechargeNoMore: (res.list || []).length < 20,
          rechargeTotal: res.total || 0
        })
      }
    } catch (e) {
      toast('加载充值列表失败')
    } finally {
      this.setData({ rechargeLoading: false })
    }
  },

  changeRechargeFilter(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({ rechargeFilter: filter, rechargeList: [], rechargePage: 1, rechargeNoMore: false })
    this.loadRechargeList(true)
  },

  // 审批通过
  async approveRecharge(e) {
    const { id, amount } = e.currentTarget.dataset
    const res = await new Promise(resolve =>
      wx.showModal({
        title: '确认通过充值',
        content: `确认已收到转账 ¥${amount}，通过该充值申请？`,
        editable: true,
        placeholderText: '审批备注（可选）',
        confirmText: '通过',
        confirmColor: '#30D158',
        success: resolve,
        fail: () => resolve({ confirm: false })
      })
    )
    if (!res.confirm) return
    wx.showLoading({ title: '操作中...' })
    try {
      const result = await callCloud('adminMgr', {
        action: 'approveRecharge',
        applyId: id,
        adminNote: res.content || '审批通过'
      })
      wx.hideLoading()
      if (result.success) {
        wx.showToast({ title: `已通过，+¥${amount}`, icon: 'success' })
        this.loadRechargeList(true)
      } else {
        wx.showToast({ title: result.error || '操作失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  // 审批拒绝
  async rejectRecharge(e) {
    const { id } = e.currentTarget.dataset
    const res = await new Promise(resolve =>
      wx.showModal({
        title: '拒绝充值申请',
        content: '请输入拒绝原因（将通知用户）',
        editable: true,
        placeholderText: '例如：未收到转账',
        confirmText: '确认拒绝',
        confirmColor: '#FF3B30',
        success: resolve,
        fail: () => resolve({ confirm: false })
      })
    )
    if (!res.confirm) return
    if (!res.content || !res.content.trim()) {
      toast('请填写拒绝原因')
      return
    }
    wx.showLoading({ title: '操作中...' })
    try {
      const result = await callCloud('adminMgr', {
        action: 'rejectRecharge',
        applyId: id,
        adminNote: res.content.trim()
      })
      wx.hideLoading()
      if (result.success) {
        wx.showToast({ title: '已拒绝', icon: 'success' })
        this.loadRechargeList(true)
      } else {
        wx.showToast({ title: result.error || '操作失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  // ========== 提现审批 ==========
  async loadWithdrawalList(refresh = false) {
    if (this.data.withdrawalLoading || (refresh && this.data.withdrawalNoMore)) return

    this.setData({ withdrawalLoading: true })
    try {
      const res = await callCloud('paymentMgr', {
        action: 'adminGetWithdrawalApplies',
        page: this.data.withdrawalPage,
        pageSize: 20,
        status: this.data.withdrawalFilter === 'all' ? '' : this.data.withdrawalFilter
      })

      const list = refresh ? (res.list || []) : [...this.data.withdrawalList, ...(res.list || [])]
      this.setData({
        withdrawalList: list,
        withdrawalPage: this.data.withdrawalPage + 1,
        withdrawalNoMore: (res.list || []).length < 20,
        withdrawalTotal: res.total || 0
      })
    } catch (e) {
      toast('加载提现列表失败')
    } finally {
      this.setData({ withdrawalLoading: false })
    }
  },

  changeWithdrawalFilter(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({ withdrawalFilter: filter, withdrawalList: [], withdrawalPage: 1, withdrawalNoMore: false })
    this.loadWithdrawalList(true)
  },

  // 审批通过提现
  async approveWithdrawal(e) {
    const { id, amount } = e.currentTarget.dataset
    const res = await new Promise(resolve =>
      wx.showModal({
        title: '确认通过提现',
        content: `确认通过该提现申请 ¥${amount}？`,
        editable: true,
        placeholderText: '审批备注（可选）',
        confirmText: '通过',
        confirmColor: '#30D158',
        success: resolve,
        fail: () => resolve({ confirm: false })
      })
    )
    if (!res.confirm) return
    wx.showLoading({ title: '操作中...' })
    try {
      const result = await callCloud('paymentMgr', {
        action: 'adminApproveWithdrawal',
        applyId: id,
        adminNote: res.content || '审批通过'
      })
      wx.hideLoading()
      if (result.success) {
        wx.showToast({ title: '已通过', icon: 'success' })
        this.loadWithdrawalList(true)
      } else {
        wx.showToast({ title: result.message || '操作失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  // 审批拒绝提现
  async rejectWithdrawal(e) {
    const { id } = e.currentTarget.dataset
    const res = await new Promise(resolve =>
      wx.showModal({
        title: '拒绝提现申请',
        content: '请输入拒绝原因（将通知用户）',
        editable: true,
        placeholderText: '例如：账户异常',
        confirmText: '确认拒绝',
        confirmColor: '#FF3B30',
        success: resolve,
        fail: () => resolve({ confirm: false })
      })
    )
    if (!res.confirm) return
    if (!res.content || !res.content.trim()) {
      toast('请填写拒绝原因')
      return
    }
    wx.showLoading({ title: '操作中...' })
    try {
      const result = await callCloud('paymentMgr', {
        action: 'adminRejectWithdrawal',
        applyId: id,
        adminNote: res.content.trim()
      })
      wx.hideLoading()
      if (result.success) {
        wx.showToast({ title: '已拒绝', icon: 'success' })
        this.loadWithdrawalList(true)
      } else {
        wx.showToast({ title: result.message || '操作失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  // ========== 弹窗辅助方法 ==========
  
  // 阻止事件冒泡
  stopPropagation() {
    // 空方法，用于阻止事件冒泡
  },

  // page-container 的 beforeleave 事件处理
  onModalBeforeLeave() {
    // 空方法，允许弹窗关闭
    // page-container 的 close-on-slide-down="true" 会自动关闭弹窗
  },

  // ========== 举报管理 ==========
  async loadReports(reset = false) {
    if (this.data.reportLoading) return

    const isReset = reset
    if (isReset) {
      this.setData({ reportLoading: true, reportPage: 1, reportNoMore: false })
    } else {
      if (this.data.reportNoMore) return
      this.setData({ reportLoading: true })
    }

    try {
      const res = await callCloud('reportMgr', {
        action: 'adminGetReports',
        page: isReset ? 1 : this.data.reportPage,
        pageSize: 20,
        status: this.data.reportFilter
      })

      if (res && res.success) {
        const newList = res.list || []
        const allList = isReset ? newList : [...this.data.reportList, ...newList]
        this.setData({
          reportList: allList,
          reportPage: isReset ? 2 : this.data.reportPage + 1,
          reportNoMore: newList.length < 20,
          reportStats: res.stats || { pending: 0, handled: 0, rejected: 0 }
        })
      } else {
        toast(res.error || '加载失败', 'error')
      }
    } catch (e) {
      console.error('加载举报列表失败', e)
      toast('加载失败', 'error')
    } finally {
      this.setData({ reportLoading: false })
    }
  },

  // 切换举报筛选
  switchReportFilter(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({ reportFilter: filter })
    this.loadReports(true)
  },

  // 显示举报处理弹窗
  showReportModal(e) {
    const item = e.currentTarget.dataset.item
    const action = e.currentTarget.dataset.action
    this.setData({
      reportModalVisible: true,
      reportModalItem: item,
      reportModalAction: action,
      reportPunishmentLevel: 'minor',
      reportAdminNote: ''
    })
  },

  // 关闭举报处理弹窗
  closeReportModal() {
    this.setData({
      reportModalVisible: false,
      reportModalItem: null,
      reportAdminNote: ''
    })
  },

  // 选择处罚等级
  selectPunishmentLevel(e) {
    this.setData({ reportPunishmentLevel: e.currentTarget.dataset.level })
  },

  // 输入处理备注
  onReportNoteInput(e) {
    this.setData({ reportAdminNote: e.detail.value })
  },

  // 预览举报图片
  previewReportImage(e) {
    const url = e.currentTarget.dataset.url
    const images = this.data.reportModalItem?.images || []
    wx.previewImage({
      current: url,
      urls: images
    })
  },

  // 提交举报处理
  async submitReportHandle() {
    const { reportModalItem, reportModalAction, reportPunishmentLevel, reportAdminNote } = this.data
    if (!reportModalItem) return

    wx.showLoading({ title: '处理中...' })

    try {
      const actionName = reportModalAction === 'handle' ? 'adminHandleReport' : 'adminRejectReport'
      const params = {
        action: actionName,
        reportId: reportModalItem._id,
        adminNote: reportAdminNote
      }
      
      if (reportModalAction === 'handle') {
        params.punishmentLevel = reportPunishmentLevel
      }

      const res = await callCloud('reportMgr', params)

      wx.hideLoading()

      if (res && res.success) {
        toast('处理成功', 'success')
        this.closeReportModal()
        this.loadReports(true)
        this.loadAllNotifications()
      } else {
        toast(res.error || '处理失败', 'error')
      }
    } catch (e) {
      wx.hideLoading()
      console.error('处理举报失败', e)
      toast('处理失败', 'error')
    }
  },

  // ===== 消息测试（Tab=19）=====

  // 测试发送订阅消息
  async testSendMsg(e) {
    const action = e.currentTarget.dataset.action
    const TEMPLATE_ID = 'qkNEkQTj0waYSCgdJC7dSe9L5_gqfAQqme-J0IEFA_c' // 活动通知（用于授权）

    // 先请求订阅授权
    const authRes = await new Promise(resolve => {
      wx.requestSubscribeMessage({
        tmplIds: [TEMPLATE_ID],
        success: res => resolve(res),
        fail: err => resolve({ err })
      })
    })

    if (authRes.err || authRes[TEMPLATE_ID] !== 'accept') {
      toast('请先授权订阅消息', 'none')
      return
    }

    this.setData({ msgTestLoading: action })

    const today = new Date().toISOString().slice(0, 10)
    const openid = getApp().globalData.openid

    // 各类型测试数据
    const TEST_PARAMS = {
      shipment:    { status: '已发货', deliveryMethod: '顺丰速运', trackingNumber: 'SF1234567890' },
      points:      { points: 88, reason: '完成互换奖励' },
      orderCancel: { cancelReason: '对方取消了订单', cancelTime: today },
      withdrawal:  { status: '已通过', amount: 50, account: '微信零钱' },
      activity:    { content: '测试活动通知内容', startTime: today, endTime: today, remark: '这是一条测试消息' },
      swapRequest: { requesterName: '测试用户', productName: '云南普洱茶', requestTime: today },
      swapAccept:  { accepterName: '测试用户', productName: '云南普洱茶', acceptTime: today },
      swapReject:  { rejecterName: '测试用户', productName: '云南普洱茶', rejectTime: today },
    }

    try {
      const res = await callCloud('sendSubscribeMsg', {
        action,
        openid,
        params: TEST_PARAMS[action] || {}
      })

      const log = {
        action,
        success: res && res.success,
        error: res?.error || '',
        time: new Date().toLocaleTimeString()
      }

      const logs = [log, ...this.data.msgTestLogs].slice(0, 20)
      this.setData({ msgTestLogs: logs, msgTestLoading: '' })

      if (res && res.success) {
        toast(`${action} 发送成功 ✅`, 'success')
      } else {
        toast(`失败: ${res?.error || '未知错误'}`, 'none')
      }
    } catch (err) {
      const logs = [{ action, success: false, error: err.message, time: new Date().toLocaleTimeString() }, ...this.data.msgTestLogs].slice(0, 20)
      this.setData({ msgTestLogs: logs, msgTestLoading: '' })
      toast('发送异常: ' + err.message, 'none')
    }
  }

})





