// cloudfunctions/daigouMgr/index.js
// 代购特产完整管理云函数 v2.0
// 接口：createOrder / getOrderDetail / getOrderList / shipOrder /
//       confirmReceived / cancelOrder / applyRefund / handleRefund /
//       submitVerify / getVerifyStatus / submitReview / getReview /
//       getDaigouLevel / updateDeposit / getSellerInfo

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// ========== 常量 ==========
const SERVICE_FEE_RATE = 0.05        // 平台服务费 5%
const AUTO_CONFIRM_DAYS = 14         // 发货后自动确认收货天数
const CANCEL_TIMEOUT_HOURS = 48      // 待发货超时自动取消小时数
const POINTS_TO_YUAN = 100           // 100积分 = 1元
const MAX_DEDUCT_RATE = 0.2          // 积分最多抵扣总价 20%
const BUYER_REWARD_RATE = 0.05       // 买家完成订单积分奖励比例（消费金额 5%）
const BUYER_REWARD_MIN = 5           // 买家奖励积分下限
const SELLER_REWARD_POINTS = 20      // 卖家每笔代购完成固定奖励积分

// ========== 代购等级体系 ==========
// 7个等级：新手代购 → 见习代购 → 普通代购 → 资深代购 → 金牌代购 → 钻石代购 → 传奇代购
const DAIGOU_LEVELS = [
  {
    level: 1,
    name: '新手代购',
    icon: '🌱',
    color: '#8E8E93',
    badge: 'free',               // 自由代购
    requiredOrders: 0,           // 完成订单数
    requiredCreditScore: 0,      // 最低信用分
    requiredDeposit: 0,          // 押金（元）
    maxOrderAmount: 200,         // 单笔最大代购金额
    maxConcurrentOrders: 2,      // 同时最多进行中订单数
    trustDesc: '新加入的代购，信息待核验',
    privileges: ['可发布代购商品', '基础买家评价']
  },
  {
    level: 2,
    name: '见习代购',
    icon: '🌿',
    color: '#34C759',
    badge: 'free',
    requiredOrders: 3,
    requiredCreditScore: 60,
    requiredDeposit: 0,
    maxOrderAmount: 500,
    maxConcurrentOrders: 3,
    trustDesc: '完成3笔订单，信用良好',
    privileges: ['可发布代购商品', '展示完成订单数', '信用徽章']
  },
  {
    level: 3,
    name: '普通代购',
    icon: '⭐',
    color: '#FF9500',
    badge: 'free',
    requiredOrders: 10,
    requiredCreditScore: 70,
    requiredDeposit: 0,
    maxOrderAmount: 1000,
    maxConcurrentOrders: 5,
    trustDesc: '经验丰富，好评率高',
    privileges: ['可发布代购商品', '展示好评率', '优先展示']
  },
  {
    level: 4,
    name: '资深代购',
    icon: '💫',
    color: '#007AFF',
    badge: 'free',
    requiredOrders: 30,
    requiredCreditScore: 80,
    requiredDeposit: 200,        // 需缴纳200元押金
    maxOrderAmount: 3000,
    maxConcurrentOrders: 10,
    trustDesc: '已缴押金，实名认证，值得信赖',
    privileges: ['蓝色认证标识', '缴押金保障', '专属客服通道']
  },
  {
    level: 5,
    name: '金牌代购',
    icon: '🥇',
    color: '#FFD700',
    badge: 'certified',          // 平台认证代购
    requiredOrders: 100,
    requiredCreditScore: 90,
    requiredDeposit: 500,        // 需缴纳500元押金
    maxOrderAmount: 10000,
    maxConcurrentOrders: 20,
    trustDesc: '平台认证，押金保障，信用极高',
    privileges: ['金色认证标识', '平台推荐', '纠纷优先保障']
  },
  {
    level: 6,
    name: '钻石代购',
    icon: '💎',
    color: '#5AC8FA',
    badge: 'certified',
    requiredOrders: 300,
    requiredCreditScore: 95,
    requiredDeposit: 2000,       // 需缴纳2000元押金
    maxOrderAmount: 50000,
    maxConcurrentOrders: 50,
    trustDesc: '顶级代购，平台重点推荐',
    privileges: ['钻石认证标识', '首页推荐位', '专属保障基金']
  },
  {
    level: 7,
    name: '传奇代购',
    icon: '👑',
    color: '#FF3B30',
    badge: 'certified',
    requiredOrders: 1000,
    requiredCreditScore: 98,
    requiredDeposit: 5000,       // 需缴纳5000元押金
    maxOrderAmount: 999999,
    maxConcurrentOrders: 999,
    trustDesc: '传奇代购，最高信任等级',
    privileges: ['王冠认证标识', '全站最高曝光', '优先结算', '专属保险']
  }
]

// ========== 工具函数 ==========

function generateOrderNo() {
  const now = new Date()
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const rand = Math.floor(Math.random() * 100000000).toString().padStart(8, '0')
  return `DG${date}${rand}`
}

async function resolveCloudUrl(url) {
  if (!url || !url.startsWith('cloud://')) return url
  try {
    const res = await cloud.getTempFileURL({ fileList: [url] })
    return res.fileList[0]?.tempFileURL || url
  } catch (e) {
    return url
  }
}

async function findUser(openid) {
  let res = await db.collection('users').where({ _openid: openid }).get()
  if (res.data && res.data[0]) return res.data[0]
  res = await db.collection('users').where({ openid }).get()
  return res.data && res.data[0] ? res.data[0] : null
}

/**
 * 计算代购等级（基于完成订单数、信用分、押金、诚信度）
 */
function calcDaigouLevel(stats) {
  const { completedOrders = 0, creditScore = 60, depositPaid = 0, isCertified = false } = stats

  // 从高到低找到第一个满足条件的等级
  for (let i = DAIGOU_LEVELS.length - 1; i >= 0; i--) {
    const lv = DAIGOU_LEVELS[i]
    if (
      completedOrders >= lv.requiredOrders &&
      creditScore >= lv.requiredCreditScore &&
      depositPaid >= lv.requiredDeposit &&
      (lv.badge !== 'certified' || isCertified)  // 平台认证等级需要管理员手动认证
    ) {
      return lv
    }
  }
  return DAIGOU_LEVELS[0]
}

/**
 * 验证管理员
 */
async function verifyAdmin(openid) {
  try {
    const cfgRes = await db.collection('system_config').doc('superadmins').get()
    const admins = cfgRes.data?.admins || []
    return admins.includes(openid)
  } catch (e) {
    return false
  }
}

async function ensureCollection() {
  try {
    await db.collection('daigouOrders').count()
    return true
  } catch (e) {
    if (e.errCode === -502005 || (e.message && e.message.includes('not exist'))) {
      return false
    }
    return true
  }
}

async function ensureCollectionByName(name) {
  try {
    await db.collection(name).count()
    return true
  } catch (e) {
    if (e.errCode === -502005 || (e.message && e.message.includes('not exist'))) {
      return false
    }
    return true
  }
}

// ========== 主入口 ==========
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, message: '未登录' }
  }

  const { action } = event

  // ──────────────────────────────────────────────────
  // 0. 初始化检测
  // ──────────────────────────────────────────────────
  if (action === 'initCheck') {
    const exists = await ensureCollection()
    return { success: true, collectionExists: exists, message: exists ? '集合正常' : '请在微信云开发控制台手动创建 daigouOrders 集合' }
  }

  // ══════════════════════════════════════════════════
  // ★★★ 实名认证相关 ★★★
  // ══════════════════════════════════════════════════

  // ──────────────────────────────────────────────────
  // A1. 提交实名认证（发布代购前必须完成）
  // ──────────────────────────────────────────────────
  if (action === 'submitVerify') {
    try {
      const { idCardFront, idCardBack, holdIdCardPhoto, realName, idCardNo } = event

      if (!idCardFront || !idCardBack || !holdIdCardPhoto) {
        return { success: false, message: '请上传身份证正面、反面和手持身份证照片' }
      }
      if (!realName || !realName.trim()) {
        return { success: false, message: '请填写真实姓名' }
      }
      if (!idCardNo || !/^\d{17}[\dXx]$/.test(idCardNo.trim())) {
        return { success: false, message: '请填写正确的身份证号码' }
      }

      // 查找用户
      const user = await findUser(openid)
      if (!user) return { success: false, message: '用户不存在，请重新登录' }

      // 检查是否已通过认证
      if (user.daigouVerify && user.daigouVerify.status === 'approved') {
        return { success: false, message: '您已完成实名认证，无需重复提交' }
      }

      // 检查是否有待审核申请
      if (user.daigouVerify && user.daigouVerify.status === 'pending') {
        return { success: false, message: '您的认证申请正在审核中，请耐心等待' }
      }

      // 身份证号脱敏存储（只存后4位，完整号码敏感信息只给管理员查）
      const idCardNoMasked = idCardNo.replace(/^(.{6})(.+)(.{4})$/, '$1****$3')

      const verifyData = {
        status: 'pending',           // pending / approved / rejected
        realName: realName.trim(),
        idCardNo: idCardNo.trim(),   // 完整号码（管理员可见，前端只展示脱敏版）
        idCardNoMasked,
        idCardFront,                 // cloud:// URL
        idCardBack,
        holdIdCardPhoto,
        submitTime: db.serverDate(),
        reviewNote: '',
        reviewTime: null,
        reviewBy: null,
        rejectCount: (user.daigouVerify?.rejectCount || 0)
      }

      await db.collection('users').doc(user._id).update({
        data: {
          daigouVerify: verifyData,
          updateTime: db.serverDate()
        }
      })

      // 同时在 daigouVerify 集合中创建审核任务（方便管理员批量查询）
      try {
        // 先检查是否已有记录
        const existRes = await db.collection('daigouVerify')
          .where({ userOpenid: openid })
          .get()

        if (existRes.data && existRes.data.length > 0) {
          // 更新已有记录
          await db.collection('daigouVerify').doc(existRes.data[0]._id).update({
            data: {
              status: 'pending',
              realName: realName.trim(),
              idCardNoMasked,
              idCardFront,
              idCardBack,
              holdIdCardPhoto,
              submitTime: db.serverDate(),
              createTime: db.serverDate(),
              userId: user._id,
              nickName: user.nickName || '',
              avatarUrl: user.avatarUrl || '',
              phone: user.phoneNumber || user.phone || '',
              reviewNote: '',
              reviewTime: null,
              reviewBy: null
            }
          })
        } else {
          // 新建记录
          await db.collection('daigouVerify').add({
            data: {
              userOpenid: openid,
              userId: user._id,
              nickName: user.nickName || '',
              avatarUrl: user.avatarUrl || '',
              phone: user.phoneNumber || user.phone || '',
              status: 'pending',
              realName: realName.trim(),
              idCardNoMasked,
              idCardFront,
              idCardBack,
              holdIdCardPhoto,
              submitTime: db.serverDate(),
              createTime: db.serverDate(),
              reviewNote: '',
              reviewTime: null,
              reviewBy: null
            }
          })
        }
      } catch (e) {
        // 队列写入失败不影响主流程
        console.warn('[daigouMgr/submitVerify] verify queue write failed:', e.message)
      }

      return { success: true, message: '认证申请已提交，管理员将在1-3个工作日内审核' }
    } catch (e) {
      console.error('[daigouMgr/submitVerify]', e)
      return { success: false, message: e.message || '提交失败' }
    }
  }

  // ──────────────────────────────────────────────────
  // A2. 获取实名认证状态
  // ──────────────────────────────────────────────────
  if (action === 'getVerifyStatus') {
    try {
      const user = await findUser(openid)
      if (!user) return { success: false, message: '用户不存在' }

      // 格式化时间为字符串
      function fmtDate(t) {
        if (!t) return ''
        try {
          const d = t instanceof Date ? t : new Date(typeof t === 'object' && t.$date ? t.$date : t)
          if (isNaN(d.getTime())) return ''
          const pad = n => String(n).padStart(2, '0')
          return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
        } catch (e) { return '' }
      }

      const verify = user.daigouVerify || null
      // 不返回完整身份证号
      const safeVerify = verify ? {
        status: verify.status,
        realName: verify.realName ? verify.realName.substring(0, 1) + '*'.repeat(verify.realName.length - 1) : '',
        idCardNoMasked: verify.idCardNoMasked || '',
        submitTime: fmtDate(verify.submitTime),
        reviewNote: verify.reviewNote || '',
        reviewTime: fmtDate(verify.reviewTime),
        rejectCount: verify.rejectCount || 0
      } : null

      // 获取代购统计
      const stats = user.daigouStats || {
        completedOrders: 0,
        creditScore: user.creditScore || 60,
        depositPaid: 0,
        isCertified: false
      }
      stats.creditScore = user.creditScore || stats.creditScore || 60

      const levelInfo = calcDaigouLevel(stats)

      return {
        success: true,
        verify: safeVerify,
        isVerified: verify && verify.status === 'approved',
        levelInfo,
        stats
      }
    } catch (e) {
      console.error('[daigouMgr/getVerifyStatus]', e)
      return { success: false, message: e.message || '查询失败' }
    }
  }

  // ──────────────────────────────────────────────────
  // A3. 获取代购等级信息（全部等级，供展示用）
  // ──────────────────────────────────────────────────
  if (action === 'getDaigouLevels') {
    return {
      success: true,
      levels: DAIGOU_LEVELS
    }
  }

  // ──────────────────────────────────────────────────
  // A4. 获取卖家代购信息（买家在商品详情页查看）
  // ──────────────────────────────────────────────────
  if (action === 'getSellerDaigouInfo') {
    try {
      const { sellerOpenid } = event
      if (!sellerOpenid) return { success: false, message: '缺少sellerOpenid' }

      const seller = await findUser(sellerOpenid)
      if (!seller) return { success: false, message: '卖家不存在' }

      const verify = seller.daigouVerify || {}
      const stats = seller.daigouStats || {
        completedOrders: 0,
        creditScore: seller.creditScore || 60,
        depositPaid: 0,
        isCertified: false
      }
      stats.creditScore = seller.creditScore || stats.creditScore || 60

      const levelInfo = calcDaigouLevel(stats)

      // 查询近30笔评价平均分（集合不存在时静默处理）
      let avgRating = 0
      try {
        const reviewRes = await db.collection('daigouReviews')
          .where({ sellerOpenid, role: 'buyer' })
          .orderBy('createTime', 'desc')
          .limit(30)
          .get()
        if (reviewRes.data && reviewRes.data.length > 0) {
          avgRating = reviewRes.data.reduce((sum, r) => sum + (r.rating || 5), 0) / reviewRes.data.length
          avgRating = Math.round(avgRating * 10) / 10
        }
      } catch (e) {
        // -502005: 集合不存在，忽略
      }

      return {
        success: true,
        seller: {
          nickName: seller.nickName || '',
          avatarUrl: seller.avatarUrl || '',
          levelInfo,
          isVerified: verify.status === 'approved',
          completedOrders: stats.completedOrders || 0,
          depositPaid: stats.depositPaid || 0,
          isCertified: stats.isCertified || false,
          avgRating,
          creditScore: stats.creditScore
        }
      }
    } catch (e) {
      console.error('[daigouMgr/getSellerDaigouInfo]', e)
      return { success: false, message: e.message || '查询失败' }
    }
  }

  // ══════════════════════════════════════════════════
  // ★★★ 订单评价相关 ★★★
  // ══════════════════════════════════════════════════

  // ──────────────────────────────────────────────────
  // B1. 提交评价（买家或卖家）
  //   买家：必须上传3张图 + 10字以上评价
  //   卖家：文字评价即可（无图片要求）
  // ──────────────────────────────────────────────────
  if (action === 'submitReview') {
    try {
      const { orderId, rating, content, images = [], role } = event
      // role: 'buyer' | 'seller'

      if (!orderId) return { success: false, message: '缺少订单ID' }
      if (!rating || rating < 1 || rating > 5) return { success: false, message: '请选择评分（1-5星）' }
      if (!content || content.trim().length < 10) return { success: false, message: '评价内容不少于10个字' }
      if (!role || !['buyer', 'seller'].includes(role)) return { success: false, message: '角色参数错误' }

      // 买家必须上传3张图
      if (role === 'buyer') {
        if (!images || images.length < 3) {
          return { success: false, message: '买家评价必须上传至少3张图片（收货照片）' }
        }
      }

      // 查询订单
      let order
      try {
        const res = await db.collection('daigouOrders').doc(orderId).get()
        order = res.data
      } catch (e) {
        return { success: false, message: '订单不存在' }
      }

      // 验证身份
      const isBuyer = order.buyerOpenid === openid
      const isSeller = order.sellerOpenid === openid

      if (role === 'buyer' && !isBuyer) return { success: false, message: '无权操作' }
      if (role === 'seller' && !isSeller) return { success: false, message: '无权操作' }

      // 订单必须是 completed 状态
      if (order.status !== 'completed') {
        return { success: false, message: '交易完成后才能评价' }
      }

      // 检查是否已经评价
      const reviewField = role === 'buyer' ? 'buyerReviewed' : 'sellerReviewed'
      if (order[reviewField]) {
        return { success: false, message: '您已完成评价，不可重复提交' }
      }

      // 检查 daigouReviews 集合是否存在
      const reviewsExists = await ensureCollectionByName('daigouReviews')
      if (!reviewsExists) {
        return {
          success: false,
          message: '评价功能数据表未初始化，请联系管理员在云开发控制台创建 daigouReviews 集合',
          errCode: 'COLLECTION_NOT_EXIST'
        }
      }

      // 处理图片（cloud:// 转临时链接存储不同，这里直接存cloud://）
      const reviewDoc = {
        orderId,
        orderNo: order.orderNo || '',
        role,                          // buyer | seller
        reviewerOpenid: openid,
        sellerOpenid: order.sellerOpenid,
        buyerOpenid: order.buyerOpenid,
        productId: order.productId || '',
        productName: order.productName || '',
        rating,
        content: content.trim(),
        images: role === 'buyer' ? images : [],  // 买家有图片，卖家无
        createTime: db.serverDate()
      }

      await db.collection('daigouReviews').add({ data: reviewDoc })

      // 标记订单已评价
      await db.collection('daigouOrders').doc(orderId).update({
        data: {
          [reviewField]: true,
          [`${role}ReviewTime`]: db.serverDate(),
          updateTime: db.serverDate()
        }
      })

      // 被评价方信用分/统计更新
      const targetOpenid = role === 'buyer' ? order.sellerOpenid : order.buyerOpenid
      const targetUser = await findUser(targetOpenid)
      if (targetUser) {
        // 根据评分调整信用分：5星+2, 4星+1, 3星不变, 2星-1, 1星-3
        const creditDelta = [0, -3, -1, 0, 1, 2][rating] || 0
        const updates = { updateTime: db.serverDate() }
        if (creditDelta !== 0) {
          updates.creditScore = _.inc(creditDelta)
        }
        // 买家评价卖家时更新卖家代购统计
        if (role === 'buyer') {
          updates['daigouStats.totalRating'] = _.inc(rating)
          updates['daigouStats.reviewCount'] = _.inc(1)
        }
        await db.collection('users').doc(targetUser._id).update({ data: updates })
      }

      // 检查双方是否都已评价，若是则更新订单状态为fully_reviewed
      const updatedOrderRes = await db.collection('daigouOrders').doc(orderId).get()
      const updatedOrder = updatedOrderRes.data
      if (updatedOrder.buyerReviewed && updatedOrder.sellerReviewed) {
        await db.collection('daigouOrders').doc(orderId).update({
          data: {
            fullyReviewed: true,
            fullyReviewedTime: db.serverDate(),
            updateTime: db.serverDate()
          }
        })
      }

      return { success: true, message: '评价提交成功，感谢您的反馈！' }
    } catch (e) {
      console.error('[daigouMgr/submitReview]', e)
      return { success: false, message: e.message || '提交失败' }
    }
  }

  // ──────────────────────────────────────────────────
  // B2. 获取订单评价状态（用于判断是否需要弹出评价弹窗）
  // ──────────────────────────────────────────────────
  if (action === 'getReviewStatus') {
    try {
      const { orderId } = event
      if (!orderId) return { success: false, message: '缺少订单ID' }

      const res = await db.collection('daigouOrders').doc(orderId).get()
      const order = res.data

      const isBuyer = order.buyerOpenid === openid
      const isSeller = order.sellerOpenid === openid

      if (!isBuyer && !isSeller) return { success: false, message: '无权查看' }

      // 查询自己的评价（集合不存在时静默处理）
      const myReviewRole = isBuyer ? 'buyer' : 'seller'
      let myReview = null
      try {
        const reviewRes = await db.collection('daigouReviews')
          .where({ orderId, reviewerOpenid: openid })
          .limit(1)
          .get()
        myReview = reviewRes.data && reviewRes.data[0] ? reviewRes.data[0] : null
      } catch (e) {
        // -502005: 集合不存在，忽略
        if (e.errCode !== -502005) console.warn('[daigouMgr/getReviewStatus] query daigouReviews failed:', e.message)
      }

      return {
        success: true,
        isBuyer,
        isSeller,
        buyerReviewed: !!order.buyerReviewed,
        sellerReviewed: !!order.sellerReviewed,
        myReviewed: isBuyer ? !!order.buyerReviewed : !!order.sellerReviewed,
        myReview,
        needReview: order.status === 'completed' && !(isBuyer ? order.buyerReviewed : order.sellerReviewed)
      }
    } catch (e) {
      console.error('[daigouMgr/getReviewStatus]', e)
      return { success: false, message: e.message || '查询失败' }
    }
  }

  // ──────────────────────────────────────────────────
  // B3. 获取卖家的全部评价列表（商品详情页展示）
  // ──────────────────────────────────────────────────
  if (action === 'getSellerReviews') {
    try {
      const { sellerOpenid, page = 1, pageSize = 10 } = event
      if (!sellerOpenid) return { success: false, message: '缺少sellerOpenid' }

      // 集合不存在时返回空列表
      const reviewsExists = await ensureCollectionByName('daigouReviews')
      if (!reviewsExists) {
        return { success: true, list: [], total: 0, page, pageSize }
      }

      const skip = (page - 1) * pageSize
      const countRes = await db.collection('daigouReviews')
        .where({ sellerOpenid, role: 'buyer' })
        .count()
      const listRes = await db.collection('daigouReviews')
        .where({ sellerOpenid, role: 'buyer' })
        .orderBy('createTime', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get()

      // 处理图片
      const list = listRes.data
      const allImgs = []
      list.forEach(r => {
        if (r.images && r.images.length) {
          r.images.forEach(img => { if (img && img.startsWith('cloud://')) allImgs.push(img) })
        }
      })
      if (allImgs.length > 0) {
        try {
          const tmpRes = await cloud.getTempFileURL({ fileList: [...new Set(allImgs)].slice(0, 50) })
          const urlMap = {}
          tmpRes.fileList.forEach(f => { if (f.tempFileURL) urlMap[f.fileID] = f.tempFileURL })
          list.forEach(r => {
            if (r.images) r.images = r.images.map(img => urlMap[img] || img)
          })
        } catch (e) {}
      }

      // 脱敏处理评价者信息
      const enriched = await Promise.all(list.map(async r => {
        try {
          const reviewer = await findUser(r.reviewerOpenid)
          return {
            ...r,
            reviewerName: reviewer ? (reviewer.nickName || '用户').substring(0, 4) + '***' : '用户***',
            reviewerAvatar: reviewer ? reviewer.avatarUrl || '' : ''
          }
        } catch (e) {
          return { ...r, reviewerName: '用户***', reviewerAvatar: '' }
        }
      }))

      return {
        success: true,
        list: enriched,
        total: countRes.total,
        page,
        pageSize
      }
    } catch (e) {
      console.error('[daigouMgr/getSellerReviews]', e)
      return { success: false, message: e.message || '查询失败' }
    }
  }

  // ══════════════════════════════════════════════════
  // ★★★ 订单核心流程（原有 + 扩展）★★★
  // ══════════════════════════════════════════════════

  // ──────────────────────────────────────────────────
  // 1. 创建代购订单
  // ──────────────────────────────────────────────────
  if (action === 'createOrder') {
    const collectionExists = await ensureCollection()
    if (!collectionExists) {
      return {
        success: false,
        message: '系统初始化中，请联系管理员创建数据表（daigouOrders）',
        errCode: 'COLLECTION_NOT_EXIST'
      }
    }

    try {
      const { productId, addressId, remark = '', usePoints = false, pointsUsed = 0 } = event

      if (!productId || !addressId) {
        return { success: false, message: '参数不完整' }
      }

      let product
      try {
        const pRes = await db.collection('products').doc(productId).get()
        product = pRes.data
      } catch (e) {
        return { success: false, message: '特产不存在' }
      }

      if (!product.daigou || !product.daigou.enabled) {
        return { success: false, message: '该特产暂不支持代购' }
      }

      if (!['active', 'in_swap'].includes(product.status)) {
        return { success: false, message: '该特产当前不可购买' }
      }

      if (product.openid === openid || product._openid === openid) {
        return { success: false, message: '不能购买自己发布的特产' }
      }

      const stock = product.daigou.stock || 0
      if (stock <= 0) {
        return { success: false, message: '库存不足' }
      }

      let address
      try {
        const aRes = await db.collection('addresses').doc(addressId).get()
        address = aRes.data
        if (address._openid !== openid && address.openid !== openid) {
          return { success: false, message: '地址不属于当前用户' }
        }
      } catch (e) {
        return { success: false, message: '收货地址不存在' }
      }

      const buyer = await findUser(openid)
      if (!buyer) {
        return { success: false, message: '用户信息不存在，请重新登录' }
      }

      const price = product.daigou.price
      const serviceFee = Math.round(price * SERVICE_FEE_RATE * 100) / 100
      const orderNo = generateOrderNo()

      let actualPointsUsed = 0
      let pointsDeductAmount = 0
      let actualPrice = price

      if (usePoints && pointsUsed > 0) {
        const currentPoints = Number(buyer.points) || 0
        const maxDeductAmt = Math.floor(price * MAX_DEDUCT_RATE * 100) / 100
        const maxPointsAllowed = Math.ceil(maxDeductAmt * POINTS_TO_YUAN)
        actualPointsUsed = Math.min(currentPoints, maxPointsAllowed, pointsUsed)
        actualPointsUsed = Math.max(0, actualPointsUsed)
        pointsDeductAmount = Math.floor(actualPointsUsed / POINTS_TO_YUAN * 100) / 100
        actualPrice = Math.max(0, Math.round((price - pointsDeductAmount) * 100) / 100)

        if (actualPointsUsed > 0 && currentPoints < actualPointsUsed) {
          return { success: false, message: `积分不足，当前 ${currentPoints} 分` }
        }
      }

      // 获取卖家代购等级（冗余到订单）
      const sellerOpenidForQuery = product.openid || product._openid || ''
      const seller = sellerOpenidForQuery ? await findUser(sellerOpenidForQuery) : null
      const sellerStats = (seller && seller.daigouStats) ? seller.daigouStats : {
        completedOrders: 0,
        creditScore: (seller && seller.creditScore) || 60,
        depositPaid: 0,
        isCertified: false
      }
      const sellerLevel = calcDaigouLevel(sellerStats)

      // ── 卖家等级限制校验 ──
      const price = product.daigou.price
      if (price > sellerLevel.maxOrderAmount) {
        return {
          success: false,
          message: `该代购商品单价超过卖家当前等级（${sellerLevel.name}）可接单上限 ¥${sellerLevel.maxOrderAmount}`
        }
      }

      // 检查卖家在途订单数（只检查 pending_shipment + shipped 状态）
      try {
        const inProgressRes = await db.collection('daigouOrders')
          .where({
            sellerOpenid: sellerOpenidForQuery,
            status: _.in(['pending_shipment', 'shipped'])
          })
          .count()
        if (inProgressRes.total >= sellerLevel.maxConcurrentOrders) {
          return {
            success: false,
            message: `卖家当前进行中订单已达上限（${sellerLevel.maxConcurrentOrders}笔），请稍后再试`
          }
        }
      } catch (e) {
        // 查询失败不阻断下单（宽松处理）
        console.warn('[daigouMgr/createOrder] check concurrent orders failed:', e.message)
      }

      const orderRes = await db.collection('daigouOrders').add({
        data: {
          orderNo,
          productId,
          productName: product.name || '神秘特产',
          productImage: product.images && product.images[0] ? product.images[0] : '',
          productProvince: product.province || '',
          sellerOpenid: product.openid || product._openid,
          buyerOpenid: openid,
          buyerInfo: {
            nickName: buyer.nickName || '',
            avatarUrl: buyer.avatarUrl || ''
          },
          sellerInfo: {
            nickName: seller?.nickName || '',
            avatarUrl: seller?.avatarUrl || '',
            levelName: sellerLevel.name,
            levelIcon: sellerLevel.icon,
            levelColor: sellerLevel.color,
            badge: sellerLevel.badge,
            isVerified: seller?.daigouVerify?.status === 'approved',
            isCertified: sellerStats.isCertified || false
          },
          price,
          originalPrice: product.daigou.originalPrice || 0,
          serviceFee,
          pointsUsed: actualPointsUsed,
          pointsDeductAmount,
          actualPrice,
          totalAmount: price,
          shippingAddress: {
            name: address.contactName || address.name || '',
            phone: address.contactPhone || address.phone || '',
            province: address.province || '',
            city: address.city || '',
            district: address.district || '',
            detail: address.detailAddress || address.detail || ''
          },
          remark,
          status: 'pending_shipment',
          payTime: db.serverDate(),
          createTime: db.serverDate(),
          updateTime: db.serverDate(),
          buyerReviewed: false,
          sellerReviewed: false
        }
      })

      const orderId = orderRes._id

      await db.collection('products').doc(productId).update({
        data: {
          'daigou.stock': _.inc(-1),
          'daigou.soldCount': _.inc(1),
          updateTime: db.serverDate()
        }
      })

      if (actualPointsUsed > 0) {
        await db.collection('users').doc(buyer._id).update({
          data: { points: _.inc(-actualPointsUsed), updateTime: db.serverDate() }
        })
        await db.collection('points_log').add({
          data: {
            _openid: openid,
            type: 'daigou_deduct',
            amount: -actualPointsUsed,
            desc: `代购下单抵扣：${product.name || '特产'}`,
            orderId,
            createTime: db.serverDate()
          }
        })
      }

      return {
        success: true,
        orderId,
        orderNo,
        actualPrice,
        pointsUsed: actualPointsUsed,
        message: '下单成功，等待卖家发货'
      }
    } catch (e) {
      console.error('[daigouMgr/createOrder]', e)
      return { success: false, message: e.message || '下单失败' }
    }
  }

  // ──────────────────────────────────────────────────
  // 2. 获取订单详情
  // ──────────────────────────────────────────────────
  if (action === 'getOrderDetail') {
    try {
      const { orderId } = event
      if (!orderId) return { success: false, message: '缺少订单ID' }

      const res = await db.collection('daigouOrders').doc(orderId).get()
      const order = res.data

      if (order.buyerOpenid !== openid && order.sellerOpenid !== openid) {
        return { success: false, message: '无权查看此订单' }
      }

      if (order.productImage && order.productImage.startsWith('cloud://')) {
        order.productImage = await resolveCloudUrl(order.productImage)
      }

      // 补全买家昵称（buyerInfo 可能在旧订单中为空）
      if (!order.buyerInfo || !order.buyerInfo.nickName) {
        try {
          const buyerUser = await findUser(order.buyerOpenid)
          order.buyerInfo = {
            nickName: buyerUser?.nickName || '',
            avatarUrl: buyerUser?.avatarUrl || ''
          }
        } catch (e) {
          order.buyerInfo = order.buyerInfo || { nickName: '', avatarUrl: '' }
        }
      }

      const isBuyer = order.buyerOpenid === openid
      const needBuyerReview = isBuyer && order.status === 'completed' && !order.buyerReviewed
      const needSellerReview = !isBuyer && order.status === 'completed' && !order.sellerReviewed

      return { success: true, order, isBuyer, needReview: isBuyer ? needBuyerReview : needSellerReview }
    } catch (e) {
      console.error('[daigouMgr/getOrderDetail]', e)
      return { success: false, message: e.message || '获取失败' }
    }
  }

  // ──────────────────────────────────────────────────
  // 3. 获取订单列表
  // ──────────────────────────────────────────────────
  if (action === 'getOrderList') {
    try {
      const { role = 'buyer', status, page = 1, pageSize = 20 } = event

      const whereClause = {}
      if (role === 'buyer') {
        whereClause.buyerOpenid = openid
      } else {
        whereClause.sellerOpenid = openid
      }
      if (status) {
        whereClause.status = status
      }

      const skip = (page - 1) * pageSize
      const countRes = await db.collection('daigouOrders').where(whereClause).count()
      const listRes = await db.collection('daigouOrders')
        .where(whereClause)
        .orderBy('createTime', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get()

      const orders = listRes.data
      const cloudUrls = orders.map(o => o.productImage).filter(u => u && u.startsWith('cloud://'))
      if (cloudUrls.length > 0) {
        try {
          const tempRes = await cloud.getTempFileURL({ fileList: [...new Set(cloudUrls)] })
          const urlMap = {}
          tempRes.fileList.forEach(f => { if (f.tempFileURL) urlMap[f.fileID] = f.tempFileURL })
          orders.forEach(o => {
            if (o.productImage && urlMap[o.productImage]) {
              o.productImage = urlMap[o.productImage]
            }
          })
        } catch (e) {}
      }

      // 格式化时间字段供前端直接展示
      orders.forEach(o => {
        if (o.createTime) {
          const d = new Date(o.createTime)
          const pad = n => String(n).padStart(2, '0')
          o.createTimeText = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
        } else {
          o.createTimeText = ''
        }
      })

      // 补全对方用户昵称/头像（列表展示用）
      // 买家视角：显示卖家信息；卖家视角：显示买家信息
      try {
        const counterpartOpenids = [...new Set(orders.map(o =>
          role === 'buyer' ? o.sellerOpenid : o.buyerOpenid
        ).filter(Boolean))]

        if (counterpartOpenids.length > 0) {
          const usersRes = await db.collection('users')
            .where({ _openid: _.in(counterpartOpenids) })
            .field({ _openid: true, nickName: true, avatarUrl: true })
            .get()

          const userMap = {}
          for (const u of usersRes.data) {
            userMap[u._openid] = {
              nickName: u.nickName || '用户',
              avatarUrl: u.avatarUrl || ''
            }
          }

          // 将对方昵称注入到订单里
          orders.forEach(o => {
            const counterOpenid = role === 'buyer' ? o.sellerOpenid : o.buyerOpenid
            const counterUser = userMap[counterOpenid] || {}
            if (role === 'buyer') {
              // 买家视角：sellerInfo 可能已在订单中，补全 nickName
              if (!o.sellerInfo || !o.sellerInfo.nickName) {
                o.sellerInfo = { ...(o.sellerInfo || {}), nickName: counterUser.nickName || '代购者', avatarUrl: counterUser.avatarUrl || '' }
              }
              o.sellerNickName = o.sellerInfo.nickName
            } else {
              // 卖家视角：buyerInfo 可能已在订单中，补全 nickName
              if (!o.buyerInfo || !o.buyerInfo.nickName) {
                o.buyerInfo = { ...(o.buyerInfo || {}), nickName: counterUser.nickName || '买家', avatarUrl: counterUser.avatarUrl || '' }
              }
              o.buyerNickName = o.buyerInfo.nickName
            }
          })
        }
      } catch (e) {
        // 用户信息补全失败不影响主流程
        console.warn('[daigouMgr/getOrderList] 补全用户信息失败:', e.message)
      }

      return {
        success: true,
        list: orders,
        total: countRes.total,
        page,
        pageSize
      }
    } catch (e) {
      console.error('[daigouMgr/getOrderList]', e)
      return { success: false, message: e.message || '获取失败' }
    }
  }

  // ──────────────────────────────────────────────────
  // 4. 卖家发货
  // ──────────────────────────────────────────────────
  if (action === 'shipOrder') {
    try {
      const { orderId, expressCompany, expressNo } = event
      if (!orderId || !expressCompany || !expressNo) {
        return { success: false, message: '请填写完整快递信息' }
      }

      const res = await db.collection('daigouOrders').doc(orderId).get()
      const order = res.data

      if (order.sellerOpenid !== openid) {
        return { success: false, message: '无权操作' }
      }
      if (order.status !== 'pending_shipment') {
        return { success: false, message: '当前状态不可发货' }
      }

      const autoConfirmTime = new Date(Date.now() + AUTO_CONFIRM_DAYS * 24 * 60 * 60 * 1000)

      await db.collection('daigouOrders').doc(orderId).update({
        data: {
          status: 'shipped',
          expressCompany,
          expressNo,
          shipTime: db.serverDate(),
          autoConfirmTime,
          updateTime: db.serverDate()
        }
      })

      return { success: true, message: '发货成功' }
    } catch (e) {
      console.error('[daigouMgr/shipOrder]', e)
      return { success: false, message: e.message || '发货失败' }
    }
  }

  // ──────────────────────────────────────────────────
  // 5. 买家确认收货（确认后跳转到评价页）
  // ──────────────────────────────────────────────────
  if (action === 'confirmReceived') {
    try {
      const { orderId } = event
      if (!orderId) return { success: false, message: '缺少订单ID' }

      const res = await db.collection('daigouOrders').doc(orderId).get()
      const order = res.data

      if (order.buyerOpenid !== openid) {
        return { success: false, message: '无权操作' }
      }
      if (order.status !== 'shipped') {
        return { success: false, message: '当前状态不可确认收货' }
      }

      const actualPrice = order.actualPrice || order.price || 0
      const buyerReward = Math.max(BUYER_REWARD_MIN, Math.ceil(actualPrice * BUYER_REWARD_RATE))

      await db.collection('daigouOrders').doc(orderId).update({
        data: {
          status: 'completed',
          confirmTime: db.serverDate(),
          completeTime: db.serverDate(),
          pointsRewarded: buyerReward,
          updateTime: db.serverDate()
        }
      })

      const buyerUser = await findUser(openid)
      if (buyerUser) {
        await db.collection('users').doc(buyerUser._id).update({
          data: { points: _.inc(buyerReward), updateTime: db.serverDate() }
        })
        await db.collection('points_log').add({
          data: {
            _openid: openid,
            type: 'daigou_complete',
            amount: buyerReward,
            desc: `代购收货奖励：${order.productName}`,
            orderId,
            createTime: db.serverDate()
          }
        })
      }

      const sellerUser = await findUser(order.sellerOpenid)
      if (sellerUser) {
        await db.collection('users').doc(sellerUser._id).update({
          data: {
            points: _.inc(SELLER_REWARD_POINTS),
            'daigouStats.completedOrders': _.inc(1),
            updateTime: db.serverDate()
          }
        })
        await db.collection('points_log').add({
          data: {
            _openid: order.sellerOpenid,
            type: 'daigou_sold',
            amount: SELLER_REWARD_POINTS,
            desc: `代购成交奖励：${order.productName}`,
            orderId,
            createTime: db.serverDate()
          }
        })
      }

      return {
        success: true,
        pointsRewarded: buyerReward,
        message: '确认收货成功，请对本次交易进行评价'
      }
    } catch (e) {
      console.error('[daigouMgr/confirmReceived]', e)
      return { success: false, message: e.message || '操作失败' }
    }
  }

  // ──────────────────────────────────────────────────
  // 6. 取消订单
  // ──────────────────────────────────────────────────
  if (action === 'cancelOrder') {
    try {
      const { orderId, reason = '' } = event
      if (!orderId) return { success: false, message: '缺少订单ID' }

      const res = await db.collection('daigouOrders').doc(orderId).get()
      const order = res.data

      const isBuyer = order.buyerOpenid === openid
      const isSeller = order.sellerOpenid === openid

      if (!isBuyer && !isSeller) {
        return { success: false, message: '无权操作' }
      }

      const cancellableStatuses = ['pending_payment', 'pending_shipment']
      if (!cancellableStatuses.includes(order.status)) {
        return { success: false, message: '当前状态不可取消' }
      }

      if (isSeller && order.status === 'shipped') {
        return { success: false, message: '已发货不可取消，请等待买家确认收货' }
      }

      await db.collection('daigouOrders').doc(orderId).update({
        data: {
          status: 'cancelled',
          cancelBy: isBuyer ? 'buyer' : 'seller',
          cancelReason: reason,
          cancelTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })

      // 恢复库存；soldCount 防止变负（用 gt(0) 条件保护）
      try {
        await db.collection('products').doc(order.productId).update({
          data: {
            'daigou.stock': _.inc(1),
            updateTime: db.serverDate()
          }
        })
        // 仅在 soldCount > 0 时才减少（避免变负）
        const pRes = await db.collection('products').doc(order.productId).get()
        if (pRes.data && pRes.data.daigou && pRes.data.daigou.soldCount > 0) {
          await db.collection('products').doc(order.productId).update({
            data: { 'daigou.soldCount': _.inc(-1) }
          })
        }
      } catch (e) {
        console.warn('[daigouMgr/cancelOrder] restore stock failed:', e.message)
      }

      return { success: true, message: '订单已取消' }
    } catch (e) {
      console.error('[daigouMgr/cancelOrder]', e)
      return { success: false, message: e.message || '取消失败' }
    }
  }

  // ──────────────────────────────────────────────────
  // 7. 申请退款
  // ──────────────────────────────────────────────────
  if (action === 'applyRefund') {
    try {
      const { orderId, reason = '' } = event
      if (!orderId) return { success: false, message: '缺少订单ID' }

      const res = await db.collection('daigouOrders').doc(orderId).get()
      const order = res.data

      if (order.buyerOpenid !== openid) {
        return { success: false, message: '无权操作' }
      }
      if (!['shipped', 'completed'].includes(order.status)) {
        return { success: false, message: '当前状态不可申请退款' }
      }
      if (order.refundStatus) {
        return { success: false, message: '已申请退款，请勿重复操作' }
      }

      await db.collection('daigouOrders').doc(orderId).update({
        data: {
          status: 'refunding',
          refundStatus: 'pending',
          refundReason: reason,
          refundApplyTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })

      return { success: true, message: '退款申请已提交，等待卖家处理' }
    } catch (e) {
      console.error('[daigouMgr/applyRefund]', e)
      return { success: false, message: e.message || '申请失败' }
    }
  }

  // ──────────────────────────────────────────────────
  // 8. 处理退款
  // ──────────────────────────────────────────────────
  if (action === 'handleRefund') {
    try {
      const { orderId, approve, rejectReason = '' } = event
      if (!orderId || approve === undefined) {
        return { success: false, message: '参数不完整' }
      }

      const res = await db.collection('daigouOrders').doc(orderId).get()
      const order = res.data

      const isSeller = order.sellerOpenid === openid
      const isAdmin = await verifyAdmin(openid)

      if (!isSeller && !isAdmin) {
        return { success: false, message: '无权操作' }
      }
      if (order.status !== 'refunding') {
        return { success: false, message: '当前状态不可处理退款' }
      }

      if (approve) {
        await db.collection('daigouOrders').doc(orderId).update({
          data: {
            status: 'refunded',
            refundStatus: 'approved',
            refundTime: db.serverDate(),
            updateTime: db.serverDate()
          }
        })
        // 恢复库存，防止 soldCount 变负
        try {
          await db.collection('products').doc(order.productId).update({
            data: { 'daigou.stock': _.inc(1), updateTime: db.serverDate() }
          })
          const pRes2 = await db.collection('products').doc(order.productId).get()
          if (pRes2.data && pRes2.data.daigou && pRes2.data.daigou.soldCount > 0) {
            await db.collection('products').doc(order.productId).update({
              data: { 'daigou.soldCount': _.inc(-1) }
            })
          }
        } catch (e) {
          console.warn('[daigouMgr/handleRefund] restore stock failed:', e.message)
        }
        return { success: true, message: '已同意退款' }
      } else {
        await db.collection('daigouOrders').doc(orderId).update({
          data: {
            status: 'shipped',
            refundStatus: 'rejected',
            refundRejectReason: rejectReason,
            updateTime: db.serverDate()
          }
        })
        return { success: true, message: '已拒绝退款申请' }
      }
    } catch (e) {
      console.error('[daigouMgr/handleRefund]', e)
      return { success: false, message: e.message || '操作失败' }
    }
  }

  // ──────────────────────────────────────────────────
  // getReview: getReviewStatus 别名（前端兼容）
  // ──────────────────────────────────────────────────
  if (action === 'getReview') {
    // 直接代理到 getReviewStatus 逻辑
    try {
      const { orderId } = event
      if (!orderId) return { success: false, message: '缺少订单ID' }
      const res = await db.collection('daigouOrders').doc(orderId).get()
      const order = res.data
      const isBuyer = order.buyerOpenid === openid
      const isSeller = order.sellerOpenid === openid
      if (!isBuyer && !isSeller) return { success: false, message: '无权查看' }
      let myReview = null
      try {
        const reviewRes = await db.collection('daigouReviews')
          .where({ orderId, reviewerOpenid: openid })
          .limit(1)
          .get()
        myReview = reviewRes.data && reviewRes.data[0] ? reviewRes.data[0] : null
      } catch (e) {}
      return {
        success: true,
        isBuyer,
        isSeller,
        buyerReviewed: !!order.buyerReviewed,
        sellerReviewed: !!order.sellerReviewed,
        myReviewed: isBuyer ? !!order.buyerReviewed : !!order.sellerReviewed,
        myReview,
        needReview: order.status === 'completed' && !(isBuyer ? order.buyerReviewed : order.sellerReviewed)
      }
    } catch (e) {
      return { success: false, message: e.message || '查询失败' }
    }
  }

  // ──────────────────────────────────────────────────
  // updateDeposit: 更新押金缴纳记录（管理员操作完成后前端同步状态用）
  // ──────────────────────────────────────────────────
  if (action === 'updateDeposit') {
    try {
      const { depositAmount } = event
      if (!depositAmount || depositAmount <= 0) {
        return { success: false, message: '押金金额无效' }
      }
      const user = await findUser(openid)
      if (!user) return { success: false, message: '用户不存在' }
      // 前端只能申请押金记录（实际审核由管理员操作）
      // 此处创建押金申请记录，供管理员审批
      try {
        await db.collection('daigouDepositApply').add({
          data: {
            userOpenid: openid,
            userId: user._id,
            nickName: user.nickName || '',
            depositAmount: Number(depositAmount),
            status: 'pending',   // pending / approved / rejected
            createTime: db.serverDate(),
            updateTime: db.serverDate()
          }
        })
      } catch (e) {
        // 集合不存在时静默处理
        console.warn('[daigouMgr/updateDeposit] collection not exist:', e.message)
      }
      return { success: true, message: '押金申请已提交，等待管理员审核' }
    } catch (e) {
      console.error('[daigouMgr/updateDeposit]', e)
      return { success: false, message: e.message || '提交失败' }
    }
  }

  return { success: false, message: `未知操作: ${action}` }
}
