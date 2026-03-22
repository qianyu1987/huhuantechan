// pages/favorites/index.js - 我的收藏
const { callCloud, processImageUrl, getProvinceByCode, toast } = require('../../utils/util')

Page({
  data: {
    favorites: [],
    loading: true,
    refreshing: false
  },

  onLoad() {
    this.loadFavorites()
  },

  onShow() {
    if (this.data._hasLoaded) {
      this.loadFavorites()
    }
  },

  async loadFavorites() {
    if (!this.data._hasLoaded) {
      this.setData({ loading: true })
    }
    try {
      const res = await callCloud('productMgr', { action: 'myFavorites' })
      const list = (res.list || []).map(item => {
        const province = getProvinceByCode(item.province)
        return {
          ...item,
          coverUrl: item.images?.[0] ? processImageUrl(item.images[0]) : '',
          provinceName: province?.name || '未知',
          provinceColor: province?.color || '#999'
        }
      })
      this.setData({ favorites: list })
    } catch (e) {
      console.error('加载收藏失败', e)
      if (!this.data._hasLoaded) {
        toast('加载失败')
      }
    } finally {
      this.setData({ loading: false, refreshing: false, _hasLoaded: true })
    }
  },

  onRefresh() {
    this.setData({ refreshing: true })
    this.loadFavorites()
  },

  goBack() {
    wx.navigateBack()
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/detail/index?id=${id}` })
  },

  removeFavorite(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '取消收藏',
      content: '确定要取消收藏吗？',
      confirmText: '取消收藏',
      confirmColor: '#FF453A',
      success: async (res) => {
        if (res.confirm) {
          try {
            await callCloud('productMgr', { action: 'removeFavorite', productId: id })
            const { favorites } = this.data
            this.setData({
              favorites: favorites.filter(item => item._id !== id)
            })
            toast('已取消收藏')
          } catch (e) {
            toast('操作失败')
          }
        }
      }
    })
  }
})
