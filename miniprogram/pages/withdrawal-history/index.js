// pages/withdrawal-history/index.js - 提现记录页面
const { callCloud, toast } = require('../../utils/util')

Page({
  data: {
    // 记录列表
    recordList: [],
    page: 1,
    pageSize: 10,
    loading: false,
    noMore: false,
    
    // 筛选状态
    filterStatus: '',
    
    // 状态文本映射
    statusTextMap: {
      '': '全部',
      'pending': '待审核',
      'approved': '已通过',
      'rejected': '已拒绝',
      'cancelled': '已取消'
    }
  },

  onLoad(options) {
    // 如果有传入筛选状态
    if (options.status) {
      this.setData({
        filterStatus: options.status
      })
    }
    this.loadRecords(true)
  },

  onShow() {
    // 页面显示时刷新数据
    this.loadRecords(true)
  },

  // 返回上一页
  goBack() {
    wx.navigateBack()
  },

  // 获取状态文本
  getStatusText(status) {
    return this.data.statusTextMap[status] || status
  },

  // 切换筛选状态
  changeFilter(e) {
    const status = e.currentTarget.dataset.status
    if (this.data.filterStatus === status) {
      return
    }
    
    this.setData({
      filterStatus: status,
      recordList: [],
      page: 1,
      noMore: false
    })
    
    this.loadRecords(true)
  },

  // 加载记录
  async loadRecords(reset = false) {
    if (this.data.loading) {
      return
    }
    
    if (reset) {
      this.setData({
        page: 1,
        noMore: false,
        loading: true
      })
    } else {
      this.setData({ loading: true })
    }
    
    const { page, pageSize, filterStatus } = this.data
    
    try {
      const res = await callCloud('paymentMgr', {
        action: 'getMyWithdrawalApplies',
        page: reset ? 1 : page,
        pageSize,
        status: filterStatus || ''
      })
      
      if (res && res.success) {
        const newList = reset ? res.list : [...this.data.recordList, ...res.list]
        const noMore = newList.length >= res.total
        
        this.setData({
          recordList: newList,
          page: reset ? 2 : page + 1,
          noMore,
          loading: false
        })
      } else {
        this.setData({ loading: false })
        toast(res.message || '加载记录失败', 'error')
      }
    } catch (e) {
      this.setData({ loading: false })
      console.error('加载提现记录失败', e)
      toast('加载失败，请重试', 'error')
    }
  },

  // 加载更多
  loadMore() {
    if (this.data.loading || this.data.noMore) {
      return
    }
    this.loadRecords(false)
  },

  // 取消提现申请
  async cancelWithdrawal(e) {
    const id = e.currentTarget.dataset.id
    if (!id) {
      return
    }
    
    // 确认取消
    wx.showModal({
      title: '确认取消',
      content: '确定要取消此提现申请吗？取消后金额将返还到钱包余额。',
      success: async (res) => {
        if (res.confirm) {
          await this.doCancelWithdrawal(id)
        }
      }
    })
  },

  // 执行取消操作
  async doCancelWithdrawal(id) {
    wx.showLoading({ title: '处理中...' })
    
    try {
      const res = await callCloud('paymentMgr', {
        action: 'cancelWithdrawalApply',
        applyId: id
      })
      
      wx.hideLoading()
      
      if (res && res.success) {
        toast('取消成功', 'success')
        // 刷新列表
        this.loadRecords(true)
        // 通知钱包页面刷新
        this.notifyWalletRefresh()
      } else {
        toast(res.message || '取消失败', 'error')
      }
    } catch (e) {
      wx.hideLoading()
      console.error('取消提现申请失败', e)
      toast('取消失败，请重试', 'error')
    }
  },

  // 通知钱包页面刷新
  notifyWalletRefresh() {
    const pages = getCurrentPages()
    const walletPage = pages.find(page => page.route === 'pages/wallet/index')
    if (walletPage) {
      walletPage.loadWalletData && walletPage.loadWalletData()
    }
    
    const withdrawalPage = pages.find(page => page.route === 'pages/withdrawal/index')
    if (withdrawalPage) {
      withdrawalPage.loadWithdrawalConfig && withdrawalPage.loadWithdrawalConfig()
    }
  }
})