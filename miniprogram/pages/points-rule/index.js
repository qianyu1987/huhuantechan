// pages/points-rule/index.js
const { callCloud } = require('../../utils/util')

Page({
  data: {
    points: 0
  },

  onLoad() {
    this.loadPoints()
  },

  onShow() {
    this.loadPoints()
  },

  async loadPoints() {
    try {
      const res = await callCloud('userInit', { action: 'init' })
      if (res) {
        this.setData({ points: res.points || 0 })
      }
    } catch (e) {
      console.error('获取积分失败', e)
    }
  },

  goInvite() {
    wx.navigateTo({ url: '/pages/invitedFriends/index' })
  },

  goBack() {
    wx.navigateBack()
  }
})
