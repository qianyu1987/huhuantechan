// pages/points-exchange/index.js
// 积分兑换页面 - 现金充值兑换积分
const { callCloud, toast } = require('../../utils/util')

const PRESETS = [1000, 2000, 5000, 10000, 20000]

Page({
  data: {
    presets: PRESETS,
    selectedPreset: null,
    customAmount: '',
    currentPoints: 0,
    exchangeRate: 100, // 100积分 = 1元
    submitting: false,
    // 支付相关
    showPayModal: false,
    payOrderId: '',
    payOrderNo: '',
    checkingPayment: false,
    paymentCheckCount: 0
  },

  onLoad() {
    // 初始化主题
    const savedTheme = wx.getStorageSync('appTheme') || 'dark'
    this.setData({ pageTheme: savedTheme })

    this.loadPoints()
    this.loadExchangeRate()
  },

  onShow() {
    this.loadPoints()
  },

  // 加载当前积分
  async loadPoints() {
    try {
      const res = await callCloud('userInit', { action: 'init' })
      if (res) {
        this.setData({ currentPoints: res.points || 0 })
      }
    } catch (e) {
      console.error('获取积分失败', e)
    }
  },

  // 加载积分汇率
  async loadExchangeRate() {
    try {
      const res = await callCloud('adminMgr', { action: 'getSystemConfig' })
      if (res && res.success) {
        this.setData({
          exchangeRate: res.pointsExchangeRate || 100
        })
      }
    } catch (e) {
      console.error('获取汇率失败', e)
    }
  },

  // 选择预设积分
  onSelectPreset(e) {
    const idx = e.currentTarget.dataset.index
    const points = PRESETS[idx]
    this.setData({
      selectedPreset: idx,
      customAmount: '',
      currentPoints: points
    })
  },

  // 输入自定义积分
  onCustomPointsInput(e) {
    const val = e.detail.value
    // 只允许数字
    const cleaned = val.replace(/[^\d]/g, '')
    const points = parseInt(cleaned) || 0
    this.setData({
      customAmount: cleaned,
      selectedPreset: null,
      currentPoints: points
    })
  },

  // 计算需要支付的金额
  calculateAmount() {
    const { currentPoints, exchangeRate } = this.data
    return (currentPoints / exchangeRate).toFixed(2)
  },

  // 发起积分兑换（微信支付）
  async onExchange() {
    const { currentPoints, submitting } = this.data
    if (submitting) return

    if (!currentPoints || currentPoints <= 0) {
      return toast('请选择或填写兑换积分数量')
    }
    if (currentPoints < 100) {
      return toast('最少兑换100积分')
    }
    if (currentPoints > 100000) {
      return toast('单次兑换不能超过100000积分')
    }

    const amount = this.calculateAmount()
    if (amount < 0.01) {
      return toast('兑换金额不能低于0.01元')
    }

    this.setData({ submitting: true })

    try {
      // 调用云函数创建积分兑换订单
      const res = await callCloud('paymentMgr', {
        action: 'createPointsExchangeOrder',
        points: currentPoints,
        amount: parseFloat(amount)
      })

      if (res && res.success) {
        this.setData({
          payOrderId: res.orderId,
          payOrderNo: res.orderNo
        })

        // 调用微信支付
        if (res.paymentParams) {
          await this.callWxPayment(res.paymentParams, res.orderId)
        } else {
          toast('支付参数获取失败，请稍后重试')
          this.setData({ submitting: false })
        }
      } else {
        toast(res.message || '兑换订单创建失败')
        this.setData({ submitting: false })
      }
    } catch (e) {
      console.error('积分兑换失败', e)
      toast('兑换失败，请稍后重试')
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

        // 支付成功，显示等待结果弹窗
        that.setData({
          showPayModal: true,
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
      }
    })
  },

  // 轮询查询支付结果
  async checkPaymentResult(orderId) {
    if (!this.data.checkingPayment) return

    const maxCheckCount = 10
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
        action: 'getPointsExchangeResult',
        orderId: orderId
      })

      if (res && res.status === 'success') {
        // 兑换成功
        this.setData({
          checkingPayment: false,
          paymentCheckCount: checkCount
        })

        wx.showModal({
          title: '兑换成功',
          content: `恭喜！${res.points}积分已到账`,
          showCancel: false,
          confirmText: '知道了',
          success: () => {
            this.closePayModal()
            this.loadPoints()
            this.setData({
              selectedPreset: null,
              customAmount: '',
              currentPoints: 0
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
          title: '兑换失败',
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
      }, 2000)
    } catch (e) {
      console.error('查询支付结果失败', e)
      setTimeout(() => {
        if (this.data.checkingPayment) {
          this.checkPaymentResult(orderId)
        }
      }, 2000)
    }
  },

  // 关闭支付弹窗
  closePayModal() {
    this.setData({
      showPayModal: false,
      checkingPayment: false,
      payOrderId: '',
      payOrderNo: ''
    })
  },

  // 返回
  onBack() {
    wx.navigateBack()
  }
})
