// pages/mine/index.js
const { PROVINCES, PRODUCT_CATEGORIES } = require('../../utils/constants')
const { callCloud, getCreditLevel, getProvinceByCode, toast, processImageUrl, uploadImage, showLoading } = require('../../utils/util')

// AI 客服知识库
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
    phoneNumber: '',
    phoneVerified: false,
    daigouLevelName: '新人',
    daigouLevelEmoji: '🌱',
    daigouFeeRate: 8.0,
    swapLevelName: '新人',
    swapLevelEmoji: '🌱',
    swapLevelIdx: 0,
    _phoneJustVerified: false, // 标记是否刚刚验证过手机号
    orderStats: {
      pending: 0,
      confirmed: 0,
      shipped: 0,
      completed: 0
    },
    points: 0,
    featureFlags: {},
    isAdmin: false,
    // 管理员待处理通知
    adminNotifications: {
      pendingReview: 0,      // 待审核特产
      daigouVerify: 0,       // 待实名认证
      depositApply: 0,       // 待押金审批
      rechargeApply: 0,      // 待充值审批
      // 新增待处理事项
      newUsers: 0,           // 新增用户
      newProducts: 0,        // 新增特产
      newShares: 0,         // 新增分享
      withdrawApply: 0,     // 提现申请
      productDelete: 0,      // 特产删除
      swapSuccess: 0,       // 互换成功
      newFavorites: 0,      // 新增收藏
      newRecharges: 0,      // 充值申请（当天）
      todayWithdrawals: 0,  // 提现申请（当天）
      userDisputes: 0,       // 用户纠纷
      productReports: 0,    // 产品举报
      userReports: 0,       // 用户举报
      totalCount: 0          // 总待处理数
    },
    todayDate: '',  // 当天日期
    showServicePanel: false,
    serviceMessages: [],
    serviceInput: '',
    scrollToView: '',
    quickQuestions: QUICK_QUESTIONS,
    keyboardHeight: 0,
    // 授权引导弹窗
    showProfileGuide: false,
    guideNickName: '',
    guideAvatarUrl: '',
    _guideSaving: false
  },

  onLoad() {
    this.setData({ featureFlags: getApp().globalData.featureFlags || {} })
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
    // 只在需要时刷新，比如从其他页面返回时
    // 不再每次都调用 loadUserData，避免性能浪费
    const app = getApp()
    
    // 如果 globalData 有数据，说明已经加载过
    if (app.globalData.userInfo) {
      // 只刷新关键数据（积分、订单数等可能变化的数据）
      this._refreshKeyDataIfNeeded()
    } else {
      // 完全没有数据时才 full load
      this.loadUserData()
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    console.log('[mine] 下拉刷新')
    // 重置刷新时间限制，强制刷新
    this._lastRefreshTime = 0
    // 执行完整数据加载
    this.loadUserData().then(() => {
      // 停止下拉刷新动画
      wx.stopPullDownRefresh()
    }).catch(err => {
      console.error('[mine] 下拉刷新失败', err)
      wx.stopPullDownRefresh()
      wx.showToast({
        title: '刷新失败',
        icon: 'none'
      })
    })
  },

  // 轻量刷新关键数据（积分、订单数、代购等级等）
  _refreshKeyDataIfNeeded() {
    // 节流：距离上次刷新少于 30 秒不刷新
    if (this._lastRefreshTime && Date.now() - this._lastRefreshTime < 30000) {
      return
    }
    this._lastRefreshTime = Date.now()
    
    // 并行获取统计数据和用户信息（包含代购等级）
    Promise.all([
      callCloud('userInit', { action: 'getStats' }),
      callCloud('userInit', { action: 'init' })
    ]).then(([statsRes, userRes]) => {
      if (statsRes) {
        this.setData({
          publishCount: statsRes.publishCount || 0,
          swapCount: statsRes.swapCount || 0,
          badgeCount: statsRes.badgeCount || 0,
          pendingCount: statsRes.pendingCount || 0,
          points: statsRes.points || this.data.points
        })
      }
      
      // 更新代购等级等用户信息
      if (userRes && userRes.userInfo) {
        const LEVEL_NAMES = { 0: '新人', 1: '初级', 2: '进阶', 3: '资深', 4: '金牌', 5: '钻石', 6: '官方认证' }
        const LEVEL_RATES = { 0: 8.0, 1: 7.0, 2: 6.5, 3: 6.0, 4: 5.5, 5: 5.0, 6: 4.0 }
        const LEVEL_EMOJIS = { 0: '🌱', 1: '⭐', 2: '🌟', 3: '💫', 4: '🥇', 5: '💎', 6: '👑' }
        
        const dlv = userRes.userInfo.daigouLevel !== undefined ? userRes.userInfo.daigouLevel : 0
        
        // 更新 userInfo 中的代购等级
        const userInfo = this.data.userInfo || {}
        userInfo.daigouLevel = dlv
        userInfo.daigouStats = userRes.userInfo.daigouStats || null
        userInfo.isDaigouVerified = userRes.userInfo.isDaigouVerified || false
        
        this.setData({
          userInfo,
          daigouLevelName: LEVEL_NAMES[dlv] || '新人',
          daigouLevelEmoji: LEVEL_EMOJIS[dlv] || '🌱',
          daigouFeeRate: LEVEL_RATES[dlv] || 8.0
        })
        
        // 更新 globalData
        const app = getApp()
        app.globalData.userInfo = { ...app.globalData.userInfo, ...userInfo }
      }
    }).catch(() => {})
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
    // 如果刚刚验证过手机号，跳过本次加载（避免覆盖刚更新的数据）
    if (this.data._phoneJustVerified) {
      console.log('[mine] 跳过本次 loadUserData（刚刚验证过手机号）')
      this.setData({ _phoneJustVerified: false })
      return
    }
    
    const app = getApp()
    
    // ========== 策略：优先用缓存，减少等待 ==========
    
    // 1. 如果 globalData 已有用户信息，先渲染（秒开）
    if (app.globalData.userInfo && app.globalData.openid) {
      const userInfo = app.globalData.userInfo
      const needGuide = !userInfo.nickName || userInfo.nickName === '微信用户' || !userInfo.avatarUrl || userInfo.avatarUrl.includes('default-avatar')
      
      this.setData({
        userInfo,
        creditScore: app.globalData.creditScore || 100,
        provinceName: getProvinceByCode(app.globalData.province)?.name || '',
        points: app.globalData.points || 0,
        phoneNumber: app.globalData.phoneNumber || '',
        phoneVerified: app.globalData.phoneVerified || false,
        showProfileGuide: needGuide,
        guideAvatarUrl: needGuide ? (userInfo.avatarUrl || '') : '',
        guideNickName: needGuide ? (userInfo.nickName === '微信用户' ? '' : (userInfo.nickName || '')) : ''
      })
      
      // 检查管理员缓存
      const cachedAdmin = wx.getStorageSync('isAdmin')
      const adminCacheTime = wx.getStorageSync('adminCacheTime')
      if (cachedAdmin !== '' && adminCacheTime && (Date.now() - adminCacheTime < 5 * 60 * 1000)) {
        this.setData({ isAdmin: cachedAdmin === 'true' })
      }
    }
    
    // 2. 后台并行刷新数据（不阻塞 UI）
    this._refreshUserDataInBackground()
  },

  // 后台刷新用户数据（不阻塞 UI）
  async _refreshUserDataInBackground() {
    const app = getApp()
    
    try {
      // 并行调用：init（获取用户信息）+ getStats（获取统计数据）
      const [userRes, statsRes] = await Promise.all([
        callCloud('userInit', { action: 'init' }),
        callCloud('userInit', { action: 'getStats' })
      ])
      
      // 更新 globalData
      if (userRes && userRes.userInfo) {
        app.globalData.userInfo = userRes.userInfo
        app.globalData.creditScore = userRes.creditScore
        app.globalData.province = userRes.province
        app.globalData.points = userRes.points || 0
        app.globalData.phoneNumber = userRes.phoneNumber || ''
        app.globalData.phoneVerified = userRes.phoneVerified || false
        
        // 更新 UI
        const userInfo = userRes.userInfo
        const needGuide = !userInfo.nickName || userInfo.nickName === '微信用户' || !userInfo.avatarUrl || userInfo.avatarUrl.includes('default-avatar')

        // 代购等级
        const LEVEL_NAMES = { 0: '新人', 1: '初级', 2: '进阶', 3: '资深', 4: '金牌', 5: '钻石', 6: '官方认证' }
        const LEVEL_RATES = { 0: 8.0, 1: 7.0, 2: 6.5, 3: 6.0, 4: 5.5, 5: 5.0, 6: 4.0 }
        const LEVEL_EMOJIS = { 0: '🌱', 1: '⭐', 2: '🌟', 3: '💫', 4: '🥇', 5: '💎', 6: '👑' }
        // 云函数返回的 daigouLevel 优先，其次读 userInfo 里携带的
        const dlv = (userRes.userInfo && userRes.userInfo.daigouLevel !== undefined)
          ? userRes.userInfo.daigouLevel
          : (userInfo.daigouLevel !== undefined ? userInfo.daigouLevel : 0)

        // 互换达人等级（基于互换次数）
        const swapCnt = (statsRes && statsRes.swapCount) || 0
        const SWAP_LEVELS = [
          { min: 0,   name: '新鲜人',  emoji: '🌱', idx: 0 },
          { min: 1,   name: '探索者',  emoji: '🗺️', idx: 1 },
          { min: 5,   name: '互换达人', emoji: '⭐', idx: 2 },
          { min: 15,  name: '特产行家', emoji: '🌟', idx: 3 },
          { min: 30,  name: '互换专家', emoji: '💫', idx: 4 },
          { min: 60,  name: '特产大师', emoji: '🏆', idx: 5 },
          { min: 100, name: '传奇宗师', emoji: '👑', idx: 6 },
        ]
        let swapLevelObj = SWAP_LEVELS[0]
        for (const lv of SWAP_LEVELS) {
          if (swapCnt >= lv.min) swapLevelObj = lv
        }

        // 把代购字段合并到 userInfo，驱动 WXML deposit-balance-bar 显示
        userInfo.daigouStats = (userRes.userInfo && userRes.userInfo.daigouStats) || userInfo.daigouStats || null
        userInfo.daigouLevel = dlv
        userInfo.isDaigouVerified = (userRes.userInfo && userRes.userInfo.isDaigouVerified) || userInfo.isDaigouVerified || false
        
        this.setData({
          userInfo,
          creditScore: userRes.creditScore || 100,
          creditClass: getCreditLevel(userRes.creditScore || 100).class,
          provinceName: getProvinceByCode(userRes.province)?.name || '',
          points: userRes.points || 0,
          phoneNumber: userRes.phoneNumber || '',
          phoneVerified: userRes.phoneVerified || false,
          showProfileGuide: needGuide,
          guideAvatarUrl: needGuide ? (userInfo.avatarUrl || '') : '',
          guideNickName: needGuide ? (userInfo.nickName === '微信用户' ? '' : (userInfo.nickName || '')) : '',
          daigouLevelName: LEVEL_NAMES[dlv] || '新人',
          daigouLevelEmoji: LEVEL_EMOJIS[dlv] || '🌱',
          daigouFeeRate: LEVEL_RATES[dlv] || 8.0,
          swapLevelName: swapLevelObj.name,
          swapLevelEmoji: swapLevelObj.emoji,
          swapLevelIdx: swapLevelObj.idx,
        })
      }
      
      // 更新统计数据
      if (statsRes) {
        this.setData({
          publishCount: statsRes.publishCount || 0,
          swapCount: statsRes.swapCount || 0,
          badgeCount: statsRes.badgeCount || 0,
          pendingCount: statsRes.pendingCount || 0,
          orderStats: statsRes.orderStats || {}
        })
        
        // 更新集章
        const badges = statsRes.provincesBadges || []
        const provinces = PROVINCES.map(p => ({ ...p, collected: badges.includes(p.code) }))
        this.setData({ provinces })
      }
    } catch (e) {
      console.error('[mine] 刷新用户数据失败:', e)
    }
    
    // 3. 检查管理员身份（独立，不阻塞其他操作）
    this._checkAdminStatus()
    
    // 4. 加载我的特产预览（独立，不阻塞其他操作）
    this._loadMyProductsPreview()
  },

  // 检查管理员身份（带缓存）
  async _checkAdminStatus() {
    // 检查缓存
    const cachedAdmin = wx.getStorageSync('isAdmin')
    const adminCacheTime = wx.getStorageSync('adminCacheTime')
    const CACHE_TTL = 5 * 60 * 1000 // 5分钟
    
    // 使用缓存
    if (cachedAdmin !== '' && adminCacheTime && (Date.now() - adminCacheTime < CACHE_TTL)) {
      const isAdmin = cachedAdmin === 'true'
      this.setData({ isAdmin })
      if (isAdmin) {
        this._loadAdminNotifications()
      }
      return
    }
    
    // 缓存过期或不存在，请求服务器
    try {
      const res = await callCloud('adminMgr', { action: 'getAdminStatus' })
      const isAdmin = !!(res && res.isSuperAdmin)
      this.setData({ isAdmin })
      wx.setStorageSync('isAdmin', isAdmin ? 'true' : 'false')
      wx.setStorageSync('adminCacheTime', Date.now())
      
      // 如果是管理员，加载待处理通知
      if (isAdmin) {
        this._loadAdminNotifications()
      }
    } catch (e) {
      console.error('[mine] 检查管理员失败:', e)
      // 请求失败时，尝试使用缓存（即使过期）
      if (cachedAdmin !== '') {
        const isAdmin = cachedAdmin === 'true'
        this.setData({ isAdmin })
        if (isAdmin) {
          this._loadAdminNotifications()
        }
      }
    }
  },

  // 加载管理员待处理通知
  async _loadAdminNotifications() {
    try {
      const [depositRes, rechargeRes, daigouVerifyRes, statsRes, pendingStatsRes] = await Promise.all([
        callCloud('adminMgr', { 
          action: 'getDepositApplyList',
          page: 1,
          pageSize: 1,
          filter: 'pending'
        }),
        callCloud('paymentMgr', {
          action: 'adminGetRechargeApplies',
          page: 1,
          pageSize: 1,
          status: 'pending'
        }),
        callCloud('daigouMgr', {
          action: 'getVerifyList',
          page: 1,
          pageSize: 1,
          filter: 'pending'
        }),
        callCloud('adminMgr', { action: 'getStats' }),
        callCloud('adminMgr', { action: 'getPendingStats' })
      ])
      
      const pendingReview = statsRes?.pendingReviews || 0
      const daigouVerify = daigouVerifyRes?.list?.length || 0
      const depositApply = depositRes?.stats?.pending || 0
      const rechargeApply = rechargeRes?.total || 0
      
      // 新增统计数据
      const newUsers = pendingStatsRes?.stats?.newUsers || 0
      const newProducts = pendingStatsRes?.stats?.newProducts || 0
      const newShares = pendingStatsRes?.stats?.newShares || 0
      const withdrawApply = pendingStatsRes?.stats?.withdrawApply || 0
      const productDelete = pendingStatsRes?.stats?.productDelete || 0
      const swapSuccess = pendingStatsRes?.stats?.swapSuccess || 0
      const newFavorites = pendingStatsRes?.stats?.newFavorites || 0
      const newRecharges = pendingStatsRes?.stats?.newRecharges || 0
      const todayWithdrawals = pendingStatsRes?.stats?.todayWithdrawals || 0
      const userDisputes = pendingStatsRes?.stats?.userDisputes || 0
      const productReports = pendingStatsRes?.stats?.productReports || 0
      const userReports = pendingStatsRes?.stats?.userReports || 0
      
      // 总待处理数（只计算需要处理的）
      const totalPending = withdrawApply + userDisputes + productReports + userReports
      // 加上其他待审核项
      const totalCount = totalPending + pendingReview + daigouVerify + depositApply + rechargeApply
      
      this.setData({
        adminNotifications: {
          pendingReview,
          daigouVerify,
          depositApply,
          rechargeApply,
          newUsers,
          newProducts,
          newShares,
          withdrawApply,
          productDelete,
          swapSuccess,
          newFavorites,
          newRecharges,
          todayWithdrawals,
          userDisputes,
          productReports,
          userReports,
          totalCount
        },
        todayDate: this._getTodayDate()
      })
    } catch (e) {
      console.error('[mine] 加载管理员通知失败:', e)
    }
  },

  // 获取当天日期格式化字符串
  _getTodayDate() {
    const now = new Date()
    const month = now.getMonth() + 1
    const day = now.getDate()
    const weekDays = ['日', '一', '二', '三', '四', '五', '六']
    const weekDay = weekDays[now.getDay()]
    return `${month}月${day}日 周${weekDay}`
  },

  // 加载我的特产预览（独立，不阻塞）
  async _loadMyProductsPreview() {
    try {
      console.log('[mine] 开始加载我的特产预览')
      const res = await callCloud('productMgr', { action: 'myList', page: 1, pageSize: 5 })
      console.log('[mine] 特产预览响应:', res)
      
      if (!res.success) {
        console.error('[mine] 特产预览失败:', res.message)
        return
      }
      
      const list = (res.list || []).map(item => {
        console.log('[mine] 处理特产:', item._id, item.name)
        let statusLabel = '展示中', statusClass = 'status-active'
        if (item.status === 'in_swap') { statusLabel = '换中'; statusClass = 'status-in-swap' }
        if (item.status === 'swapped') { statusLabel = '已换出'; statusClass = 'status-swapped' }
        
        const isMystery = item.isMystery || false
        let mysteryStyle = {}
        if (isMystery) {
          const MYSTERY_EMOJIS = ['🎁', '🎀', '🎉', '🎊', '🎄', '🎃', '🎈', '🎯', '🎲', '🎳']
          const provinceName = item.province ? getProvinceByCode(item.province)?.name || item.province : '神秘'
          const code = provinceName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
          const emoji = MYSTERY_EMOJIS[code % MYSTERY_EMOJIS.length]
          mysteryStyle = { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }
          item.coverUrl = emoji
          item.colorClass = `color-${(code % 10) + 1}`
          item.emoji = emoji
          item.provinceName = provinceName
          item.displayName = provinceName + '神秘特产'
        } else {
          // 处理普通特产的图片链接
          let coverUrl = '/images/default-product.png'
          if (item.images && item.images.length > 0) {
            coverUrl = processImageUrl(item.images[0])
          } else if (item.coverUrl) {
            coverUrl = processImageUrl(item.coverUrl)
          }
          item.coverUrl = coverUrl
          item.displayName = item.name || '特产'
        }
        
        item.statusLabel = statusLabel
        item.statusClass = statusClass
        item.mysteryStyle = mysteryStyle
        return item
      })
      
      console.log('[mine] 特产预览列表:', list.length, '个')
      this.setData({ myProducts: list })
    } catch (e) {
      console.error('[mine] 加载特产预览失败:', e)
    }
  },

  // 选择头像（使用新版组件）
  async onChooseAvatar(e) {
    const tempPath = e.detail.avatarUrl
    
    // 模拟器环境检测
    if (!tempPath) {
      // 检测是否在模拟器中
      const systemInfo = wx.getSystemInfoSync()
      if (systemInfo.platform === 'devtools') {
        wx.showModal({
          title: '模拟器限制',
          content: '头像选择功能需要在真机上测试。\n\n请使用"真机调试"功能，在真实手机上扫码测试。',
          confirmText: '知道了',
          showCancel: false
        })
      } else {
        toast('请重新点击头像选择')
      }
      return
    }
    
    showLoading('上传中...')
    try {
      // 上传到云存储，得到 cloud:// fileID
      const fileID = await uploadImage(tempPath, 'avatars')
      
      // 立即保存到数据库
      const saveRes = await callCloud('userInit', {
        action: 'updateProfile',
        avatarUrl: fileID
      })
      
      wx.hideLoading()
      
      if (saveRes && saveRes.success) {
        const userInfo = this.data.userInfo || {}
        userInfo.avatarUrl = fileID
        this.setData({ userInfo })
        getApp().globalData.userInfo = userInfo
        toast('头像已保存', 'success')
      } else {
        toast(saveRes?.error || '保存失败')
      }
    } catch (err) {
      wx.hideLoading()
      console.error('头像上传失败', err)
      toast('头像上传失败')
    }
  },

  // 输入昵称（同时自动保存）
  onNicknameInput(e) {
    const nickName = e.detail.value
    const userInfo = this.data.userInfo || {}
    userInfo.nickName = nickName
    this.setData({ userInfo })
    
    // 如果头像已设置且昵称至少2个字，自动保存
    if (userInfo.avatarUrl && !userInfo.avatarUrl.includes('default-avatar') && nickName && nickName.trim().length >= 2) {
      // 防抖：延迟500ms后保存，避免每次输入都调用
      if (this._saveTimer) clearTimeout(this._saveTimer)
      this._saveTimer = setTimeout(() => {
        this.saveUserProfile()
      }, 500)
    }
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
        
        // 登录成功后更新 openid（如果云函数返回）
        if (saveRes.openid) {
          app.globalData.openid = saveRes.openid
        }
        
        this.setData({ userInfo })
        
        // 更新 phone-verify 组件的登录状态
        const phoneVerify = this.selectComponent('#phoneVerify')
        if (phoneVerify) {
          phoneVerify.checkLoginStatus()
        }
        
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

  // ===== 授权引导弹窗 =====
  // 弹窗内选择头像
  async onGuideChooseAvatar(e) {
    const tempPath = e.detail.avatarUrl
    if (!tempPath) return
    showLoading('上传中...')
    try {
      // 上传到云存储，得到 cloud:// fileID
      const fileID = await uploadImage(tempPath, 'avatars')
      
      // 立即保存到数据库
      const saveRes = await callCloud('userInit', {
        action: 'updateProfile',
        avatarUrl: fileID
      })
      
      wx.hideLoading()
      
      if (saveRes && saveRes.success) {
        this.setData({ guideAvatarUrl: fileID })
        toast('头像已保存', 'success')
      } else {
        toast(saveRes?.error || '头像保存失败')
      }
    } catch (err) {
      wx.hideLoading()
      console.error('头像上传失败', err)
      toast('头像上传失败，请重试')
    }
  },

  // 弹窗内输入昵称
  onGuideNickNameInput(e) {
    this.setData({ guideNickName: e.detail.value })
  },

  // 弹窗内保存
  async saveGuideProfile() {
    if (this.data._guideSaving) return
    const avatarUrl = this.data.guideAvatarUrl
    const nickName = (this.data.guideNickName || '').trim()

    if (!avatarUrl) {
      toast('请先点击头像获取微信头像')
      return
    }
    if (!nickName || nickName.length < 2) {
      toast('请输入昵称（至少2个字）')
      return
    }

    this.setData({ _guideSaving: true })
    showLoading('保存中...')
    try {
      const saveRes = await callCloud('userInit', {
        action: 'updateProfile',
        avatarUrl,
        nickName
      })
      wx.hideLoading()
      if (saveRes && saveRes.success) {
        const userInfo = { ...(this.data.userInfo || {}), avatarUrl, nickName }
        const app = getApp()
        app.globalData.userInfo = userInfo
        this.setData({
          userInfo,
          showProfileGuide: false,
          _guideSaving: false
        })
        toast('设置成功，欢迎加入！', 'success')
      } else {
        this.setData({ _guideSaving: false })
        toast('保存失败，请重试')
      }
    } catch (e) {
      wx.hideLoading()
      this.setData({ _guideSaving: false })
      toast('保存失败，请重试')
    }
  },

  // 跳过引导
  skipProfileGuide() {
    this.setData({ showProfileGuide: false })
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

  goToPoints() {
    wx.navigateTo({ url: '/pages/points-rule/index' })
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
  goToAdmin(e) {
    const tab = e.currentTarget.dataset.tab
    const url = tab !== undefined ? `/pages/admin/index?tab=${tab}` : '/pages/admin/index'
    wx.navigateTo({ url })
  },

  goToSettings() {
    wx.navigateTo({ url: '/pages/settings/index' })
  },

  // 跳转关于我们
  goToAbout() {
    wx.navigateTo({ url: '/pages/about/index' })
  },

  // 代购实名认证
  goDaigouVerify() {
    wx.navigateTo({ url: '/pages/daigou-verify/index' })
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

  // 代购订单
  goToDaigouOrders() {
    wx.navigateTo({ url: '/pages/daigou-order-list/index' })
  },

  // 钱包
  goToWallet() {
    wx.navigateTo({ url: '/pages/wallet/index' })
  },

  // 押金管理
  goToDaigouDeposit() {
    wx.navigateTo({ url: '/pages/daigou-deposit/index' })
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
  },

  // 手机号验证成功回调
  onPhoneVerified(e) {
    console.log('手机号验证成功:', e.detail)
    const { phoneNumber, creditScore } = e.detail

    // 更新页面数据
    this.setData({
      phoneNumber: phoneNumber,
      phoneVerified: true,
      creditScore: creditScore,
      _phoneJustVerified: true // 标记刚刚验证过，防止 onShow 覆盖
    })

    // 更新全局数据
    const app = getApp()
    app.globalData.creditScore = creditScore

    console.log('[mine] 更新后的数据:', {
      phoneNumber: this.data.phoneNumber,
      phoneVerified: this.data.phoneVerified
    })
  },

  // 测试订阅消息
  async testSubscribeMessage() {
    const TEMPLATE_ID = 'qkNEkQTj0waYSCgdJC7dSe9L5_gqfAQqme-J0IEFA_c' // 活动通知

    // 第1步：请求用户订阅授权
    const authRes = await new Promise((resolve) => {
      wx.requestSubscribeMessage({
        tmplIds: [TEMPLATE_ID],
        success: (res) => {
          console.log('[订阅授权] 成功:', res)
          resolve(res)
        },
        fail: (err) => {
          console.error('[订阅授权] 失败:', err)
          wx.showToast({ title: '授权失败', icon: 'none' })
          resolve({ err })
        }
      })
    })

    // 检查用户是否允许
    const acceptKey = TEMPLATE_ID
    if (authRes[acceptKey] === 'accept') {
      wx.showLoading({ title: '发送中...' })
      try {
        const openid = getApp().globalData.openid
        if (!openid) {
          wx.hideLoading()
          wx.showToast({ title: '当前用户未登录', icon: 'none' })
          return
        }

        // 第2步：发送订阅消息（通过云函数）
        const sendRes = await callCloud('sendSubscribeMsg', {
          action: 'activity',
          openid: openid,
          params: {
            content: '🔔 测试消息：您的特产互换订单有新动态，请留意查看！',
            startTime: new Date().toLocaleString(),
            endTime: '长期有效',
            remark: '这是一条来自互换特产小程序的测试消息',
            page: '/pages/order/index'
          }
        })

        wx.hideLoading()
        if (sendRes && sendRes.success) {
          wx.showToast({ title: '发送成功，请在微信服务通知中查看', icon: 'none', duration: 3000 })
        } else {
          console.error('[发送订阅消息] 失败:', JSON.stringify(sendRes))
          wx.showToast({ title: '发送失败：' + (sendRes?.error?.message || sendRes?.error?.errMsg || JSON.stringify(sendRes?.error) || '未知错误'), icon: 'none', duration: 4000 })
        }
      } catch (e) {
        wx.hideLoading()
        console.error('[发送订阅消息] 异常:', e)
        wx.showToast({ title: '发送异常：' + e.message, icon: 'none' })
      }
    } else if (authRes[acceptKey] === 'reject') {
      wx.showToast({ title: '您拒绝了授权，无法收到消息', icon: 'none' })
    } else {
      wx.showToast({ title: '授权结果未知', icon: 'none' })
    }
  }
})
