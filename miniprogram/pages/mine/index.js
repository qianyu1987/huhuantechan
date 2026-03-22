// pages/mine/index.js
const { PROVINCES, PRODUCT_CATEGORIES } = require('../../utils/constants')
const { callCloud, getCreditLevel, getProvinceByCode, toast, processImageUrl } = require('../../utils/util')

// ===== AI 客服知识库 =====
const SERVICE_KB = [
  // 平台规则
  { id: 'p01', category: 'platform', keywords: ['平台', '是什么', '干什么', '做什么', '介绍', '特产分享'], question: '特产分享平台是什么？', answer: '特产分享是一个让全国各地用户分享家乡特产的平台。你可以发布自己的家乡特产，与其他省份的用户相互分享，体验不同地域的美食和文化。' },
  { id: 'p02', category: 'platform', keywords: ['收费', '费用', '花钱', '免费', '要钱'], question: '平台收费吗？', answer: '平台完全免费使用！发布特产、匹配分享均不收取任何费用。唯一的费用是邮寄特产时的快递费，由各自承担。' },
  { id: 'p03', category: 'platform', keywords: ['谁能用', '注册', '使用条件', '资格'], question: '谁可以使用？', answer: '所有微信用户都可以使用。首次进入后需要完善资料，设置你的家乡省份，就可以开始发布和分享特产了。' },
  // 分享流程
  { id: 's01', category: 'swap', keywords: ['分享流程', '怎么分享', '如何分享', '分享特产', '流程', '步骤'], question: '分享流程是什么？', answer: '分享流程分 7 步：\n1. 完善资料，设置家乡省份\n2. 发布你的特产（拍照+填信息）\n3. 在发现页浏览其他特产\n4. 到匹配页选择你的特产，系统智能匹配\n5. 点击"分享"发起请求，等待对方确认\n6. 双方确认后填写快递信息并发货\n7. 收货后确认并互相评价' },
  { id: 's02', category: 'swap', keywords: ['发布', '上传', '发特产', '怎么发', '发布特产'], question: '怎么发布特产？', answer: '点击底部"发布"按钮，拍摄或上传特产照片，填写名称、品类、价值区间、描述等信息，还可以设置你感兴趣的省份和品类偏好，提交即可。' },
  { id: 's03', category: 'swap', keywords: ['取消', '不想了', '取消分享', '退出', '撤销'], question: '可以取消分享吗？', answer: '可以在对方确认前取消。但请注意，确认后取消会扣除信用分。建议双方充分沟通后再发起，避免不必要的取消。' },
  { id: 's04', category: 'swap', keywords: ['匹配', '匹配规则', '智能匹配', '怎么匹配', '推荐'], question: '匹配规则是什么？', answer: '系统按优先级智能匹配：\n- 最优：双向意愿完全匹配（你想要的=对方有的，反之亦然）\n- 高：你的意愿匹配对方特产\n- 中：对方意愿匹配你的特产\n- 低：同价值区间或跨省匹配\n填写"想要的省份和品类"能大幅提高匹配精度。' },
  { id: 's05', category: 'swap', keywords: ['分享记录', '订单', '查看订单', '记录'], question: '如何查看分享记录？', answer: '在"我的"页面点击"分享记录"，或者在快捷服务区找到"分享记录"图标，即可查看所有订单的状态和详情。' },
  // 神秘特产
  { id: 'm01', category: 'mystery', keywords: ['神秘特产', '盲盒', '神秘', '是什么神秘'], question: '什么是神秘特产？', answer: '神秘特产是盲盒模式！发布时只显示来自哪个省份，不透露具体内容。只能与其他神秘特产配对，配对后双方同时揭晓内容，充满惊喜感。' },
  { id: 'm02', category: 'mystery', keywords: ['神秘怎么玩', '神秘分享', '盲盒怎么玩', '神秘特产怎么玩'], question: '神秘特产怎么玩？', answer: '神秘特产只能和神秘特产配对。在匹配页面选择你的神秘特产，系统会自动筛选其他用户的神秘特产进行匹配。完成后，双方同时揭晓对方寄来的是什么。' },
  { id: 'm03', category: 'mystery', keywords: ['神秘安全', '盲盒靠谱', '神秘保障'], question: '神秘特产安全吗？', answer: '有信用体系保障。发送不合理物品的用户会被扣信用分甚至封号。如果收到的神秘特产存在问题，可以申请纠纷处理，平台会介入调解。' },
  // 信用体系
  { id: 'c01', category: 'credit', keywords: ['信用分', '提高信用', '加分', '信用怎么提高', '积分'], question: '怎么提高信用分？', answer: '提高信用分的方式：\n- 完成分享：+5分\n- 获得好评：+2分\n- 完善个人资料：+3分\n- 每日签到：+1分\n保持良好的记录是最佳方式。' },
  { id: 'c02', category: 'credit', keywords: ['信用分有什么用', '信用用途', '信用作用', '分数有什么用'], question: '信用分有什么用？', answer: '信用分影响你在平台的信任度和匹配优先级。高信用分的用户更容易被推荐，也更受其他用户信赖。信用分过低可能限制部分功能使用。' },
  { id: 'c03', category: 'credit', keywords: ['扣分', '减分', '信用扣分', '信用减少', '降分'], question: '信用分扣分规则？', answer: '以下行为会扣信用分：\n- 获得差评：-10分\n- 确认后取消：-5分\n- 纠纷败诉：-15分\n- 超时未发货：-8分\n请保持诚信。' },
  // 物流相关
  { id: 'l01', category: 'shipping', keywords: ['邮费', '快递费', '运费', '谁出邮费', '包邮'], question: '邮费谁出？', answer: '双方的邮费由各自承担。建议选择性价比高的快递服务，发货前可以和对方沟通邮费情况。' },
  { id: 'l02', category: 'shipping', keywords: ['快递', '发货', '怎么发货', '填快递', '物流'], question: '怎么填快递信息？', answer: '确认后，在订单详情页面点击"填写快递信息"，输入快递公司和单号即可。建议发货后 24 小时内填写，方便对方查收。' },
  { id: 'l03', category: 'shipping', keywords: ['多久发货', '发货时间', '几天发', '什么时候发'], question: '多久需要发货？', answer: '建议在确认后 3 天内发货。超时未发货会扣信用分，也影响对方的体验。如遇特殊情况请提前和对方沟通。' },
  { id: 'l04', category: 'shipping', keywords: ['收到有问题', '货有问题', '不对', '描述不符', '质量', '纠纷'], question: '收到货有问题怎么办？', answer: '如果收到的特产与描述不符或有质量问题，可以在订单详情申请纠纷处理。平台会介入调解，根据实际情况保护双方权益。' },
  // 账号相关
  { id: 'a01', category: 'account', keywords: ['修改资料', '改资料', '编辑资料', '改名字', '改头像'], question: '怎么修改资料？', answer: '在"我的"页面右上角点击编辑按钮，可以修改头像和昵称。注意：家乡省份一旦设置后不可更改，请谨慎选择。' },
  { id: 'a02', category: 'account', keywords: ['收货地址', '地址', '设置地址', '改地址', '填地址'], question: '怎么设置收货地址？', answer: '在"我的"页面找到快捷服务区的"收货地址"，点击进入后可以添加、编辑或删除收货地址。发起分享时会使用默认地址。' },
  { id: 'a03', category: 'account', keywords: ['联系对方', '聊天', '消息', '怎么联系', '沟通'], question: '如何联系对方？', answer: '可以通过小程序内的消息功能联系对方。在订单详情页面也可以查看对方的联系信息，方便沟通发货和收货事宜。' },
  { id: 'a04', category: 'account', keywords: ['邀请', '邀请码', '邀请好友', '怎么邀请'], question: '怎么邀请好友？', answer: '在"我的"页面找到"邀请好友"入口，可以分享你的专属邀请码。好友通过邀请码注册后，你们都可以获得积分奖励。' },
  { id: 'a05', category: 'account', keywords: ['集章', '省份集章', '收集', '集齐'], question: '省份集章是什么？', answer: '每成功完成一次与某省用户的分享，就能收集该省的印章。集齐更多省份的印章，展示你的足迹，也是一种成就感。' }
]

const QUICK_QUESTIONS = [
  '分享流程是什么？',
  '邮费谁出？',
  '怎么提高信用分？',
  '什么是神秘特产？',
  '可以取消分享吗？',
  '收到货有问题？',
  '怎么发布特产？',
  '怎么修改资料？',
  '怎么设置地址？',
  '联系人工客服'
]

const WELCOME_MSG = '你好！我是特产分享小助手\n有什么可以帮你的？你可以直接输入问题，或点击下方常见问题快速了解~'
const DEFAULT_REPLY = '抱歉，我暂时无法解答这个问题。您可以尝试换个说法提问，或者点击下方按钮联系人工客服为您解答。'

function matchAnswer(input) {
  if (!input) return null
  const cleaned = input.trim().replace(/[，。？！、,.\?!]/g, '')
  if (!cleaned) return null

  let bestMatch = null
  let bestScore = 0

  for (const item of SERVICE_KB) {
    let score = 0
    let hitCount = 0

    // 精确匹配问题
    const qCleaned = item.question.replace(/[，。？！、,.\?!]/g, '')
    if (cleaned === qCleaned) return item

    for (const kw of item.keywords) {
      if (cleaned.includes(kw)) {
        score += kw.length
        hitCount++
      } else if (kw.includes(cleaned) && cleaned.length >= 2) {
        score += cleaned.length * 0.5
        hitCount++
      }
    }

    if (hitCount >= 2) score *= 1.5
    if (score > bestScore) {
      bestScore = score
      bestMatch = item
    }
  }

  return bestScore >= 2 ? bestMatch : null
}

Page({
  data: {
    userInfo: null,
    provinceName: '',
    creditScore: 100,
    creditClass: 'credit-high',
    publishCount: 0,
    swapCount: 0,
    badgeCount: 0,
    pendingCount: 0,
    myProducts: [],
    provinces: [],
    badgeExpanded: false,
    orderStats: {
      pending: 0,
      confirmed: 0,
      shipped: 0,
      completed: 0
    },
    isAdmin: false,
    showServicePanel: false,
    serviceMessages: [],
    serviceInput: '',
    scrollToView: '',
    quickQuestions: QUICK_QUESTIONS,
    keyboardHeight: 0
  },

  onLoad() {
    this.initProvinces()
    this.loadUserData()
    this._kbCallback = res => {
      if (this.data.showServicePanel) {
        this.setData({ keyboardHeight: res.height })
      }
    }
    wx.onKeyboardHeightChange(this._kbCallback)
  },

  onShow() {
    this.loadUserData()
  },

  onUnload() {
    if (this._kbCallback) {
      wx.offKeyboardHeightChange(this._kbCallback)
    }
  },

  initProvinces() {
    const app = getApp()
    const badges = app.globalData.provincesBadges || []
    const provinces = PROVINCES.map(p => ({
      ...p,
      collected: badges.includes(p.code)
    }))
    this.setData({ provinces })
  },

  async loadUserData() {
    const app = getApp()
    const appInstance = this
    
    // 先获取用户信息
    try {
      const userRes = await callCloud('userInit', { action: 'init' })
      if (userRes && userRes.userInfo) {
        const userInfo = userRes.userInfo

        app.globalData.userInfo = userInfo
        app.globalData.creditScore = userRes.creditScore
        app.globalData.province = userRes.province

        const creditInfo = getCreditLevel(userRes.creditScore || 100)
        const province = getProvinceByCode(userRes.province)
        this.setData({
          userInfo: userInfo,
          creditScore: userRes.creditScore || 100,
          creditClass: creditInfo.class,
          provinceName: province ? province.name : ''
        })
      }
    } catch (e) {
      console.error('获取用户信息失败', e)
    }

    // 检查管理员身份
    try {
      const adminRes = await callCloud('adminMgr', { action: 'getAdminStatus' })
      this.setData({ isAdmin: !!(adminRes && adminRes.isSuperAdmin) })
    } catch (e) {
      this.setData({ isAdmin: false })
    }

    try {
      const res = await callCloud('userInit', { action: 'getStats' })
      if (res) {
        this.setData({
          publishCount: res.publishCount || 0,
          swapCount: res.swapCount || 0,
          badgeCount: res.badgeCount || 0,
          pendingCount: res.pendingCount || 0,
          orderStats: res.orderStats || {}
        })
        // 更新集章
        const badges = res.provincesBadges || []
        const provinces = PROVINCES.map(p => ({ ...p, collected: badges.includes(p.code) }))
        this.setData({ provinces })
      }
    } catch (e) {}

    // 加载我的特产预览（最多5个）
    try {
      const res2 = await callCloud('productMgr', { action: 'myList', page: 1, pageSize: 5 })
      const list = (res2.list || []).map(item => {
        let statusLabel = '展示中', statusClass = 'status-active'
        if (item.status === 'in_swap') { statusLabel = '换中'; statusClass = 'status-in-swap' }
        if (item.status === 'swapped') { statusLabel = '已换出'; statusClass = 'status-swapped' }
        // 神秘特产处理
        const isMystery = item.isMystery || false
        let mysteryStyle = {}
        if (isMystery) {
          const MYSTERY_EMOJIS = ['🎁', '🎀', '🎉', '🎊', '🎄', '🎃', '🎈', '🎯', '🎲', '🎳']
          const provinceName = item.province ? getProvinceByCode(item.province)?.name || item.province : '神秘'
          const code = provinceName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
          mysteryStyle = {
            isMystery: true,
            colorClass: `color-${(code % 10) + 1}`,
            emoji: MYSTERY_EMOJIS[code % MYSTERY_EMOJIS.length],
            provinceName: provinceName
          }
        }
        
        return {
          ...item,
          ...mysteryStyle,
          coverUrl: isMystery ? '' : (item.images && item.images[0] ? processImageUrl(item.images[0]) : ''),
          statusLabel,
          statusClass
        }
      })
      this.setData({ myProducts: list })
    } catch (e) {}
  },

  // 选择头像（使用新版组件）
  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl
    const userInfo = this.data.userInfo || {}
    userInfo.avatarUrl = avatarUrl
    this.setData({ userInfo })
  },

  // 输入昵称
  onNicknameInput(e) {
    const nickName = e.detail.value
    const userInfo = this.data.userInfo || {}
    userInfo.nickName = nickName
    this.setData({ userInfo })
  },

  // 保存用户信息（头像+昵称）
  async saveUserProfile() {
    const userInfo = this.data.userInfo
    if (!userInfo) return

    // 验证头像和昵称
    if (!userInfo.avatarUrl || userInfo.avatarUrl.includes('default-avatar')) {
      toast('请先选择头像')
      return
    }
    if (!userInfo.nickName || userInfo.nickName.trim().length < 2) {
      toast('请输入昵称（至少2个字符）')
      return
    }

    try {
      const saveRes = await callCloud('userInit', {
        action: 'updateProfile',
        avatarUrl: userInfo.avatarUrl,
        nickName: userInfo.nickName.trim()
      })

      if (saveRes && saveRes.success) {
        const app = getApp()
        app.globalData.userInfo = userInfo
        this.setData({ userInfo })
        toast('保存成功', 'success')
      } else {
        toast('保存失败')
      }
    } catch (e) {
      console.error('保存失败', e)
      toast('保存失败')
    }
  },

  // 旧方法保留（兼容）
  async getUserInfo() {
    toast('请点击头像和昵称进行设置')
  },

  // 编辑个人资料（头像、昵称、家乡）
  editProfile() {
    wx.navigateTo({ url: '/pages/profile-edit/index' })
  },

  goToMyProducts() {
    wx.navigateTo({ url: '/pages/my-products/index' })
  },

  goToOrders(e) {
    const status = e.currentTarget && e.currentTarget.dataset.status
    wx.navigateTo({ url: `/pages/order/index${status ? '?status=' + status : ''}` })
  },

  goToDetail(e) {
    wx.navigateTo({ url: `/pages/detail/index?id=${e.currentTarget.dataset.id}` })
  },

  goToCredit() {
    wx.navigateTo({ url: '/pages/credit/index' })
  },

  goToHelp() {
    wx.navigateTo({ url: '/pages/help/index' })
  },

  // ===== AI 客服面板 =====
  showService() {
    const msgs = this.data.serviceMessages
    if (msgs.length === 0) {
      msgs.push({ type: 'ai', content: WELCOME_MSG, showHumanBtn: false })
    }
    this.setData({
      showServicePanel: true,
      serviceMessages: msgs,
      scrollToView: 'msg-' + (msgs.length - 1)
    })
  },

  hideService() {
    this.setData({ showServicePanel: false, keyboardHeight: 0 })
  },

  noop() {},

  onServiceInput(e) {
    this.setData({ serviceInput: e.detail.value })
  },

  sendMessage() {
    const input = (this.data.serviceInput || '').trim()
    if (!input) return

    const msgs = this.data.serviceMessages
    msgs.push({ type: 'user', content: input, showHumanBtn: false })
    this.setData({
      serviceMessages: msgs,
      serviceInput: '',
      scrollToView: 'msg-' + (msgs.length - 1)
    })

    setTimeout(() => {
      const result = matchAnswer(input)
      const aiMsg = result
        ? { type: 'ai', content: result.answer, showHumanBtn: false }
        : { type: 'ai', content: DEFAULT_REPLY, showHumanBtn: true }

      const updated = this.data.serviceMessages
      updated.push(aiMsg)
      this.setData({
        serviceMessages: updated,
        scrollToView: 'msg-' + (updated.length - 1)
      })
    }, 400)
  },

  selectQuickQuestion(e) {
    const idx = e.currentTarget.dataset.index
    const text = QUICK_QUESTIONS[idx]
    if (!text) return

    // 最后一项"联系人工客服"直接触发
    if (idx === QUICK_QUESTIONS.length - 1) {
      this.contactHuman()
      return
    }

    this.setData({ serviceInput: text })
    this.sendMessage()
  },

  contactHuman() {
    wx.showModal({
      title: '联系人工客服',
      content: '请前往微信公众号「换特产」留言，客服会尽快回复您。\n\n关注方式：微信搜索公众号"换特产"',
      showCancel: true,
      cancelText: '我知道了',
      confirmText: '去搜索',
      success(res) {
        if (res.confirm) {
          wx.setClipboardData({
            data: '换特产',
            success() {
              wx.showToast({ title: '已复制，去微信搜索', icon: 'none', duration: 2000 })
            }
          })
        }
      }
    })
  },

  // 跳转管理员入口
  goToAdmin() {
    wx.navigateTo({ url: '/pages/admin/index' })
  },

  goToSettings() {
    wx.navigateTo({ url: '/pages/settings/index' })
  },

  // 跳转关于我们
  goToAbout() {
    wx.navigateTo({ url: '/pages/about/index' })
  },

  // 跳转我的收藏
  goToFavorites() {
    wx.navigateTo({ url: '/pages/favorites/index' })
  },

  // 跳转神秘特产
  goToMystery() {
    wx.navigateTo({ url: '/pages/mystery/index' })
  },

  // 跳转收货地址
  goToAddress() {
    wx.navigateTo({ url: '/pages/address/index' })
  },

  // 跳转邀请好友
  goToInvite() {
    wx.navigateTo({ url: '/pages/invitedFriends/index' })
  },

  // 跳转我的评价（历史记录）
  goToReview() {
    wx.navigateTo({ url: '/pages/my-reviews/index' })
  },

  toggleBadgeExpand() {
    this.setData({
      badgeExpanded: !this.data.badgeExpanded
    })
  },

  // 头像加载失败处理
  onAvatarError(e) {
    console.warn('头像加载失败，使用默认头像')
    const userInfo = this.data.userInfo
    if (userInfo) {
      userInfo.avatarUrl = '/images/default-avatar.png'
      this.setData({ userInfo })
    }
  },

  // 特产图片加载失败处理
  onImageError(e) {
    console.warn('特产图片加载失败')
    const index = e.currentTarget.dataset.index
    if (index !== undefined && this.data.myProducts[index]) {
      const myProducts = this.data.myProducts
      myProducts[index].coverUrl = '/images/default-product.png'
      this.setData({ myProducts })
    }
  }
})
