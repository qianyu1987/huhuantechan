// pages/recharge/index.js
const { callCloud, toast } = require('../../utils/util')

const PRESETS = [50, 100, 200, 500, 1000]

Page({
  data: {
    presets: PRESETS,
    selectedPreset: null,    // 选中的预设金额索引
    customAmount: '',        // 自定义输入金额
    currentAmount: 0,        // 当前选择的充值金额
    walletBalance: 0,        // 当前余额
    submitting: false,
    serviceWechat: '', // 客服微信（从后台配置读取）
    // 充值记录
    applyList: [],
    applyTotal: 0,
    applyPage: 1,
    applyLoading: false,
    // 微信支付相关
    showWechatPayModal: false,
    wechatPayOrderId: '',
    wechatPayOrderNo: '',
    checkingPayment: false,
    paymentCheckCount: 0
  },

  onLoad() {
    // 初始化主题
    const savedTheme = wx.getStorageSync('appTheme') || 'dark'
    this.setData({ pageTheme: savedTheme })

    this.loadBalance()
    this.loadApplyList(true)
    this.loadServiceConfig()
  },

  onShow() {
    this.loadBalance()
    this.loadApplyList(true)
    this.loadServiceConfig()
  },

  // 加载客服配置
  async loadServiceConfig() {
    try {
      const res = await callCloud('userInit', { action: 'getServiceConfig' })
      if (res && res.success) {
        this.setData({
          serviceWechat: res.serviceWechat || ''
        })
      }
    } catch (e) {
      console.error('加载客服配置失败', e)
    }
  },

  // 加载余额
  async loadBalance() {
    try {
      const res = await callCloud('paymentMgr', { action: 'getWalletInfo' })
      if (res && res.success !== false) {
        this.setData({ walletBalance: res.walletBalance || 0 })
      }
    } catch (e) {
      console.error('加载余额失败', e)
    }
  },

  // 选择预设金额
  onSelectPreset(e) {
    const idx = e.currentTarget.dataset.index
    const amount = PRESETS[idx]
    this.setData({
      selectedPreset: idx,
      customAmount: '',
      currentAmount: amount
    })
  },

  // 输入自定义金额
  onCustomAmountInput(e) {
    const val = e.detail.value
    // 只允许数字和小数点
    const cleaned = val.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
    const amount = parseFloat(cleaned) || 0
    this.setData({
      customAmount: cleaned,
      selectedPreset: null,
      currentAmount: amount
    })
  },

  // ========== 微信支付充值 ==========
  // 发起微信支付
  async onWechatPay() {
    const { currentAmount, submitting } = this.data
    if (submitting) return

    if (!currentAmount || currentAmount <= 0) {
      return toast('请选择或填写充值金额')
    }
    if (currentAmount < 1) {
      return toast('充值金额不能低于 ¥1')
    }
    if (currentAmount > 10000) {
      return toast('单次充值不能超过 ¥10000')
    }

    this.setData({ submitting: true })

    try {
      // 调用云函数创建微信支付订单
      const res = await callCloud('paymentMgr', {
        action: 'createWechatPayOrder',
        amount: currentAmount
      })

      if (res && res.success) {
        // 保存订单信息
        this.setData({
          wechatPayOrderId: res.orderId,
          wechatPayOrderNo: res.orderNo
        })

        // 调用微信支付
        if (res.paymentParams) {
          await this.callWxPayment(res.paymentParams, res.orderId)
        } else {
          toast('支付参数获取失败，请稍后重试')
          this.setData({ submitting: false })
        }
      } else {
        toast(res.message || '支付订单创建失败')
        this.setData({ submitting: false })
      }
    } catch (e) {
      console.error('微信支付充值失败', e)
      toast('支付失败，请稍后重试')
      this.setData({ submitting: false })
    }
  },

  // 调用微信支付
  callWxPayment(paymentParams, orderId) {
    const that = this

    wx.showLoading({ title: '正在调起支付...' })

    wx.requestPayment({
      ...paymentParams,
      success: (payRes) => {
        console.log('微信支付成功', payRes)
        wx.hideLoading()

        // 支付成功，弹窗显示等待结果
        that.setData({
          showWechatPayModal: true,
          submitting: false,
          checkingPayment: true,
          paymentCheckCount: 0
        })

        // 开始轮询查询支付结果
        that.checkPaymentResult(orderId)
      },
      fail: (payErr) => {
        console.error('微信支付取消或失败', payErr)
        wx.hideLoading()
        that.setData({ submitting: false })

        if (payErr.errMsg && payErr.errMsg.includes('cancel')) {
          toast('支付已取消')
        } else {
          toast('支付失败，请重试')
        }

        // 更新订单状态为失败
        callCloud('paymentMgr', {
          action: 'getWechatPayResult',
          orderId: orderId
        })
      }
    })
  },

  // 轮询查询支付结果
  async checkPaymentResult(orderId) {
    if (!this.data.checkingPayment) return

    const maxCheckCount = 10  // 最多查询10次
    const checkCount = this.data.paymentCheckCount + 1

    if (checkCount > maxCheckCount) {
      this.setData({
        checkingPayment: false,
        paymentCheckCount: checkCount
      })
      toast('支付结果查询超时，请稍后刷新页面查看')
      return
    }

    try {
      const res = await callCloud('paymentMgr', {
        action: 'getWechatPayResult',
        orderId: orderId
      })

      if (res && res.status === 'approved') {
        // 支付成功
        this.setData({
          checkingPayment: false,
          paymentCheckCount: checkCount
        })

        wx.showModal({
          title: '充值成功',
          content: `恭喜！¥${this.data.currentAmount} 已到账`,
          showCancel: false,
          confirmText: '知道了',
          success: () => {
            this.closeWechatPayModal()
            this.loadBalance()
            this.loadApplyList(true)
            this.setData({
              selectedPreset: null,
              customAmount: '',
              currentAmount: 0
            })
          }
        })
        return
      } else if (res && res.status === 'failed') {
        // 支付失败
        this.setData({
          checkingPayment: false,
          paymentCheckCount: checkCount
        })
        wx.showModal({
          title: '充值失败',
          content: res.message || '支付失败，请重试',
          showCancel: false,
          confirmText: '知道了'
        })
        return
      }

      // 继续轮询
      this.setData({ paymentCheckCount: checkCount })
      setTimeout(() => {
        if (this.data.checkingPayment) {
          this.checkPaymentResult(orderId)
        }
      }, 2000)  // 每2秒查询一次
    } catch (e) {
      console.error('查询支付结果失败', e)
      setTimeout(() => {
        if (this.data.checkingPayment) {
          this.checkPaymentResult(orderId)
        }
      }, 2000)
    }
  },

  // 关闭微信支付弹窗
  closeWechatPayModal() {
    this.setData({
      showWechatPayModal: false,
      checkingPayment: false,
      wechatPayOrderId: '',
      wechatPayOrderNo: ''
    })
  },

  // 复制订单号
  copyWechatPayOrderNo() {
    wx.setClipboardData({
      data: this.data.wechatPayOrderNo,
      success: () => toast('订单号已复制', 'success')
    })
  },

  // 加载充值记录
  async loadApplyList(refresh = false) {
    if (this.data.applyLoading) return
    const page = refresh ? 1 : this.data.applyPage
    this.setData({ applyLoading: true })
    try {
      const res = await callCloud('paymentMgr', {
        action: 'getMyRechargeApplies',
        page,
        pageSize: 10
      })
      if (res && res.success !== false) {
        const list = refresh ? res.list : [...this.data.applyList, ...res.list]
        this.setData({
          applyList: list,
          applyTotal: res.total || 0,
          applyPage: page + 1
        })
      }
    } catch (e) {
      console.error('加载充值记录失败', e)
    } finally {
      this.setData({ applyLoading: false })
    }
  },

  // 加载更多
  onLoadMore() {
    const { applyList, applyTotal } = this.data
    if (applyList.length < applyTotal) {
      this.loadApplyList(false)
    }
  },

  // 返回
  onBack() {
    wx.navigateBack()
  }
})
