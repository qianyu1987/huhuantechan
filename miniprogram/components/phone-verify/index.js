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
    loading: false
  },

  lifetimes: {
    attached() {
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

    // 获取手机号回调(微信原生方案)
    async onGetPhoneNumber(e) {
      console.log('getPhoneNumber callback:', e.detail)
      
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
