// pages/settings/index.js - 设置
const { callCloud } = require('../../utils/util')

Page({
  data: {
    notifyEnabled: true,
    showProfile: true,
    searchable: true,
    cacheSize: '12.5 MB',
    currentTheme: 'dark',
    currentThemeName: '深邃黑',
    showThemeModal: false,
    version: '1.0.0',
    // 新增功能开关
    soundEnabled: true,
    vibrationEnabled: true,
    autoUpdateEnabled: true,
    privacyMode: false,
    // 客服配置
    serviceWechat: '',
    servicePhone: '',
    // 关于我们信息
    aboutInfo: {
      company: '特产互换科技',
      contact: 'support@techan.com',
      website: 'www.techan.com'
    },
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
      },
      {
        id: 'fresh',
        name: '小清新',
        desc: '鼠尾草绿配奶油黄，白底轻盈',
        colors: ['#F7F9F5', '#7DAF8E', '#E8C96A']
      }
    ]
  },

  onLoad() {
    this.loadSettings()
    this.loadTheme()
    this.loadServiceConfig()
  },

  onShow() {
    // 每次显示页面时更新主题
    this.loadTheme()
    this.loadServiceConfig()
  },

  // 加载客服配置
  async loadServiceConfig() {
    try {
      const res = await callCloud('userInit', { action: 'getServiceConfig' })
      if (res && res.success) {
        this.setData({
          serviceWechat: res.serviceWechat || '',
          servicePhone: res.servicePhone || ''
        })
      }
    } catch (e) {
      console.error('加载客服配置失败', e)
    }
  },

  loadSettings() {
    const settings = wx.getStorageSync('userSettings') || {}
    this.setData({
      notifyEnabled: settings.notifyEnabled ?? true,
      showProfile: settings.showProfile ?? true,
      searchable: settings.searchable ?? true,
      soundEnabled: settings.soundEnabled ?? true,
      vibrationEnabled: settings.vibrationEnabled ?? true,
      autoUpdateEnabled: settings.autoUpdateEnabled ?? true,
      privacyMode: settings.privacyMode ?? false
    })
  },

  loadTheme() {
    const savedTheme = wx.getStorageSync('appTheme') || 'dark'
    const themeNames = {
      'dark': '深邃黑',
      'light': '纯净白',
      'rose': '玫瑰红',
      'fresh': '小清新'
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
      'rose': '玫瑰红',
      'fresh': '小清新'
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

  // 通用开关切换
  toggleSwitch(e) {
    const key = e.currentTarget.dataset.key
    const enabled = e.detail.value
    this.setData({ [key]: enabled })
    this.saveSettings(key, enabled)
    
    const messages = {
      soundEnabled: enabled ? '声音已开启' : '声音已关闭',
      vibrationEnabled: enabled ? '振动已开启' : '振动已关闭',
      autoUpdateEnabled: enabled ? '自动更新已开启' : '自动更新已关闭',
      privacyMode: enabled ? '隐私模式已开启' : '隐私模式已关闭'
    }
    wx.showToast({ title: messages[key] || '设置已保存', icon: 'none' })
  },

  // 检查更新
  checkUpdate() {
    wx.showLoading({ title: '检查中...' })
    
    // 模拟检查更新
    setTimeout(() => {
      wx.hideLoading()
      wx.showModal({
        title: '已是最新版本',
        content: `当前版本 v${this.data.version}，无需更新`,
        showCancel: false,
        confirmText: '知道了'
      })
    }, 1000)
  },

  // 意见反馈
  goToFeedback() {
    const wechat = this.data.serviceWechat || ''
    const phone = this.data.servicePhone || ''
    
    let content = '如有问题或建议，欢迎联系我们：\n'
    if (wechat) {
      content += `\n📱 客服微信：${wechat}`
    }
    if (phone) {
      content += `\n📞 客服电话：${phone}`
    }
    content += '\n📧 客服邮箱：support@techan.com'
    
    const hasContact = wechat || phone
    
    wx.showModal({
      title: '意见反馈',
      content: content,
      confirmText: hasContact ? '复制联系方式' : '知道了',
      showCancel: true,
      cancelText: '关闭',
      success: (res) => {
        if (res.confirm && hasContact) {
          const copyText = wechat ? `客服微信：${wechat}` : `客服电话：${phone}`
          wx.setClipboardData({
            data: copyText,
            success: () => wx.showToast({ title: '已复制', icon: 'success' })
          })
        }
      }
    })
  },

  // 用户协议
  goToUserAgreement() {
    wx.navigateTo({ url: '/pages/user-agreement/index' })
  },

  // 隐私政策
  goToPrivacyPolicy() {
    wx.navigateTo({ url: '/pages/privacy-policy/index' })
  },

  // 关于我们
  goToAbout() {
    wx.navigateTo({ url: '/pages/about/index' })
  },

  // 帮助中心
  goToHelp() {
    wx.navigateTo({ url: '/pages/help/index' })
  },

  // 主题变化回调
  onThemeChange(theme) {
    this.setData({
      currentTheme: theme.id,
      currentThemeName: theme.name
    })
  }
})
