// pages/article-list/index.js
const { callCloud } = require('../../utils/util')

Page({
  data: {
    articles: [],
    loading: false,
    page: 1,
    pageSize: 10
  },

  onLoad() {
    this.loadArticles()
  },

  async loadArticles() {
    const { page, pageSize } = this.data
    
    this.setData({ loading: true })
    
    try {
      const result = await callCloud('syncOfficialArticles', {
        action: 'getList',
        page,
        pageSize
      })
      
      if (result.success && result.list) {
        const newArticles = result.list.map(article => ({
          ...article,
          publishTimeText: this.formatTime(article.publishTime)
        }))
        
        this.setData({
          articles: newArticles,
          page: page + 1
        })
      }
    } catch (e) {
      console.error('加载文章失败:', e)
    } finally {
      this.setData({ loading: false })
    }
  },

  formatTime(time) {
    if (!time) return ''
    const date = new Date(time)
    const now = new Date()
    const diff = now - date
    const days = Math.floor(diff / 86400000)
    
    if (days === 0) return '今天'
    if (days === 1) return '昨天'
    if (days < 7) return `${days}天前`
    
    return `${date.getMonth() + 1}月${date.getDate()}日`
  },

  goToDetail(e) {
    const { id, url } = e.currentTarget.dataset
    
    // 如果有公众号文章链接，使用官方接口打开
    if (url && url.includes('mp.weixin.qq.com')) {
      // 使用 wx.openOfficialAccountArticle 打开公众号文章
      // 需要基础库 >= 3.4.8
      if (wx.openOfficialAccountArticle) {
        wx.openOfficialAccountArticle({
          url: url,
          success: () => {
            console.log('打开公众号文章成功')
          },
          fail: (err) => {
            console.error('打开公众号文章失败:', err)
            // 如果失败，使用 web-view 打开（需要配置业务域名）
            wx.navigateTo({
              url: `/pages/article-detail/index?id=${id}`
            })
          }
        })
      } else {
        // 基础库版本过低，使用 web-view
        wx.navigateTo({
          url: `/pages/article-detail/index?id=${id}`
        })
      }
    } else {
      // 内部文章，跳转到详情页
      wx.navigateTo({
        url: `/pages/article-detail/index?id=${id}`
      })
    }
  },

  goBack() {
    wx.navigateBack()
  }
})