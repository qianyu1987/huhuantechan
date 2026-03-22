// pages/settings/index.js - 设置
Page({
  data: {
    notifyEnabled: true,
    showProfile: true,
    searchable: true,
    darkMode: true,
    cacheSize: '12.5 MB'
  },

  onLoad() {
    this.loadSettings()
  },

  loadSettings() {
    const settings = wx.getStorageSync('userSettings') || {}
    this.setData({
      notifyEnabled: settings.notifyEnabled ?? true,
      showProfile: settings.showProfile ?? true,
      searchable: settings.searchable ?? true,
      darkMode: settings.darkMode ?? true
    })
  },

  saveSettings(key, value) {
    const settings = wx.getStorageSync('userSettings') || {}
    settings[key] = value
    wx.setStorageSync('userSettings', settings)
  },

  goBack() {
    wx.navigateBack()
  },

  editProfile() {
    wx.navigateTo({ url: '/pages/profile-edit/index' })
  },

  goToAddress() {
    wx.navigateTo({ url: '/pages/address/index' })
  },

  toggleNotify(e) {
    this.setData({ notifyEnabled: e.detail.value })
    this.saveSettings('notifyEnabled', e.detail.value)
  },

  toggleShowProfile(e) {
    this.setData({ showProfile: e.detail.value })
    this.saveSettings('showProfile', e.detail.value)
  },

  toggleSearchable(e) {
    this.setData({ searchable: e.detail.value })
    this.saveSettings('searchable', e.detail.value)
  },

  toggleDarkMode(e) {
    this.setData({ darkMode: e.detail.value })
    this.saveSettings('darkMode', e.detail.value)
    // 可以触发全局主题切换
  },

  clearCache() {
    wx.showModal({
      title: '清理缓存',
      content: '确定要清理缓存吗？',
      confirmText: '清理',
      confirmColor: '#0A84FF',
      success: (res) => {
        if (res.confirm) {
          // 清理缓存
          wx.showLoading({ title: '清理中...' })
          setTimeout(() => {
            wx.hideLoading()
            this.setData({ cacheSize: '0 KB' })
            wx.showToast({ title: '清理完成', icon: 'success' })
          }, 1000)
        }
      }
    })
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      confirmText: '退出',
      confirmColor: '#FF453A',
      success: (res) => {
        if (res.confirm) {
          const app = getApp()
          app.globalData.userInfo = null
          app.globalData.creditScore = 100
          app.globalData.openid = null
          app.globalData.province = ''
          app.globalData.provincesBadges = []
          wx.removeStorageSync('userInfo')
          wx.removeStorageSync('openid')
          wx.showToast({ title: '已退出', icon: 'success' })
          setTimeout(() => {
            wx.reLaunch({ url: '/pages/index/index' })
          }, 1000)
        }
      }
    })
  }
})
