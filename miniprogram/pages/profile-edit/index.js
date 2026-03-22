// pages/profile-edit/index.js
const { PROVINCES } = require('../../utils/constants')
const { callCloud, toast, showLoading, hideLoading } = require('../../utils/util')

Page({
  data: {
    userInfo: null,
    province: '',
    provinceName: '',
    hasProvince: false, // 是否已设置过家乡
    provinces: PROVINCES,
    showProvincePicker: false,
    tempProvince: '',
    avatarUrl: '',
    nickName: ''
  },

  onLoad() {
    this.loadUserInfo()
  },

  preventBubble() {},

  async loadUserInfo() {
    const app = getApp()
    showLoading('加载中...')
    try {
      const res = await callCloud('userInit', {})
      if (res && res.success) {
        const provinceName = this.getProvinceName(res.province)
        this.setData({
          userInfo: res.userInfo,
          avatarUrl: res.userInfo?.avatarUrl || '',
          nickName: res.userInfo?.nickName || '',
          province: res.province || '',
          provinceName: provinceName,
          hasProvince: !!res.province
        })
      }
    } catch (e) {
      console.error('加载用户信息失败', e)
    } finally {
      hideLoading()
    }
  },

  getProvinceName(code) {
    if (!code) return ''
    const p = PROVINCES.find(item => item.code === code)
    return p ? p.name : ''
  },

  // 选择头像
  async chooseAvatar() {
    try {
      const res = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera']
      })
      
      if (res.tempFiles && res.tempFiles[0]) {
        const tempFilePath = res.tempFiles[0].tempFilePath
        showLoading('上传中...')
        
        // 上传到云存储
        const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath: tempFilePath
        })
        
        if (uploadRes.fileID) {
          this.setData({ avatarUrl: uploadRes.fileID })
        }
        hideLoading()
      }
    } catch (e) {
      console.error('选择头像失败', e)
      hideLoading()
    }
  },

  // 昵称输入
  onNickNameInput(e) {
    this.setData({ nickName: e.detail.value })
  },

  // 选择家乡
  selectProvince() {
    if (this.data.hasProvince) {
      // 已设置过家乡，提示不能修改
      wx.showModal({
        title: '提示',
        content: `你的家乡已设置为【${this.data.provinceName}】，无法修改`,
        showCancel: false
      })
      return
    }
    this.setData({ showProvincePicker: true })
  },

  // 省份选择变化
  onProvinceChange(e) {
    const index = e.detail.value
    const province = this.data.provinces[index]
    this.setData({ tempProvince: province.code })
  },

  // 确认选择省份
  confirmProvince() {
    if (!this.data.tempProvince) {
      toast('请选择省份')
      return
    }
    
    const province = this.data.provinces.find(p => p.code === this.data.tempProvince)
    this.setData({
      province: province.code,
      provinceName: province.name,
      showProvincePicker: false,
      tempProvince: ''
    })
  },

  // 取消选择省份
  cancelProvince() {
    this.setData({ showProvincePicker: false, tempProvince: '' })
  },

  // 保存资料
  async saveProfile() {
    const { nickName, avatarUrl, province } = this.data
    
    if (!nickName.trim()) {
      toast('请输入昵称')
      return
    }
    
    showLoading('保存中...')
    try {
      const res = await callCloud('userInit', {
        action: 'updateProfile',
        nickName: nickName.trim(),
        avatarUrl: avatarUrl,
        province: province
      })
      
      if (res && res.success) {
        // 更新本地缓存
        const app = getApp()
        if (!app.globalData.userInfo) {
          app.globalData.userInfo = {}
        }
        app.globalData.userInfo.nickName = nickName.trim()
        app.globalData.userInfo.avatarUrl = avatarUrl
        app.globalData.province = province
        
        toast('保存成功', 'success')
        setTimeout(() => wx.navigateBack(), 1500)
      } else {
        toast(res?.error || '保存失败')
      }
    } catch (e) {
      console.error('保存失败', e)
      toast('保存失败')
    } finally {
      hideLoading()
    }
  }
})
