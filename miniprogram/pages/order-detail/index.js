// pages/order-detail/index.js
const { ORDER_STATUS } = require('../../utils/constants')
const { callCloud, formatTime, formatDateTime, getCreditLevel, getProvinceByCode, toast, showLoading, hideLoading, processImageUrl } = require('../../utils/util')
const subscribeMsg = require('../../utils/subscribeMessage')

const STATUS_CONFIG = {
  [ORDER_STATUS.PENDING]: {
    label: '待对方确认',
    color: '#F4A261',
    emoji: '⏳',
    desc: '等待对方确认请求'
  },
  [ORDER_STATUS.CONFIRMED]: {
    label: '等待发货',
    color: '#457B9D',
    emoji: '📦',
    desc: '双方已确认，请尽快发货'
  },
  [ORDER_STATUS.SHIPPED_A]: {
    label: '你已发货',
    color: '#F4A261',
    emoji: '🚚',
    desc: '你已发货，等待对方发货'
  },
  [ORDER_STATUS.SHIPPED_B]: {
    label: '对方已发货',
    color: '#FF6B35',
    emoji: '📬',
    desc: '对方已发货，请尽快发货'
  },
  [ORDER_STATUS.SHIPPED_BOTH]: {
    label: '双方已发货',
    color: '#457B9D',
    emoji: '🔄',
    desc: '双方都已发货，等待收货'
  },
  [ORDER_STATUS.RECEIVED_A]: {
    label: '你已收货',
    color: '#2D6A4F',
    emoji: '✅',
    desc: '你已收货，等待对方确认收货'
  },
  [ORDER_STATUS.RECEIVED_B]: {
    label: '对方已收货',
    color: '#F4A261',
    emoji: '📦',
    desc: '对方已收货，请确认收货'
  },
  [ORDER_STATUS.COMPLETED]: {
    label: '已完成',
    color: '#2D6A4F',
    emoji: '🎉',
    desc: '已完成，快去评价吧'
  },
  [ORDER_STATUS.CANCELLED]: {
    label: '已取消',
    color: '#999',
    emoji: '❌',
    desc: '订单已取消'
  },
  [ORDER_STATUS.DISPUTED]: {
    label: '纠纷中',
    color: '#E63946',
    emoji: '⚠️',
    desc: '订单存在纠纷，请联系客服'
  }
}

Page({
  data: {
    orderId: '',
    order: null,
    loading: true,
    statusConfig: {},
    isInitiator: false,
    myProduct: null,
    theirProduct: null,
    counterpart: null,
    timeline: [],
    // 客服配置
    servicePhone: '',
    serviceWechat: '',
    hasReviewed: false,
    showShipModal: false,
    shipForm: {
      companyIndex: -1,
      trackingNo: ''
    },
    expressCompanies: [
      '顺丰速运', '圆通速递', '中通快递', '韵达速递', '极兔速递',
      '申通快递', 'EMS', '京东物流', '德邦物流', '其它'
    ],
    // 地址选择弹窗
    showAddressModal: false,
    addressList: [],
    selectedAddressId: '',
    // 地址表单（手动填写）
    addressForm: {
      name: '',
      phone: '',
      province: '',
      city: '',
      district: '',
      detailAddress: ''
    },
    region: [],
    isEditingAddress: false,  // 是否手动编辑地址
    canShip: false,  // 是否可以填写快递单号
    // 纠纷处理
    showDisputeModal: false,
    showDisputeStatusModal: false,
    disputeTypes: ['商品不符', '质量问题', '物流问题', '其他问题'],
    disputeForm: {
      typeIndex: -1,
      description: '',
      images: []
    },
    disputeInfo: {},
    disputeStatusMap: {
      pending: '待处理',
      processing: '处理中',
      resolved: '已解决',
      rejected: '已驳回'
    }
  },

  onLoad(options) {
    // 初始化主题
    const savedTheme = wx.getStorageSync('appTheme') || 'dark'
    this.setData({ pageTheme: savedTheme })

    const { id, action } = options
    if (id) {
      this.setData({ orderId: id })
      this.loadOrderDetail().then(() => {
        if (action === 'ship') {
          this.showShipModal()
        } else if (action === 'review') {
          this.goToReview()
        }
      })
    } else {
      toast('订单ID错误')
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  onPullDownRefresh() {
    this.loadOrderDetail().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  onShow() {
    // 从评价页返回后刷新订单数据，更新评价状态
    if (this.data.orderId && !this.data.loading) {
      this.loadOrderDetail()
    }
  },

  // 分享给好友
  async onShareAppMessage() {
    const { order, myProduct, counterpart } = this.data
    if (!order || !myProduct) return {}
    
    let title = '我在风物之情与你互换特产'
    let imageUrl = ''
    
    // 如果有产品图片，用产品图片
    if (myProduct && myProduct.coverUrl) {
      imageUrl = myProduct.coverUrl
      
      // 如果是 cloud:// 格式，转换为临时链接
      if (imageUrl.startsWith('cloud://')) {
        try {
          const tempRes = await wx.cloud.getTempFileURL({
            fileList: [imageUrl]
          })
          if (tempRes.fileList && tempRes.fileList[0] && tempRes.fileList[0].tempFileURL) {
            imageUrl = tempRes.fileList[0].tempFileURL
          }
        } catch (tempErr) {
          console.error('转换图片临时链接失败:', tempErr)
          imageUrl = '/images/share-default.png'
        }
      }
    } else {
      imageUrl = '/images/share-default.png'
    }
    
    // 如果是已完成订单，显示互换成功
    if (order.status === 'completed') {
      title = `与${counterpart?.nickName || '好友'}互换特产成功！`
    } else if (order.status === 'confirmed' || order.status === 'shipped_a' || order.status === 'shipped_b') {
      title = '我正在和好友互换特产，快来加入！'
    }
    
    return {
      title,
      path: `/pages/detail/index?id=${myProduct._id}`,
      imageUrl
    }
  },

  // 分享到朋友圈
  async onShareTimeline() {
    const { order, myProduct, counterpart } = this.data
    if (!order || !myProduct) return {}
    
    let title = '我在风物之情互换特产'
    
    if (order.status === 'completed') {
      title = `与${counterpart?.nickName || '好友'}互换特产成功！🎉`
    } else if (order.status === 'confirmed' || order.status === 'shipped_a' || order.status === 'shipped_b') {
      title = '我正在和好友互换特产，快来一起玩！🎁'
    }
    
    // 朋友圈分享使用产品封面图
    let imageUrl = '/images/share-default.png'
    if (myProduct && myProduct.coverUrl) {
      imageUrl = myProduct.coverUrl
      
      // 如果是 cloud:// 格式，转换为临时链接
      if (imageUrl.startsWith('cloud://')) {
        try {
          const tempRes = await wx.cloud.getTempFileURL({
            fileList: [imageUrl]
          })
          if (tempRes.fileList && tempRes.fileList[0] && tempRes.fileList[0].tempFileURL) {
            imageUrl = tempRes.fileList[0].tempFileURL
          }
        } catch (tempErr) {
          console.error('转换图片临时链接失败:', tempErr)
          imageUrl = '/images/share-default.png'
        }
      }
    }
    
    return {
      title,
      imageUrl,
      query: `id=${myProduct._id}`
    }
  },

  // 点击分享按钮
  onShareTap() {
    // 显示分享菜单
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
  },

  async loadOrderDetail() {
    this.setData({ loading: true })
    showLoading('加载中...')

    try {
      const userRes = await callCloud('userInit', {})
      const myOpenid = userRes.openid
      
      const res = await callCloud('orderMgr', {
        action: 'detail',
        orderId: this.data.orderId
      })

      if (!res.success) {
        toast(res.message || '加载失败')
        return
      }

      const order = res.order
      const statusConfig = STATUS_CONFIG[order.status] || { label: '未知状态', color: '#999', desc: '' }

      const isInitiator = order.initiatorOpenid === myOpenid

      const myProduct = isInitiator ? order.initiatorProduct : order.receiverProduct
      const theirProduct = isInitiator ? order.receiverProduct : order.initiatorProduct
      const counterpart = isInitiator ? order.receiver : order.initiator

      // 神秘特产颜色和emoji处理
      const MYSTERY_EMOJIS = ['🎁', '🎀', '🎉', '🎊', '🎄', '🎃', '🎈', '🎯', '🎲', '🎳']
      const getMysteryStyle = (product) => {
        if (!product?.isMystery) return null
        // 根据省份名称生成稳定颜色索引
        const colorIndex = (product.provinceName?.charCodeAt(0) || 0) % 10 + 1
        const emoji = MYSTERY_EMOJIS[colorIndex - 1] || '🎁'
        return { colorClass: `color-${colorIndex}`, emoji }
      }

      if (myProduct) {
        myProduct.coverUrl = myProduct.images?.[0] ? processImageUrl(myProduct.images[0]) : ''
        const myStyle = getMysteryStyle(myProduct)
        if (myStyle) {
          myProduct.colorClass = myStyle.colorClass
          myProduct.mysteryEmoji = myStyle.emoji
        }
      }
      if (theirProduct) {
        theirProduct.coverUrl = theirProduct.images?.[0] ? processImageUrl(theirProduct.images[0]) : ''
        const theirStyle = getMysteryStyle(theirProduct)
        if (theirStyle) {
          theirProduct.colorClass = theirStyle.colorClass
          theirProduct.mysteryEmoji = theirStyle.emoji
        }
      }

      const timeline = this.generateTimeline(order, isInitiator)

      // 获取用户的收货地址（优先默认地址，否则用第一个地址）
      let myShipping = null
      try {
        const addrRes = await callCloud('userInit', { action: 'getAddressList' })
        if (addrRes.success && addrRes.addresses && addrRes.addresses.length > 0) {
          // 优先使用默认地址
          const defaultAddr = addrRes.addresses.find(a => a.isDefault) || addrRes.addresses[0]
          myShipping = {
            contactName: defaultAddr.contactName,
            contactPhone: defaultAddr.contactPhone,
            fullAddress: (defaultAddr.province || '') + (defaultAddr.city || '') + (defaultAddr.district || '') + (defaultAddr.detailAddress || '')
          }
        }
      } catch (e) {
        console.error('获取收货地址失败', e)
      }

      // 如果订单没有"我的收货信息"，使用地址库中的收货地址
      const myShippingField = isInitiator ? 'initiatorShipping' : 'receiverShipping'
      if (!order[myShippingField] && myShipping) {
        order[myShippingField] = myShipping
      }

      // 如果订单没有"对方收货信息"(initiatorShipping)，显示为空
      // 对方的收货信息应该由云函数在创建订单时保存

      // 判断是否可以填写快递单号：双方收货信息都已填写，且当前用户还未发货
      const canShip = (
        order.receiverShipping?.contactName && 
        order.initiatorShipping?.contactName &&
        ['confirmed', 'shipped_a', 'shipped_b'].includes(order.status) &&
        // 判断当前用户是否已发货
        ((isInitiator && !order.initiatorTracking?.number) || (!isInitiator && !order.receiverTracking?.number))
      )

      // 角色归一化：根据当前用户角色映射"我的"和"对方的"收货信息
      myShipping = isInitiator ? (order.initiatorShipping || {}) : (order.receiverShipping || {})
      const theirShipping = isInitiator ? (order.receiverShipping || {}) : (order.initiatorShipping || {})

      this.setData({
        order,
        statusConfig,
        isInitiator,
        myProduct,
        theirProduct,
        myShipping,
        theirShipping,
        counterpart: {
          ...counterpart,
          creditInfo: getCreditLevel(counterpart?.creditScore || 100)
        },
        timeline,
        canShip,
        loading: false
      })

      if (order.status === 'completed') {
        this.checkReviewStatus(isInitiator)
      }

      wx.setNavigationBarTitle({ title: `订单详情 - ${statusConfig.label}` })
    } catch (e) {
      console.error('加载订单详情失败', e)
      toast('加载失败')
    } finally {
      hideLoading()
      this.setData({ loading: false })
    }
  },

  async checkReviewStatus(isInitiator) {
    try {
      const res = await callCloud('orderMgr', {
        action: 'detail',
        orderId: this.data.orderId
      })
      if (res.success && res.order) {
        const o = res.order
        const isMyReview = res.isInitiator ? !!o.initiatorReview : !!o.receiverReview
        if (isMyReview) {
          this.setData({ hasReviewed: true })
        }
      }
    } catch (e) {
      console.error('检查评价状态失败', e)
    }
  },

  // 生成完整的订单进度时间线
  generateTimeline(order, isInitiator) {
    const timeline = []
    const allStatuses = ['pending', 'confirmed', 'shipped_a', 'shipped_b', 'shipped', 'received_a', 'received_b', 'completed']
    const currentIndex = allStatuses.indexOf(order.status)

    // 1. 发起请求
    timeline.push({
      time: order.createTime,
      title: '发起分享请求',
      desc: isInitiator ? '你发起了分享请求' : '对方发起了分享请求',
      icon: 'add',
      active: true,
      step: 1
    })

    // 2. 确认（pending → confirmed）
    if (currentIndex >= 1) {
      timeline.push({
        time: order.confirmTime,
        title: '已确认',
        desc: isInitiator ? '对方已确认' : '你已确认',
        icon: 'check',
        active: true,
        step: 2
      })
    } else {
      timeline.push({
        time: null,
        title: '等待确认',
        desc: '等待对方确认',
        icon: 'clock',
        active: false,
        step: 2
      })
    }

    // 3. 发货阶段（confirmed → shipped）
    const hasShipped = order.initiatorTracking?.number || order.receiverTracking?.number
    if (hasShipped) {
      if (order.initiatorTracking?.shipTime) {
        const isMyShip = isInitiator
        timeline.push({
          time: order.initiatorTracking.shipTime,
          title: isMyShip ? '你已发货' : '对方已发货',
          desc: `${order.initiatorTracking.company || '快递'} ${order.initiatorTracking.number || ''}`,
          icon: 'car',
          active: true,
          step: 3
        })
      }
      if (order.receiverTracking?.shipTime) {
        const isMyShip = !isInitiator
        timeline.push({
          time: order.receiverTracking.shipTime,
          title: isMyShip ? '你已发货' : '对方已发货',
          desc: `${order.receiverTracking.company || '快递'} ${order.receiverTracking.number || ''}`,
          icon: 'car',
          active: true,
          step: 3
        })
      }
    } else {
      timeline.push({
        time: null,
        title: '等待发货',
        desc: currentIndex >= 1 ? '请尽快填写快递信息' : '等待确认后发货',
        icon: 'car',
        active: false,
        step: 3
      })
    }

    // 4. 收货阶段
    const hasReceived = order.receiveTimeA || order.receiveTimeB
    if (hasReceived) {
      if (order.receiveTimeA) {
        timeline.push({
          time: order.receiveTimeA,
          title: isInitiator ? '你已收货' : '对方已收货',
          desc: '',
          icon: 'shopping',
          active: true,
          step: 4
        })
      }
      if (order.receiveTimeB) {
        timeline.push({
          time: order.receiveTimeB,
          title: isInitiator ? '对方已收货' : '你已收货',
          desc: '',
          icon: 'shopping',
          active: true,
          step: 4
        })
      }
    } else {
      timeline.push({
        time: null,
        title: '等待收货',
        desc: '双方发货后等待确认收货',
        icon: 'shopping',
        active: false,
        step: 4
      })
    }

    // 5. 完成
    if (order.status === 'completed') {
      timeline.push({
        time: order.completeTime,
        title: '已完成',
        desc: '双方已完成分享',
        icon: 'success',
        active: true,
        step: 5
      })
    } else if (order.status === 'cancelled') {
      timeline.push({
        time: order.cancelTime || order.updateTime,
        title: '订单取消',
        desc: order.cancelReason === 'rejected' ? '对方拒绝了请求' : '订单已取消',
        icon: 'clear',
        active: true,
        step: -1
      })
    }

    return timeline
  },

  // 确认互换 - 弹出地址选择
  async confirmOrder() {
    showLoading('加载地址...')
    try {
      const res = await callCloud('userInit', { action: 'getAddressList' })
      
      if (res.success && res.addresses && res.addresses.length > 0) {
        // 有地址，弹出选择
        this.setData({
          showAddressModal: true,
          addressList: res.addresses,
          selectedAddressId: res.addresses.find(a => a.isDefault)?._id || res.addresses[0]._id,
          isEditingAddress: false,
          addressForm: { name: '', phone: '', province: '', city: '', district: '', detailAddress: '' },
          region: []
        })
      } else {
        // 没有地址，引导去添加
        const modalRes = await new Promise(resolve =>
          wx.showModal({
            title: '添加收货地址',
            content: '确认前需要填写收货地址，是否现在添加？',
            confirmText: '去添加',
            confirmColor: '#07c160',
            success: resolve
          })
        )
        if (modalRes.confirm) {
          wx.navigateTo({ url: '/pages/address/index' })
        }
      }
    } catch (e) {
      console.error('获取地址失败', e)
      toast('获取地址失败')
    } finally {
      hideLoading()
    }
  },

  // 选择已有地址
  onAddressSelect(e) {
    const addressId = e.currentTarget.dataset.id
    this.setData({ selectedAddressId: addressId })
  },

  // 切换到手动填写地址
  switchToEditAddress() {
    this.setData({
      isEditingAddress: true,
      selectedAddressId: '',
      addressForm: { name: '', phone: '', province: '', city: '', district: '', detailAddress: '' },
      region: []
    })
  },

  // 切换回选择已有地址
  switchToSelectAddress() {
    this.setData({ isEditingAddress: false })
  },

  // 尝试使用微信收货地址
  async tryWechatAddress() {
    try {
      const res = await wx.chooseAddress()
      if (res && res.userName) {
        this.setData({
          isEditingAddress: true,
          addressForm: {
            name: res.userName,
            phone: res.telNumber,
            province: res.provinceName,
            city: res.cityName,
            district: res.countyName,
            detailAddress: res.detailInfo
          },
          region: [res.provinceName, res.cityName, res.countyName]
        })
      }
    } catch (e) {
      if (e.errMsg && e.errMsg.indexOf('cancel') === -1) {
        console.error('选择地址失败', e)
      }
    }
  },

  hideAddressModal() {
    this.setData({ showAddressModal: false })
  },

  onAddressInput(e) {
    const field = e.currentTarget.dataset.field
    let value = e.detail.value
    
    if (field === 'phone') {
      value = value.replace(/\D/g, '').slice(0, 11)
    }
    
    this.setData({ [`addressForm.${field}`]: value })
  },

  onRegionChange(e) {
    const [province, city, district] = e.detail.value
    this.setData({
      region: e.detail.value,
      'addressForm.province': province,
      'addressForm.city': city,
      'addressForm.district': district
    })
  },

  // 提交确认 - 选择已有地址
  async submitAddressSelect() {
    const { selectedAddressId, addressList, order } = this.data
    if (!selectedAddressId) {
      toast('请选择收货地址')
      return
    }

    const selectedAddr = addressList.find(a => a._id === selectedAddressId)
    if (!selectedAddr) {
      toast('地址无效')
      return
    }

    // 根据订单状态决定操作类型
    const isPending = order.status === 'pending'
    const modalTitle = isPending ? '确认分享' : '更新收货信息'
    const modalContent = isPending ? '确认后订单将进入发货阶段，请确保你能按时发货' : '确认后将更新你的收货信息'

    const modalRes = await new Promise(resolve =>
      wx.showModal({
        title: modalTitle,
        content: modalContent,
        confirmText: '确认',
        confirmColor: '#07c160',
        success: resolve
      })
    )
    if (!modalRes.confirm) return

    showLoading('处理中...')
    try {
      let result
      if (isPending) {
        // pending 状态：确认互换，使用confirm action保存双方收货地址
        result = await callCloud('orderMgr', {
          action: 'confirm',
          orderId: this.data.orderId,
          addressId: selectedAddressId
        })
      } else {
        // confirmed 及之后状态：更新收货地址
        result = await callCloud('orderMgr', {
          action: 'updateShipping',
          orderId: this.data.orderId,
          addressId: selectedAddressId
        })
      }

      if (result.success) {
        toast(isPending ? '已确认' : '收货信息已更新', 'success')
        this.hideAddressModal()
        this.loadOrderDetail()
      } else {
        toast(result.message || '操作失败')
      }
    } catch (e) {
      toast('网络错误')
    } finally {
      hideLoading()
    }
  },

  // 提交确认 - 手动填写地址
  async submitAddressEdit() {
    const { name, phone, province, city, district, detailAddress } = this.data.addressForm
    
    if (!name.trim()) {
      toast('请输入收货人姓名')
      return
    }
    if (!phone.trim() || phone.length < 11) {
      toast('请输入正确的联系电话')
      return
    }
    if (!province || !city || !district) {
      toast('请选择省市区')
      return
    }
    if (!detailAddress.trim()) {
      toast('请输入详细地址')
      return
    }

    const modalRes = await new Promise(resolve =>
      wx.showModal({
        title: '确认分享',
        content: '确认后订单将进入发货阶段，请确保你能按时发货',
        confirmText: '确认',
        confirmColor: '#07c160',
        success: resolve
      })
    )
    if (!modalRes.confirm) return

    showLoading('处理中...')
    try {
      // 先保存地址到 addresses 集合
      const saveRes = await callCloud('userInit', {
        action: 'saveAddress',
        address: {
          contactName: name.trim(),
          contactPhone: phone.trim(),
          province,
          city,
          district,
          detailAddress: detailAddress.trim(),
          isDefault: true  // 设为默认地址
        }
      })

      if (!saveRes.success) {
        toast(saveRes.message || '保存地址失败')
        hideLoading()
        return
      }

      // 获取刚保存的地址ID
      const listRes = await callCloud('userInit', { action: 'getAddressList' })
      if (!listRes.success || !listRes.addresses || listRes.addresses.length === 0) {
        toast('获取地址失败')
        hideLoading()
        return
      }

      // 使用最新保存的地址
      const latestAddr = listRes.addresses[0]

      // 根据订单状态决定操作类型
      const isPending = this.data.order.status === 'pending'
      let result
      if (isPending) {
        // pending 状态：确认互换，使用confirm action保存双方收货地址
        result = await callCloud('orderMgr', {
          action: 'confirm',
          orderId: this.data.orderId,
          addressId: latestAddr._id
        })
      } else {
        // confirmed 及之后状态：更新收货地址
        result = await callCloud('orderMgr', {
          action: 'updateShipping',
          orderId: this.data.orderId,
          addressId: latestAddr._id
        })
      }

      if (result.success) {
        toast(isPending ? '已确认' : '收货信息已更新', 'success')
        this.hideAddressModal()
        // 确认互换后请求活动通知订阅（发货等状态变更会通知）
        if (isPending) {
          subscribeMsg.subscribeForActivity()
        }
        this.loadOrderDetail()
      } else {
        toast(result.message || '操作失败')
      }
    } catch (e) {
      console.error('操作失败', e)
      toast('网络错误')
    } finally {
      hideLoading()
    }
  },

  async rejectOrder() {
    const res = await new Promise(resolve =>
      wx.showModal({
        title: '拒绝请求',
        content: '拒绝后该请求将关闭，对方会收到通知',
        confirmText: '拒绝',
        confirmColor: '#E63946',
        success: resolve
      })
    )

    if (!res.confirm) return

    showLoading('处理中...')
    try {
      const result = await callCloud('orderMgr', {
        action: 'reject',
        orderId: this.data.orderId
      })

      if (result.success) {
        toast('已拒绝', 'success')
        this.loadOrderDetail()
      } else {
        toast(result.message || '操作失败')
      }
    } catch (e) {
      toast('网络错误')
    } finally {
      hideLoading()
    }
  },

  showShipModal() {
    this.setData({ showShipModal: true })
  },

  hideShipModal() {
    this.setData({ showShipModal: false, shipForm: { companyIndex: -1, trackingNo: '' } })
  },

  onShipInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`shipForm.${field}`]: e.detail.value })
  },

  onCompanyChange(e) {
    this.setData({
      'shipForm.companyIndex': e.detail.value
    })
  },

  async submitShip() {
    const { companyIndex, trackingNo } = this.data.shipForm
    const expressCompanies = this.data.expressCompanies

    if (companyIndex < 0) {
      toast('请选择快递公司')
      return
    }
    const company = expressCompanies[companyIndex]
    if (!trackingNo.trim()) {
      toast('请输入快递单号')
      return
    }

    showLoading('提交中...')
    try {
      const result = await callCloud('orderMgr', {
        action: 'ship',
        orderId: this.data.orderId,
        company: company,
        trackingNo: trackingNo.trim()
      })

      if (result.success) {
        toast('发货成功', 'success')
        this.hideShipModal()
        // 请求发货通知订阅（让用户订阅发货状态通知）
        subscribeMsg.subscribeForShipment()
        this.loadOrderDetail()
      } else {
        toast(result.message || '发货失败')
      }
    } catch (e) {
      toast('网络错误')
    } finally {
      hideLoading()
    }
  },

  async confirmReceive() {
    const res = await new Promise(resolve =>
      wx.showModal({
        title: '确认收货',
        content: '确认已收到对方的特产？确认后订单将完成。',
        confirmText: '确认收货',
        confirmColor: '#07c160',
        success: resolve
      })
    )

    if (!res.confirm) return

    showLoading('处理中...')
    try {
      const result = await callCloud('orderMgr', {
        action: 'receive',
        orderId: this.data.orderId
      })

      if (result.success) {
        // 如果订单变为已完成，自动跳转到评价页面
        if (result.newStatus === 'completed') {
          toast('已完成！即将进入评价', 'success')
          setTimeout(() => {
            wx.navigateTo({
              url: `/pages/review/index?orderId=${this.data.orderId}`,
              fail: () => {
                // 跳转失败则回退到订单详情
                this.loadOrderDetail()
              }
            })
          }, 1000)
        } else {
          toast('已确认收货', 'success')
          this.loadOrderDetail()
        }
      } else {
        toast(result.message || '操作失败')
      }
    } catch (e) {
      toast('网络错误')
    } finally {
      hideLoading()
    }
  },

  async cancelOrder() {
    const res = await new Promise(resolve =>
      wx.showModal({
        title: '取消订单',
        content: '取消后订单将关闭，无法恢复',
        confirmText: '取消订单',
        confirmColor: '#E63946',
        success: resolve
      })
    )

    if (!res.confirm) return

    showLoading('处理中...')
    try {
      const result = await callCloud('orderMgr', {
        action: 'cancel',
        orderId: this.data.orderId
      })

      if (result.success) {
        toast('已取消', 'success')
        // 请求订单取消通知订阅
        subscribeMsg.subscribeForOrderCancel()
        this.loadOrderDetail()
      } else {
        toast(result.message || '操作失败')
      }
    } catch (e) {
      toast('网络错误')
    } finally {
      hideLoading()
    }
  },

  goToReview() {
    wx.navigateTo({
      url: `/pages/review/index?orderId=${this.data.orderId}`
    })
  },

  contactCounterpart() {
    wx.showModal({
      title: '联系对方',
      content: '当前版本暂不支持站内聊天。\n\n如需联系，可通过订单页面查看对方信息，或在完成互换后通过微信联系。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  previewImage(e) {
    const { url } = e.currentTarget.dataset
    wx.previewImage({ urls: [url], current: url })
  },

  copyTrackingNo(e) {
    const order = this.data.order
    const isInitiator = this.data.isInitiator
    const type = e.currentTarget.dataset.type
    
    let tracking
    if (type === 'mine') {
      tracking = isInitiator ? order.initiatorTracking : order.receiverTracking
    } else {
      tracking = isInitiator ? order.receiverTracking : order.initiatorTracking
    }

    if (tracking?.number) {
      wx.setClipboardData({
        data: tracking.number,
        success: () => toast('已复制快递单号', 'success')
      })
    }
  },

  preventBubble() {},

  handleAvatarError() {
    const { counterpart } = this.data
    if (counterpart) {
      this.setData({
        counterpart: {
          ...counterpart,
          avatarUrl: '/images/default-avatar.png'
        }
      })
    }
  },

  goToUserProfile(e) {
    const openid = e.currentTarget.dataset.openid
    if (openid) {
      wx.navigateTo({ url: `/pages/user-profile/index?openid=${openid}` })
    }
  },

  // 纠纷处理相关方法
  showDisputeModal() {
    this.setData({
      showDisputeModal: true,
      disputeForm: {
        typeIndex: -1,
        description: '',
        images: []
      }
    })
  },

  hideDisputeModal() {
    this.setData({ showDisputeModal: false })
  },

  onDisputeTypeChange(e) {
    this.setData({ 'disputeForm.typeIndex': e.detail.value })
  },

  onDisputeInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`disputeForm.${field}`]: e.detail.value })
  },

  async chooseDisputeImage() {
    const { images } = this.data.disputeForm
    if (images.length >= 3) {
      toast('最多只能上传3张图片')
      return
    }

    try {
      const res = await wx.chooseMedia({
        count: 3 - images.length,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType: ['album', 'camera']
      })

      if (res.tempFiles) {
        const newImages = [...images]
        for (const file of res.tempFiles) {
          newImages.push(file.tempFilePath)
        }
        this.setData({ 'disputeForm.images': newImages })
      }
    } catch (e) {
      console.error('选择图片失败', e)
    }
  },

  removeDisputeImage(e) {
    const index = e.currentTarget.dataset.index
    const { images } = this.data.disputeForm
    images.splice(index, 1)
    this.setData({ 'disputeForm.images': images })
  },

  async submitDispute() {
    const { typeIndex, description, images } = this.data.disputeForm
    const { orderId } = this.data

    if (typeIndex < 0) {
      toast('请选择纠纷类型')
      return
    }

    if (!description.trim()) {
      toast('请详细描述纠纷情况')
      return
    }

    showLoading('提交中...')
    try {
      // 上传图片到云存储
      let uploadedImages = []
      if (images.length > 0) {
        const uploadPromises = images.map(filePath => {
          const cloudPath = `disputes/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`
          return wx.cloud.uploadFile({
            cloudPath,
            filePath
          })
        })
        const uploadResults = await Promise.all(uploadPromises)
        uploadedImages = uploadResults.filter(r => r.fileID).map(r => r.fileID)
      }

      // 提交纠纷申请
      const result = await callCloud('orderMgr', {
        action: 'createDispute',
        orderId: orderId,
        type: this.data.disputeTypes[typeIndex],
        description: description.trim(),
        images: uploadedImages
      })

      if (result.success) {
        toast('纠纷申请已提交', 'success')
        this.hideDisputeModal()
        this.loadOrderDetail()
      } else {
        toast(result.message || '提交失败')
      }
    } catch (e) {
      console.error('提交纠纷失败', e)
      toast('网络错误')
    } finally {
      hideLoading()
    }
  },

  async checkDisputeStatus() {
    const { orderId } = this.data
    showLoading('加载中...')
    try {
      const result = await callCloud('orderMgr', {
        action: 'getDispute',
        orderId: orderId
      })

      if (result.success && result.dispute) {
        this.setData({
          disputeInfo: result.dispute,
          showDisputeStatusModal: true
        })
      } else {
        toast(result.message || '获取纠纷信息失败')
      }
    } catch (e) {
      console.error('获取纠纷信息失败', e)
      toast('网络错误')
    } finally {
      hideLoading()
    }
  },

  hideDisputeStatusModal() {
    this.setData({ showDisputeStatusModal: false })
  },

  previewDisputeImage(e) {
    const { url } = e.currentTarget.dataset
    wx.previewImage({ urls: [url], current: url })
  },

  contactService() {
    wx.showModal({
      title: '联系客服',
      content: `如有需要，请添加客服微信：${this.data.serviceWechat || '未配置'}\n\n工作时间：9:00-18:00`,
      confirmText: '复制微信号',
      cancelText: '知道了',
      success: (res) => {
        if (res.confirm && this.data.serviceWechat) {
          wx.setClipboardData({
            data: this.data.serviceWechat,
            success: () => toast('已复制客服微信', 'success')
          })
        }
      }
    })
  }
})
