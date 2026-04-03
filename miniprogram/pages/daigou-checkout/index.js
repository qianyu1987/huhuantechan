// pages/daigou-checkout/index.js
const { callCloud, toast, showLoading, hideLoading, getProvinceByCode } = require('../../utils/util')

const app = getApp()

// 积分兑换比率：100积分 = 1元（最多抵扣总价20%）
const POINTS_TO_YUAN = 100
const MAX_DEDUCT_RATE = 0.2

Page({
  data: {
    productId: '',
    product: null,
    productCover: '',
    productOrigin: '',
    address: null,
    remark: '',
    loading: true,
    submitting: false,
    // 积分
    userPoints: 0,
    usePoints: false,          // 是否使用积分抵扣
    pointsDeductible: 0,       // 最多可用积分
    pointsDeductAmount: 0,     // 积分抵扣金额（元）
    actualPrice: 0,            // 实际支付金额
    estimatedReward: 0,        // 下单后预估可得积分
    // 卖家信息
    sellerInfo: null
  },

  onLoad(options) {
    // 初始化主题
    const savedTheme = wx.getStorageSync('appTheme') || 'dark'
    this.setData({ pageTheme: savedTheme })

    const { productId } = options
    if (!productId) {
      toast('参数错误')
      setTimeout(() => wx.navigateBack(), 1200)
      return
    }
    this.setData({ productId })
    this.loadData(productId)
  },

  onShow() {
    // 地址页通过 prevPage.setData 写入 selectedAddress
    if (this.data.selectedAddress) {
      this.setData({ address: this.data.selectedAddress, selectedAddress: null })
    }
    // 刷新最新积分（从 globalData 同步，无需额外云函数调用）
    const latestPoints = app.globalData.points || 0
    if (latestPoints !== this.data.userPoints) {
      const price = (this.data.product && this.data.product.daigou) ? (this.data.product.daigou.price || 0) : 0
      const maxDeductAmt = Math.floor(price * MAX_DEDUCT_RATE * 100) / 100
      const pointsDeductible = price > 0 ? Math.min(latestPoints, Math.ceil(maxDeductAmt * POINTS_TO_YUAN)) : 0
      const pointsDeductAmount = Math.floor(pointsDeductible / POINTS_TO_YUAN * 100) / 100
      this.setData({ userPoints: latestPoints, pointsDeductible, pointsDeductAmount })
    }
    this._calcPrice()
  },

  async loadData(productId) {
    this.setData({ loading: true })
    try {
      const [productRes, addrRes, userRes, sellerRes] = await Promise.all([
        callCloud('productMgr', { action: 'detail', productId }),
        callCloud('userInit', { action: 'getAddressList' }).catch(() => ({ addresses: [] })),
        callCloud('userInit', { action: 'getStats' }).catch(() => null),
        callCloud('daigouMgr', { action: 'getSellerInfo', sellerOpenid: productId.split('_')[0] }).catch(() => null)
      ])

      if (!productRes.success || !productRes.product) {
        toast('商品不存在')
        setTimeout(() => wx.navigateBack(), 1200)
        return
      }

      const p = productRes.product
      if (!p.daigou || !p.daigou.enabled) {
        toast('该商品不支持代购')
        setTimeout(() => wx.navigateBack(), 1200)
        return
      }
      if (p.daigou.stock <= 0) {
        toast('该商品已售罄')
        setTimeout(() => wx.navigateBack(), 1200)
        return
      }

      // 处理图片
      let cover = (p.images && p.images.length > 0) ? p.images[0] : ''

      // 产地文本
      const provObj = getProvinceByCode ? getProvinceByCode(p.province) : null
      const origin = provObj ? provObj.name : (p.province || '')

      // 地址
      const addresses = (addrRes.addresses || addrRes.list || [])
      const defaultAddr = addresses.find(a => a.isDefault) || addresses[0] || null

      // 积分
      let userPoints = app.globalData.points || 0
      if (userRes && userRes.success) {
        userPoints = userRes.points || 0
        app.globalData.points = userPoints
        app.globalData.creditScore = userRes.creditScore || 100
      }

      const price = p.daigou.price || 0
      const maxDeductAmt = Math.floor(price * MAX_DEDUCT_RATE * 100) / 100  // 最多可抵扣金额
      const pointsDeductible = Math.min(userPoints, Math.ceil(maxDeductAmt * POINTS_TO_YUAN))
      const pointsDeductAmount = Math.floor(pointsDeductible / POINTS_TO_YUAN * 100) / 100
      // 完成后可得积分（价格 5%，最低5分）
      const estimatedReward = Math.max(5, Math.ceil(price * 0.05))

      // 卖家信息
      let sellerInfo = null
      if (sellerRes && sellerRes.success) {
        sellerInfo = sellerRes.sellerInfo
      }

      this.setData({
        product: p,
        productCover: cover,
        productOrigin: origin,
        address: defaultAddr,
        userPoints,
        pointsDeductible,
        pointsDeductAmount,
        actualPrice: price,
        estimatedReward,
        sellerInfo,
        loading: false
      })
    } catch (e) {
      console.error('[daigou-checkout] loadData error', e)
      toast('加载失败')
      this.setData({ loading: false })
    }
  },

  // 重新计算实付金额
  _calcPrice() {
    if (!this.data.product) return
    const price = this.data.product.daigou.price || 0
    const { usePoints, pointsDeductAmount } = this.data
    const actual = usePoints
      ? Math.max(0, Math.round((price - pointsDeductAmount) * 100) / 100)
      : price
    this.setData({ actualPrice: actual })
  },

  // 切换积分抵扣
  togglePoints() {
    const usePoints = !this.data.usePoints
    this.setData({ usePoints }, () => this._calcPrice())
  },

  chooseAddress() {
    wx.navigateTo({ url: '/pages/address/index?from=select' })
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value })
  },

  onImgError() {
    this.setData({ productCover: '/images/default-product.png' })
  },

  async submitOrder() {
    if (!this.data.address) {
      toast('请先选择收货地址')
      return
    }
    if (this.data.submitting) return

    this.setData({ submitting: true })
    showLoading('创建订单...')

    try {
      // 第一步：创建订单（状态为 pending_payment）
      const res = await callCloud('daigouMgr', {
        action: 'createOrder',
        productId: this.data.productId,
        addressId: this.data.address._id,
        remark: this.data.remark,
        usePoints: this.data.usePoints,
        pointsUsed: this.data.usePoints ? this.data.pointsDeductible : 0
      })

      hideLoading()

      if (!res.success) {
        toast(res.message || '下单失败，请重试')
        this.setData({ submitting: false })
        return
      }

      // 扣减本地积分显示
      if (this.data.usePoints && this.data.pointsDeductible > 0) {
        app.globalData.points = Math.max(0, (app.globalData.points || 0) - this.data.pointsDeductible)
      }

      const orderId = res.orderId
      const orderNo = res.orderNo
      const actualPrice = res.actualPrice || this.data.actualPrice

      // 第二步：如果实际支付金额 > 0，唤起微信支付
      if (actualPrice > 0) {
        showLoading('获取支付参数...')
        try {
          const payRes = await callCloud('daigouMgr', {
            action: 'createDaigouPayOrder',
            orderId
          })
          hideLoading()

          if (payRes && payRes.success && payRes.paymentParams) {
            // 唤起微信支付
            await this._callWxPayment(payRes.paymentParams, orderId, payRes.wxPayOrderId)
          } else {
            // 支付参数获取失败，跳转到订单详情让用户手动支付
            wx.showModal({
              title: '支付参数获取失败',
              content: '订单已创建，请在订单详情页重新发起支付',
              showCancel: false,
              success: () => {
                wx.redirectTo({ url: `/pages/daigou-order/index?orderId=${orderId}` })
              }
            })
          }
        } catch (payErr) {
          hideLoading()
          console.error('[daigou-checkout] 获取支付参数失败', payErr)
          wx.showModal({
            title: '支付发起失败',
            content: '订单已创建，请在订单详情页重新发起支付',
            showCancel: false,
            success: () => {
              wx.redirectTo({ url: `/pages/daigou-order/index?orderId=${orderId}` })
            }
          })
        }
      } else {
        // actualPrice 为 0（全额积分抵扣），直接确认支付
        await callCloud('daigouMgr', { action: 'confirmDaigouPayment', orderId })
        wx.showToast({ title: '下单成功！', icon: 'success', duration: 1200 })
        setTimeout(() => {
          wx.redirectTo({ url: `/pages/daigou-order/index?orderId=${orderId}` })
        }, 1000)
      }
    } catch (e) {
      hideLoading()
      toast('下单失败，请重试')
      console.error('[daigou-checkout] submitOrder error', e)
      this.setData({ submitting: false })
    }
  },

  // 调起微信支付
  async _callWxPayment(paymentParams, orderId, wxPayOrderId) {
    const that = this
    wx.showLoading({ title: '正在调起支付...' })

    wx.requestPayment({
      ...paymentParams,
      success: async (payRes) => {
        console.log('[代购支付成功]', payRes)
        wx.hideLoading()
        wx.showLoading({ title: '确认支付结果...' })

        try {
          // 通知云函数支付成功，将订单推进到 pending_shipment
          const confirmRes = await callCloud('daigouMgr', {
            action: 'confirmDaigouPayment',
            orderId,
            wxPayOrderId: wxPayOrderId || ''
          })
          wx.hideLoading()

          if (confirmRes && confirmRes.success) {
            wx.showToast({ title: '支付成功！', icon: 'success', duration: 1500 })
            setTimeout(() => {
              that.setData({ submitting: false })
              wx.redirectTo({ url: `/pages/daigou-order/index?orderId=${orderId}` })
            }, 1500)
          } else {
            // 确认失败，但支付已成功 → 跳到订单页
            wx.showModal({
              title: '支付成功',
              content: '支付已完成，请在订单详情中查看最新状态',
              showCancel: false,
              success: () => {
                that.setData({ submitting: false })
                wx.redirectTo({ url: `/pages/daigou-order/index?orderId=${orderId}` })
              }
            })
          }
        } catch (confirmErr) {
          wx.hideLoading()
          console.error('[代购支付] 确认支付结果失败', confirmErr)
          wx.showModal({
            title: '支付成功',
            content: '支付已完成，请在订单详情中查看最新状态',
            showCancel: false,
            success: () => {
              that.setData({ submitting: false })
              wx.redirectTo({ url: `/pages/daigou-order/index?orderId=${orderId}` })
            }
          })
        }
      },
      fail: (payErr) => {
        wx.hideLoading()
        that.setData({ submitting: false })
        console.error('[代购支付取消或失败]', payErr)

        if (payErr.errMsg && payErr.errMsg.includes('cancel')) {
          // 用户取消支付 → 跳到订单详情，可以重新支付
          wx.showModal({
            title: '支付已取消',
            content: '您可以在订单详情页重新发起支付',
            confirmText: '查看订单',
            cancelText: '稍后再说',
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.redirectTo({ url: `/pages/daigou-order/index?orderId=${orderId}` })
              }
            }
          })
        } else {
          wx.showModal({
            title: '支付失败',
            content: '支付未成功，可在订单详情页重新发起支付',
            confirmText: '查看订单',
            cancelText: '返回',
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.redirectTo({ url: `/pages/daigou-order/index?orderId=${orderId}` })
              }
            }
          })
        }
      }
    })
  }
})
