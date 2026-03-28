// pages/daigou-review/index.js
// 代购交易完成后的双向评价页面
// 买家：必须上传3张图 + 10字以上内容评价
// 卖家：文字评价即可（5星+内容）
const { callCloud, toast, showLoading, hideLoading } = require('../../utils/util')

Page({
  data: {
    orderId: '',
    orderNo: '',
    productName: '',
    productImage: '',
    isBuyer: true,
    role: 'buyer',   // buyer | seller
    otherPartyName: '',

    // 已完成评价的展示
    myReviewed: false,
    myReview: null,
    otherReviewed: false,

    // 评分
    rating: 5,
    stars: [1, 2, 3, 4, 5],

    // 评价内容
    content: '',
    contentLen: 0,
    MIN_CONTENT_LEN: 10,

    // 图片（买家必须3张）
    images: [],     // 已上传的 cloud:// URL
    localImages: [], // 本地预览路径
    MIN_IMAGES: 3,

    uploading: false,
    submitting: false,
    loading: true,

    // 提交确认弹窗
    confirmVisible: false
  },

  onLoad(options) {
    const { orderId, orderNo, productName, isBuyer, role } = options
    if (!orderId) {
      toast('参数错误')
      setTimeout(() => wx.navigateBack(), 1200)
      return
    }
    this.setData({
      orderId,
      orderNo: orderNo || '',
      productName: decodeURIComponent(productName || ''),
      isBuyer: isBuyer !== 'false',
      role: role || (isBuyer !== 'false' ? 'buyer' : 'seller')
    })
    this.loadReviewStatus(orderId)
  },

  async loadReviewStatus(orderId) {
    this.setData({ loading: true })
    try {
      const res = await callCloud('daigouMgr', { action: 'getReviewStatus', orderId })
      if (res.success) {
        const { isBuyer, myReviewed, myReview, buyerReviewed, sellerReviewed } = res
        const otherReviewed = isBuyer ? sellerReviewed : buyerReviewed
        this.setData({
          isBuyer,
          role: isBuyer ? 'buyer' : 'seller',
          myReviewed,
          myReview,
          otherReviewed,
          loading: false
        })
      } else {
        this.setData({ loading: false })
      }
    } catch (e) {
      this.setData({ loading: false })
    }
  },

  setRating(e) {
    if (this.data.myReviewed) return
    const star = parseInt(e.currentTarget.dataset.star)
    this.setData({ rating: star })
  },

  onContentInput(e) {
    const val = e.detail.value || ''
    this.setData({ content: val, contentLen: val.length })
  },

  // 添加图片（买家）
  async addImage() {
    const { images, localImages } = this.data
    if (images.length >= 6) { toast('最多上传6张图片'); return }

    const remaining = 6 - images.length
    try {
      const res = await new Promise((resolve, reject) =>
        wx.chooseMedia({
          count: Math.min(3, remaining),
          mediaType: ['image'],
          sourceType: ['album', 'camera'],
          success: resolve,
          fail: reject
        })
      )

      const files = res.tempFiles
      this.setData({ uploading: true })
      showLoading('上传图片中...')

      const newImages = [...images]
      const newLocalImages = [...localImages]

      for (const file of files) {
        if (newImages.length >= 6) break
        const cloudPath = `daigou-review/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath: file.tempFilePath
        })
        newImages.push(uploadRes.fileID)
        newLocalImages.push(file.tempFilePath)
      }

      hideLoading()
      this.setData({ images: newImages, localImages: newLocalImages, uploading: false })
    } catch (e) {
      hideLoading()
      this.setData({ uploading: false })
      if (e && e.errMsg && e.errMsg.includes('cancel')) return
      toast('上传失败，请重试')
    }
  },

  removeImage(e) {
    const idx = e.currentTarget.dataset.idx
    const images = [...this.data.images]
    const localImages = [...this.data.localImages]
    images.splice(idx, 1)
    localImages.splice(idx, 1)
    this.setData({ images, localImages })
  },

  previewImg(e) {
    const idx = e.currentTarget.dataset.idx
    const { localImages } = this.data
    wx.previewImage({ urls: localImages, current: localImages[idx] })
  },

  goBack() {
    wx.navigateBack({ delta: 1 })
  },

  // 点击「提交评价」按钮 → 先校验，再弹出页内确认卡
  submitReview() {
    const { role, rating, content, images } = this.data

    if (!rating) { toast('请选择评分'); return }
    if (!content || content.trim().length < 10) {
      toast('评价内容不少于10个字，当前 ' + (content ? content.trim().length : 0) + ' 字')
      return
    }
    if (role === 'buyer' && images.length < 3) {
      toast('买家评价必须上传至少3张收货图片')
      return
    }

    // 校验通过，弹出页内确认卡
    this.setData({ confirmVisible: true })
  },

  hideConfirm() {
    this.setData({ confirmVisible: false })
  },

  async doSubmitReview() {
    const { orderId, role, rating, content, images } = this.data

    this.setData({ confirmVisible: false, submitting: true })
    showLoading('提交中...')

    try {
      const res = await callCloud('daigouMgr', {
        action: 'submitReview',
        orderId,
        role,
        rating,
        content: content.trim(),
        images: role === 'buyer' ? images : []
      })

      hideLoading()
      this.setData({ submitting: false })

      if (res.success) {
        wx.showToast({ title: '评价成功！', icon: 'success', duration: 2000 })
        setTimeout(() => {
          this.loadReviewStatus(orderId)
        }, 1500)
      } else if (res.errCode === 'COLLECTION_NOT_EXIST') {
        wx.showModal({
          title: '系统提示',
          content: '评价功能数据表未初始化，请联系管理员在微信云开发控制台创建 daigouReviews 集合后重试',
          showCancel: false,
          confirmText: '知道了'
        })
      } else {
        toast(res.message || '提交失败')
      }
    } catch (e) {
      hideLoading()
      this.setData({ submitting: false })
      toast('提交失败，请重试')
    }
  }
})
