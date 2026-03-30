// pages/daigou-benefits/index.js
// 等级权益说明页面
const { callCloud, toast } = require('../../utils/util')

Page({
  data: {
    myLevelInfo: null,
    loading: true
  },

  onLoad() {
    this.loadMyLevelInfo()
  },

  async loadMyLevelInfo() {
    this.setData({ loading: true })
    try {
      const res = await callCloud('daigouMgr', { action: 'getVerifyStatus' })
      if (res.success && res.levelInfo) {
        // 计算进度
        const levelInfo = res.levelInfo
        const progress = this.calculateProgress(levelInfo)
        
        this.setData({
          myLevelInfo: {
            ...levelInfo,
            progress: progress.progress,
            remaining: progress.remaining
          },
          loading: false
        })
      } else {
        this.setData({ loading: false })
      }
    } catch (e) {
      console.error('loadMyLevelInfo error:', e)
      toast('加载失败')
      this.setData({ loading: false })
    }
  },

  // 计算等级进度
  calculateProgress(levelInfo) {
    const currentLevel = levelInfo.level || 1
    const completedOrders = levelInfo.completedOrders || 0
    
    // 等级对应的订单要求
    const levelRequirements = {
      1: 10,  // V1 需要 10 笔
      2: 50,  // V2 需要 50 笔
      3: 200, // V3 需要 200 笔
      4: 500  // V4 需要 500 笔
    }
    
    // 计算当前等级的进度
    let targetOrders = levelRequirements[currentLevel]
    let nextLevelOrders = levelRequirements[currentLevel + 1] || levelRequirements[currentLevel]
    
    let progress = 0
    let remaining = 0
    
    if (currentLevel < 4) {
      progress = Math.min(100, Math.round((completedOrders / nextLevelOrders) * 100))
      remaining = Math.max(0, nextLevelOrders - completedOrders)
    } else {
      // 已经是最高等级
      progress = 100
      remaining = 0
    }
    
    return { progress, remaining }
  },

  // 刷新等级信息
  refreshLevelInfo() {
    this.loadMyLevelInfo()
  },

  // 跳转到押金管理页面
  goToDepositPage() {
    wx.navigateTo({ url: '/pages/daigou-deposit/index' })
  }
})