// pages/test-phone/index.js - 手机验证组件测试页面
Page({
  data: {
    phoneNumber: '',
    phoneVerified: false,
    creditScore: 100
  },

  onLoad() {
    // 从全局数据获取当前状态
    const app = getApp()
    this.setData({
      creditScore: app.globalData.creditScore || 100
    })
  },

  onShow() {
    // 加载用户数据
    this.loadUserData()
  },

  async loadUserData() {
    const { callCloud } = require('../../utils/util')
    try {
      const res = await callCloud('userInit', { action: 'init' })
      if (res && res.userInfo) {
        this.setData({
          phoneNumber: res.phoneNumber || '',
          phoneVerified: res.phoneVerified || false,
          creditScore: res.creditScore || 100
        })
      }
    } catch (e) {
      console.error('加载用户数据失败:', e)
    }
  },

  onPhoneVerified(e) {
    console.log('手机号验证成功:', e.detail)
    const { phoneNumber, creditScore } = e.detail
    
    this.setData({
      phoneNumber,
      phoneVerified: true,
      creditScore
    })

    // 更新全局数据
    const app = getApp()
    app.globalData.creditScore = creditScore
  }
})
