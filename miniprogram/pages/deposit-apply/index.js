// pages/deposit-apply/index.js
const { callCloud, toast, showLoading } = require('../../utils/util')

// 押金档位配置（与等级体系对应）
const DEPOSIT_TIERS = [
  {
    level: 1,
    name: 'LV1 初级代购',
    amount: 50,
    icon: '🌱',
    color: '#34C759',
    colorLight: 'rgba(52,199,89,0.12)',
    feeRate: '7.0%',
    dailyLimit: 5,
    desc: '每日最多发布5件代购商品，服务费率7%'
  },
  {
    level: 2,
    name: 'LV2 进阶代购',
    amount: 100,
    icon: '🌿',
    color: '#30D158',
    colorLight: 'rgba(48,209,88,0.12)',
    feeRate: '6.5%',
    dailyLimit: 10,
    desc: '每日最多发布10件代购商品，服务费率6.5%'
  },
  {
    level: 3,
    name: 'LV3 资深代购',
    amount: 200,
    icon: '🔥',
    color: '#FF9500',
    colorLight: 'rgba(255,149,0,0.12)',
    feeRate: '6.0%',
    dailyLimit: 20,
    desc: '每日最多发布20件代购商品，服务费率6%'
  },
  {
    level: 4,
    name: 'LV4 金牌代购',
    amount: 500,
    icon: '🥇',
    color: '#FFD60A',
    colorLight: 'rgba(255,214,10,0.12)',
    feeRate: '5.5%',
    dailyLimit: 50,
    desc: '每日最多发布50件代购商品，服务费率5.5%'
  },
  {
    level: 5,
    name: 'LV5 钻石代购',
    amount: 1000,
    icon: '💎',
    color: '#BF5AF2',
    colorLight: 'rgba(191,90,242,0.12)',
    feeRate: '5.0%',
    dailyLimit: 100,
    desc: '每日最多发布100件代购商品，服务费率5%'
  }
]

// 申请流程步骤
const STEPS = [
  { id: 1, label: '选择档位' },
  { id: 2, label: '填写信息' },
  { id: 3, label: '确认提交' }
]

Page({
  data: {
    // 流程控制
    currentStep: 1,
    steps: STEPS,
    // 档位数据
    tiers: DEPOSIT_TIERS,
    selectedTierIndex: -1,
    selectedTier: null,
    // 申请表单
    form: {
      realName: '',
      phone: '',
      wechatId: '',
      remark: ''
    },
    // 上传凭证
    transferProof: '', // 转账截图云存储路径
    transferProofUrl: '', // 预览URL
    uploadingProof: false,
    // 提交状态
    submitting: false,
    submitResult: null, // null | 'success' | 'duplicate'
    // 已有申请记录
    existingApply: null,
    loadingExisting: true,
    // 客服信息（从后台配置读取）
    wechatCs: '',
    phoneCs: '',
    // 协议勾选
    agreed: false,
    // 步骤2校验提示
    formErrors: {}
  },

  onLoad() {
    this._loadExistingApply()
    this._loadServiceConfig()
  },

  // 加载客服配置
  async _loadServiceConfig() {
    try {
      const res = await callCloud('userInit', { action: 'getServiceConfig' })
      if (res && res.success) {
        this.setData({
          wechatCs: res.serviceWechat || '',
          phoneCs: res.servicePhone || ''
        })
      }
    } catch (e) {
      console.error('加载客服配置失败', e)
    }
  },

  // ─── 加载已有申请 ───
  async _loadExistingApply() {
    try {
      const res = await callCloud('daigouMgr', { action: 'getMyDepositApply' })
      if (res.success && res.apply) {
        this.setData({ existingApply: res.apply, loadingExisting: false })
      } else {
        this.setData({ loadingExisting: false })
      }
    } catch (e) {
      console.error('加载申请记录失败', e)
      this.setData({ loadingExisting: false })
    }
  },

  // ─── 选择档位 ───
  selectTier(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({
      selectedTierIndex: idx,
      selectedTier: DEPOSIT_TIERS[idx]
    })
  },

  // ─── 步骤1 → 2 ───
  goStep2() {
    if (this.data.selectedTierIndex < 0) {
      toast('请先选择押金档位')
      return
    }
    this.setData({ currentStep: 2 })
  },

  // ─── 步骤2 → 3 ───
  goStep3() {
    const { form, agreed } = this.data
    const errors = {}
    if (!form.realName.trim()) errors.realName = '请填写真实姓名'
    if (!form.phone.trim() || !/^1[3-9]\d{9}$/.test(form.phone.trim())) errors.phone = '请填写正确的手机号'
    if (!form.wechatId.trim()) errors.wechatId = '请填写微信号'
    if (!agreed) errors.agreed = '请阅读并同意申请须知'

    if (Object.keys(errors).length > 0) {
      this.setData({ formErrors: errors })
      return
    }
    this.setData({ formErrors: {}, currentStep: 3 })
  },

  // ─── 返回上一步 ───
  goBack() {
    const { currentStep } = this.data
    if (currentStep > 1) {
      this.setData({ currentStep: currentStep - 1 })
    } else {
      wx.navigateBack()
    }
  },

  // ─── 表单输入 ───
  onInput(e) {
    const { field } = e.currentTarget.dataset
    const val = e.detail.value
    const form = { ...this.data.form, [field]: val }
    const formErrors = { ...this.data.formErrors }
    delete formErrors[field]
    this.setData({ form, formErrors })
  },

  // ─── 协议勾选 ───
  toggleAgreed() {
    const formErrors = { ...this.data.formErrors }
    delete formErrors.agreed
    this.setData({ agreed: !this.data.agreed, formErrors })
  },

  // ─── 上传转账截图 ───
  async chooseTransferProof() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        this.setData({ uploadingProof: true })
        try {
          const cloudPath = `deposit_proof/${wx.getStorageSync('openid') || Date.now()}_${Date.now()}.jpg`
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath,
            filePath: tempPath
          })
          // 获取临时访问URL
          const urlRes = await wx.cloud.getTempFileURL({
            fileList: [uploadRes.fileID]
          })
          this.setData({
            transferProof: uploadRes.fileID,
            transferProofUrl: urlRes.fileList[0].tempFileURL,
            uploadingProof: false
          })
        } catch (e) {
          console.error('上传截图失败', e)
          toast('上传失败，请重试')
          this.setData({ uploadingProof: false })
        }
      }
    })
  },

  // ─── 删除截图 ───
  removeProof() {
    this.setData({ transferProof: '', transferProofUrl: '' })
  },

  // ─── 预览截图 ───
  previewProof() {
    if (this.data.transferProofUrl) {
      wx.previewImage({ urls: [this.data.transferProofUrl], current: this.data.transferProofUrl })
    }
  },

  // ─── 复制客服微信 ───
  copyWechat() {
    wx.setClipboardData({
      data: this.data.wechatCs,
      success: () => toast('已复制客服微信号')
    })
  },

  // ─── 拨打客服电话 ───
  callCs() {
    wx.makePhoneCall({ phoneNumber: this.data.phoneCs })
  },

  // ─── 提交申请 ───
  async submitApply() {
    if (this.data.submitting) return
    const { selectedTier, form, transferProof, agreed } = this.data
    if (!agreed) {
      toast('请勾选申请须知')
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...', mask: true })

    try {
      const res = await callCloud('daigouMgr', {
        action: 'applyDeposit',
        depositAmount: selectedTier.amount,
        targetLevel: selectedTier.level,
        realName: form.realName.trim(),
        phone: form.phone.trim(),
        wechatId: form.wechatId.trim(),
        remark: form.remark.trim(),
        transferProof
      })

      wx.hideLoading()
      this.setData({ submitting: false })

      if (res.success) {
        this.setData({ submitResult: 'success' })
        this._loadExistingApply()
      } else if (res.code === 'DUPLICATE') {
        this.setData({ submitResult: 'duplicate', existingApply: res.apply })
      } else {
        toast(res.message || '提交失败，请重试')
      }
    } catch (e) {
      wx.hideLoading()
      this.setData({ submitting: false })
      console.error('提交申请失败', e)
      toast('提交失败，请重试')
    }
  },

  // ─── 查看申请状态 ───
  viewApplyStatus() {
    this.setData({ submitResult: null, currentStep: 1 })
    this._loadExistingApply()
  },

  // ─── 返回我的页面 ───
  goToMine() {
    console.log('goToMine called, attempting to navigate to mine page')
    try {
      // 使用 reLaunch 重新启动到我的页面
      wx.reLaunch({ url: '/pages/mine/index' })
    } catch (e) {
      console.error('reLaunch failed:', e)
      // 备用方案：使用 navigateBack
      const pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack({ delta: 1 })
      } else {
        // 最后备选：使用 redirectTo
        wx.redirectTo({ url: '/pages/mine/index' })
      }
    }
  },

  // ─── 重新申请（已有被拒的） ───
  reApply() {
    this.setData({
      existingApply: null,
      currentStep: 1,
      selectedTierIndex: -1,
      selectedTier: null,
      submitResult: null,
      form: { realName: '', phone: '', wechatId: '', remark: '' },
      transferProof: '',
      transferProofUrl: '',
      agreed: false
    })
  },

  // ─── 展示申请须知 ───
  showNotice() {
    wx.showModal({
      title: '押金申请须知',
      content: '1. 押金为履约保证金，正常经营不扣除\n2. 以下情况将扣除押金：发货纠纷败诉、信用分<60分、长期不发货\n3. 退出代购后可申请退还剩余余额\n4. 押金余额不足时系统将暂停代购资格\n5. 如需帮助请联系客服',
      showCancel: false,
      confirmText: '我知道了'
    })
  }
})
