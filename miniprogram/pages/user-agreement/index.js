// pages/user-agreement/index.js - 用户服务协议
Page({
  data: {
    agreementType: 'user' // user 或 privacy
  },

  onLoad(options) {
    const type = options.type || 'user'
    this.setData({ agreementType: type })
    
    // 设置页面标题
    wx.setNavigationBarTitle({
      title: type === 'user' ? '用户服务协议' : '隐私政策'
    })
  },

  onReady() {
    // 动态设置标题
    wx.setNavigationBarTitle({
      title: this.data.agreementType === 'user' ? '用户服务协议' : '隐私政策'
    })
  }
})
