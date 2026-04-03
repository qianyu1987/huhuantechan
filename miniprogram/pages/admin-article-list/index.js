// pages/admin-article-list/index.js
const { callCloud } = require('../../utils/util')

Page({
  data: {
    articles: [],
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 20
  },

  onLoad() {
    this.loadArticles()
  },

  onShow() {
    // 每次显示时刷新列表
    this.setData({ page: 1, articles: [], hasMore: true })
    this.loadArticles()
  },

  onPullDownRefresh() {
    this.setData({ page: 1, articles: [], hasMore: true })
    this.loadArticles().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadArticles() {
    const { page, pageSize, articles } = this.data
    
    if (page === 1) {
      this.setData({ loading: true })
    }
    
    try {
      const result = await callCloud('syncOfficialArticles', {
        action: 'getList',
        page,
        pageSize
      })
      
      if (result.success) {
        const newArticles = page === 1 ? result.list : [...articles, ...result.list]
        this.setData({
          articles: newArticles,
          hasMore: newArticles.length < result.total,
          page: page + 1
        })
      }
    } catch (e) {
      console.error('加载失败:', e)
    } finally {
      this.setData({ loading: false })
    }
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadArticles()
    }
  },

  // 同步示例文章
  syncArticles() {
    wx.showModal({
      title: '同步示例文章',
      content: '将添加5篇示例文章，是否继续？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '同步中...' })
          try {
            const result = await callCloud('syncOfficialArticles', { action: 'sync' })
            wx.showToast({ title: result.message || '同步完成', icon: 'success' })
            this.setData({ page: 1, articles: [], hasMore: true })
            this.loadArticles()
          } catch (e) {
            wx.showToast({ title: '同步失败', icon: 'none' })
          } finally {
            wx.hideLoading()
          }
        }
      }
    })
  },

  // 跳转到添加文章
  goToAdd() {
    wx.navigateTo({ url: '/pages/admin-article-edit/index' })
  },

  // 跳转到编辑文章
  goToEdit(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/admin-article-edit/index?id=${id}` })
  },

  // 删除文章
  deleteArticle(e) {
    const { id, title } = e.currentTarget.dataset
    
    wx.showModal({
      title: '确认删除',
      content: `确定删除 "${title}" 吗？`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' })
          try {
            await callCloud('syncOfficialArticles', {
              action: 'deleteArticle',
              id
            })
            
            const articles = this.data.articles.filter(a => a._id !== id)
            this.setData({ articles })
            wx.showToast({ title: '删除成功', icon: 'success' })
          } catch (e) {
            wx.showToast({ title: '删除失败', icon: 'none' })
          } finally {
            wx.hideLoading()
          }
        }
      }
    })
  },

  // 预览文章
  goToDetail(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/article-detail/index?id=${id}` })
  }
})