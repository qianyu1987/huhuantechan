// pages/daigou-deposit/index.js
// 押金管理页面 - 显示押金状态，引导用户联系客服
const { callCloud, toast, showLoading } = require('../../utils/util')

Page({
  data: {
    depositStatus: 'inactive', // active | inactive
    depositAmount: 0,
    loading: true,
    // 退押金弹窗
    refundModalVisible: false,
    refundAmount: '',
    refundRemark: '',
    // 补押金弹窗
    addModalVisible: false,
    addAmount: '',
    addRemark: '',
    // 客服配置
    servicePhone: '',
    serviceWechat: ''
  },

  onLoad() {
    this.loadDepositStatus()
    this.loadServiceConfig()
  },

  async loadDepositStatus() {
    this.setData({ loading: true })
    try {
      const res = await callCloud('daigouMgr', { action: 'getDepositStatus' })
      if (res.success) {
        this.setData({
          depositStatus: res.status || 'inactive',
          depositAmount: res.amount || 0,
          loading: false
        })
      } else {
        toast(res.message || '加载失败')
        this.setData({ loading: false })
      }
    } catch (e) {
      console.error('loadDepositStatus error:', e)
      toast('加载失败')
      this.setData({ loading: false })
    }
  },

  // ===== 退押金 =====
  openRefundModal() {
    const balance = this.data.depositAmount || 0
    if (balance <= 0) {
      toast('当前押金余额为0，无法退款')
      return
    }
    this.setData({
      refundModalVisible: true,
      refundAmount: '',
      refundRemark: ''
    })
  },

  closeRefundModal() {
    this.setData({ refundModalVisible: false })
  },

  onRefundAmountInput(e) {
    this.setData({ refundAmount: e.detail.value })
  },

  onRefundRemarkInput(e) {
    this.setData({ refundRemark: e.detail.value })
  },

  async submitRefund() {
    const amount = parseFloat(this.data.refundAmount)
    const remark = this.data.refundRemark.trim()
    const balance = this.data.depositAmount || 0

    if (!amount || amount <= 0) {
      toast('请输入有效的退款金额')
      return
    }
    if (amount > balance) {
      toast('退款金额不能超过当前余额')
      return
    }

    showLoading('提交中...')
    try {
      const res = await callCloud('userInit', {
        action: 'submitDepositRequest',
        type: 'refund',
        amount,
        remark
      })
      wx.hideLoading()
      if (res && res.success) {
        toast('退款申请已提交，请等待审核', 'success')
        this.setData({ refundModalVisible: false })
      } else {
        toast(res?.error || '申请失败')
      }
    } catch (e) {
      wx.hideLoading()
      toast('申请失败')
    }
  },

  // ===== 补押金 =====
  openAddModal() {
    this.setData({
      addModalVisible: true,
      addAmount: '',
      addRemark: ''
    })
  },

  closeAddModal() {
    this.setData({ addModalVisible: false })
  },

  onAddAmountInput(e) {
    this.setData({ addAmount: e.detail.value })
  },

  onAddRemarkInput(e) {
    this.setData({ addRemark: e.detail.value })
  },

  async submitAdd() {
    const amount = parseFloat(this.data.addAmount)
    const remark = this.data.addRemark.trim()

    if (!amount || amount <= 0) {
      toast('请输入有效的补缴金额')
      return
    }

    showLoading('提交中...')
    try {
      const res = await callCloud('userInit', {
        action: 'submitDepositRequest',
        type: 'add',
        amount,
        remark
      })
      wx.hideLoading()
      if (res && res.success) {
        toast('补缴申请已提交，请等待审核', 'success')
        this.setData({ addModalVisible: false })
      } else {
        toast(res?.error || '申请失败')
      }
    } catch (e) {
      wx.hideLoading()
      toast('申请失败')
    }
  },

  stopPropagation() {},

  // 加载客服配置
  async loadServiceConfig() {
    try {
      const res = await callCloud('userInit', { action: 'getServiceConfig' })
      if (res && res.success) {
        this.setData({
          servicePhone: res.servicePhone || '',
          serviceWechat: res.serviceWechat || ''
        })
      }
    } catch (e) {
      console.error('loadServiceConfig error:', e)
    }
  },

  // 复制客服微信
  copyWechat() {
    const wechat = this.data.serviceWechat
    if (!wechat) {
      toast('客服微信未配置')
      return
    }
    wx.setClipboardData({
      data: wechat,
      success: () => {
        toast('客服微信已复制', 'success')
      },
      fail: () => {
        toast('复制失败，请手动复制')
      }
    })
  },

  // 拨打电话
  makeCall() {
    const phone = this.data.servicePhone
    if (!phone) {
      toast('客服电话未配置')
      return
    }
    wx.makePhoneCall({
      phoneNumber: phone.replace(/-/g, ''),
      fail: () => {
        toast('拨打电话失败')
      }
    })
  },

  // 刷新押金状态
  refreshStatus() {
    this.loadDepositStatus()
  },

  // 跳转到押金申请页面
  goToApply() {
    wx.navigateTo({ url: '/pages/deposit-apply/index' })
  },

  // 跳转到等级页面
  goToLevelPage() {
    wx.navigateTo({ url: '/pages/daigou-level/index' })
  }
})
