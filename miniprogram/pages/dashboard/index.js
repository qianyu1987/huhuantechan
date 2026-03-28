// pages/dashboard/index.js
// 运营数据看板 - 接入真实云数据库
const app = getApp()

Page({
  data: {
    loading: true,
    refreshing: false,
    range: 30,        // 时间范围（天）
    rangeOptions: [
      { label: '近7天',  value: 7 },
      { label: '近30天', value: 30 },
      { label: '近90天', value: 90 },
      { label: '全年',   value: 365 }
    ],
    rangeIndex: 1,    // 默认30天
    updateTime: '',

    // KPI
    kpi: {
      totalUsers:    0,
      totalProducts: 0,
      activeSwaps:   0,
      pendingReviews: 0,
      mysteryCount:  0,
      maleCount:     0,
      femaleCount:   0
    },

    // 省份排行
    provinces: [],

    // 品类分布
    categories: [],

    // 信用等级
    credits: [],

    // 订单漏斗
    funnel: [],

    // 底部小指标
    smItems: [],

    // 用户性别占比（简单计算）
    genderMalePct: 0,
    genderFemalePct: 0,

    // 错误提示
    errorMsg: ''
  },

  onLoad() {
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData(true)
  },

  onShow() {
    // 每次显示时更新时间
    this.setUpdateTime()
  },

  /** 切换时间范围 */
  onRangeChange(e) {
    const idx = parseInt(e.currentTarget.dataset.idx)
    const opt = this.data.rangeOptions[idx]
    this.setData({ rangeIndex: idx, range: opt.value })
    this.loadData()
  },

  /** 刷新按钮 */
  onRefresh() {
    this.loadData(true)
  },

  /** 更新时间显示 */
  setUpdateTime() {
    const now = new Date()
    const pad = n => String(n).padStart(2, '0')
    const t = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    this.setData({ updateTime: t })
  },

  /** 格式化数字 */
  fmt(n) {
    if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
    return (n || 0).toLocaleString()
  },

  /** 加载所有数据 */
  async loadData(isRefresh = false) {
    if (isRefresh) {
      this.setData({ refreshing: true })
    } else {
      this.setData({ loading: true, errorMsg: '' })
    }

    try {
      // 并行请求两个接口，用 allSettled 避免一个失败拖垮另一个
      const [statsSettled, detailSettled] = await Promise.allSettled([
        wx.cloud.callFunction({
          name: 'adminMgr',
          data: { action: 'getStats' }
        }),
        wx.cloud.callFunction({
          name: 'adminMgr',
          data: { action: 'getDashboardData', range: this.data.range }
        })
      ])

      const stats = (statsSettled.status === 'fulfilled' ? statsSettled.value.result : null) || {}
      const detail = (detailSettled.status === 'fulfilled' ? detailSettled.value.result : null) || {}

      // ── KPI ──
      const kpi = {
        totalUsers:     stats.totalUsers    || 0,
        totalProducts:  stats.totalProducts || 0,
        activeSwaps:    stats.activeSwaps   || 0,
        pendingReviews: stats.pendingReviews|| 0,
        mysteryCount:   stats.mysteryCount  || 0,
        maleCount:      stats.maleCount     || 0,
        femaleCount:    stats.femaleCount   || 0
      }

      // ── 省份排行 ──
      const provinces = (detail.provinces || []).map((p, i) => ({
        ...p,
        rank: i + 1,
        rankClass: i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal',
        pct: detail.provinces.length > 0
          ? Math.round(p.count / detail.provinces[0].count * 100)
          : 0
      }))

      // ── 品类分布 ──
      const catTotal = (detail.categories || []).reduce((s, c) => s + c.count, 0)
      const categories = (detail.categories || []).map(c => ({
        ...c,
        pct: catTotal > 0 ? Math.round(c.count / catTotal * 100) : 0
      }))

      // ── 信用等级 ──
      const creditTotal = (detail.credits || []).reduce((s, c) => s + c.count, 0)
      const CREDIT_CONFIG = [
        { name: '达人', icon: '👑', color: '#FFD60A', bg: 'rgba(255,214,10,0.15)' },
        { name: '信赖', icon: '⭐', color: '#FF9F0A', bg: 'rgba(255,159,10,0.15)' },
        { name: '普通', icon: '👤', color: '#0A84FF', bg: 'rgba(10,132,255,0.15)' },
        { name: '新手', icon: '🌱', color: '#8E8E93', bg: 'rgba(142,142,147,0.15)' }
      ]
      const credits = (detail.credits || []).map((c, i) => ({
        ...c,
        ...(CREDIT_CONFIG[i] || {}),
        pct: creditTotal > 0 ? Math.round(c.count / creditTotal * 100) : 0,
        barWidth: creditTotal > 0 ? Math.round(c.count / creditTotal * 100) : 0
      }))

      // ── 订单漏斗 ──
      const funnelMax = detail.funnel && detail.funnel.length ? detail.funnel[0].value : 1
      const funnel = (detail.funnel || []).map(f => ({
        ...f,
        pct: Math.round(f.value / funnelMax * 100),
        convPct: f.value // 原始值，模板里显示
      }))

      // ── 性别占比 ──
      const genderTotal = kpi.maleCount + kpi.femaleCount
      const genderMalePct = genderTotal > 0 ? Math.round(kpi.maleCount / genderTotal * 100) : 50
      const genderFemalePct = 100 - genderMalePct

      // ── 底部小指标 ──
      const smItems = [
        { icon: '💬', val: this.fmt(detail.totalReviews || 0),    label: '总评价数',   color: '#58a6ff' },
        { icon: '🎁', val: this.fmt(kpi.mysteryCount),             label: '惊喜特产',   color: '#bc8cff' },
        { icon: '📦', val: String(kpi.pendingReviews),             label: '待审核',     color: '#f78166' },
        { icon: '♻️', val: this.fmt(detail.completedSwaps || 0),   label: '已完成互换', color: '#3fb950' },
        { icon: '👦', val: genderMalePct + '%',                    label: '男性用户',   color: '#58a6ff' },
        { icon: '👧', val: genderFemalePct + '%',                  label: '女性用户',   color: '#ff6b8a' }
      ]

      this.setData({
        loading: false,
        refreshing: false,
        kpi,
        provinces,
        categories,
        credits,
        funnel,
        smItems,
        genderMalePct,
        genderFemalePct,
        errorMsg: ''
      })
      this.setUpdateTime()

    } catch (err) {
      console.error('[Dashboard] 数据加载失败', err)
      this.setData({
        loading: false,
        refreshing: false,
        errorMsg: '数据加载失败，请检查网络或云函数'
      })
    }

    if (isRefresh) {
      wx.stopPullDownRefresh()
    }
  }
})
