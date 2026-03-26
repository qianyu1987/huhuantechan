// components/phone-verify/index.js - 手机号快速验证组件(微信原生方案)
const { callCloud, toast } = require('../../utils/util')

Component({
  properties: {
    // 用户当前手机号
    phone: {
      type: String,
      value: ''
    },
    // 是否已验证
    verified: {
      type: Boolean,
      value: false
    }
  },

  data: {
    isVerified: false,
    maskedPhone: '',
    loading: false,
    isLoggedIn: false // 用户是否已登录微信
  },

  lifetimes: {
    attached() {
      this.checkLoginStatus()
      this.initData()
    }
  },

  observers: {
    'phone, verified': function(phone, verified) {
      console.log('[phone-verify] observer触发:', { phone, verified })
      this.initData()
    }
  },

  methods: {
    // 检查用户是否已登录微信
    checkLoginStatus() {
      const app = getApp()
      const openid = app.globalData.openid
      console.log('[phone-verify] 登录状态检查, openid:', openid)
      
      this.setData({
        isLoggedIn: !!openid
      })
    },

    initData() {
      const { phone, verified } = this.properties
      console.log('[phone-verify] initData:', { phone, verified })
      this.setData({
        isVerified: verified,
        maskedPhone: this.maskPhone(phone)
      })
    },

    // 手机号脱敏
    maskPhone(phone) {
      console.log('[phone-verify] maskPhone 输入:', phone, '长度:', phone ? phone.length : 0)
      if (!phone || phone.length !== 11) return ''
      const masked = phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
      console.log('[phone-verify] maskPhone 输出:', masked)
      return masked
    },

    // 引导用户先登录微信
    onLoginFirst() {
      // 检测是否在模拟器中
      const systemInfo = wx.getSystemInfoSync()
      if (systemInfo.platform === 'devtools') {
        wx.showModal({
          title: '模拟器限制',
          content: '手机号验证功能需要在真机上测试。\n\n请使用"真机调试"功能，在真实手机上扫码测试。',
          confirmText: '知道了',
          showCancel: false
        })
        return
      }
      
      wx.showModal({
        title: '需要先登录',
        content: '请先点击页面顶部的头像完成微信登录，然后再验证手机号。',
        confirmText: '知道了',
        showCancel: false
      })
    },

    // 获取手机号回调(微信原生方案)
    async onGetPhoneNumber(e) {
      console.log('getPhoneNumber callback:', e.detail)
      
      // 再次检查登录状态（防止用户未登录就点击）
      const app = getApp()
      if (!app.globalData.openid) {
        toast('请先完成微信登录')
        this.setData({ isLoggedIn: false })
        return
      }
      
      if (e.detail.errMsg !== 'getPhoneNumber:ok') {
        toast('需要授权手机号才能验证')
        return
      }

      // 微信新版本返回 code,旧版本返回 cloudID/encryptedData
      const { code, cloudID, encryptedData, iv } = e.detail
      
      if (!code && !cloudID && !encryptedData) {
        toast('获取手机号失败')
        return
      }

      this.setData({ loading: true })

      try {
        // 调用云函数验证手机号(直接获取,无需验证码)
        const res = await callCloud('userInit', {
          action: 'verifyPhoneNumber',
          code: code,
          cloudID: cloudID,
          encryptedData: encryptedData,
          iv: iv
        })

        if (res.success) {
          this.setData({
            isVerified: true,
            maskedPhone: this.maskPhone(res.phoneNumber),
            loading: false
          })

          // 触发父组件事件
          this.triggerEvent('verified', { 
            phoneNumber: res.phoneNumber,
            creditScore: res.creditScore
          })

          toast('验证成功,信用分 +5', 'success')
        } else {
          throw new Error(res.message || '验证失败')
        }
      } catch (err) {
        console.error('手机号验证失败:', err)
        toast(err.message || '验证失败')
        this.setData({ loading: false })
      }
    }
  }
})
