// pages/invitedFriends/index.js
const { callCloud, toast } = require('../../utils/util')

Page({
  data: {
    inviteCode: '',
    qrcodeUrl: '',
    inviteCount: 0,
    inviteList: [],
    userInfo: null,
    myPoints: 0,
    rewardSummary: {
      signupRewards: 0,
      swapRewards: 0,
      totalRewards: 0,
      firstSwapCount: 0
    }
  },

  onLoad() {
    this.loadInviteData()
  },

  onShow() {
    const app = getApp()
    this.setData({
      userInfo: app.globalData.userInfo
    })
  },

  async loadInviteData() {
    try {
      const res = await callCloud('userInit', { action: 'getInviteData' })
      if (res) {
        this.setData({
          inviteCode: res.inviteCode || '',
          inviteCount: res.inviteCount || 0,
          inviteList: res.inviteList || [],
          myPoints: res.myPoints || 0,
          rewardSummary: res.rewardSummary || this.data.rewardSummary
        })
        // 生成小程序码
        if (res.inviteCode) {
          this.generateQrcode(res.inviteCode)
        }
      }
    } catch (e) {
      console.error('加载邀请数据失败', e)
      // 使用 openid 作为邀请码
      const openid = getApp().globalData.openid
      if (openid) {
        const inviteCode = openid.slice(-6).toUpperCase()
        this.setData({ inviteCode })
        this.generateQrcode(inviteCode)
      }
    }
  },

  async generateQrcode(inviteCode) {
    try {
      wx.showLoading({ title: '生成中...' })
      const res = await wx.cloud.callFunction({
        name: 'userInit',
        data: {
          action: 'getQrcode',
          inviteCode: inviteCode
        }
      })
      wx.hideLoading()
      if (res.result && res.result.fileID) {
        // 获取临时链接
        const fileRes = await wx.cloud.getTempFileURL({
          fileList: [res.result.fileID]
        })
        if (fileRes.fileList && fileRes.fileList[0]) {
          this.setData({
            qrcodeUrl: fileRes.fileList[0].tempFileURL
          })
        }
      }
    } catch (e) {
      wx.hideLoading()
      console.error('生成二维码失败', e)
      // 使用本地生成方式作为备选
      this.setData({
        qrcodeUrl: `https://mp.weixin.qq.com/a/~~/cgi-bin/qrcode?action=show&expire=2592000&invite=${inviteCode}`
      })
    }
  },

  // 复制邀请码
  copyInviteCode() {
    if (this.data.inviteCode) {
      wx.setClipboardData({
        data: this.data.inviteCode,
        success: () => {
          toast('邀请码已复制', 'success')
        }
      })
    }
  },

  // 分享给好友
  onShareAppMessage() {
    const inviteCode = this.data.inviteCode
    return {
      title: '特产分享 - 邀请好友一起玩',
      path: `/pages/index/index?inviteCode=${inviteCode}`,
      imageUrl: '/images/share-cover.png'
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    const inviteCode = this.data.inviteCode
    return {
      title: '特产分享 - 邀请好友一起玩',
      query: `inviteCode=${inviteCode}`
    }
  },

  // 保存图片到相册
  async saveQrcode() {
    if (!this.data.qrcodeUrl) {
      toast('暂无二维码')
      return
    }

    try {
      // 下载图片
      const downloadRes = await wx.downloadFile({
        url: this.data.qrcodeUrl
      })

      // 保存到相册
      await wx.saveImageToPhotosAlbum({
        filePath: downloadRes.tempFilePath
      })

      toast('已保存到相册', 'success')
    } catch (e) {
      console.error('保存失败', e)
      if (e && e.errMsg && e.errMsg.indexOf('auth deny') !== -1) {
        // 需要授权
        wx.openSetting()
      } else {
        toast('保存失败')
      }
    }
  },

  // 邀请好友按钮
  inviteFriends() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
  },

  // 跳转积分规则页面
  goToPointsRule() {
    wx.navigateTo({ url: '/pages/points-rule/index' })
  }
})
