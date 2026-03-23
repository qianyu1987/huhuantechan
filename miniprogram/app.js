// app.js
const { DEFAULT_FEATURE_FLAGS } = require('./utils/constants')
const $pl = require('./utils/platform')

App({
  globalData: {
    userInfo: null,
    openid: null,
    envId: 'cloud1-3g4sjhqr5e28e54e', // 你的云开发环境ID
    creditScore: 100,
    province: '',
    provincesBadges: [], // 已集章省份
    platform: 'weixin', // 平台：weixin/ohos/android/ios
    platformInfo: null, // 详细平台信息
    featureFlags: null,
    featureFlagsReady: false
  },

  onLaunch() {
    // 获取平台信息（支持三端）
    const $pi = $pl.getPlatformInfo()
    this.globalData.platform = $pi.platform
    this.globalData.platformInfo = $pi
    console.log('[App] 平台:', $pi)

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
      // 多端应用和 HarmonyOS 的云初始化
      const $io = {
        env: this.globalData.envId,
        traceUser: true
      }
      
      wx.cloud.init($io)
      console.log('[App] 云开发初始化成功', $io)
    } catch ($ex) {
      console.error('[App] 云开发初始化失败', $ex)
      // 降级初始化
      if ($pi.isOhos || $pi.isApp) {
        try {
          wx.cloud.init({ traceUser: false })
          console.log('[App] 降级初始化成功（使用默认环境）')
        } catch ($he) {
          console.error('[App] 降级初始化也失败', $he)
          wx.showModal({
            title: '云服务初始化失败',
            content: '云开发初始化失败，部分功能可能无法使用。错误: ' + $ex.message,
            showCancel: false
          })
        }
      } else {
        wx.showToast({ title: '云开发初始化失败', icon: 'none' })
      }
    }

    // TDesign图标字体通过CSS自动加载，无需手动处理
    // this.loadIcons()

    // 加载功能开关配置
    this.loadFeatureFlags()

    // 检查用户协议同意状态
    this.checkAgreement()
  },

  // 加载功能开关配置
  loadFeatureFlags() {
    // 先读本地缓存（同步）
    try {
      const $ca = wx.getStorageSync('featureFlags')
      const $tl = wx.getStorageSync('featureFlagsTTL')
      if ($ca && $tl && Date.now() < $tl) {
        this.applyFeatureFlags($ca)
        console.log('[App] 使用缓存的功能开关配置')
        return
      }
    } catch ($e1) {
      // 缓存读取失败，继续走网络
    }

    // 缓存过期或不存在，异步加载
    this.callCloudFunctionWithRetry('adminMgr', { action: 'getFeatureFlags' }, 3)
      .then($r1 => {
        if ($r1.result && $r1.result.success && $r1.result.flags) {
          this.applyFeatureFlags($r1.result.flags)
          // 缓存5分钟
          wx.setStorageSync('featureFlags', $r1.result.flags)
          wx.setStorageSync('featureFlagsTTL', Date.now() + 5 * 60 * 1000)
          console.log('[App] 从云端加载功能开关配置')
        } else {
          this.applyFeatureFlags({ ...DEFAULT_FEATURE_FLAGS })
          console.log('[App] 云端无配置，使用默认值')
        }
      })
      .catch($e2 => {
        console.error('[App] 加载功能开关失败', $e2)
        this.applyFeatureFlags({ ...DEFAULT_FEATURE_FLAGS })
      })
  },

  // 应用功能开关（处理审核模式）
  applyFeatureFlags($fl) {
    const $ap = { ...DEFAULT_FEATURE_FLAGS, ...$fl }
    // 审核模式：自动隐藏敏感功能
    if ($ap.review_mode) {
      $ap.tab_match = false
      $ap.tab_order = false
      $ap.feature_mystery = false
      $ap.feature_value_display = false
      $ap.feature_swap = false
    }
    this.globalData.featureFlags = $ap
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
      const $r3 = await this.callCloudFunctionWithRetry('adminMgr', { action: 'getFeatureFlags' }, 3)
      if ($r3.result && $r3.result.success && $r3.result.flags) {
        this.applyFeatureFlags($r3.result.flags)
        wx.setStorageSync('featureFlags', $r3.result.flags)
        wx.setStorageSync('featureFlagsTTL', Date.now() + 5 * 60 * 1000)
      } else {
        this.applyFeatureFlags({ ...DEFAULT_FEATURE_FLAGS })
      }
    } catch ($e3) {
      console.error('[App] 刷新功能开关失败', $e3)
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
    const $t = this
    wx.showModal({
      title: '用户协议与隐私政策',
      content: '欢迎使用风物之小程序！\n\n在使用本小程序前，请先阅读并同意：\n\n• 《用户服务协议》\n• 《隐私政策》\n\n点击"同意"即表示您已阅读并同意相关条款。',
      confirmText: '同意并继续',
      cancelText: '不同意',
      success: ($r4) => {
        if ($r4.confirm) {
          // 用户同意，保存状态并继续
          wx.setStorageSync('userAgreedAgreement', true)
          wx.setStorageSync('agreementDate', new Date().toISOString())
          $t.initUser()
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
    const $pi = this.globalData.platformInfo
    // HarmonyOS 和 App 平台字体加载可能有兼容性问题，跳过或使用本地字体
    if ($pi && ($pi.isOhos || $pi.isApp)) {
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
      const $r7 = await this.callCloudFunctionWithRetry('userInit', {}, 3)
      if ($r7.result && $r7.result.success) {
        this.globalData.openid = $r7.result.openid
        this.globalData.userInfo = $r7.result.userInfo
        this.globalData.creditScore = $r7.result.creditScore || 100
        this.globalData.province = $r7.result.province || ''
        this.globalData.provincesBadges = $r7.result.provincesBadges || []

        // 检查并绑定邀请关系
        await this.bindInviteIfNeeded()
      }
    } catch ($e5) {
      console.error('[App] 用户初始化失败', $e5)
    }
  },

  // 检查并绑定邀请关系
  async bindInviteIfNeeded() {
    try {
      const $pic = wx.getStorageSync('pendingInviteCode')
      const $bi = wx.getStorageSync('boundInvite')

      // 如果有待绑定的邀请码且未绑定
      if ($pic && !$bi) {
        const $r5 = await this.callCloudFunctionWithRetry('userInit', {
          action: 'bindInvite',
          inviteCode: $pic
        }, 3)

        if ($r5.result && $r5.result.success) {
          wx.setStorageSync('boundInvite', $pic)
          wx.removeStorageSync('pendingInviteCode')

          // 提示获得积分
          if ($r5.result.reward > 0) {
            wx.showModal({
              title: '邀请成功',
              content: `恭喜获得 ${$r5.result.reward} 积分奖励！`,
              showCancel: false
            })
          }
        }
      }
    } catch ($e4) {
      console.error('[App] 绑定邀请关系失败', $e4)
    }
  },

  // ========== 云函数调用辅助方法（含重试和平台兼容性） ==========
  callCloudFunctionWithRetry($nm, $dt = {}, $mr = 3) {
    return new Promise(($rs, $rj) => {
      let $rc = 0

      const $dc = () => {
        if (!wx.cloud) {
          $rj(new Error('云开发尚未初始化'))
          return
        }

        wx.cloud.callFunction({
          name: $nm,
          data: $dt
        }).then($r6 => {
          $rs($r6)
        }).catch($err => {
          $rc++
          console.warn(`[App] 云函数调用失败 (${$nm}), 重试 ${$rc}/${$mr}:`, $err)

          // 错误码 -601002 在 HarmonyOS 上通常是环境问题，尝试重试
          if ($rc < $mr && ($err.errCode === -601002 || $err.errCode === -1)) {
            // 延迟后重试，避免立即重试导致连接被拒
            setTimeout($dc, 1000 * $rc)
          } else {
            $rj($err)
          }
        })
      }

      $dc()
    })
  }
})
