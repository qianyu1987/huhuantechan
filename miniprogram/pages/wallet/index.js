// pages/wallet/index.js
const { callCloud, toast } = require('../../utils/util')

Page({
  data: {
    walletBalance: 0,
    pendingRechargeAmount: 0,   // 待审核充值金额
    depositBalance: 0,
    depositPaid: 0,
    depositFrozen: 0,
    depositStatus: 'ok', // ok, low, empty
    depositStatusText: '正常',
    points: 0,
    transactions: [],
    serviceWechat: '',
    servicePhone: ''
  },

  onLoad() {
    // 初始化主题
    const savedTheme = wx.getStorageSync('appTheme') || 'dark'
    this.setData({ pageTheme: savedTheme })

    this.loadWalletData()
  },

  onShow() {
    this.loadWalletData()
  },

  // 加载钱包数据
  async loadWalletData() {
    try {
      const [walletRes, transactionsRes, configRes] = await Promise.all([
        callCloud('paymentMgr', { action: 'getWalletInfo' }),
        callCloud('paymentMgr', { action: 'getTransactions', page: 1, pageSize: 5 }),
        callCloud('userInit', { action: 'getServiceConfig' })
      ])

      if (walletRes && walletRes.success !== false) {
        this.setData({
          walletBalance: walletRes.walletBalance || 0,
          pendingRechargeAmount: walletRes.pendingRechargeAmount || 0,
          depositBalance: walletRes.depositBalance || 0,
          depositPaid: walletRes.depositPaid || 0,
          depositFrozen: walletRes.depositFrozen || 0,
          points: walletRes.points || 0
        })
        this.updateDepositStatus()
      }

      if (transactionsRes && transactionsRes.list) {
        this.setData({
          transactions: transactionsRes.list.map(item => ({
            id: item.id,
            title: item.title || '交易',
            amount: item.amount || 0,
            type: item.type || 'expense',
            time: item.time || '',
            emoji: this.getTransactionEmoji(item.bizType, item.title)
          }))
        })
      }

      // 加载客服配置
      if (configRes && configRes.success) {
        this.setData({
          serviceWechat: configRes.serviceWechat || '',
          servicePhone: configRes.servicePhone || ''
        })
      }
    } catch (error) {
      console.error('加载钱包数据失败:', error)
      toast('加载数据失败')
    }
  },

  // 更新押金状态
  updateDepositStatus() {
    const { depositBalance } = this.data
    let status = 'ok', statusText = '正常'
    if (depositBalance === 0) { status = 'empty'; statusText = '未缴纳' }
    else if (depositBalance < 100) { status = 'low'; statusText = '余额不足' }
    this.setData({ depositStatus: status, depositStatusText: statusText })
  },

  // 获取交易类型对应的emoji
  getTransactionEmoji(bizType, title) {
    if (bizType === 'recharge') return '💳'
    if (bizType === 'service_fee') return '🛒'
    if (bizType === 'admin_adjust') return '⚙️'
    if (title && title.includes('押金')) return '🔒'
    if (title && title.includes('积分')) return '⭐'
    if (title && title.includes('代购')) return '🛒'
    return '💰'
  },

  // 跳转到押金详情
  goToDepositDetail() {
    wx.navigateTo({ url: '/pages/daigou-deposit/index' })
  },

  // 联系客服
  contactCustomerService() {
    const wechat = this.data.serviceWechat
    if (!wechat) {
      wx.showModal({
        title: '客服暂未配置',
        content: '客服联系方式正在配置中，请稍后再试或使用其他方式联系我们。',
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }
    wx.showModal({
      title: '联系客服',
      content: `请添加客服微信进行押金相关操作\n\n客服微信：${wechat}`,
      showCancel: true,
      cancelText: '取消',
      confirmText: '复制微信',
      success: (res) => {
        if (res.confirm) this.copyWechat()
      }
    })
  },

  // 复制客服微信
  copyWechat() {
    const wechat = this.data.serviceWechat
    if (!wechat) {
      wx.showModal({
        title: '客服暂未配置',
        content: '客服联系方式正在配置中，请稍后再试。',
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }
    wx.setClipboardData({
      data: wechat,
      success: () => toast('客服微信已复制', 'success'),
      fail: () => toast('复制失败')
    })
  },

  // 拨打客服电话
  callCustomerService() {
    const phone = this.data.servicePhone
    if (!phone) {
      wx.showModal({
        title: '客服暂未配置',
        content: '客服电话正在配置中，请稍后再试或使用其他方式联系我们。',
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }
    wx.makePhoneCall({
      phoneNumber: phone.replace(/-/g, ''),
      fail: (err) => {
        if (err.errMsg.indexOf('cancel') === -1) {
          toast('拨打失败')
        }
      }
    })
  },

  // 跳转到交易记录
  goToTransactionHistory() {
    toast('交易记录功能开发中')
  },

  // 跳转到积分明细
  goToPoints() {
    wx.navigateTo({ url: '/pages/points-rule/index' })
  },

  // 跳转到信用中心
  goToCredit() {
    wx.navigateTo({ url: '/pages/credit/index' })
  },

  // 跳转到提现页面
  goToWithdrawal() {
    wx.navigateTo({ url: '/pages/withdrawal/index' })
  },

  // 跳转到充值页面
  goToRecharge() {
    wx.navigateTo({ url: '/pages/recharge/index' })
  }
})
