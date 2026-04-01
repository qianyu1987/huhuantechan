// pages/settings/index.js - 设置
Page({
  data: {
    notifyEnabled: true,
    showProfile: true,
    searchable: true,
    cacheSize: '12.5 MB',
    currentTheme: 'dark',
    currentThemeName: '深邃黑',
    showThemeModal: false,
    themes: [
      {
        id: 'dark',
        name: '深邃黑',
        desc: '经典深色，护眼舒适',
        colors: ['#0D0D0F', '#0A84FF', '#30D158']
      },
      {
        id: 'light',
        name: '纯净白',
        desc: '清新明亮，简约时尚',
        colors: ['#F2F2F7', '#007AFF', '#34C759']
      },
      {
        id: 'rose',
        name: '玫瑰红',
        desc: 'iOS 18 玫瑰红，优雅浪漫',
        colors: ['#1A0008', '#FF3B54', '#FF6B7F']
      }
    ]
  },

  onLoad() {
    this.loadSettings()
    this.loadTheme()
  },

  onShow() {
    // 每次显示页面时更新主题
    this.loadTheme()
  },

  loadSettings() {
    const settings = wx.getStorageSync('userSettings') || {}
    this.setData({
      notifyEnabled: settings.notifyEnabled ?? true,
      showProfile: settings.showProfile ?? true,
      searchable: settings.searchable ?? true
    })
  },

  loadTheme() {
    const savedTheme = wx.getStorageSync('appTheme') || 'dark'
    const themeNames = {
      'dark': '深邃黑',
      'light': '纯净白',
      'rose': '玫瑰红'
    }
    this.setData({
      currentTheme: savedTheme,
      currentThemeName: themeNames[savedTheme] || '深邃黑'
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

  // 主题切换相关
  toggleTheme() {
    this.setData({ showThemeModal: true })
  },

  closeThemeModal() {
    this.setData({ showThemeModal: false })
  },

  preventBubble() {
    // 阻止冒泡
  },

  selectTheme(e) {
    const themeId = e.currentTarget.dataset.theme
    if (themeId === this.data.currentTheme) {
      this.closeThemeModal()
      return
    }

    // 使用 App 的主题切换功能
    const app = getApp()
    app.switchTheme(themeId)

    // 更新本地状态
    const themeNames = {
      'dark': '深邃黑',
      'light': '纯净白',
      'rose': '玫瑰红'
    }
    this.setData({
      currentTheme: themeId,
      currentThemeName: themeNames[themeId],
      showThemeModal: false
    })

    // 更新页面根元素的样式类
    this.updateThemeClass(themeId)
  },

  updateThemeClass(themeId) {
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    if (currentPage) {
      currentPage.setData({
        pageTheme: themeId
      })
    }
  },

  clearCache() {
    wx.showModal({
      title: '清理缓存',
      content: '确定要清理缓存吗？',
      confirmText: '清理',
      confirmColor: 'var(--color-primary)',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '清理中...' })
          setTimeout(() => {
            try {
              // 清理功能开关缓存
              wx.removeStorageSync('featureFlags')
              wx.removeStorageSync('featureFlagsTTL')
              this.setData({ cacheSize: '0 MB' })
              wx.hideLoading()
              wx.showToast({ title: '清理完成', icon: 'success' })
            } catch (e) {
              wx.hideLoading()
              wx.showToast({ title: '清理失败', icon: 'none' })
            }
          }, 500)
        }
      }
    })
  },

  goToNetworkTest() {
    wx.navigateTo({ url: '/pages/network-test/index' })
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      confirmText: '退出',
      confirmColor: 'var(--color-danger)',
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
  },

  // 主题变化回调
  onThemeChange(theme) {
    this.setData({
      currentTheme: theme.id,
      currentThemeName: theme.name
    })
  }
})
