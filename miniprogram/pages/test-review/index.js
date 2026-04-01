// pages/test-review/index.js - 测试评价云函数
Page({
  data: {
    myReviewsResult: null,
    receivedReviewsResult: null,
    loading: false,
    error: null
  },

  onLoad() {
    this.testReviewMgr()
  },

  async testReviewMgr() {
    this.setData({ loading: true, error: null })
    
    try {
      console.log('开始测试reviewMgr云函数...')
      
      // 测试myReviews
      const myReviewsRes = await this.callReviewMgr('myReviews')
      console.log('myReviews结果:', myReviewsRes)
      
      // 测试receivedReviews  
      const receivedReviewsRes = await this.callReviewMgr('receivedReviews')
      console.log('receivedReviews结果:', receivedReviewsRes)
      
      this.setData({
        myReviewsResult: myReviewsRes,
        receivedReviewsResult: receivedReviewsRes,
        loading: false
      })
      
    } catch (e) {
      console.error('测试失败:', e)
      this.setData({ error: e.message, loading: false })
    }
  },

  async callReviewMgr(action) {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'reviewMgr',
        data: { action, page: 1, pageSize: 20 },
        success: (res) => {
          console.log(`reviewMgr.${action}成功:`, res)
          resolve(res.result)
        },
        fail: (err) => {
          console.error(`reviewMgr.${action}失败:`, err)
          reject(err)
        }
      })
    })
  },

  copyResult(e) {
    const type = e.currentTarget.dataset.type
    const result = type === 'my' ? this.data.myReviewsResult : this.data.receivedReviewsResult
    
    if (!result) {
      wx.showToast({ title: '无数据', icon: 'none' })
      return
    }
    
    const text = JSON.stringify(result, null, 2)
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
      }
    })
  },

  reTest() {
    this.testReviewMgr()
  }
})