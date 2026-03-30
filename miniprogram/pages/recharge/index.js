// pages/recharge/index.js
const { callCloud, toast } = require('../../utils/util')

const PRESETS = [50, 100, 200, 500, 1000]
const ADMIN_WECHAT = 'xiaoqiange12315'

Page({
  data: {
    presets: PRESETS,
    selectedPreset: null,    // 选中的预设金额索引
    customAmount: '',        // 自定义输入金额
    currentAmount: 0,        // 当前选择的充值金额
    remark: '',              // 备注（转账备注）
    walletBalance: 0,        // 当前余额
    submitting: false,
    // 申请记录
    applyList: [],
    applyTotal: 0,
    applyPage: 1,
    applyLoading: false,
    // 结果弹窗
    showResultModal: false,
    resultApplyNo: '',
    resultAmount: 0,
    resultCreateTime: ''
  },

  onLoad() {
    this.loadBalance()
    this.loadApplyList(true)
  },

  onShow() {
    this.loadBalance()
    this.loadApplyList(true)
  },

  // 加载余额
  async loadBalance() {
    try {
      const res = await callCloud('paymentMgr', { action: 'getWalletInfo' })
      if (res && res.success !== false) {
        this.setData({ walletBalance: res.walletBalance || 0 })
      }
    } catch (e) {
      console.error('加载余额失败', e)
    }
  },

  // 选择预设金额
  onSelectPreset(e) {
    const idx = e.currentTarget.dataset.index
    const amount = PRESETS[idx]
    this.setData({
      selectedPreset: idx,
      customAmount: '',
      currentAmount: amount
    })
  },

  // 输入自定义金额
  onCustomAmountInput(e) {
    const val = e.detail.value
    // 只允许数字和小数点
    const cleaned = val.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
    const amount = parseFloat(cleaned) || 0
    this.setData({
      customAmount: cleaned,
      selectedPreset: null,
      currentAmount: amount
    })
  },

  // 输入备注
  onRemarkInput(e) {
    this.setData({ remark: e.detail.value })
  },

  // 复制管理员微信
  copyAdminWechat() {
    wx.setClipboardData({
      data: ADMIN_WECHAT,
      success: () => toast('管理员微信已复制', 'success')
    })
  },

  // 提交充值申请
  async onSubmit() {
    const { currentAmount, remark, submitting } = this.data
    if (submitting) return

    if (!currentAmount || currentAmount <= 0) {
      return toast('请选择或填写充值金额')
    }
    if (currentAmount < 10) {
      return toast('充值金额不能低于 ¥10')
    }
    if (currentAmount > 10000) {
      return toast('单次充值不能超过 ¥10000')
    }

    this.setData({ submitting: true })
    try {
      const res = await callCloud('paymentMgr', {
        action: 'submitRechargeApply',
        amount: currentAmount,
        remark
      })

      if (res && res.success !== false) {
        // 格式化当前时间
        const now = new Date()
        const pad = n => String(n).padStart(2, '0')
        const timeStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
        this.setData({
          showResultModal: true,
          resultApplyNo: res.applyNo || '',
          resultAmount: currentAmount,
          resultCreateTime: timeStr,
          selectedPreset: null,
          customAmount: '',
          currentAmount: 0,
          remark: ''
        })
        this.loadApplyList(true)
      } else {
        toast(res.message || '提交失败，请重试')
      }
    } catch (e) {
      console.error('提交充值申请失败', e)
      toast('提交失败，请重试')
    } finally {
      this.setData({ submitting: false })
    }
  },

  // 关闭结果弹窗
  closeResultModal() {
    this.setData({ showResultModal: false })
  },

  // 复制申请单号
  copyApplyNo() {
    wx.setClipboardData({
      data: this.data.resultApplyNo,
      success: () => toast('申请单号已复制', 'success')
    })
  },

  // 加载申请记录
  async loadApplyList(refresh = false) {
    if (this.data.applyLoading) return
    const page = refresh ? 1 : this.data.applyPage
    this.setData({ applyLoading: true })
    try {
      const res = await callCloud('paymentMgr', {
        action: 'getMyRechargeApplies',
        page,
        pageSize: 10
      })
      if (res && res.success !== false) {
        const list = refresh ? res.list : [...this.data.applyList, ...res.list]
        this.setData({
          applyList: list,
          applyTotal: res.total || 0,
          applyPage: page + 1
        })
      }
    } catch (e) {
      console.error('加载充值记录失败', e)
    } finally {
      this.setData({ applyLoading: false })
    }
  },

  // 取消充值申请
  async onCancelApply(e) {
    const { id } = e.currentTarget.dataset
    wx.showModal({
      title: '确认取消',
      content: '确定要取消该充值申请吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            const r = await callCloud('paymentMgr', {
              action: 'cancelRechargeApply',
              applyId: id
            })
            if (r && r.success !== false) {
              toast('申请已取消', 'success')
              this.loadApplyList(true)
            } else {
              toast(r.message || '取消失败')
            }
          } catch (e) {
            toast('操作失败，请重试')
          }
        }
      }
    })
  },

  // 加载更多
  onLoadMore() {
    const { applyList, applyTotal } = this.data
    if (applyList.length < applyTotal) {
      this.loadApplyList(false)
    }
  },

  // 返回
  onBack() {
    wx.navigateBack()
  }
})
