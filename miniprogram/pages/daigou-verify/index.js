// pages/daigou-verify/index.js
// 代购实名认证页面 - 上传身份证正反面 + 手持身份证自拍
const { callCloud, uploadImage, toast, showLoading, hideLoading } = require('../../utils/util')

Page({
  data: {
    // 认证状态
    verifyStatus: null,  // null | pending | approved | rejected
    verifyInfo: null,
    levelInfo: null,
    stats: null,

    // 表单数据
    form: {
      realName: '',
      idCardNo: '',
      idCardFront: '',      // cloud:// URL
      idCardBack: '',
      holdIdCardPhoto: ''
    },
    // 图片预览用（本地临时路径）
    previewImages: {
      front: '',
      back: '',
      hold: ''
    },

    uploading: {
      front: false,
      back: false,
      hold: false
    },
    submitting: false,
    loading: true
  },

  onLoad() {
    this.loadStatus()
  },

  async loadStatus() {
    this.setData({ loading: true })
    try {
      const res = await callCloud('daigouMgr', { action: 'getVerifyStatus' })
      if (res.success) {
        const verify = res.verify
        this.setData({
          verifyStatus: verify ? verify.status : null,
          verifyInfo: verify,
          levelInfo: res.levelInfo,
          stats: res.stats,
          loading: false
        })
      } else {
        toast(res.message || '加载失败')
        this.setData({ loading: false })
      }
    } catch (e) {
      toast('加载失败')
      this.setData({ loading: false })
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  // 选择并上传图片
  async chooseImage(e) {
    const type = e.currentTarget.dataset.type  // 'front' | 'back' | 'hold'
    const labelMap = { front: '身份证正面', back: '身份证反面', hold: '手持身份证照片' }

    try {
      const res = await new Promise((resolve, reject) =>
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType: ['album', 'camera'],
          camera: 'back',
          success: resolve,
          fail: reject
        })
      )

      const tempPath = res.tempFiles[0].tempFilePath
      this.setData({ [`previewImages.${type}`]: tempPath })

      // 上传到云存储
      this.setData({ [`uploading.${type}`]: true })
      showLoading(`上传${labelMap[type]}...`)

      const cloudPath = `daigou-verify/${Date.now()}-${type}-${Math.random().toString(36).slice(2)}.jpg`
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: tempPath
      })

      hideLoading()
      const fieldMap = { front: 'idCardFront', back: 'idCardBack', hold: 'holdIdCardPhoto' }
      this.setData({
        [`form.${fieldMap[type]}`]: uploadRes.fileID,
        [`uploading.${type}`]: false
      })

      toast(`${labelMap[type]}上传成功`, 'success')
    } catch (e) {
      hideLoading()
      this.setData({ [`uploading.${type}`]: false })
      if (e && e.errMsg && e.errMsg.includes('cancel')) return
      toast('上传失败，请重试')
    }
  },

  previewImage(e) {
    const type = e.currentTarget.dataset.type
    const path = this.data.previewImages[type]
    if (!path) return
    wx.previewImage({ urls: [path], current: path })
  },

  async submitVerify() {
    const { form } = this.data

    if (!form.realName.trim()) {
      toast('请填写真实姓名'); return
    }
    if (!/^\d{17}[\dXx]$/.test(form.idCardNo.trim())) {
      toast('请填写正确的18位身份证号码'); return
    }
    if (!form.idCardFront) {
      toast('请上传身份证正面照片'); return
    }
    if (!form.idCardBack) {
      toast('请上传身份证反面照片'); return
    }
    if (!form.holdIdCardPhoto) {
      toast('请上传手持身份证自拍照'); return
    }

    const confirmRes = await new Promise(resolve =>
      wx.showModal({
        title: '提交认证申请',
        content: '请确认您上传的信息真实有效。虚假信息将导致永久封号。',
        confirmText: '确认提交',
        success: resolve
      })
    )
    if (!confirmRes.confirm) return

    this.setData({ submitting: true })
    showLoading('提交中...')

    try {
      const res = await callCloud('daigouMgr', {
        action: 'submitVerify',
        realName: form.realName.trim(),
        idCardNo: form.idCardNo.trim(),
        idCardFront: form.idCardFront,
        idCardBack: form.idCardBack,
        holdIdCardPhoto: form.holdIdCardPhoto
      })

      hideLoading()
      this.setData({ submitting: false })

      if (res.success) {
        wx.showToast({ title: '申请已提交！', icon: 'success', duration: 2000 })
        setTimeout(() => this.loadStatus(), 1500)
      } else {
        toast(res.message || '提交失败')
      }
    } catch (e) {
      hideLoading()
      this.setData({ submitting: false })
      toast('提交失败，请重试')
    }
  },

  goPublish() {
    wx.navigateBack()
  },

  viewLevels() {
    wx.navigateTo({ url: '/pages/daigou-level/index' })
  }
})
