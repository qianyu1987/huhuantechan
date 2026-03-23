// pages/mystery/index.js - 神秘特产
const { callCloud, getProvinceByCode } = require('../../utils/util')
const { PRODUCT_CATEGORIES, VALUE_RANGES, MYSTERY_EMOJIS } = require('../../utils/constants')

// 省份到颜色的映射（基于省份简称生成稳定的颜色）
const PROVINCE_COLORS = {
  '北京': 'color-1', '天津': 'color-2', '河北': 'color-3', '山西': 'color-4',
  '内蒙古': 'color-5', '辽宁': 'color-6', '吉林': 'color-7', '黑龙江': 'color-8',
  '上海': 'color-9', '江苏': 'color-10', '浙江': 'color-1', '安徽': 'color-2',
  '福建': 'color-3', '江西': 'color-4', '山东': 'color-5', '河南': 'color-6',
  '湖北': 'color-7', '湖南': 'color-8', '广东': 'color-9', '广西': 'color-10',
  '海南': 'color-1', '重庆': 'color-2', '四川': 'color-3', '贵州': 'color-4',
  '云南': 'color-5', '西藏': 'color-6', '陕西': 'color-7', '甘肃': 'color-8',
  '青海': 'color-9', '宁夏': 'color-10', '新疆': 'color-1', '台湾': 'color-2',
  '香港': 'color-3', '澳门': 'color-4'
}

Page({
  data: {
    myProducts: [],      // 我发布的神秘特产
    activeSwaps: [],     // 进行中的神秘互换
    loading: true
  },

  // 获取稳定的颜色分类
  getColorClass(provinceName) {
    if (!provinceName) return 'color-1'
    // 使用省份名称的字符码生成稳定的颜色索引
    const code = provinceName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const colors = ['color-1', 'color-2', 'color-3', 'color-4', 'color-5',
                    'color-6', 'color-7', 'color-8', 'color-9', 'color-10']
    return colors[code % colors.length]
  },

  // 获取随机的emoji
  getEmoji(index) {
    return MYSTERY_EMOJIS[index % MYSTERY_EMOJIS.length]
  },

  onLoad() {
    this.loadData()
  },

  onShow() {
    this.loadData()
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      // 获取我发布的神秘特产
      const productsRes = await callCloud('productMgr', {
        action: 'myList',
        isMystery: true
      })
      
      let myProducts = []
      if (productsRes.success && productsRes.list) {
        myProducts = productsRes.list.map((p, index) => {
          const prov = getProvinceByCode(p.province)
          const provinceName = prov ? prov.name : (p.province || '神秘')
          return {
            ...p,
            coverUrl: p.images?.[0] || '',
            provinceName,
            categoryName: '',
            valueRangeLabel: '',
            createTimeText: this.formatTime(p.createTime),
            // 添加颜色和emoji
            colorClass: this.getColorClass(provinceName),
            emoji: this.getEmoji(index)
          }
        })
      }

      // 获取进行中的神秘互换订单
      const ordersRes = await callCloud('orderMgr', {
        action: 'mysteryList'
      })
      
      let activeSwaps = []
      if (ordersRes.success && ordersRes.list) {
        activeSwaps = ordersRes.list.map(o => {
          return {
            id: o._id,
            myProductImage: o.initiatorProduct?.images?.[0] || '',
            partnerName: o.counterpart?.nickName || '',
            status: o.status,
            createTimeText: this.formatTime(o.createTime)
          }
        })
      }

      this.setData({
        myProducts,
        activeSwaps,
        loading: false
      })
    } catch (e) {
      console.error('加载神秘特产数据失败:', e)
      this.setData({ loading: false })
    }
  },

  // 格式化时间
  formatTime(time) {
    if (!time) return ''
    const date = new Date(time)
    const month = date.getMonth() + 1
    const day = date.getDate()
    return `${month}月${day}日`
  },

  // 跳转到发布页面（神秘特产模式）
  goToPublish() {
    wx.navigateTo({
      url: '/pages/publish/index?mystery=1'
    })
  },

  // 跳转到特产详情
  goToProductDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/detail/index?id=${id}`
    })
  },

  // 跳转到互换详情
  goToSwapDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/order-detail/index?id=${id}`
    })
  },

  goBack() {
    wx.navigateBack()
  }
})
