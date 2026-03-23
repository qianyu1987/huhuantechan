/**
 * 平台适配工具模块
 * 支持：微信小程序、HarmonyOS (ohos)、Android、iOS
 */

const $pl = {
  // 平台类型枚举
  PLATFORM: {
    WEIXIN: 'weixin',      // 微信小程序
    OHOS: 'ohos',          // HarmonyOS（微信小程序中）
    ANDROID: 'android',    // Android App（多端应用）
    IOS: 'ios'             // iOS App（多端应用）
  },

  // 当前平台信息（缓存）
  _$ci: null,

  /**
   * 获取当前平台信息
   * @returns {Object} { platform, isWeixin, isOhos, isAndroid, isIOS, isMiniApp, isApp }
   */
  getPlatformInfo() {
    if (this._$ci) return this._$ci

    try {
      const $di = wx.getDeviceInfo()
      const $ai = wx.getAccountInfoSync ? wx.getAccountInfoSync() : null
      
      // 判断平台
      let $pt = this.PLATFORM.WEIXIN
      
      // HarmonyOS 在微信小程序中的标识是 'ohos'
      if ($di.platform === 'ohos' || $di.platform === 'harmony') {
        $pt = this.PLATFORM.OHOS
      }
      // Android App（多端应用）
      else if ($di.platform === 'android' && $ai && $ai.miniProgram.envVersion === 'app') {
        $pt = this.PLATFORM.ANDROID
      }
      // iOS App（多端应用）
      else if (($di.platform === 'ios' || $di.platform === 'devtools') && $ai && $ai.miniProgram.envVersion === 'app') {
        $pt = this.PLATFORM.IOS
      }

      this._$ci = {
        platform: $pt,
        system: $di.system,
        SDKVersion: $di.SDKVersion,
        brand: $di.brand,
        model: $di.model,
        
        // 便捷判断
        isWeixin: $pt === this.PLATFORM.WEIXIN,
        isOhos: $pt === this.PLATFORM.OHOS,
        isAndroid: $pt === this.PLATFORM.ANDROID || ($pt === this.PLATFORM.WEIXIN && $di.platform === 'android'),
        isIOS: $pt === this.PLATFORM.IOS || ($pt === this.PLATFORM.WEIXIN && $di.platform === 'ios'),
        
        // 应用类型
        isMiniApp: $pt === this.PLATFORM.WEIXIN || $pt === this.PLATFORM.OHOS,
        isApp: $pt === this.PLATFORM.ANDROID || $pt === this.PLATFORM.IOS,
        
        // HarmonyOS 特殊特性支持检测
        supportDarkmode: $pt !== this.PLATFORM.OHOS,
        supportSkyline: $pt === this.PLATFORM.WEIXIN,
        supportShareTimeline: $pt !== this.PLATFORM.OHOS,
        supportAd: $pt !== this.PLATFORM.OHOS
      }

      console.log('[Platform] 平台信息:', this._$ci)
      return this._$ci
    } catch ($e) {
      console.error('[Platform] 获取平台信息失败:', $e)
      return {
        platform: this.PLATFORM.WEIXIN,
        isWeixin: true,
        isOhos: false,
        isAndroid: false,
        isIOS: false,
        isMiniApp: true,
        isApp: false
      }
    }
  },

  /**
   * 判断当前是否为 HarmonyOS 平台
   */
  isOhos() {
    return this.getPlatformInfo().isOhos
  },

  /**
   * 判断当前是否为 App（Android/iOS）
   */
  isApp() {
    return this.getPlatformInfo().isApp
  },

  /**
   * 检查 API 是否可用
   * @param {string} api API 名称，如 'onThemeChange'
   */
  canIUse($api) {
    return wx.canIUse($api)
  },

  /**
   * 平台特定样式适配
   * @param {Object} styles 样式对象 { default: {}, weixin: {}, ohos: {}, android: {}, ios: {} }
   */
  adaptStyles($st) {
    const $pi = this.getPlatformInfo()
    return {
      ...($st.default || {}),
      ...($st[$pi.platform] || {})
    }
  },

  /**
   * 条件执行函数
   * @param {Object} options { weixin: fn, ohos: fn, android: fn, ios: fn, default: fn }
   */
  conditionExec($op) {
    const $pi = this.getPlatformInfo()
    const $fn = $op[$pi.platform] || $op.default
    if (typeof $fn === 'function') {
      return $fn()
    }
  },

  /**
   * 获取安全区域信息（适配不同平台）
   */
  getSafeArea() {
    try {
      const $si = wx.getSystemInfoSync()
      return {
        top: $si.safeArea ? $si.safeArea.top : 0,
        bottom: $si.safeArea ? $si.safeArea.bottom : $si.screenHeight,
        left: $si.safeArea ? $si.safeArea.left : 0,
        right: $si.safeArea ? $si.safeArea.right : $si.screenWidth,
        width: $si.safeArea ? $si.safeArea.width : $si.screenWidth,
        height: $si.safeArea ? $si.safeArea.height : $si.screenHeight
      }
    } catch ($e) {
      return { top: 0, bottom: 667, left: 0, right: 375, width: 375, height: 667 }
    }
  },

  /**
   * 获取状态栏高度
   */
  getStatusBarHeight() {
    try {
      const $si = wx.getSystemInfoSync()
      return $si.statusBarHeight || 0
    } catch ($e) {
      return 0
    }
  }
}

module.exports = $pl
