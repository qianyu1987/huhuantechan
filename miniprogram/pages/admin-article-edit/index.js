// pages/admin-article-edit/index.js
const { callCloud, showLoading, hideLoading } = require('../../utils/util')

Page({
  data: {
    isEdit: false,
    articleId: null,
    form: {
      title: '',
      summary: '',
      coverUrl: '',
      content: '',
      sourceUrl: ''
    }
  },

  onLoad(options) {
    if (options.id) {
      this.setData({
        isEdit: true,
        articleId: options.id
      })
      wx.setNavigationBarTitle({ title: '编辑文章' })
      this.loadArticle(options.id)
    } else {
      wx.setNavigationBarTitle({ title: '添加文章' })
    }
  },

  async loadArticle(id) {
    showLoading('加载中...')
    try {
      const result = await callCloud('syncOfficialArticles', {
        action: 'getDetail',
        id
      })
      
      if (result.success && result.article) {
        const { title, summary, coverUrl, content, sourceUrl } = result.article
        this.setData({
          form: { title, summary, coverUrl, content, sourceUrl: sourceUrl || '' }
        })
      }
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      hideLoading()
    }
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({
      [`form.${field}`]: e.detail.value
    })
  },

  // 选择封面图片
  async chooseCover() {
    try {
      const res = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera']
      })
      
      const tempFilePath = res.tempFiles[0].tempFilePath
      
      wx.showLoading({ title: '上传中...' })
      
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: `article-covers/${Date.now()}.jpg`,
        filePath: tempFilePath
      })
      
      this.setData({
        'form.coverUrl': uploadRes.fileID
      })
      
      wx.hideLoading()
      wx.showToast({ title: '上传成功', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      console.error('上传失败:', e)
      wx.showToast({ title: '上传失败', icon: 'none' })
    }
  },

  // 删除封面
  deleteCover() {
    this.setData({
      'form.coverUrl': ''
    })
  },

  // 保存文章
  async saveArticle() {
    const { form, isEdit, articleId } = this.data
    
    if (!form.title.trim()) {
      wx.showToast({ title: '请输入标题', icon: 'none' })
      return
    }
    
    if (!form.summary.trim()) {
      wx.showToast({ title: '请输入摘要', icon: 'none' })
      return
    }
    
    wx.showLoading({ title: '保存中...' })
    
    try {
      if (isEdit) {
        // 删除旧文章，添加新文章
        await callCloud('syncOfficialArticles', {
          action: 'deleteArticle',
          id: articleId
        })
      }
      
      const result = await callCloud('syncOfficialArticles', {
        action: 'addArticle',
        title: form.title,
        summary: form.summary,
        coverUrl: form.coverUrl,
        content: form.content,
        sourceUrl: form.sourceUrl
      })
      
      if (result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        wx.showToast({ title: result.message || '保存失败', icon: 'none' })
      }
    } catch (e) {
      console.error('保存失败:', e)
      wx.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  goBack() {
    wx.navigateBack()
  }
})