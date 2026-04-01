// pages/report/index.js - 举报页面
const { callCloud, toast, uploadImage } = require('../../utils/util.js')

// 商品举报类型
const PRODUCT_REPORT_TYPES = [
  { code: 'product_fake', name: '虚假商品', desc: '商品信息与实际不符', icon: '🎭' },
  { code: 'product_prohibited', name: '违禁品', desc: '售卖违禁物品', icon: '🚫' },
  { code: 'product_infringement', name: '侵权', desc: '侵犯知识产权', icon: '©️' },
  { code: 'product_fraud', name: '诈骗', desc: '涉嫌诈骗行为', icon: '💰' },
  { code: 'product_quality', name: '质量问题', desc: '商品质量低劣', icon: '⚠️' },
  { code: 'product_other', name: '其他', desc: '其他商品问题', icon: '📝' }
]

// 用户举报类型
const USER_REPORT_TYPES = [
  { code: 'user_harassment', name: '骚扰', desc: '骚扰其他用户', icon: '😤' },
  { code: 'user_fraud', name: '诈骗', desc: '涉嫌诈骗', icon: '💰' },
  { code: 'user_fake', name: '虚假信息', desc: '使用虚假身份', icon: '🎭' },
  { code: 'user_inappropriate', name: '不当言行', desc: '发布不当内容', icon: '💬' },
  { code: 'user_cheating', name: '作弊', desc: '利用系统漏洞', icon: '🎮' },
  { code: 'user_other', name: '其他', desc: '其他用户问题', icon: '📝' }
]

Page({
  data: {
    // 举报目标信息
    targetType: '',      // 'product' 或 'user'
    targetId: '',
    targetName: '',
    targetImage: '',
    ownerId: '',         // 商品所有者ID

    // 举报类型
    reportTypes: [],
    selectedType: '',

    // 举报内容
    description: '',
    images: [],

    // 提交状态
    submitting: false
  },

  onLoad(options) {
    const { type, targetId, targetName, targetImage, ownerId } = options
    
    if (!type || !targetId) {
      toast('参数错误', 'error')
      wx.navigateBack()
      return
    }

    this.setData({
      targetType: type,
      targetId,
      targetName: decodeURIComponent(targetName || ''),
      targetImage: decodeURIComponent(targetImage || ''),
      ownerId: ownerId || '',
      reportTypes: type === 'user' ? USER_REPORT_TYPES : PRODUCT_REPORT_TYPES
    })
  },

  // 选择举报类型
  onSelectType(e) {
    const code = e.currentTarget.dataset.code
    this.setData({ selectedType: code })
  },

  // 输入描述
  onDescriptionInput(e) {
    this.setData({ description: e.detail.value })
  },

  // 选择图片
  async chooseImage() {
    if (this.data.images.length >= 3) {
      toast('最多上传3张图片', 'error')
      return
    }

    try {
      const res = await wx.chooseMedia({
        count: 3 - this.data.images.length,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed']
      })

      const tempFiles = res.tempFiles
      const newImages = []

      wx.showLoading({ title: '上传中...' })

      for (const file of tempFiles) {
        try {
          const fileID = await uploadImage(file.tempFilePath, 'reports')
          if (fileID) {
            newImages.push(fileID)
          }
        } catch (e) {
          console.error('上传图片失败:', e)
        }
      }

      wx.hideLoading()

      if (newImages.length > 0) {
        this.setData({
          images: [...this.data.images, ...newImages]
        })
        toast('上传成功', 'success')
      } else {
        toast('上传失败', 'error')
      }
    } catch (e) {
      wx.hideLoading()
      if (e.errMsg && !e.errMsg.includes('cancel')) {
        toast('选择图片失败', 'error')
      }
    }
  },

  // 预览图片
  previewImage(e) {
    const url = e.currentTarget.dataset.url
    wx.previewImage({
      current: url,
      urls: this.data.images
    })
  },

  // 删除图片
  deleteImage(e) {
    const index = e.currentTarget.dataset.index
    const images = [...this.data.images]
    images.splice(index, 1)
    this.setData({ images })
  },

  // 提交举报
  async submitReport() {
    if (this.data.submitting) return

    // 验证
    if (!this.data.selectedType) {
      toast('请选择举报类型', 'error')
      return
    }
    if (!this.data.description.trim()) {
      toast('请填写详细描述', 'error')
      return
    }
    if (this.data.description.trim().length < 10) {
      toast('描述不能少于10个字', 'error')
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...' })

    try {
      const res = await callCloud('reportMgr', {
        action: 'submitReport',
        type: this.data.targetType,
        targetId: this.data.targetId,
        targetType: this.data.selectedType,
        description: this.data.description.trim(),
        images: this.data.images,
        ownerId: this.data.ownerId
      })

      wx.hideLoading()

      if (res && res.success) {
        toast('举报提交成功', 'success')
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        toast(res.error || '提交失败', 'error')
        this.setData({ submitting: false })
      }
    } catch (e) {
      wx.hideLoading()
      console.error('提交举报失败:', e)
      toast('提交失败，请重试', 'error')
      this.setData({ submitting: false })
    }
  },

  // 计算属性：是否可以提交
  canSubmit() {
    return this.data.selectedType && this.data.description.trim().length >= 10
  }
})
