// pages/review/index.js - 评价页面
const { callCloud, toast, showLoading, hideLoading, processImageUrl } = require('../../utils/util')

const MYSTERY_EMOJIS = ['🎁', '🎀', '🎉', '🎊', '🎄', '🎃', '🎈', '🎯', '🎲', '🎳']

Page({
  data: {
    orderId: '',
    order: null,
    rating: 5,
    tags: [],
    selectedTags: [],
    loading: true,
    submitting: false,
    isAnonymous: false,
    showSuccess: false,
    // 标签图标
    tagIcons: [
      '✨', '📦', '🚚', '💬',
      '💎', '🤝', '😊', '🔄'
    ]
  },

  // 评价标签选项
  tagOptions: [
    { name: '特产很正宗', selected: false },
    { name: '包装精美', selected: false },
    { name: '发货及时', selected: false },
    { name: '沟通愉快', selected: false },
    { name: '物超所值', selected: false },
    { name: '诚实守信', selected: false },
    { name: '态度友好', selected: false },
    { name: '会再分享', selected: false }
  ],

  onLoad(options) {
    const { orderId } = options
    if (!orderId) {
      toast('订单ID错误')
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }
    this.setData({
      orderId,
      tags: this.tagOptions.map(t => ({ ...t, selected: false }))
    })
    this.loadOrderDetail()
  },

  async loadOrderDetail() {
    showLoading('加载中...')
    try {
      const res = await callCloud('orderMgr', {
        action: 'detail',
        orderId: this.data.orderId
      })

      if (!res.success) {
        toast(res.message || '加载失败')
        return
      }

      const order = res.order

      // 处理双方产品的图片和神秘特产样式
      const processProd = (product) => {
        if (!product) return
        if (product.isMystery) {
          const colorIndex = (product.provinceName?.charCodeAt(0) || product.province?.charCodeAt(0) || 0) % 10 + 1
          product.colorClass = `color-${colorIndex}`
          product.mysteryEmoji = MYSTERY_EMOJIS[colorIndex - 1] || '🎁'
        } else if (product.images && product.images.length > 0) {
          product.coverUrl = processImageUrl(product.images[0])
        }
      }
      processProd(order.initiatorProduct)
      processProd(order.receiverProduct)

      this.setData({ order, loading: false })

      // 客户端解析 cloud:// 临时链接
      this.resolveCloudUrls(order)
    } catch (e) {
      console.error('加载订单失败', e)
      toast('加载失败')
    } finally {
      hideLoading()
    }
  },

  // 批量解析 cloud:// URL
  async resolveCloudUrls(order) {
    const cloudItems = []
    const products = [order.initiatorProduct, order.receiverProduct]
    products.forEach((p, idx) => {
      if (p && !p.isMystery && p.coverUrl && p.coverUrl.startsWith('cloud://')) {
        cloudItems.push({ fileID: p.coverUrl, field: idx === 0 ? 'initiatorProduct' : 'receiverProduct' })
      }
    })
    if (cloudItems.length === 0) return

    try {
      const res = await wx.cloud.getTempFileURL({
        fileList: cloudItems.map(c => c.fileID)
      })
      res.fileList.forEach((f, i) => {
        if (f.tempFileURL) {
          this.setData({
            [`order.${cloudItems[i].field}.coverUrl`]: f.tempFileURL
          })
        }
      })
    } catch (e) {
      console.error('解析cloud URL失败', e)
    }
  },

  // 选择评分
  onRatingChange(e) {
    const rating = parseInt(e.currentTarget.dataset.value)
    this.setData({ rating })

    // 播放星星动画
    wx.vibrateShort({ type: 'light' })
  },

  // 匿名评价开关
  onAnonymousChange(e) {
    this.setData({ isAnonymous: e.detail.value })
  },

  // 选择标签
  toggleTag(e) {
    const index = parseInt(e.currentTarget.dataset.index)
    const { tags } = this.data
    const selectedCount = tags.filter(t => t.selected).length

    if (tags[index].selected) {
      tags[index].selected = false
    } else {
      if (selectedCount >= 4) {
        toast('最多选择4个标签')
        return
      }
      tags[index].selected = true
    }

    const newSelectedTags = tags.filter(t => t.selected).map(t => t.name)

    this.setData({ 
      tags: tags,
      selectedTags: newSelectedTags
    })
    wx.vibrateShort({ type: 'light' })
  },

  // 提交评价
  async submitReview() {
    const { rating, selectedTags, orderId, submitting } = this.data

    if (submitting) return

    if (selectedTags.length === 0) {
      toast('请至少选择一个标签')
      return
    }

    this.setData({ submitting: true })
    showLoading('提交中...')

    try {
      const result = await callCloud('orderMgr', {
        action: 'review',
        orderId,
        rating,
        content: selectedTags.join('、'),
        tags: selectedTags,
        isAnonymous: this.data.isAnonymous
      })

      if (result.success) {
        // 震动反馈
        wx.vibrateShort({ type: 'heavy' })

        // 显示成功动画
        this.setData({ showSuccess: true })

        setTimeout(() => {
          wx.navigateBack()
        }, 2000)
      } else {
        toast(result.message || '评价失败')
        this.setData({ submitting: false })
      }
    } catch (e) {
      console.error('提交评价失败', e)
      toast('网络错误，请重试')
      this.setData({ submitting: false })
    } finally {
      hideLoading()
    }
  }
})
