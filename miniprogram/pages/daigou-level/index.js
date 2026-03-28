// pages/daigou-level/index.js
// 代购等级体系展示页面
const { callCloud, toast } = require('../../utils/util')

Page({
  data: {
    levels: [],
    myLevelInfo: null,
    myStats: null,
    loading: true
  },

  async onLoad() {
    this.setData({ loading: true })
    try {
      const [levelsRes, statusRes] = await Promise.all([
        callCloud('daigouMgr', { action: 'getDaigouLevels' }),
        callCloud('daigouMgr', { action: 'getVerifyStatus' })
      ])
      this.setData({
        levels: levelsRes.levels || [],
        myLevelInfo: statusRes.levelInfo || null,
        myStats: statusRes.stats || null,
        loading: false
      })
    } catch (e) {
      toast('加载失败')
      this.setData({ loading: false })
    }
  }
})
