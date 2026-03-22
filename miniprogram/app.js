// app.js
const { DEFAULT_FEATURE_FLAGS } = require('./utils/constants')

App({
  globalData: {
    userInfo: null,
    openid: null,
    envId: 'cloud1-3g4sjhqr5e28e54e', // 你的云开发环境ID
    creditScore: 100,
    province: '',
    provincesBadges: [], // 已集章省份
    platform: 'weixin', // 平台：weixin/harmony
    featureFlags: null,
    featureFlagsReady: false
  },

  onLaunch() {
    // 获取设备信息判断平台
    const deviceInfo = wx.getDeviceInfo()
    this.globalData.platform = deviceInfo.platform === 'harmony' ? 'harmony' : 'weixin'
    console.log('[App] 平台:', this.globalData.platform, deviceInfo)

    // 初始化云开发
    if (!wx.cloud) {
      wx.showModal({
        title: '提示',
        content: '当前微信版本过低，无法使用云开发功能，请升级到最新微信版本。',
        showCancel: false
      })
      return
    }
    
    // 使用指定的环境ID初始化
    try {
      wx.cloud.init({
        env: this.globalData.envId,
        traceUser: true
      })
    } catch (e) {
      console.error('[App] 云开发初始化失败', e)
      wx.showToast({ title: '云开发初始化失败', icon: 'none' })
    }

    // 预加载 TDesign 图标字体（HarmonyOS需要特殊处理）
    this.loadIcons()

    // 加载功能开关配置
    this.loadFeatureFlags()

    // 检查用户协议同意状态
    this.checkAgreement()
  },

  // 加载功能开关配置
  loadFeatureFlags() {
    // 先读本地缓存（同步）
    try {
      const cached = wx.getStorageSync('featureFlags')
      const ttl = wx.getStorageSync('featureFlagsTTL')
      if (cached && ttl && Date.now() < ttl) {
        this.applyFeatureFlags(cached)
        console.log('[App] 使用缓存的功能开关配置')
        return
      }
    } catch (e) {
      // 缓存读取失败，继续走网络
    }

    // 缓存过期或不存在，异步加载
    wx.cloud.callFunction({
      name: 'adminMgr',
      data: { action: 'getFeatureFlags' }
    }).then(res => {
      if (res.result && res.result.success && res.result.flags) {
        this.applyFeatureFlags(res.result.flags)
        // 缓存5分钟
        wx.setStorageSync('featureFlags', res.result.flags)
        wx.setStorageSync('featureFlagsTTL', Date.now() + 5 * 60 * 1000)
        console.log('[App] 从云端加载功能开关配置')
      } else {
        this.applyFeatureFlags({ ...DEFAULT_FEATURE_FLAGS })
        console.log('[App] 云端无配置，使用默认值')
      }
    }).catch(e => {
      console.error('[App] 加载功能开关失败', e)
      this.applyFeatureFlags({ ...DEFAULT_FEATURE_FLAGS })
    })
  },

  // 应用功能开关（处理审核模式）
  applyFeatureFlags(flags) {
    const applied = { ...DEFAULT_FEATURE_FLAGS, ...flags }
    // 审核模式：自动隐藏敏感功能
    if (applied.review_mode) {
      applied.tab_match = false
      applied.tab_order = false
      applied.feature_mystery = false
      applied.feature_value_display = false
      applied.feature_swap = false
    }
    this.globalData.featureFlags = applied
    this.globalData.featureFlagsReady = true
  },

  // 检查功能是否启用
  isFeatureEnabled(flag) {
    const flags = this.globalData.featureFlags
    if (!flags || !(flag in flags)) return true
    return flags[flag]
  },

  // 强制刷新功能开关（admin修改后调用）
  async refreshFeatureFlags() {
    try {
      wx.removeStorageSync('featureFlags')
      wx.removeStorageSync('featureFlagsTTL')
      const res = await wx.cloud.callFunction({
        name: 'adminMgr',
        data: { action: 'getFeatureFlags' }
      })
      if (res.result && res.result.success && res.result.flags) {
        this.applyFeatureFlags(res.result.flags)
        wx.setStorageSync('featureFlags', res.result.flags)
        wx.setStorageSync('featureFlagsTTL', Date.now() + 5 * 60 * 1000)
      } else {
        this.applyFeatureFlags({ ...DEFAULT_FEATURE_FLAGS })
      }
    } catch (e) {
      console.error('[App] 刷新功能开关失败', e)
    }
  },

  // 检查用户协议同意状态（首次登录弹窗）
  checkAgreement() {
    const hasAgreed = wx.getStorageSync('userAgreedAgreement')
    
    if (!hasAgreed) {
      // 首次登录，显示协议弹窗
      this.showAgreementModal()
    } else {
      // 已同意协议，继续初始化
      this.initUser()
    }
  },

  // 显示协议确认弹窗
  showAgreementModal() {
    const that = this
    wx.showModal({
      title: '用户协议与隐私政策',
      content: '欢迎使用风物之小程序！\n\n在使用本小程序前，请先阅读并同意：\n\n• 《用户服务协议》\n• 《隐私政策》\n\n点击"同意"即表示您已阅读并同意相关条款。',
      confirmText: '同意并继续',
      cancelText: '不同意',
      success: (res) => {
        if (res.confirm) {
          // 用户同意，保存状态并继续
          wx.setStorageSync('userAgreedAgreement', true)
          wx.setStorageSync('agreementDate', new Date().toISOString())
          that.initUser()
        } else {
          // 用户不同意，提示并退出
          wx.showModal({
            title: '提示',
            content: '您需要同意用户协议才能使用本小程序。',
            showCancel: false,
            success: () => {
              // 退出小程序
              wx.exitMiniProgram({})
            }
          })
        }
      }
    })
  },

  // 图标字体加载（HarmonyOS兼容）
  loadIcons() {
    // HarmonyOS 平台字体加载可能有兼容性问题，跳过或使用本地字体
    if (this.globalData.platform === 'harmony') {
      console.log('[App] HarmonyOS平台，跳过远程字体加载')
      return
    }

    wx.loadFontFace({
      family: 't',
      source: 'url("https://tdesign.gtimg.com/icon/0.4.1/fonts/t.ttf")',
      global: true,
      success: () => {
        console.log('[App] TDesign字体加载成功')
      },
      fail: (err) => {
        console.warn('[App] 字体加载失败', err)
      }
    })
  },

  async initUser() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'userInit',
        data: {}
      })
      if (res.result && res.result.success) {
        this.globalData.openid = res.result.openid
        this.globalData.userInfo = res.result.userInfo
        this.globalData.creditScore = res.result.creditScore || 100
        this.globalData.province = res.result.province || ''
        this.globalData.provincesBadges = res.result.provincesBadges || []

        // 检查并绑定邀请关系
        await this.bindInviteIfNeeded()
      }
    } catch (e) {
      console.error('[App] 用户初始化失败', e)
    }
  },

  // 检查并绑定邀请关系
  async bindInviteIfNeeded() {
    try {
      const pendingInviteCode = wx.getStorageSync('pendingInviteCode')
      const boundInvite = wx.getStorageSync('boundInvite')

      // 如果有待绑定的邀请码且未绑定
      if (pendingInviteCode && !boundInvite) {
        const res = await wx.cloud.callFunction({
          name: 'userInit',
          data: {
            action: 'bindInvite',
            inviteCode: pendingInviteCode
          }
        })

        if (res.result && res.result.success) {
          wx.setStorageSync('boundInvite', pendingInviteCode)
          wx.removeStorageSync('pendingInviteCode')

          // 提示获得积分
          if (res.result.reward > 0) {
            wx.showModal({
              title: '邀请成功',
              content: `恭喜获得 ${res.result.reward} 积分奖励！`,
              showCancel: false
            })
          }
        }
      }
    } catch (e) {
      console.error('[App] 绑定邀请关系失败', e)
    }
  }
})
