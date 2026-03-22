// pages/credit/index.js - 信用记录
const { getCreditLevel, callCloud, formatTime } = require('../../utils/util')
const { CREDIT_TIERS } = require('../../utils/constants')

Page({
  data: {
    creditScore: 100,
    creditInfo: {},
    allTiers: [],
    records: [],
    myPoints: 0,
    pointsLogs: [],
    activeTab: 'credit' // 'credit' | 'points'
  },

  onLoad() {
    this.loadCreditData()
  },

  async loadCreditData() {
    const app = getApp()
    const creditScore = app.globalData.creditScore || 100
    const creditInfo = getCreditLevel(creditScore)

    // 为每个等级标记是否为当前等级、是否已达成
    const allTiers = CREDIT_TIERS.map(t => ({
      ...t,
      isCurrent: creditScore >= t.minScore && creditScore <= t.maxScore,
      isAchieved: creditScore >= t.minScore
    }))

    this.setData({
      creditScore,
      creditInfo,
      allTiers
    })

    // 并行加载信用记录和积分数据
    this.loadRecords()
    this.loadPoints()
  },

  async loadRecords() {
    try {
      const res = await callCloud('reviewMgr', { action: 'creditLogs' })
      if (res.success && res.list) {
        const records = res.list.map(item => ({
          ...item,
          icon: item.change > 0 ? '📈' : '📉',
          time: formatTime(item.createTime)
        }))
        this.setData({ records })
      }
    } catch (e) {
      console.log('信用记录加载失败', e)
      this.setData({ records: [] })
    }
  },

  async loadPoints() {
    try {
      // 获取积分余额
      const statsRes = await callCloud('userInit', { action: 'getStats' })
      if (statsRes && statsRes.success) {
        this.setData({ myPoints: statsRes.points || 0 })
      }

      // 获取积分明细
      const logsRes = await callCloud('reviewMgr', { action: 'pointsLogs' })
      if (logsRes.success && logsRes.list) {
        const TYPE_MAP = {
          invite: { label: '邀请好友奖励', icon: '🎁' },
          invited: { label: '被邀请注册奖励', icon: '🎉' },
          first_swap_bonus: { label: '首次分享奖励', icon: '🎊' },
          invitee_first_swap: { label: '好友首次分享奖励', icon: '🤝' },
          admin_add: { label: '管理员增加', icon: '📥' },
          admin_deduct: { label: '管理员扣除', icon: '📤' }
        }
        const pointsLogs = logsRes.list.map(item => {
          const typeInfo = TYPE_MAP[item.type] || { label: item.desc || '积分变动', icon: '💰' }
          return {
            ...item,
            label: typeInfo.label,
            icon: typeInfo.icon,
            time: formatTime(item.createTime)
          }
        })
        this.setData({ pointsLogs })
      }
    } catch (e) {
      console.log('积分数据加载失败', e)
    }
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab })
  },

  goInvite() {
    wx.navigateTo({ url: '/pages/invitedFriends/index' })
  },

  goBack() {
    wx.navigateBack()
  }
})
