// pages/withdrawal/index.js - 提现页面
const { callCloud, toast } = require('../../utils/util')
const subscribeMsg = require('../../utils/subscribeMessage')

// 辅助函数：安全地格式化金额
function formatAmount(value) {
  const num = parseFloat(value)
  return isNaN(num) ? '0.00' : num.toFixed(2)
}

Page({
  data: {
    // 提现配置
    withdrawalThreshold: 30,
    withdrawalThresholdText: '30.00',
    walletBalance: 0,
    walletBalanceText: '0.00',
    availableAmount: 0,
    availableAmountText: '0.00',
    maxWithdrawalAmount: 0, // 单次最大提现金额（钱包余额的50%）
    withdrawalFeeRate: 0.05, // 提现手续费率5%
    canWithdraw: false,
    
    // 表单数据
    amount: '',
    paymentQrcode: '',    // 微信收款码URL
    paymentQrcodeLocal: '', // 本地预览URL
    remark: '',
    amountError: '',
    
    // 计算金额
    feeAmount: 0,    // 手续费金额
    feeAmountText: '0.00',
    actualAmount: 0, // 实际到账金额
    actualAmountText: '0.00',
    
    // 快捷金额选项（根据可提现金额动态计算）
    quickAmounts: [],   // 统一使用这个数组 [{value: 50, text: "50.00"}]
    
    // 提交状态
    canSubmit: false,
    loading: false
  },
  
  // 在页面中暴露formatAmount函数（用于JS内部调用）
  formatAmount: formatAmount,

  onLoad() {
    // 初始化主题
    const savedTheme = wx.getStorageSync('appTheme') || 'dark'
    this.setData({ pageTheme: savedTheme })

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
        const filteredAmounts = presetAmounts.filter(amount => amount <= availableAmount)
        // 统一生成 quickAmounts 数组
        const quickAmounts = filteredAmounts.map(v => ({
          value: v,
          text: formatAmount(v)
        }))
        
        this.setData({
          withdrawalThreshold: withdrawalThreshold,
          withdrawalThresholdText: formatAmount(withdrawalThreshold),
          walletBalance: walletBalance,
          walletBalanceText: formatAmount(walletBalance),
          availableAmount: availableAmount,
          availableAmountText: formatAmount(availableAmount),
          maxWithdrawalAmount: maxWithdrawalAmount,
          withdrawalFeeRate: withdrawalFeeRate,
          canWithdraw: res.canWithdraw || false,
          quickAmounts: quickAmounts
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

  // 跳转充值页面
  goToRecharge() {
    wx.navigateTo({ url: '/pages/recharge/index' })
  },

  // 返回钱包
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
    const amount = e.currentTarget.dataset.amount
    if (amount) {
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

  // 上传微信收款码
  async uploadPaymentQrcode() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFilePaths[0]
        wx.showLoading({ title: '上传中...' })
        try {
          // 上传到云存储
          const cloudPath = `payment-qrcodes/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath: cloudPath,
            filePath: tempFilePath
          })
          
          wx.hideLoading()
          if (uploadRes.fileID) {
            this.setData({
              paymentQrcode: uploadRes.fileID,
              paymentQrcodeLocal: tempFilePath
            })
            this.validateForm()
            wx.showToast({ title: '上传成功', icon: 'success' })
          } else {
            wx.showToast({ title: '上传失败', icon: 'none' })
          }
        } catch (e) {
          wx.hideLoading()
          console.error('上传收款码失败', e)
          wx.showToast({ title: '上传失败', icon: 'none' })
        }
      },
      fail: () => {
        // 用户取消选择
      }
    })
  },

  // 删除收款码
  deletePaymentQrcode() {
    wx.showModal({
      title: '提示',
      content: '确定要删除收款码吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            paymentQrcode: '',
            paymentQrcodeLocal: ''
          })
          this.validateForm()
        }
      }
    })
  },

  // 备注输入
  onRemarkInput(e) {
    this.setData({
      remark: e.detail.value
    })
  },

  // 验证表单
  validateForm() {
    const { amount, paymentQrcode, withdrawalThreshold, availableAmount, maxWithdrawalAmount, withdrawalFeeRate } = this.data
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
        amountError = `提现金额不能低于 ¥${formatAmount(withdrawalThreshold)}`
      } else if (amountNum > availableAmount) {
        amountError = `提现金额不能超过可提现金额 ¥${formatAmount(availableAmount)}`
      } else if (amountNum > maxWithdrawalAmount) {
        amountError = `单次提现金额不能超过钱包余额的50%（最多 ¥${formatAmount(maxWithdrawalAmount)}）`
      } else {
        // 计算手续费和实际到账金额
        feeAmount = parseFloat((amountNum * withdrawalFeeRate).toFixed(2))
        actualAmount = parseFloat((amountNum - feeAmount).toFixed(2))
      }
    }

    // 验证收款码
    if (!paymentQrcode) {
      if (!amountError && amount) {
        amountError = '请上传微信收款码'
      }
    }

    // 判断是否可以提交
    canSubmit = !amountError && amount && paymentQrcode

    this.setData({
      amountError,
      feeAmount,
      feeAmountText: formatAmount(feeAmount),
      actualAmount,
      actualAmountText: formatAmount(actualAmount),
      canSubmit
    })
  },

  // 提交提现申请
  async submitWithdrawal() {
    if (!this.data.canSubmit || this.data.loading) {
      return
    }

    const { amount, paymentQrcode, remark } = this.data
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

    if (!paymentQrcode) {
      toast('请上传微信收款码', 'error')
      return
    }

    this.setData({ loading: true })

    try {
      const res = await callCloud('paymentMgr', {
        action: 'submitWithdrawalApply',
        amount: amountNum,
        paymentQrcode: paymentQrcode,
        remark: remark.trim()
      })

      this.setData({ loading: false })

      if (res && res.success) {
        // 请求提现结果通知订阅
        subscribeMsg.subscribeForWithdrawal()
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