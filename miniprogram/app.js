// app.js
const { DEFAULT_FEATURE_FLAGS } = require('./utils/constants')
const platformUtil = require('./utils/platform')

App({
  globalData: {
    userInfo: null,
    openid: null,
    envId: 'cloud1-3g4sjhqr5e28e54e', // 你的云开发环境ID
    creditScore: 100,
    points: 0, // ✅ 补充 points 初始值
    province: '',
    provincesBadges: [], // 已集章省份
    platform: 'weixin', // 平台：weixin/ohos/android/ios
    platformInfo: null, // 详细平台信息
    featureFlags: null,
    featureFlagsReady: false
  },

onLaunch() {
    // 获取平台信息（支持三端）
    const platformInfo = platformUtil.getPlatformInfo()
    this.globalData.platform = platformInfo.platform
    this.globalData.platformInfo = platformInfo
    console.log('[App] 平台:', platformInfo)

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
    // 强制指定环境ID，避免 "Environment not found" 错误
    try {
      wx.cloud.init({
        env: this.globalData.envId,
        traceUser: true
      })
      console.log('[App] 云开发初始化成功，环境:', this.globalData.envId)
    } catch (ex) {
      console.error('[App] 云开发初始化失败', ex)
    }

    // TDesign图标字体通过CSS自动加载，无需手动处理
    // this.loadIcons()

    // 加载功能开关配置
    this.loadFeatureFlags()

    // 检查用户协议同意状态
    this.checkAgreement()

    // 自动登录检查
    this.autoLogin()
  },

  // 自动登录功能
  async autoLogin() {
    try {
      console.log('[App] 检查自动登录状态...')
      
      // 检查本地存储的用户信息
      const localUserInfo = wx.getStorageSync('userInfo')
      const localOpenid = wx.getStorageSync('openid')
      
      if (localUserInfo && localOpenid) {
        console.log('[App] 发现本地用户信息，尝试自动登录')
        
        // 设置全局数据
        this.globalData.userInfo = localUserInfo
        this.globalData.openid = localOpenid
        
        // 获取用户完整信息
        const res = await this.callCloudFunctionWithRetry('userInit', { action: 'getProfile' }, 3)
        if (res.result && res.result.success) {
          this.globalData.userInfo = res.result.userInfo
          this.globalData.creditScore = res.result.creditScore || 100
          this.globalData.province = res.result.province || ''
          this.globalData.provincesBadges = res.result.provincesBadges || []
          this.globalData.points = res.result.points || 0
          
          console.log('[App] 自动登录成功，用户:', this.globalData.userInfo.nickName)
          
          // 保存更新后的用户信息
          wx.setStorageSync('userInfo', this.globalData.userInfo)
          wx.setStorageSync('openid', this.globalData.openid)
        } else {
          console.log('[App] 自动登录获取用户信息失败，重新初始化')
          this.initUser()
        }
      } else {
        console.log('[App] 未发现本地用户信息，正常初始化')
        this.initUser()
      }
    } catch (err) {
      console.error('[App] 自动登录失败:', err)
      this.initUser()
    }
  },

  // 加载功能开关配置
  loadFeatureFlags() {
    // 先读本地缓存（同步）
    try {
      const cached = wx.getStorageSync('featureFlags')
      const cachedTTL = wx.getStorageSync('featureFlagsTTL')
      if (cached && cachedTTL && Date.now() < cachedTTL) {
        this.applyFeatureFlags(cached)
        console.log('[App] 使用缓存的功能开关配置')
        return
      }
    } catch (err) {
      // 缓存读取失败，继续走网络
    }

    // 缓存过期或不存在，异步加载
    this.callCloudFunctionWithRetry('adminMgr', { action: 'getFeatureFlags' }, 3)
      .then(res => {
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
      })
      .catch(err => {
        console.error('[App] 加载功能开关失败', err)
        this.applyFeatureFlags({ ...DEFAULT_FEATURE_FLAGS })
      })
  },

  // 应用功能开关（处理审核模式）
  applyFeatureFlags(flags) {
    const appliedFlags = { ...DEFAULT_FEATURE_FLAGS, ...flags }
    // 审核模式：自动隐藏敏感功能
    if (appliedFlags.review_mode) {
      appliedFlags.tab_match = false
      appliedFlags.tab_order = false
      appliedFlags.feature_mystery = false
      appliedFlags.feature_value_display = false
      appliedFlags.feature_swap = false
    }
    this.globalData.featureFlags = appliedFlags
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
      const res = await this.callCloudFunctionWithRetry('adminMgr', { action: 'getFeatureFlags' }, 3)
      if (res.result && res.result.success && res.result.flags) {
        this.applyFeatureFlags(res.result.flags)
        wx.setStorageSync('featureFlags', res.result.flags)
        wx.setStorageSync('featureFlagsTTL', Date.now() + 5 * 60 * 1000)
      } else {
        this.applyFeatureFlags({ ...DEFAULT_FEATURE_FLAGS })
      }
    } catch (err) {
      console.error('[App] 刷新功能开关失败', err)
    }
  },

  // 检查用户协议同意状态
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
    const self = this
    wx.showModal({
      title: '用户协议与隐私政策',
      content: '欢迎使用风物之小程序！\n\n在使用本小程序前，请先阅读并同意：\n\n• 《用户服务协议》\n• 《隐私政策》\n\n点击"同意"即表示您已阅读并同意相关条款。',
      confirmText: '同意并继续',
      cancelText: '不同意',
      success: (modalRes) => {
        if (modalRes.confirm) {
          // 用户同意，保存状态并继续
          wx.setStorageSync('userAgreedAgreement', true)
          wx.setStorageSync('agreementDate', new Date().toISOString())
          self.initUser()
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

  // 图标字体加载（多端兼容）
  loadIcons() {
    const platformInfo = this.globalData.platformInfo
    // HarmonyOS 和 App 平台字体加载可能有兼容性问题，跳过或使用本地字体
    if (platformInfo && (platformInfo.isOhos || platformInfo.isApp)) {
      console.log('[App] 非微信平台，跳过远程字体加载')
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
      console.log('[App] 开始初始化用户...')
      const res = await this.callCloudFunctionWithRetry('userInit', { action: 'init' }, 3)
      console.log('[App] userInit 响应:', res.result)
      if (res.result && res.result.success) {
        this.globalData.openid = res.result.openid
        this.globalData.userInfo = res.result.userInfo
        this.globalData.creditScore = res.result.creditScore || 100
        this.globalData.province = res.result.province || ''
        this.globalData.provincesBadges = res.result.provincesBadges || []
        this.globalData.points = res.result.points || 0 // ✅ 补充 points

        console.log('[App] 用户初始化成功, openid:', res.result.openid, 'points:', res.result.points)

        // 检查并绑定邀请关系
        await this.bindInviteIfNeeded()
      } else {
        console.error('[App] userInit 返回失败:', res.result)
      }
    } catch (err) {
      console.error('[App] 用户初始化失败', err)
    }
  },

  // 检查并绑定邀请关系
  async bindInviteIfNeeded() {
    try {
      const pendingInviteCode = wx.getStorageSync('pendingInviteCode')
      const alreadyBound = wx.getStorageSync('boundInvite')

      // 如果有待绑定的邀请码且未绑定
      if (pendingInviteCode && !alreadyBound) {
        const res = await this.callCloudFunctionWithRetry('userInit', {
          action: 'bindInvite',
          inviteCode: pendingInviteCode
        }, 3)

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
    } catch (err) {
      console.error('[App] 绑定邀请关系失败', err)
    }
  },

  // ========== 云函数调用辅助方法（含重试和平台兼容性） ==========
  callCloudFunctionWithRetry(funcName, data = {}, maxRetries = 3) {
    return new Promise((resolve, reject) => {
      let retryCount = 0

      const doCall = () => {
        if (!wx.cloud) {
          reject(new Error('云开发尚未初始化'))
          return
        }

        wx.cloud.callFunction({
          name: funcName,
          data: data
        }).then(res => {
          resolve(res)
        }).catch(err => {
          retryCount++
          console.warn(`[App] 云函数调用失败 (${funcName}), 重试 ${retryCount}/${maxRetries}:`, err)

          // 错误码 -601002 在 HarmonyOS 上通常是环境问题，尝试重试
          if (retryCount < maxRetries && (err.errCode === -601002 || err.errCode === -1)) {
            // 延迟后重试，避免立即重试导致连接被拒
            setTimeout(doCall, 1000 * retryCount)
          } else {
            reject(err)
          }
        })
      }

      doCall()
    })
  }
})
