// pages/withdrawal/index.js - 提现页面
const { callCloud, toast } = require('../../utils/util')

// 辅助函数：安全地格式化金额
function formatAmount(value) {
  const num = parseFloat(value)
  return isNaN(num) ? '0.00' : num.toFixed(2)
}

Page({
  data: {
    // 提现配置
    withdrawalThreshold: 30,
    walletBalance: 0,
    availableAmount: 0,
    maxWithdrawalAmount: 0, // 单次最大提现金额（钱包余额的50%）
    withdrawalFeeRate: 0.05, // 提现手续费率5%
    canWithdraw: false,
    
    // 表单数据
    amount: '',
    contactInfo: '',
    remark: '',
    amountError: '',
    
    // 计算金额
    feeAmount: 0,    // 手续费金额
    actualAmount: 0, // 实际到账金额
    
    // 快捷金额选项（根据可提现金额动态计算）
    quickAmountOptions: [],
    
    // 提交状态
    canSubmit: false,
    loading: false
  },
  
  // 在页面中暴露formatAmount函数
  formatAmount: formatAmount,

  onLoad() {
    this.loadWithdrawalConfig()
  },

  onShow() {
    // 页面显示时重新加载配置
    this.loadWithdrawalConfig()
  },

  // 加载提现配置
  async loadWithdrawalConfig() {
    try {
      const res = await callCloud('paymentMgr', { action: 'getWithdrawalConfig' })
      if (res && res.success) {
        // 确保所有金额都是数字类型
        const withdrawalThreshold = parseFloat(res.withdrawalThreshold) || 30
        const walletBalance = parseFloat(res.walletBalance) || 0
        const availableAmount = parseFloat(res.availableAmount) || 0
        const maxWithdrawalAmount = parseFloat(res.maxWithdrawalAmount) || 0
        const withdrawalFeeRate = parseFloat(res.withdrawalFeeRate) || 0.05
        
        // 动态计算快捷金额选项：只显示小于等于可提现金额的选项
        const presetAmounts = [50, 100, 200, 500]
        const quickAmountOptions = presetAmounts.filter(amount => amount <= availableAmount)
        
        this.setData({
          withdrawalThreshold: withdrawalThreshold,
          walletBalance: walletBalance,
          availableAmount: availableAmount,
          maxWithdrawalAmount: maxWithdrawalAmount,
          withdrawalFeeRate: withdrawalFeeRate,
          canWithdraw: res.canWithdraw || false,
          quickAmountOptions: quickAmountOptions
        })
        this.validateForm()
      } else {
        toast(res.message || '加载提现配置失败', 'error')
      }
    } catch (e) {
      console.error('加载提现配置失败', e)
      toast('加载失败，请重试', 'error')
    }
  },

  // 返回上一页
  goBack() {
    wx.navigateBack()
  },

  // 金额输入
  onAmountInput(e) {
    const value = e.detail.value
    this.setData({
      amount: value,
      amountError: ''
    })
    this.validateForm()
  },

  // 选择快捷金额
  selectQuickAmount(e) {
    const amount = parseFloat(e.currentTarget.dataset.amount)
    if (!isNaN(amount)) {
      this.setData({
        amount: amount.toString(),
        amountError: ''
      })
      this.validateForm()
    }
  },

  // 选择全部金额
  selectAllAmount() {
    this.setData({
      amount: this.data.availableAmount.toString(),
      amountError: ''
    })
    this.validateForm()
  },

  // 收款信息输入
  onContactInfoInput(e) {
    this.setData({
      contactInfo: e.detail.value
    })
    this.validateForm()
  },

  // 备注输入
  onRemarkInput(e) {
    this.setData({
      remark: e.detail.value
    })
  },

  // 验证表单
  validateForm() {
    const { amount, contactInfo, withdrawalThreshold, availableAmount, maxWithdrawalAmount, withdrawalFeeRate } = this.data
    let amountError = ''
    let canSubmit = false
    let feeAmount = 0
    let actualAmount = 0

    // 验证金额
    if (!amount) {
      amountError = '请输入提现金额'
    } else {
      const amountNum = parseFloat(amount)
      if (isNaN(amountNum) || amountNum <= 0) {
        amountError = '提现金额必须大于0'
      } else if (amountNum < withdrawalThreshold) {
        amountError = `提现金额不能低于 ¥${(withdrawalThreshold || 0).toFixed(2)}`
      } else if (amountNum > availableAmount) {
        amountError = `提现金额不能超过可提现金额 ¥${(availableAmount || 0).toFixed(2)}`
      } else if (amountNum > maxWithdrawalAmount) {
        amountError = `单次提现金额不能超过钱包余额的50%（最多 ¥${(maxWithdrawalAmount || 0).toFixed(2)}）`
      } else {
        // 计算手续费和实际到账金额
        feeAmount = parseFloat((amountNum * withdrawalFeeRate).toFixed(2))
        actualAmount = parseFloat((amountNum - feeAmount).toFixed(2))
      }
    }

    // 验证收款信息
    if (!contactInfo.trim()) {
      // 金额验证通过但收款信息为空时，才显示错误
      if (!amountError && amount) {
        amountError = '请输入收款账户信息'
      }
    }

    // 判断是否可以提交
    canSubmit = !amountError && amount && contactInfo.trim()

    this.setData({
      amountError,
      feeAmount,
      actualAmount,
      canSubmit
    })
  },

  // 提交提现申请
  async submitWithdrawal() {
    if (!this.data.canSubmit || this.data.loading) {
      return
    }

    const { amount, contactInfo, remark } = this.data
    const amountNum = parseFloat(amount)

    // 最终验证
    if (amountNum < this.data.withdrawalThreshold) {
      toast(`提现金额不能低于 ¥${(this.data.withdrawalThreshold || 0).toFixed(2)}`, 'error')
      return
    }

    if (amountNum > this.data.availableAmount) {
      toast(`提现金额不能超过可提现金额 ¥${(this.data.availableAmount || 0).toFixed(2)}`, 'error')
      return
    }

    if (amountNum > this.data.maxWithdrawalAmount) {
      toast(`单次提现金额不能超过钱包余额的50%（最多 ¥${(this.data.maxWithdrawalAmount || 0).toFixed(2)}）`, 'error')
      return
    }

    this.setData({ loading: true })

    try {
      const res = await callCloud('paymentMgr', {
        action: 'submitWithdrawalApply',
        amount: amountNum,
        contactInfo: contactInfo.trim(),
        remark: remark.trim()
      })

      this.setData({ loading: false })

      if (res && res.success) {
        // 显示成功提示
        wx.showModal({
          title: '提交成功',
          content: res.message,
          showCancel: false,
          success: () => {
            // 返回上一页
            wx.navigateBack()
            // 提示钱包页面刷新数据
            const pages = getCurrentPages()
            const prevPage = pages[pages.length - 2]
            if (prevPage && prevPage.route === 'pages/wallet/index') {
              prevPage.loadWalletData && prevPage.loadWalletData()
            }
          }
        })
      } else {
        toast(res.message || '提交失败', 'error')
      }
    } catch (e) {
      this.setData({ loading: false })
      console.error('提交提现申请失败', e)
      toast('提交失败，请重试', 'error')
    }
  },

  // 跳转到提现记录页面
  goToWithdrawalHistory() {
    wx.navigateTo({
      url: '/pages/withdrawal-history/index'
    })
  }
})