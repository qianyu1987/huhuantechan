// pages/daigou-deposit/index.js
// 押金管理页面 - 显示押金状态，引导用户联系客服
const { callCloud, toast } = require('../../utils/util')

Page({
  data: {
    depositStatus: 'inactive', // active | inactive
    depositAmount: 0,
    loading: true
  },

  onLoad() {
    this.loadDepositStatus()
  },

  async loadDepositStatus() {
    this.setData({ loading: true })
    try {
      const res = await callCloud('daigouMgr', { action: 'getDepositStatus' })
      if (res.success) {
        this.setData({
          depositStatus: res.status || 'inactive',
          depositAmount: res.amount || 0,
          loading: false
        })
      } else {
        toast(res.message || '加载失败')
        this.setData({ loading: false })
      }
    } catch (e) {
      console.error('loadDepositStatus error:', e)
      toast('加载失败')
      this.setData({ loading: false })
    }
  },

  // 复制客服微信
  copyWechat() {
    wx.setClipboardData({
      data: 'xiaoqiange12315',
      success: () => {
        toast('客服微信已复制', 'success')
      },
      fail: () => {
        toast('复制失败，请手动复制')
      }
    })
  },

  // 拨打电话
  makeCall() {
    wx.makePhoneCall({
      phoneNumber: '4001234567',
      fail: () => {
        toast('拨打电话失败')
      }
    })
  },

  // 刷新押金状态
  refreshStatus() {
    this.loadDepositStatus()
  },

  // 跳转到押金申请页面
  goToApply() {
    wx.navigateTo({ url: '/pages/deposit-apply/index' })
  },

  // 跳转到等级页面
  goToLevelPage() {
    wx.navigateTo({ url: '/pages/daigou-level/index' })
  }
})