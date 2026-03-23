// pages/user-profile/index.js
const { PROVINCES, MYSTERY_EMOJIS } = require('../../utils/constants')
const { callCloud, formatTime, formatValue, getCreditLevel, getProvinceByCode, getProvinceByName, toast, processImageUrl } = require('../../utils/util')

const STATUS_MAP = {
  active: { label: '可换', cls: 'status-active' },
  in_swap: { label: '匹配中', cls: 'status-swap' },
  swapped: { label: '已换', cls: 'status-done' }
}

Page({
  data: {
    loading: true,
    openid: '',
    profile: null,
    products: [],
    reviews: [],
    reviewCount: 0,
    // 展示字段
    creditClass: 'credit-high',
    creditLevel: '',
    joinDays: 0,
    badgeList: [],
    badgeCount: 0
  },

  onLoad(options) {
    // 兼容 openid 和 _openid 两种参数名
    const openid = options.openid || options._openid
    if (!openid) {
      toast('参数错误')
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }
    this.setData({ openid })
    this.loadProfile(openid)
  },

  async loadProfile(openid) {
    this.setData({ loading: true })
    try {
      const [profileRes, reviewRes] = await Promise.all([
        callCloud('userInit', { action: 'publicProfile', targetOpenid: openid }),
        callCloud('reviewMgr', { action: 'list', targetOpenid: openid, pageSize: 5 })
      ])

      if (!profileRes || !profileRes.success) {
        toast('用户不存在')
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }

      const p = profileRes.profile
      const creditInfo = getCreditLevel(p.creditScore || 100)

      // 计算加入天数
      let joinDays = 0
      if (p.createTime) {
        const created = new Date(p.createTime)
        joinDays = Math.max(1, Math.floor((Date.now() - created.getTime()) / 86400000))
      }

      // 处理省份集章
      const badges = p.provincesBadges || []
      const badgeList = badges.map(code => {
        const prov = getProvinceByCode(code)
        return prov ? { code, name: prov.name, color: prov.color } : null
      }).filter(Boolean)

      // 处理产品列表
      const products = (profileRes.products || []).map(item => {
        const prov = item.province ? getProvinceByCode(item.province) : (item.provinceName ? getProvinceByName(item.provinceName) : null)
        const provinceName = prov ? prov.name : (item.provinceName || '')
        const provinceColor = prov ? prov.color : '#FF375F'
        const valueLabel = (item.valueMin && item.valueMax) ? formatValue(item.valueMin, item.valueMax) : ''

        const isMystery = item.isMystery || false
        const sm = STATUS_MAP[item.status] || STATUS_MAP.active
        if (isMystery) {
          const provName = provinceName || '神秘'
          const code = provName.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
          return {
            ...item,
            isMystery: true,
            colorClass: `color-${(code % 10) + 1}`,
            emoji: MYSTERY_EMOJIS[code % MYSTERY_EMOJIS.length],
            mysteryProvince: provName,
            provinceName: provName,
            provinceColor,
            valueLabel,
            statusLabel: sm.label,
            statusCls: sm.cls
          }
        }
        return {
          ...item,
          coverUrl: item.coverUrl || (item.images && item.images[0] ? processImageUrl(item.images[0]) : ''),
          provinceName,
          provinceColor,
          valueLabel,
          statusLabel: sm.label,
          statusCls: sm.cls
        }
      })

      // 处理评价
      let reviews = []
      let reviewCount = 0
      if (reviewRes && reviewRes.success && reviewRes.list) {
        reviews = reviewRes.list.map(r => {
          const isGood = r.rating === 1 || r.rating >= 4
          return {
            ...r,
            reviewerName: r.reviewer?.nickName || '匿名用户',
            reviewerAvatar: r.reviewer?.avatarUrl || '',
            ratingLabel: isGood ? '👍 好评' : '👎 差评',
            ratingClass: isGood ? 'good' : 'bad',
            timeText: formatTime(r.createTime)
          }
        })
        reviewCount = reviewRes.total || reviews.length
      }

      const province = getProvinceByCode(p.province)

      this.setData({
        loading: false,
        profile: {
          ...p,
          provinceName: province ? province.name : ''
        },
        products,
        reviews,
        reviewCount,
        creditClass: creditInfo.class,
        creditLevel: creditInfo.level,
        joinDays,
        badgeList,
        badgeCount: badgeList.length
      })

      wx.setNavigationBarTitle({ title: p.nickName || '用户主页' })
    } catch (e) {
      console.error('加载用户主页失败', e)
      toast('加载失败')
    } finally {
      this.setData({ loading: false })
    }
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: `/pages/detail/index?id=${id}` })
  },

  previewAvatar() {
    const url = this.data.profile?.avatarUrl
    if (url) wx.previewImage({ urls: [url], current: url })
  }
})
