// 云函数: adminMgr - 管理员功能
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

// 辅助：根据押金金额推算代购等级
function _calcLevelFromDeposit(amount) {
  if (amount >= 1000) return 5
  if (amount >= 500) return 4
  if (amount >= 200) return 3
  if (amount >= 100) return 2
  if (amount >= 50) return 1
  return 0
}


// 简单的内存缓存
const _cacheStore = new Map()
const simpleCache = {
  get: (key) => {
    const item = _cacheStore.get(key)
    if (!item) return null
    if (Date.now() > item.expireAt) {
      _cacheStore.delete(key)
      return null
    }
    return item.value
  },
  set: (key, value, ttlMs = 5 * 60 * 1000) => {
    _cacheStore.set(key, { value, expireAt: Date.now() + ttlMs })
  },
  delete: (key) => {
    _cacheStore.delete(key)
  },
  clear: () => {
    _cacheStore.clear()
  }
}

// 验证超级管理员权限（带缓存，减少 DB 查询）
async function verifySuperAdmin(wxContext) {
  const cacheKey = `superAdmins`
  let superAdmins = simpleCache.get(cacheKey)
  if (!superAdmins) {
    const admins = await db.collection('system_config').where({
      configKey: 'superAdmins'
    }).get()
    superAdmins = (admins.data.length > 0 && admins.data[0].configValue) ? admins.data[0].configValue : []
    simpleCache.set(cacheKey, superAdmins, 10 * 60 * 1000) // 缓存10分钟
  }
  return superAdmins.includes(wxContext.OPENID)
}

exports.main = async (event, context) => {
  const { action } = event
  const wxContext = cloud.getWXContext()
  const adminOpenid = wxContext.OPENID
  
  // 检查是否是超级管理员（用于敏感操作）
  const isSuperAdmin = await verifySuperAdmin(wxContext)

  try {
    switch (action) {
      // 获取统计数据
      case 'getStats': {
        const userCount = await db.collection('users').count()
        const productCount = await db.collection('products').count()
        const swapCount = await db.collection('orders').where({
          status: _.in(['pending', 'confirmed', 'shipped'])
        }).count()
        const reviewCount = await db.collection('reviews').where({
          status: 'pending'
        }).count()
        const pendingProductCount = await db.collection('products').where({
          status: 'pending_review'
        }).count()
        const mysteryCount = await db.collection('products').where({
          isMystery: true
        }).count()

        // 性别统计
        const maleCount = await db.collection('users').where({ gender: 'male' }).count()
        const femaleCount = await db.collection('users').where({ gender: 'female' }).count()

        return {
          totalUsers: userCount.total,
          totalProducts: productCount.total,
          activeSwaps: swapCount.total,
          pendingReviews: reviewCount.total + pendingProductCount.total,
          pendingProductCount: pendingProductCount.total,
          mysteryCount: mysteryCount.total,
          maleCount: maleCount.total,
          femaleCount: femaleCount.total,
          isSuperAdmin
        }
      }

      // 看板详细统计数据（省份排行、品类、信用等级、订单漏斗）
      case 'getDashboardData': {
        const PROVINCE_EMOJI = {
          '广东': '🍊', '四川': '🌶️', '新疆': '🍇', '云南': '🌸', '山东': '🥜',
          '湖南': '🌶️', '浙江': '🍵', '福建': '🫖', '贵州': '🌿', '海南': '🥥',
          '江苏': '🦐', '北京': '🦆', '上海': '🫒', '重庆': '🔥', '湖北': '🍜',
          '陕西': '🫙', '甘肃': '🌵', '青海': '🏔️', '西藏': '🏔️', '内蒙古': '🥛',
          '黑龙江': '🌾', '吉林': '🌾', '辽宁': '🦀', '河北': '🌾', '山西': '🍜',
          '河南': '🌾', '安徽': '🦆', '江西': '🍵', '广西': '🍹', '宁夏': '🐑',
          '新疆': '🍇', '海南': '🥥'
        }
        const CAT_EMOJI = {
          '零食小吃': '🍿', '干货腊味': '🥩', '茶叶酒水': '🍵', '坚果炒货': '🥜',
          '地方糕点': '🧁', '水果生鲜': '🍓', '酱料调味': '🫙', '其他': '📦'
        }

        try {
          // 并行查询多个统计，降低延迟
          const [
            allProducts,
            completedOrders,
            allOrders,
            allReviews
          ] = await Promise.all([
            // 产品列表（只取需要的字段：province, category, status）
            db.collection('products')
              .field({ province: true, category: true, status: true, value: true })
              .limit(500)
              .get(),
            // 已完成订单数
            db.collection('orders').where({ status: 'completed' }).count(),
            // 全部订单（用于漏斗）
            db.collection('orders')
              .field({ status: true })
              .limit(500)
              .get(),
            // 评价数
            db.collection('reviews').count()
          ])

          // ── 省份排行（上架特产数量 TOP 10）──
          const provinceMap = {}
          allProducts.data.forEach(p => {
            if (p.province && p.status !== 'removed' && p.status !== 'banned') {
              provinceMap[p.province] = (provinceMap[p.province] || 0) + 1
            }
          })
          const provinces = Object.entries(provinceMap)
            .map(([name, count]) => ({
              name,
              count,
              emoji: PROVINCE_EMOJI[name] || '📍'
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10)

          // ── 品类分布 ──
          const catMap = {}
          allProducts.data.forEach(p => {
            if (p.category && p.status === 'active') {
              catMap[p.category] = (catMap[p.category] || 0) + 1
            }
          })
          const categories = Object.entries(catMap)
            .map(([name, count]) => ({
              name,
              count,
              emoji: CAT_EMOJI[name] || '📦'
            }))
            .sort((a, b) => b.count - a.count)

          // ── 订单漏斗（互换全流程） ──
          const orderStatusCount = {}
          allOrders.data.forEach(o => {
            orderStatusCount[o.status] = (orderStatusCount[o.status] || 0) + 1
          })
          const totalOrders = allOrders.data.length
          const funnel = [
            { name: '发起互换',  value: totalOrders },
            { name: '对方确认',  value: (orderStatusCount['confirmed'] || 0) + (orderStatusCount['shipped'] || 0) + (orderStatusCount['completed'] || 0) },
            { name: '双方发货',  value: (orderStatusCount['shipped'] || 0) + (orderStatusCount['completed'] || 0) },
            { name: '完成互换',  value: orderStatusCount['completed'] || 0 },
          ].filter(f => f.value > 0)

          return {
            provinces,
            categories,
            funnel,
            totalReviews: allReviews.total,
            completedSwaps: completedOrders.total,
            // 预留信用等级（需要用户集合聚合，这里给空数组）
            credits: []
          }
        } catch (err) {
          console.error('[getDashboardData] error:', err)
          return {
            provinces: [],
            categories: [],
            funnel: [],
            totalReviews: 0,
            completedSwaps: 0,
            credits: []
          }
        }
      }


      case 'getUsers': {
        const { page = 1, pageSize = 20, keyword = '', filter = '' } = event
        
        let query = db.collection('users')
        
        // 关键词搜索
        if (keyword) {
          query = query.where({
            nickName: db.RegExp({
              regexp: keyword,
              options: 'i'
            })
          })
        }
        
        // 筛选条件
        if (filter === 'high' || filter === 'low') {
          // 积分排序在后面处理
        } else if (filter === 'excellent') {
          query = query.where({ creditScore: _.gte(90) })
        } else if (filter === 'good') {
          query = query.where({ creditScore: _.and(_.gte(80), _.lt(90)) })
        } else if (filter === 'poor') {
          query = query.where({ creditScore: _.lt(60) })
        }

        let res
        // 积分排序特殊处理
        if (filter === 'high') {
          res = await db.collection('users')
            .orderBy('points', 'desc')
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .get()
        } else if (filter === 'low') {
          res = await db.collection('users')
            .orderBy('points', 'asc')
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .get()
        } else {
          res = await query
            .orderBy('_createTime', 'desc')
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .get()
        }

        // 用户积分直接从 users 表读取（统一数据源）
        const list = res.data.map((user) => {
          return {
            ...user,
            // 确保 nickname 相关字段正确传递
            nickName: user.nickName || '',
            openid: user.openid || user._openid || '',
            _openid: user._openid || user.openid || '',
            points: user.points || 0,
            totalPoints: user.points || 0  // 简化处理，不单独维护累计积分
          }
        })

        console.log('[adminMgr] getUsers 返回样例:', list[0] ? { _id: list[0]._id, nickName: list[0].nickName, openid: list[0].openid } : '无用户')

        // 积分统计（从 users 表统计）
        let stats = { totalUsers: 0, totalPoints: 0, avgPoints: 0 }
        try {
          const totalUserCount = await db.collection('users').count()
          const pointsSum = await db.collection('users')
            .aggregate()
            .group({
              _id: null,
              totalPoints: $.sum('$points')
            })
            .end()
          stats = {
            totalUsers: totalUserCount.total,
            totalPoints: pointsSum.list[0]?.totalPoints || 0,
            avgPoints: totalUserCount.total > 0 ? Math.round((pointsSum.list[0]?.totalPoints || 0) / totalUserCount.total) : 0
          }
        } catch (e) {}

        // 信用分分布统计
        let creditDist = { excellent: 0, good: 0, normal: 0, poor: 0 }
        try {
          const [excellent, good, normal, poor] = await Promise.all([
            db.collection('users').where({ creditScore: _.gte(90) }).count(),
            db.collection('users').where({ creditScore: _.and(_.gte(80), _.lt(90)) }).count(),
            db.collection('users').where({ creditScore: _.and(_.gte(60), _.lt(80)) }).count(),
            db.collection('users').where({ creditScore: _.lt(60) }).count()
          ])
          const total = excellent.total + good.total + normal.total + poor.total
          creditDist = {
            excellent: total > 0 ? Math.round(excellent.total / total * 100) : 0,
            good: total > 0 ? Math.round(good.total / total * 100) : 0,
            normal: total > 0 ? Math.round(normal.total / total * 100) : 0,
            poor: total > 0 ? Math.round(poor.total / total * 100) : 0
          }
        } catch (e) {}

        return { list, stats, creditDist, isSuperAdmin }
      }

      // 获取单个用户详情
      case 'getUserDetail': {
        const { openid } = event
        const userRes = await db.collection('users').where({
          _openid: openid
        }).get()
        
        if (userRes.data.length === 0) {
          return { success: false, error: '用户不存在' }
        }
        
        const user = userRes.data[0]
        
        // 积分直接从 users 表读取
        const userPoints = user.points || 0
        
        // 获取积分变动记录（只使用 _openid）
        const pointsLogRes = await db.collection('points_log').where({
          _openid: openid
        }).orderBy('createTime', 'desc').limit(50).get()
        
        return {
          user,
          points: userPoints,
          totalPoints: userPoints,
          pointsLog: pointsLogRes.data || [],
          isSuperAdmin
        }
      }

      // 增加用户积分（仅超级管理员）
      case 'addPoints': {
        if (!isSuperAdmin) {
          return { success: false, error: '权限不足，需要超级管理员权限' }
        }
        
        const { openid, points, reason = '管理员操作' } = event
        if (!openid || !points || points <= 0) {
          return { success: false, error: '参数错误' }
        }
        
        // 查询用户
        const userRes = await db.collection('users').where({ _openid: openid }).get()
        if (userRes.data.length === 0) {
          return { success: false, error: '用户不存在' }
        }
        const user = userRes.data[0]
        
        // 直接更新 users 表的积分（统一数据源）
        await db.collection('users').doc(user._id).update({
          data: {
            points: _.inc(points),
            updateTime: db.serverDate()
          }
        })
        
        // 记录积分变动日志
        await db.collection('points_log').add({
          data: {
            _openid: openid,
            amount: points,
            type: 'admin_add',
            desc: reason,
            createTime: db.serverDate()
          }
        })
        
        return { success: true, message: `成功增加 ${points} 积分` }
      }

      // 扣除用户积分（仅超级管理员）
      case 'deductPoints': {
        if (!isSuperAdmin) {
          return { success: false, error: '权限不足，需要超级管理员权限' }
        }
        
        const { openid, points, reason = '管理员操作' } = event
        if (!openid || !points || points <= 0) {
          return { success: false, error: '参数错误' }
        }
        
        // 查询用户当前积分
        const userRes = await db.collection('users').where({ _openid: openid }).get()
        if (userRes.data.length === 0) {
          return { success: false, error: '用户不存在' }
        }
        const user = userRes.data[0]
        const currentPoints = user.points || 0
        
        if (currentPoints < points) {
          return { success: false, error: '积分不足，当前积分: ' + currentPoints }
        }
        
        // 扣除积分（统一更新 users 表）
        await db.collection('users').doc(user._id).update({
          data: {
            points: _.inc(-points),
            updateTime: db.serverDate()
          }
        })
        
        // 记录积分变动日志
        await db.collection('points_log').add({
          data: {
            _openid: openid,
            amount: -points,
            type: 'admin_deduct',
            desc: reason,
            createTime: db.serverDate()
          }
        })
        
        return { success: true, message: `成功扣除 ${points} 积分` }
      }

      // 调整用户信用分（仅超级管理员）
      case 'adjustCredit': {
        if (!isSuperAdmin) {
          return { success: false, error: '权限不足，需要超级管理员权限' }
        }
        
        const { openid, creditScore, reason = '管理员操作' } = event
        if (!openid || creditScore === undefined) {
          return { success: false, error: '参数错误' }
        }
        
        // 信用分范围 0-100
        const newScore = Math.max(0, Math.min(100, creditScore))
        
        // 先查询用户
        const userRes = await db.collection('users').where({ _openid: openid }).get()
        if (userRes.data.length === 0) {
          return { success: false, error: '用户不存在' }
        }
        
        const user = userRes.data[0]
        const oldScore = user.creditScore || 100
        const delta = newScore - oldScore
        
        // 使用 _id 精准更新
        await db.collection('users').doc(user._id).update({
          data: {
            creditScore: newScore,
            creditUpdatedAt: db.serverDate()
          }
        })
        
        // 记录信用分变动日志
        await db.collection('credit_logs').add({
          data: {
            openid: openid,
            delta: delta,
            creditScore: newScore,
            type: 'admin_adjust',
            reason: reason,
            createTime: db.serverDate()
          }
        })
        
        return { success: true, message: `信用分已调整为 ${newScore}` }
      }

      // 编辑用户信息（仅超级管理员）
      case 'editUser': {
        if (!isSuperAdmin) {
          return { success: false, error: '权限不足，需要超级管理员权限' }
        }

        const { openid, updates } = event
        if (!openid || !updates) {
          return { success: false, error: '参数错误' }
        }

        // 查询用户
        const userRes = await db.collection('users').where({ _openid: openid }).get()
        if (userRes.data.length === 0) {
          return { success: false, error: '用户不存在' }
        }
        
        const user = userRes.data[0]

        // 允许编辑的字段
        const allowedFields = ['nickName', 'province', 'gender', 'birthday', 'zodiac', 'zodiacAnimal', 'points', 'creditScore']
        const updateData = {}

        for (const key of allowedFields) {
          if (updates[key] !== undefined) {
            updateData[key] = updates[key]
          }
        }

        if (Object.keys(updateData).length === 0) {
          return { success: false, error: '没有可更新的字段' }
        }

        updateData.updateTime = db.serverDate()

        // 使用 _id 精准更新
        await db.collection('users').doc(user._id).update({
          data: updateData
        })

        return { success: true, message: '用户信息已更新' }
      }

      // 删除用户（仅超级管理员）
      case 'deleteUser': {
        if (!isSuperAdmin) {
          return { success: false, error: '权限不足，需要超级管理员权限' }
        }

        const { userId } = event
        if (!userId) {
          return { success: false, error: '缺少用户ID' }
        }

        console.log('[adminMgr] 删除用户:', userId)

        // 查询用户，确认存在
        let userRes = await db.collection('users').where({ _openid: userId }).get()
        let user = userRes.data && userRes.data[0]
        
        // 如果用 _openid 找不到，尝试用 _id
        if (!user) {
          try {
            userRes = await db.collection('users').doc(userId).get()
            user = userRes.data
          } catch (e) {
            user = null
          }
        }

        if (!user) {
          return { success: false, error: '用户不存在' }
        }

        // 不能删除自己
        if (user._openid === wxContext.OPENID) {
          return { success: false, error: '不能删除自己' }
        }

        // 删除用户的特产
        const userProducts = await db.collection('products').where({ _openid: user._openid }).get()
        for (const product of userProducts.data) {
          await db.collection('products').doc(product._id).remove()
        }

        // 删除用户的订单
        const userOrders = await db.collection('orders').where(
          _.or([
            { initiatorOpenid: user._openid },
            { receiverOpenid: user._openid }
          ])
        ).get()
        for (const order of userOrders.data) {
          await db.collection('orders').doc(order._id).remove()
        }

        // 删除用户的收藏
        const userFavorites = await db.collection('favorites').where({ _openid: user._openid }).get()
        for (const fav of userFavorites.data) {
          await db.collection('favorites').doc(fav._id).remove()
        }

        // 删除用户记录
        await db.collection('users').doc(user._id).remove()

        console.log('[adminMgr] 删除用户成功:', userId, '删除了', userProducts.data.length, '个特产')

        return { success: true, message: '用户已删除' }
      }

      // 编辑特产信息（仅超级管理员）
      case 'editProduct': {
        if (!isSuperAdmin) {
          return { success: false, error: '权限不足，需要超级管理员权限' }
        }

        const { productId, updates } = event
        if (!productId || !updates) {
          return { success: false, error: '参数错误' }
        }

        const allowedFields = ['name', 'description', 'province', 'city', 'category', 'valueRange', 'status']
        const updateData = {}

        for (const key of allowedFields) {
          if (updates[key] !== undefined) {
            updateData[key] = updates[key]
          }
        }

        if (Object.keys(updateData).length === 0) {
          return { success: false, error: '没有可更新的字段' }
        }

        updateData.updatedAt = db.serverDate()

        await db.collection('products').doc(productId).update({
          data: updateData
        })

        return { success: true, message: '特产信息已更新' }
      }

      // 获取特产列表
      case 'getProducts': {
        const { page = 1, pageSize = 20, status = '', isMystery = '' } = event
        let query = db.collection('products')

        if (status) {
          query = query.where({ status })
        }
        if (isMystery !== '') {
          query = query.where({ isMystery: isMystery === 'true' })
        }

        const res = await query
          .orderBy('_createTime', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get()

        // 格式化时间（精确到分钟）
        const list = (res.data || []).map(item => ({
          ...item,
          createTimeText: item.createTime
            ? new Date(
                typeof item.createTime === 'object' && item.createTime.$date
                  ? item.createTime.$date
                  : item.createTime
              ).toLocaleString('zh-CN', { hour12: false })
                .replace(/\//g, '-')
            : ''
        }))

        // 获取特产总数
        let countQuery = db.collection('products')
        if (status) {
          countQuery = countQuery.where({ status })
        }
        if (isMystery !== '') {
          countQuery = countQuery.where({ isMystery: isMystery === 'true' })
        }
        const totalCount = await countQuery.count()

        return { list, total: totalCount.total, isSuperAdmin }
      }

      // 获取神秘特产列表（仅超级管理员）
      case 'getMysteryProducts': {
        if (!isSuperAdmin) {
          return { success: false, error: '权限不足，需要超级管理员权限' }
        }
        
        const { page = 1, pageSize = 20, filter = 'all' } = event
        
        let query = db.collection('products').where({ isMystery: true })
        
        // 筛选条件
        if (filter !== 'all') {
          query = query.where({ status: filter })
        }

        const res = await query
          .orderBy('_createTime', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get()

        // 统计
        const [totalCount, activeCount, inSwapCount] = await Promise.all([
          db.collection('products').where({ isMystery: true }).count(),
          db.collection('products').where({ isMystery: true, status: 'active' }).count(),
          db.collection('products').where({ isMystery: true, status: 'in_swap' }).count()
        ])

        return { 
          list: res.data,
          stats: {
            total: totalCount.total,
            active: activeCount.total,
            inSwap: inSwapCount.total
          }
        }
      }

      // 编辑神秘特产（仅超级管理员）
      case 'editMysteryProduct': {
        if (!isSuperAdmin) {
          return { success: false, error: '权限不足，需要超级管理员权限' }
        }
        
        const { productId, updates } = event
        if (!productId) {
          return { success: false, error: '缺少特产ID' }
        }
        
        // 允许更新的字段
        const allowedFields = ['name', 'description', 'province', 'city', 'coverUrl', 'images', 'status', 'tags']
        const updateData = {}
        
        for (const key of allowedFields) {
          if (updates[key] !== undefined) {
            updateData[key] = updates[key]
          }
        }
        
        updateData.updatedAt = db.serverDate()
        
        await db.collection('products').doc(productId).update({
          data: updateData
        })
        
        return { success: true, message: '神秘特产已更新' }
      }

      // 删除神秘特产（仅超级管理员）
      case 'deleteMysteryProduct': {
        if (!isSuperAdmin) {
          return { success: false, error: '权限不足，需要超级管理员权限' }
        }
        
        const { productId } = event
        if (!productId) {
          return { success: false, error: '缺少特产ID' }
        }
        
        await db.collection('products').doc(productId).remove()
        
        return { success: true, message: '神秘特产已删除' }
      }

      // 下架特产
      case 'banProduct': {
        if (!isSuperAdmin) return { success: false, error: '权限不足，需要超级管理员权限' }
        const { productId } = event
        await db.collection('products').doc(productId).update({
          data: {
            status: 'banned',
            bannedAt: db.serverDate()
          }
        })
        return { success: true, message: '已下架' }
      }

      // 上架特产
      case 'unbanProduct': {
        if (!isSuperAdmin) return { success: false, error: '权限不足，需要超级管理员权限' }
        const { productId } = event
        await db.collection('products').doc(productId).update({
          data: {
            status: 'active',
            bannedAt: _.remove()
          }
        })
        return { success: true, message: '已上架' }
      }

      // 获取订单列表
      case 'getOrders': {
        const { page = 1, pageSize = 20, filter = 'all' } = event
        
        let query = db.collection('orders')
        
        // 筛选条件
        if (filter !== 'all') {
          query = query.where({ status: filter })
        }

        const res = await query
          .orderBy('_createTime', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get()

        // 关联查询用户和特产信息
        const list = await Promise.all(res.data.map(async (order) => {
          let orderData = { ...order }

          // 获取请求者信息
          if (order.requesterId || order.requesterOpenid || order._openid) {
            try {
              const openid = order.requesterOpenid || order._openid
              const userRes = await db.collection('users').where({
                _openid: openid
              }).field({ nickName: true, avatarUrl: true }).get()
              if (userRes.data.length > 0) {
                orderData.requesterNick = userRes.data[0].nickName
                orderData.requesterAvatar = userRes.data[0].avatarUrl
              }
            } catch (e) {}
          }

          // 获取特产信息
          if (order.productId) {
            try {
              const productRes = await db.collection('products').doc(order.productId).get()
              if (productRes.data) {
                orderData.productName = productRes.data.name
                orderData.productCover = productRes.data.images && productRes.data.images[0] ? productRes.data.images[0] : ''
                orderData.productProvince = productRes.data.province
              }
            } catch (e) {}
          }

          return orderData
        }))

        // 获取订单统计
        const [pendingCount, shippingCount, completedCount, totalCount] = await Promise.all([
          db.collection('orders').where({ status: _.in(['pending', 'confirmed']) }).count(),
          db.collection('orders').where({ status: 'shipped' }).count(),
          db.collection('orders').where({ status: 'completed' }).count(),
          db.collection('orders').count()
        ])

        return { 
          list,
          total: totalCount.total,
          stats: {
            pending: pendingCount.total,
            shipping: shippingCount.total,
            completed: completedCount.total
          }
        }
      }

      // 强制完成订单（仅超级管理员）
      case 'forceCompleteOrder': {
        if (!isSuperAdmin) {
          return { success: false, error: '权限不足，需要超级管理员权限' }
        }
        
        const { orderId } = event
        await db.collection('orders').doc(orderId).update({
          data: {
            status: 'completed',
            completedAt: db.serverDate()
          }
        })
        return { success: true, message: '订单已强制完成' }
      }

      // 强制取消订单（仅超级管理员）
      case 'forceCancelOrder': {
        if (!isSuperAdmin) {
          return { success: false, error: '权限不足，需要超级管理员权限' }
        }
        
        const { orderId } = event
        await db.collection('orders').doc(orderId).update({
          data: {
            status: 'cancelled',
            cancelledAt: db.serverDate()
          }
        })
        return { success: true, message: '订单已强制取消' }
      }

      // 获取待审核评价
      case 'getPendingReviews': {
        const { page = 1, pageSize = 20 } = event
        const res = await db.collection('reviews')
          .where({ status: 'pending' })
          .orderBy('_createTime', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get()

        return { list: res.data }
      }

      // 审核通过
      case 'approveReview': {
        const { reviewId } = event
        await db.collection('reviews').doc(reviewId).update({
          data: {
            status: 'approved',
            approvedAt: db.serverDate()
          }
        })
        return { success: true }
      }

      // 审核拒绝
      case 'rejectReview': {
        const { reviewId } = event
        await db.collection('reviews').doc(reviewId).update({
          data: {
            status: 'rejected',
            rejectedAt: db.serverDate()
          }
        })
        return { success: true }
      }

      // 获取已通过的评价列表
      case 'getApprovedReviews': {
        const { page = 1, pageSize = 20 } = event
        const res = await db.collection('reviews')
          .where({ status: 'approved' })
          .orderBy('_createTime', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get()

        return { list: res.data || [] }
      }

      // 获取已拒绝的评价列表
      case 'getRejectedReviews': {
        const { page = 1, pageSize = 20 } = event
        const res = await db.collection('reviews')
          .where({ status: 'rejected' })
          .orderBy('_createTime', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get()

        return { list: res.data || [] }
      }

      // 获取操作日志
      case 'getAdminLogs': {
        if (!isSuperAdmin) {
          return { success: false, error: '权限不足，需要超级管理员权限' }
        }
        
        const { page = 1, pageSize = 50, type = '' } = event
        let query = db.collection('admin_logs')
        
        if (type) {
          query = query.where({ type })
        }
        
        const res = await query
          .orderBy('createTime', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get()
        
        return { list: res.data }
      }

      // 记录管理员操作
      case 'logAdminAction': {
        const { type, targetId, action: adminAction, detail = {} } = event
        
        await db.collection('admin_logs').add({
          data: {
            _openid: wxContext.OPENID,
            type,
            targetId,
            action: adminAction,
            detail,
            createTime: db.serverDate()
          }
        })
        
        return { success: true }
      }

      // 获取超级管理员状态
      case 'getAdminStatus': {
        return { isSuperAdmin }
      }

      // 设置当前用户为超级管理员
      case 'initSuperAdmin': {
        try {
          const existing = await db.collection('system_config').where({
            configKey: 'superAdmins'
          }).get()
          
          const openid = wxContext.OPENID
          
          if (existing.data.length > 0) {
            const currentAdmins = existing.data[0].configValue || []
            if (!currentAdmins.includes(openid)) {
              currentAdmins.push(openid)
              await db.collection('system_config').doc(existing.data[0]._id).update({
                data: { 
                  configValue: currentAdmins,
                  updateTime: new Date()
                }
              })
            }
            return { success: true, message: '已设置你为超级管理员', admins: currentAdmins }
          } else {
            await db.collection('system_config').add({
              data: {
                configKey: 'superAdmins',
                configValue: [openid],
                createTime: new Date()
              }
            })
            return { success: true, message: '已设置你为超级管理员', admins: [openid] }
          }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }

      // ========== 获取功能开关配置 ==========
      case 'getFeatureFlags': {
        try {
          const res = await db.collection('system_config').where({
            configKey: 'featureFlags'
          }).get()
          if (res.data.length > 0) {
            return { success: true, flags: res.data[0].configValue }
          }
          return { success: true, flags: null }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }

      // ========== 设置功能开关配置（需超管权限） ==========
      case 'setFeatureFlags': {
        if (!isSuperAdmin) return { success: false, error: '无权限' }
        try {
          const { flags } = event
          const existing = await db.collection('system_config').where({
            configKey: 'featureFlags'
          }).get()
          if (existing.data.length > 0) {
            await db.collection('system_config').doc(existing.data[0]._id).update({
              data: {
                configValue: flags,
                updateTime: new Date(),
                updatedBy: wxContext.OPENID
              }
            })
          } else {
            await db.collection('system_config').add({
              data: {
                configKey: 'featureFlags',
                configValue: flags,
                createTime: new Date(),
                updateTime: new Date(),
                updatedBy: wxContext.OPENID
              }
            })
          }
          return { success: true }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }

      // ========== 获取待审核产品列表 ==========
      case 'getPendingProducts': {
        try {
          const { page = 1, pageSize = 20, filter = 'pending' } = event

          let query = db.collection('products')

          // 筛选条件
          if (filter === 'pending') {
            query = query.where({ status: 'pending_review' })
          } else if (filter === 'approved') {
            query = query.where({ status: 'active' })
              .where({ reviewedAt: _.exists(true) })
          } else if (filter === 'rejected') {
            query = query.where({ status: 'rejected' })
          }

          const res = await query
            .orderBy('createTime', 'desc')
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .get()

          // 获取发布者信息
          const openids = [...new Set(res.data.map(p => p.openid))]
          const userMap = {}
          if (openids.length > 0) {
            const usersRes = await db.collection('users')
              .where({ _openid: _.in(openids) })
              .field({ _openid: true, nickName: true, avatarUrl: true })
              .get()
            for (const u of usersRes.data) {
              userMap[u._openid] = u
            }
          }

          const list = res.data.map(p => ({
            ...p,
            publisher: userMap[p.openid] || {},
            createTimeText: p.createTime
              ? new Date(
                  typeof p.createTime === 'object' && p.createTime.$date
                    ? p.createTime.$date
                    : p.createTime
                ).toLocaleString('zh-CN', { hour12: false })
                  .replace(/\//g, '-')
              : ''
          }))

          // 统计
          const [pendingCount, approvedCount, rejectedCount] = await Promise.all([
            db.collection('products').where({ status: 'pending_review' }).count(),
            db.collection('products').where({ status: 'active' }).where({ reviewedAt: _.exists(true) }).count(),
            db.collection('products').where({ status: 'rejected' }).count()
          ])

          return {
            success: true,
            list,
            stats: {
              pending: pendingCount.total,
              approved: approvedCount.total,
              rejected: rejectedCount.total,
              total: pendingCount.total + approvedCount.total + rejectedCount.total
            }
          }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }

      // ========== 审核通过 ==========
      case 'approveProduct': {
        try {
          const { productId } = event
          if (!productId) {
            return { success: false, error: '缺少产品ID' }
          }

          await db.collection('products').doc(productId).update({
            data: {
              status: 'active',
              auditReason: '',
              auditTime: db.serverDate(),
              auditor: wxContext.OPENID
            }
          })

          return { success: true, message: '审核通过' }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }

      // ========== 审核拒绝 ==========
      case 'rejectProduct': {
        try {
          const { productId, reason } = event
          if (!productId) {
            return { success: false, error: '缺少产品ID' }
          }

          await db.collection('products').doc(productId).update({
            data: {
              status: 'rejected',
              auditReason: reason || '管理员审核拒绝',
              auditTime: db.serverDate(),
              auditor: wxContext.OPENID
            }
          })

          return { success: true, message: '已拒绝' }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }

      // =================== 代购管理 ===================

      // 获取代购统计
      case 'getDaigouStats': {
        if (!isSuperAdmin) return { success: false, error: '无权限' }
        try {
          const total = await db.collection('daigouOrders').count()
          const pendingShipment = await db.collection('daigouOrders').where({ status: 'pending_shipment' }).count()
          const shipped = await db.collection('daigouOrders').where({ status: 'shipped' }).count()
          const completed = await db.collection('daigouOrders').where({ status: 'completed' }).count()
          const refunding = await db.collection('daigouOrders').where({ status: 'refunding' }).count()
          const cancelled = await db.collection('daigouOrders').where({ status: 'cancelled' }).count()
          // 计算总成交额（已完成订单）
          const completedOrders = await db.collection('daigouOrders').where({ status: 'completed' }).field({ totalPrice: true }).get()
          const totalAmount = (completedOrders.data || []).reduce((sum, o) => sum + (o.totalPrice || 0), 0)
          return {
            success: true,
            stats: {
              total: total.total,
              pendingShipment: pendingShipment.total,
              shipped: shipped.total,
              completed: completed.total,
              refunding: refunding.total,
              cancelled: cancelled.total,
              totalAmount
            }
          }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }

      // 获取代购订单列表
      case 'getDaigouOrders': {
        if (!isSuperAdmin) return { success: false, error: '无权限' }
        try {
          const { page = 1, pageSize = 20, filter = 'all', keyword = '' } = event
          let query = db.collection('daigouOrders')
          if (filter !== 'all') {
            query = query.where({ status: filter })
          }
          const skip = (page - 1) * pageSize

          // 同步查总量（用于分页）
          let total = 0
          try {
            let countQuery = db.collection('daigouOrders')
            if (filter !== 'all') countQuery = countQuery.where({ status: filter })
            const countRes = await countQuery.count()
            total = countRes.total || 0
          } catch (e) { /* 集合可能不存在 */ }

          const res = await query.orderBy('createTime', 'desc').skip(skip).limit(pageSize).get()

          // 收集所有需要查询的 openid（买家 + 代购者）
          const openids = new Set()
          for (const o of (res.data || [])) {
            if (o.buyerOpenid) openids.add(o.buyerOpenid)
            if (o.sellerOpenid) openids.add(o.sellerOpenid)
            if (o.publisherOpenid) openids.add(o.publisherOpenid)
          }

          // 批量查用户信息（昵称、头像、手机号）
          const userMap = {}
          if (openids.size > 0) {
            try {
              const usersRes = await db.collection('users')
                .where({ _openid: _.in([...openids]) })
                .field({ _openid: true, nickName: true, avatarUrl: true, phoneNumber: true, phone: true })
                .get()
              for (const u of (usersRes.data || [])) {
                userMap[u._openid] = {
                  nickName: u.nickName || '',
                  avatarUrl: u.avatarUrl || '',
                  phone: u.phoneNumber || u.phone || ''
                }
              }
            } catch (e) { console.error('[getDaigouOrders] 查用户信息失败:', e.message) }
          }

          // 格式化数据，注入用户信息
          const list = (res.data || []).map(o => {
            const buyerInfo = userMap[o.buyerOpenid] || {}
            const sellerOpenid = o.sellerOpenid || o.publisherOpenid || ''
            const sellerInfo = userMap[sellerOpenid] || {}
            return {
              ...o,
              createTimeStr: o.createTime ? new Date(o.createTime).toLocaleString('zh-CN') : '',
              // 买家信息
              buyerNickName: buyerInfo.nickName || o.buyerNickName || '',
              buyerAvatarUrl: buyerInfo.avatarUrl || o.buyerAvatarUrl || '',
              buyerPhone: buyerInfo.phone || '',
              // 代购者（卖家）信息
              sellerNickName: sellerInfo.nickName || o.sellerNickName || '',
              sellerAvatarUrl: sellerInfo.avatarUrl || o.sellerAvatarUrl || '',
              sellerPhone: sellerInfo.phone || '',
              // 单价字段归一化（daigou.price 或 unitPrice）
              unitPrice: o.unitPrice || (o.daigou && o.daigou.price) || o.price || o.totalPrice || 0
            }
          })
          return { success: true, list, total, page, pageSize }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }

      // 强制取消代购订单
      case 'forceCancelDaigouOrder': {
        if (!isSuperAdmin) return { success: false, error: '无权限' }
        try {
          const { orderId, reason = '管理员强制取消' } = event
          if (!orderId) return { success: false, error: '缺少订单ID' }
          const orderRes = await db.collection('daigouOrders').doc(orderId).get()
          const order = orderRes.data
          if (!order) return { success: false, error: '订单不存在' }
          if (order.status === 'cancelled' || order.status === 'completed') {
            return { success: false, error: '订单状态不允许取消' }
          }
          await db.collection('daigouOrders').doc(orderId).update({
            data: {
              status: 'cancelled',
              cancelReason: reason,
              cancelTime: db.serverDate(),
              cancelBy: 'admin'
            }
          })
          // 恢复库存
          if (order.productId && order.quantity) {
            await db.collection('products').doc(order.productId).update({
              data: { 'daigou.stock': _.inc(order.quantity || 1) }
            })
          }
          return { success: true }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }

      // 处理退款
      case 'handleDaigouRefund': {
        if (!isSuperAdmin) return { success: false, error: '无权限' }
        try {
          const { orderId, approve = true, remark = '' } = event
          if (!orderId) return { success: false, error: '缺少订单ID' }
          await db.collection('daigouOrders').doc(orderId).update({
            data: {
              status: approve ? 'refunded' : 'completed',
              refundStatus: approve ? 'approved' : 'rejected',
              refundRemark: remark,
              refundHandleTime: db.serverDate(),
              refundHandleBy: 'admin'
            }
          })
          return { success: true }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }

      // 删除代购订单（仅已取消/已完成）
      case 'deleteDaigouOrder': {
        if (!isSuperAdmin) return { success: false, error: '无权限' }
        try {
          const { orderId } = event
          if (!orderId) return { success: false, error: '缺少订单ID' }
          const orderRes = await db.collection('daigouOrders').doc(orderId).get()
          const order = orderRes.data
          if (!order) return { success: false, error: '订单不存在' }
          if (order.status !== 'cancelled' && order.status !== 'completed' && order.status !== 'refunded') {
            return { success: false, error: '只能删除已取消/已完成/已退款的订单' }
          }
          await db.collection('daigouOrders').doc(orderId).remove()
          return { success: true }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }

      // 获取实名审核列表
      case 'getDaigouVerifyList': {
        if (!isSuperAdmin) return { success: false, error: '无权限' }
        try {
          const { page = 1, pageSize = 20, filter = 'pending' } = event
          const skip = (page - 1) * pageSize

          // ── 直接查 users 集合（管理员云函数有全量读权限，避免 daigouVerify 集合简易权限限制）──
          // 注：daigouVerify 独立集合由用户端写入，_openid 为用户 openid，
          //     简易权限"仅创建者可读写"会导致管理员云函数只能读到自己那条，
          //     改为以 users 集合为主数据源（更完整，且权限正常）。
          let list = []
          let stats = { pending: 0, approved: 0, rejected: 0 }

          // 1. 统计（全量，不分页）
          const allUsersWithVerify = await db.collection('users')
            .where({ daigouVerify: _.exists(true) })
            .field({ _openid: true, 'daigouVerify.status': true })
            .limit(500)
            .get()

          let p = 0, a = 0, r = 0
          for (const u of (allUsersWithVerify.data || [])) {
            if (!u.daigouVerify || !u.daigouVerify.status) continue
            if (u.daigouVerify.status === 'pending') p++
            else if (u.daigouVerify.status === 'approved') a++
            else if (u.daigouVerify.status === 'rejected') r++
          }
          stats = { pending: p, approved: a, rejected: r }

          // 2. 分页查询（按 filter 过滤）
          // 微信云数据库不支持对嵌套对象字段做 where+orderBy 分页，
          // 先拉全量（上限500）再在内存中过滤分页（实名审核用户量小，可接受）
          const allRes = await db.collection('users')
            .where({ daigouVerify: _.exists(true) })
            .field({
              _openid: true, openid: true, nickName: true, avatarUrl: true,
              phoneNumber: true, phone: true, daigouVerify: true, updateTime: true
            })
            .limit(500)
            .get()

          let filtered = (allRes.data || [])
            .filter(u => u.daigouVerify && u.daigouVerify.status)
            .filter(u => filter === 'all' || u.daigouVerify.status === filter)

          // 按提交时间降序排列
          filtered.sort((a, b) => {
            const ta = a.daigouVerify.submitTime
            const tb = b.daigouVerify.submitTime
            const getTs = t => {
              if (!t) return 0
              if (typeof t === 'object' && t.$date) return t.$date
              return typeof t === 'number' ? t : new Date(t).getTime()
            }
            return getTs(tb) - getTs(ta)
          })

          // 内存分页
          const paged = filtered.slice(skip, skip + pageSize)

          list = paged.map(u => {
            const v = u.daigouVerify
            const submitTime = v.submitTime
            let timeStr = ''
            if (submitTime) {
              const t = typeof submitTime === 'object' && submitTime.$date ? submitTime.$date : submitTime
              try { timeStr = new Date(t).toLocaleString('zh-CN') } catch (e) {}
            }
            return {
              _id: u._id,
              userOpenid: u._openid || u.openid,
              nickName: u.nickName || '',
              avatarUrl: u.avatarUrl || '',
              phone: u.phoneNumber || u.phone || '',
              status: v.status || 'pending',
              realName: v.realName || '',
              idCardNoMasked: v.idCardNoMasked || '',
              idCardFront: v.idCardFront || '',
              idCardBack: v.idCardBack || '',
              holdIdCardPhoto: v.holdIdCardPhoto || '',
              reviewNote: v.reviewNote || '',
              submitTime: v.submitTime,
              createTimeStr: timeStr,
              _source: 'users'
            }
          })

          return { success: true, list, stats }
        } catch (e) {
          console.error('[getDaigouVerifyList]', e)
          return { success: false, error: e.message }
        }
      }

      // 通过实名审核
      case 'approveDaigouVerify': {
        if (!isSuperAdmin) return { success: false, error: '无权限' }
        try {
          // 兼容 userOpenid（前端传）和 userId（旧版本传）
          const { verifyId, userOpenid, userId } = event
          const targetOpenid = userOpenid || userId
          if (!verifyId) return { success: false, error: '缺少审核ID' }

          // 先尝试更新 daigouVerify 独立集合
          try {
            await db.collection('daigouVerify').doc(verifyId).update({
              data: { status: 'approved', handleTime: db.serverDate(), handleBy: 'admin' }
            })
          } catch (e) {
            // 集合中无此记录（数据来源于 users 集合），忽略
            console.warn('[approveDaigouVerify] daigouVerify集合更新失败（可能数据在users集合）:', e.message)
          }

          // 同步更新 users 集合中的认证状态
          if (targetOpenid) {
            await db.collection('users').where({ _openid: targetOpenid }).update({
              data: {
                isDaigouVerified: true,
                daigouVerifyTime: db.serverDate(),
                'daigouVerify.status': 'approved',
                'daigouVerify.reviewTime': db.serverDate(),
                'daigouVerify.reviewBy': 'admin'
              }
            })
          } else {
            // 如果没有 openid，尝试通过 user._id 查找
            try {
              const userRes = await db.collection('users').doc(verifyId).get()
              if (userRes.data) {
                await db.collection('users').doc(verifyId).update({
                  data: {
                    isDaigouVerified: true,
                    daigouVerifyTime: db.serverDate(),
                    'daigouVerify.status': 'approved',
                    'daigouVerify.reviewTime': db.serverDate(),
                    'daigouVerify.reviewBy': 'admin'
                  }
                })
              }
            } catch (e2) {
              console.warn('[approveDaigouVerify] 通过_id更新users失败:', e2.message)
            }
          }
          return { success: true }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }

      // 拒绝实名审核
      case 'rejectDaigouVerify': {
        if (!isSuperAdmin) return { success: false, error: '无权限' }
        try {
          // 兼容 userOpenid（前端传）和 userId（旧版本传）
          const { verifyId, userOpenid, userId, reason = '不符合要求' } = event
          const targetOpenid = userOpenid || userId
          if (!verifyId) return { success: false, error: '缺少审核ID' }

          // 先尝试更新 daigouVerify 独立集合
          try {
            await db.collection('daigouVerify').doc(verifyId).update({
              data: { status: 'rejected', rejectReason: reason, handleTime: db.serverDate(), handleBy: 'admin' }
            })
          } catch (e) {
            // 集合中无此记录（数据来源于 users 集合），忽略
            console.warn('[rejectDaigouVerify] daigouVerify集合更新失败（可能数据在users集合）:', e.message)
          }

          // 同步更新 users 集合中的认证状态
          if (targetOpenid) {
            await db.collection('users').where({ _openid: targetOpenid }).update({
              data: {
                isDaigouVerified: false,
                'daigouVerify.status': 'rejected',
                'daigouVerify.reviewNote': reason,
                'daigouVerify.reviewTime': db.serverDate(),
                'daigouVerify.reviewBy': 'admin'
              }
            })
          } else {
            // 如果没有 openid，尝试通过 user._id 查找
            try {
              const userRes = await db.collection('users').doc(verifyId).get()
              if (userRes.data) {
                await db.collection('users').doc(verifyId).update({
                  data: {
                    isDaigouVerified: false,
                    'daigouVerify.status': 'rejected',
                    'daigouVerify.reviewNote': reason,
                    'daigouVerify.reviewTime': db.serverDate(),
                    'daigouVerify.reviewBy': 'admin'
                  }
                })
              }
            } catch (e2) {
              console.warn('[rejectDaigouVerify] 通过_id更新users失败:', e2.message)
            }
          }
          return { success: true }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }

      // ──────────────────────────────────────────────────
      // 押金审批：获取押金申请列表
      // ──────────────────────────────────────────────────
      case 'getDepositApplyList': {
        if (!isSuperAdmin) return { success: false, error: '无权限' }
        try {
          const { page = 1, pageSize = 20, filter = 'pending' } = event
          const skip = (page - 1) * pageSize

          // 查 daigouDepositApply 集合
          let query = db.collection('daigouDepositApply')
          if (filter !== 'all') {
            query = query.where({ status: filter })
          }

          let total = 0
          try {
            const countRes = await query.count()
            total = countRes.total
          } catch (e) {
            if (e.errCode === -502005) return { success: true, list: [], total: 0 }
            throw e
          }

          const listRes = await query
            .orderBy('createTime', 'desc')
            .skip(skip)
            .limit(pageSize)
            .get()

          const list = listRes.data || []

          // 统计各状态数量
          let stats = { pending: 0, approved: 0, rejected: 0 }
          try {
            const allRes = await db.collection('daigouDepositApply')
              .field({ status: true })
              .limit(500)
              .get()
            ;(allRes.data || []).forEach(r => {
              if (r.status === 'pending') stats.pending++
              else if (r.status === 'approved') stats.approved++
              else if (r.status === 'rejected') stats.rejected++
            })
          } catch (e) { /* 忽略统计失败 */ }

          // 格式化时间
          const formatTime = (t) => {
            if (!t) return ''
            try {
              return new Date(typeof t === 'object' && t.$date ? t.$date : t).toLocaleString('zh-CN')
            } catch (_) { return '' }
          }
          const formatted = list.map(r => ({
            ...r,
            createTimeText: formatTime(r.createTime),
            handleTimeText: formatTime(r.handleTime),
            // 确保 userOpenid 存在（兼容 _openid 和 userOpenid）
            userOpenid: r.userOpenid || r._openid || '',
            // 兼容旧版没有以下字段的记录
            realName: r.realName || '',
            phone: r.phone || '',
            wechatId: r.wechatId || '',
            transferProof: r.transferProof || '',
            targetLevel: r.targetLevel || _calcLevelFromDeposit(r.depositAmount || 0),
            remark: r.remark || ''
          }))

          return { success: true, list: formatted, total, stats }
        } catch (e) {
          console.error('[getDepositApplyList]', e)
          return { success: false, error: e.message }
        }
      }

      // ──────────────────────────────────────────────────
      // 押金审批：通过 - 自动升级代购等级 + 更新余额
      // ──────────────────────────────────────────────────
      case 'approveDeposit': {
        if (!isSuperAdmin) return { success: false, error: '无权限' }
        try {
          const { applyId, userOpenid, depositAmount } = event
          if (!applyId || !userOpenid) return { success: false, error: '参数不完整' }

          // 读取申请记录，获取 targetLevel
          let applyDoc = null
          try {
            const applyRes = await db.collection('daigouDepositApply').doc(applyId).get()
            applyDoc = applyRes.data
          } catch (e) { /* 忽略读取失败 */ }

          const amount = Number(depositAmount || (applyDoc && applyDoc.depositAmount)) || 0
          const targetLevel = (applyDoc && applyDoc.targetLevel) || _calcLevelFromDeposit(amount)

          // 等级对应费率表
          const FEE_RATES = { 0: 8.0, 1: 7.0, 2: 6.5, 3: 6.0, 4: 5.5, 5: 5.0, 6: 4.0 }

          // 更新申请记录状态
          await db.collection('daigouDepositApply').doc(applyId).update({
            data: {
              status: 'approved',
              handleTime: db.serverDate(),
              handleBy: 'admin',
              updateTime: db.serverDate()
            }
          })

          // 更新用户：depositPaid累加 + 余额同步 + 等级升级 + isDaigouVerified
          if (amount > 0) {
            await db.collection('users').where({ _openid: userOpenid }).update({
              data: {
                'daigouStats.depositPaid': _.inc(amount),
                'daigouStats.depositBalance': _.inc(amount),
                daigouLevel: targetLevel,
                isDaigouVerified: true,
                'daigouStats.feeRate': FEE_RATES[targetLevel] || 7.0,
                updateTime: db.serverDate()
              }
            })
          }

          console.log(`[approveDeposit] 审批通过 applyId=${applyId} level=${targetLevel} amount=${amount}`)
          return {
            success: true,
            message: `押金审批通过，用户已升级为LV${targetLevel}代购`,
            targetLevel,
            amount
          }
        } catch (e) {
          console.error('[approveDeposit]', e)
          return { success: false, error: e.message }
        }
      }

      // ──────────────────────────────────────────────────
      // 押金审批：拒绝
      // ──────────────────────────────────────────────────
      case 'rejectDeposit': {
        if (!isSuperAdmin) return { success: false, error: '无权限' }
        try {
          const { applyId, userOpenid, reason = '审核未通过' } = event
          if (!applyId) return { success: false, error: '缺少申请ID' }

          await db.collection('daigouDepositApply').doc(applyId).update({
            data: {
              status: 'rejected',
              rejectReason: reason,
              handleTime: db.serverDate(),
              handleBy: 'admin',
              updateTime: db.serverDate()
            }
          })

          return { success: true, message: '已拒绝押金申请' }
        } catch (e) {
          console.error('[rejectDeposit]', e)
          return { success: false, error: e.message }
        }
      }

      // ──────────────────────────────────────────────────
      // 代购等级管理：获取代购等级用户列表
      // ──────────────────────────────────────────────────
      case 'getDaigouLevelUsers': {
        if (!isSuperAdmin) return { success: false, error: '无权限' }
        try {
          const { page = 1, pageSize = 20, keyword = '', filter = 'all' } = event
          const skip = (page - 1) * pageSize

          // 查询有 daigouStats 字段的用户（代购者）
          let allRes
          if (keyword) {
            allRes = await db.collection('users')
              .where({
                nickName: db.RegExp({ regexp: keyword, options: 'i' })
              })
              .field({
                _openid: true, openid: true, nickName: true, avatarUrl: true,
                phoneNumber: true, phone: true, creditScore: true, points: true,
                daigouStats: true, daigouLevel: true, isDaigouVerified: true
              })
              .limit(500)
              .get()
          } else {
            allRes = await db.collection('users')
              .field({
                _openid: true, openid: true, nickName: true, avatarUrl: true,
                phoneNumber: true, phone: true, creditScore: true, points: true,
                daigouStats: true, daigouLevel: true, isDaigouVerified: true
              })
              .limit(500)
              .get()
          }

          let users = (allRes.data || [])
          // 筛选：只看已认证代购者
          if (filter === 'verified') {
            users = users.filter(u => u.isDaigouVerified === true)
          } else if (filter === 'has_deposit') {
            users = users.filter(u => u.daigouStats && u.daigouStats.depositPaid > 0)
          } else if (filter === 'no_deposit') {
            users = users.filter(u => !u.daigouStats || !u.daigouStats.depositPaid || u.daigouStats.depositPaid === 0)
          }

          const total = users.length
          const paged = users.slice(skip, skip + pageSize)

          // 等级费率表
          const LEVEL_RATE = { 0: 8.0, 1: 7.0, 2: 6.5, 3: 6.0, 4: 5.5, 5: 5.0, 6: 4.0 }
          const LEVEL_NAMES = { 0: '新人', 1: '初级', 2: '进阶', 3: '资深', 4: '金牌', 5: '钻石', 6: '官方认证' }

          const list = paged.map(u => {
            const stats = u.daigouStats || {}
            const level = u.daigouLevel !== undefined ? u.daigouLevel : 0
            return {
              _id: u._id,
              openid: u._openid || u.openid,
              nickName: u.nickName || '未知用户',
              avatarUrl: u.avatarUrl || '',
              creditScore: u.creditScore || 100,
              points: u.points || 0,
              daigouLevel: level,
              daigouLevelName: LEVEL_NAMES[level] || '新人',
              feeRate: LEVEL_RATE[level] || 8.0,
              isDaigouVerified: u.isDaigouVerified || false,
              depositPaid: stats.depositPaid || 0,
              depositBalance: stats.depositBalance !== undefined ? stats.depositBalance : (stats.depositPaid || 0),
              totalOrders: stats.totalOrders || 0,
              completedOrders: stats.completedOrders || 0,
              positiveRate: stats.positiveRate || 0,
              phone: u.phoneNumber || u.phone || ''
            }
          })

          return { success: true, list, total, page, pageSize }
        } catch (e) {
          console.error('[getDaigouLevelUsers]', e)
          return { success: false, error: e.message }
        }
      }

      // ──────────────────────────────────────────────────
      // 代购等级管理：调整用户代购等级
      // ──────────────────────────────────────────────────
      case 'adjustDaigouLevel': {
        if (!isSuperAdmin) return { success: false, error: '无权限' }
        try {
          const { userOpenid, level, reason = '管理员调整等级' } = event
          if (!userOpenid || level === undefined) return { success: false, error: '参数不完整' }
          if (level < 0 || level > 6) return { success: false, error: '等级范围0-6' }

          // 查用户
          const userRes = await db.collection('users').where({ _openid: userOpenid }).get()
          if (!userRes.data || userRes.data.length === 0) return { success: false, error: '用户不存在' }
          const user = userRes.data[0]
          const oldLevel = user.daigouLevel || 0

          await db.collection('users').doc(user._id).update({
            data: {
              daigouLevel: level,
              daigouLevelUpdatedAt: db.serverDate(),
              daigouLevelUpdatedBy: 'admin'
            }
          })

          // 记录日志
          await db.collection('admin_logs').add({
            data: {
              _openid: wxContext.OPENID,
              type: 'adjust_daigou_level',
              targetId: userOpenid,
              action: `等级 LV${oldLevel} → LV${level}`,
              detail: { oldLevel, newLevel: level, reason },
              createTime: db.serverDate()
            }
          })

          return { success: true, message: `代购等级已调整为 LV${level}` }
        } catch (e) {
          console.error('[adjustDaigouLevel]', e)
          return { success: false, error: e.message }
        }
      }

      // ──────────────────────────────────────────────────
      // 押金管理：管理员直接录入/修改用户押金
      // ──────────────────────────────────────────────────
      case 'setUserDeposit': {
        if (!isSuperAdmin) return { success: false, error: '无权限' }
        try {
          const { userOpenid, depositAmount, note = '管理员录入' } = event
          if (!userOpenid || depositAmount === undefined) return { success: false, error: '参数不完整' }
          const amount = Number(depositAmount)
          if (isNaN(amount) || amount < 0) return { success: false, error: '押金金额无效' }

          const userRes = await db.collection('users').where({ _openid: userOpenid }).get()
          if (!userRes.data || userRes.data.length === 0) return { success: false, error: '用户不存在' }
          const user = userRes.data[0]
          const oldStats = user.daigouStats || {}
          const oldDeposit = oldStats.depositPaid || 0
          const oldBalance = oldStats.depositBalance !== undefined ? oldStats.depositBalance : oldDeposit
          // 计算新余额：余额按比例调整（如果是增加，余额对应增加）
          const delta = amount - oldDeposit
          const newBalance = Math.max(0, oldBalance + delta)

          await db.collection('users').doc(user._id).update({
            data: {
              'daigouStats.depositPaid': amount,
              'daigouStats.depositBalance': newBalance,
              updateTime: db.serverDate()
            }
          })

          // 记录押金变动日志
          await db.collection('deposit_logs').add({
            data: {
              userOpenid,
              type: 'admin_set',
              oldAmount: oldDeposit,
              newAmount: amount,
              delta,
              note,
              operatorOpenid: wxContext.OPENID,
              createTime: db.serverDate()
            }
          })

          return { success: true, message: `押金已更新为 ¥${amount}，余额 ¥${newBalance}` }
        } catch (e) {
          console.error('[setUserDeposit]', e)
          return { success: false, error: e.message }
        }
      }

      // ──────────────────────────────────────────────────
      // 押金管理：获取用户押金变动日志
      // ──────────────────────────────────────────────────
      case 'getDepositLogs': {
        if (!isSuperAdmin) return { success: false, error: '无权限' }
        try {
          const { userOpenid, page = 1, pageSize = 20 } = event
          let query = db.collection('deposit_logs')
          if (userOpenid) {
            query = query.where({ userOpenid })
          }
          const res = await query
            .orderBy('createTime', 'desc')
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .get()
          const list = (res.data || []).map(r => ({
            ...r,
            createTimeText: r.createTime
              ? new Date(
                  typeof r.createTime === 'object' && r.createTime.$date
                    ? r.createTime.$date
                    : r.createTime
                ).toLocaleString('zh-CN')
              : ''
          }))
          return { success: true, list }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }

      // 初始化集合检测（管理员专用）
      case 'initCollections': {
        if (!isSuperAdmin) return { success: false, error: '无权限' }
        const collections = ['users', 'products', 'swapOrders', 'daigouOrders', 'reviews', 'system_config', 'share_configs']
        const result = {}
        for (const col of collections) {
          try {
            await db.collection(col).count()
            result[col] = 'ok'
          } catch (e) {
            if (e.errCode === -502005 || (e.message && e.message.includes('not exist'))) {
              result[col] = 'NOT_EXIST'
            } else {
              result[col] = `error:${e.message}`
            }
          }
        }
        const missing = Object.keys(result).filter(k => result[k] === 'NOT_EXIST')
        return {
          success: true,
          collections: result,
          missing,
          tip: missing.length > 0 ? `请在微信云开发控制台手动创建以下集合：${missing.join(', ')}` : '所有集合正常'
        }
      }

      // ══════════════════════════════════════════
      // 钱包充值审批
      // ══════════════════════════════════════════

      // 获取充值申请列表
      case 'getRechargeApplies': {
        if (!isSuperAdmin) return { success: false, error: '无管理员权限' }
        try {
          const { page = 1, pageSize = 20, status = '' } = event
          const skip = (page - 1) * pageSize

          let whereClause = {}
          if (status) whereClause.status = status

          const [listRes, countRes] = await Promise.all([
            db.collection('recharge_apply')
              .where(whereClause)
              .orderBy('createTime', 'desc')
              .skip(skip)
              .limit(pageSize)
              .get(),
            db.collection('recharge_apply')
              .where(whereClause)
              .count()
          ])

          // 批量获取用户余额信息
          const openids = [...new Set((listRes.data || []).map(r => r._openid))]
          let userMap = {}
          if (openids.length > 0) {
            const usersRes = await db.collection('users')
              .where({ _openid: _.in(openids) })
              .field({ _openid: true, nickName: true, avatarUrl: true, walletBalance: true })
              .get()
            for (const u of (usersRes.data || [])) {
              userMap[u._openid] = u
            }
          }

          const statusTextMap = { pending: '待审核', approved: '已通过', rejected: '已拒绝', cancelled: '已取消' }

          return {
            success: true,
            list: (listRes.data || []).map(item => ({
              id: item._id,
              applyNo: item.applyNo || '',
              amount: item.amount || 0,
              status: item.status,
              statusText: statusTextMap[item.status] || item.status,
              remark: item.remark || '',
              adminNote: item.adminNote || '',
              transferProof: item.transferProof || '',
              userInfo: userMap[item._openid] || item.userInfo || {},
              currentWalletBalance: (userMap[item._openid] && userMap[item._openid].walletBalance) || 0,
              createTime: item.createTime,
              updateTime: item.updateTime
            })),
            total: countRes.total || 0
          }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }

      // 审批通过充值申请
      case 'approveRecharge': {
        if (!isSuperAdmin) return { success: false, error: '无管理员权限' }
        try {
          const { applyId, adminNote = '审批通过' } = event
          if (!applyId) return { success: false, error: '缺少申请ID' }

          const applyRes = await db.collection('recharge_apply').doc(applyId).get()
          const apply = applyRes.data
          if (!apply) return { success: false, error: '申请不存在' }

          const statusTextMap = { pending: '待审核', approved: '已通过', rejected: '已拒绝', cancelled: '已取消' }
          if (apply.status !== 'pending') {
            return { success: false, error: `该申请已是"${statusTextMap[apply.status] || apply.status}"状态` }
          }

          const amount = apply.amount || 0

          // 获取用户
          const userRes = await db.collection('users')
            .where({ _openid: apply._openid })
            .limit(1)
            .get()
          if (!userRes.data || userRes.data.length === 0) {
            return { success: false, error: '申请用户不存在' }
          }
          const user = userRes.data[0]
          const oldBalance = user.walletBalance || 0
          const newBalance = Math.round((oldBalance + amount) * 100) / 100

          // 更新申请状态
          await db.collection('recharge_apply').doc(applyId).update({
            data: {
              status: 'approved',
              adminNote,
              approvedBy: adminOpenid,
              approvedAt: db.serverDate(),
              updateTime: db.serverDate()
            }
          })

          // 增加钱包余额
          await db.collection('users').doc(user._id).update({
            data: {
              walletBalance: newBalance,
              updateTime: db.serverDate()
            }
          })

          // 写钱包流水
          await db.collection('wallet_logs').add({
            data: {
              _openid: apply._openid,
              type: 'recharge',
              flow: 'income',
              title: '钱包充值',
              amount,
              balanceBefore: oldBalance,
              balanceAfter: newBalance,
              relatedId: applyId,
              applyNo: apply.applyNo || '',
              remark: adminNote,
              status: 'done',
              createTime: db.serverDate()
            }
          })

          // 记录管理日志
          await db.collection('admin_logs').add({
            data: {
              _openid: adminOpenid,
              type: 'recharge_approve',
              targetId: applyId,
              detail: { applyNo: apply.applyNo, amount, userOpenid: apply._openid, newBalance },
              createTime: db.serverDate()
            }
          })

          return {
            success: true,
            amount,
            newBalance,
            message: `已通过充值申请，充值 ¥${amount.toFixed(2)}，用户余额更新为 ¥${newBalance.toFixed(2)}`
          }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }

      // 拒绝充值申请
      case 'rejectRecharge': {
        if (!isSuperAdmin) return { success: false, error: '无管理员权限' }
        try {
          const { applyId, adminNote = '申请被拒绝' } = event
          if (!applyId) return { success: false, error: '缺少申请ID' }

          const applyRes = await db.collection('recharge_apply').doc(applyId).get()
          const apply = applyRes.data
          if (!apply) return { success: false, error: '申请不存在' }
          if (apply.status !== 'pending') return { success: false, error: '该申请已处理' }

          await db.collection('recharge_apply').doc(applyId).update({
            data: {
              status: 'rejected',
              adminNote,
              rejectedBy: adminOpenid,
              rejectedAt: db.serverDate(),
              updateTime: db.serverDate()
            }
          })

          return { success: true, message: '已拒绝该充值申请' }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }

      // 管理员直接调整钱包余额
      case 'adjustWalletBalance': {
        if (!isSuperAdmin) return { success: false, error: '无管理员权限' }
        try {
          const { targetOpenid, amount, remark = '管理员调整' } = event
          if (!targetOpenid || amount === undefined) return { success: false, error: '参数不完整' }

          const userRes = await db.collection('users')
            .where({ _openid: targetOpenid })
            .limit(1)
            .get()
          if (!userRes.data || userRes.data.length === 0) {
            return { success: false, error: '用户不存在' }
          }
          const user = userRes.data[0]
          const oldBalance = user.walletBalance || 0
          const adj = parseFloat(amount)
          const newBalance = Math.max(0, Math.round((oldBalance + adj) * 100) / 100)

          await db.collection('users').doc(user._id).update({
            data: { walletBalance: newBalance, updateTime: db.serverDate() }
          })

          await db.collection('wallet_logs').add({
            data: {
              _openid: targetOpenid,
              type: 'admin_adjust',
              flow: adj >= 0 ? 'income' : 'expense',
              title: adj >= 0 ? '管理员充值' : '管理员扣款',
              amount: Math.abs(adj),
              balanceBefore: oldBalance,
              balanceAfter: newBalance,
              remark,
              status: 'done',
              createTime: db.serverDate()
            }
          })

          return { success: true, oldBalance, newBalance, message: `余额调整成功` }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }

      // ══════════════════════════════════════════
      // 纠纷处理
      // ══════════════════════════════════════════

      // 获取纠纷列表
      case 'getDisputes': {
        if (!isSuperAdmin) return { success: false, error: '无管理员权限' }
        try {
          const { page = 1, pageSize = 20, status = '' } = event
          const skip = (page - 1) * pageSize

          let whereClause = {}
          if (status) whereClause.status = status

          const [listRes, countRes] = await Promise.all([
            db.collection('disputes')
              .where(whereClause)
              .orderBy('createTime', 'desc')
              .skip(skip)
              .limit(pageSize)
              .get(),
            db.collection('disputes')
              .where(whereClause)
              .count()
          ])

          // 统计各状态数量
          const statsRes = await db.collection('disputes')
            .aggregate()
            .group({
              _id: '$status',
              count: $.sum(1)
            })
            .end()

          const stats = { pending: 0, processing: 0, resolved: 0, closed: 0 }
          for (const s of (statsRes.list || [])) {
            if (stats.hasOwnProperty(s._id)) {
              stats[s._id] = s.count
            }
          }

          // 格式化纠纷数据
          const statusTextMap = { pending: '待处理', processing: '处理中', resolved: '已解决', closed: '已关闭' }
          const list = (listRes.data || []).map(item => ({
            ...item,
            statusText: statusTextMap[item.status] || item.status,
            createTimeText: item.createTime
              ? new Date(
                  typeof item.createTime === 'object' && item.createTime.$date
                    ? item.createTime.$date
                    : item.createTime
                ).toLocaleString('zh-CN')
              : '',
            updateTimeText: item.updateTime
              ? new Date(
                  typeof item.updateTime === 'object' && item.updateTime.$date
                    ? item.updateTime.$date
                    : item.updateTime
                ).toLocaleString('zh-CN')
              : ''
          }))

          return {
            success: true,
            list,
            stats,
            total: countRes.total || 0
          }
        } catch (e) {
          console.error('[getDisputes]', e)
          return { success: false, error: e.message }
        }
      }

      // 处理纠纷
      case 'handleDispute': {
        if (!isSuperAdmin) return { success: false, error: '无管理员权限' }
        try {
          const { disputeId, disputeAction, result, note, punishment } = event
          if (!disputeId || !disputeAction) return { success: false, error: '参数不完整' }

          const disputeRes = await db.collection('disputes').doc(disputeId).get()
          const dispute = disputeRes.data
          if (!dispute) return { success: false, error: '纠纷不存在' }

          // 根据操作类型更新状态
          let newStatus
          if (disputeAction === 'resolve') {
            newStatus = 'resolved'
          } else if (disputeAction === 'close') {
            newStatus = 'closed'
          } else {
            newStatus = dispute.status
          }

          // 构建更新数据
          const updateData = {
            status: newStatus,
            resolution: result || '',
            adminNote: note || '',
            handledBy: adminOpenid,
            handledAt: db.serverDate(),
            updateTime: db.serverDate()
          }

          // 如果有处罚信息
          if (punishment && punishment.type && punishment.type !== 'none') {
            updateData.punishment = punishment
            updateData.responsibleParty = punishment.responsibleParty || ''

            // 执行处罚
            await _applyDisputePunishment(dispute, punishment, adminOpenid)
          }

          await db.collection('disputes').doc(disputeId).update({
            data: updateData
          })

          // 记录管理日志
          await db.collection('admin_logs').add({
            data: {
              _openid: adminOpenid,
              type: 'dispute_handle',
              targetId: disputeId,
              detail: { disputeAction, result, note, punishment, newStatus },
              createTime: db.serverDate()
            }
          })

          return {
            success: true,
            message: disputeAction === 'resolve' ? '纠纷已解决' : '纠纷已关闭'
          }
        } catch (e) {
          console.error('[handleDispute]', e)
          return { success: false, error: e.message }
        }
      }

      // 执行纠纷处罚
      async function _applyDisputePunishment(dispute, punishment, adminOpenid) {
        const { type, value, responsibleParty } = punishment
        if (!value || value <= 0) return

        // 确定被处罚的用户
        let targetOpenid = ''
        if (responsibleParty === 'initiator') {
          targetOpenid = dispute.initiatorOpenid
        } else if (responsibleParty === 'responder') {
          targetOpenid = dispute.responderOpenid
        } else if (responsibleParty === 'both') {
          // 双方都处罚
          if (dispute.initiatorOpenid) {
            await _applySinglePunishment(dispute.initiatorOpenid, type, value, dispute._id, adminOpenid)
          }
          if (dispute.responderOpenid) {
            await _applySinglePunishment(dispute.responderOpenid, type, value, dispute._id, adminOpenid)
          }
          return
        } else {
          return
        }

        if (targetOpenid) {
          await _applySinglePunishment(targetOpenid, type, value, dispute._id, adminOpenid)
        }
      }

      // 对单个用户执行处罚
      async function _applySinglePunishment(targetOpenid, type, value, disputeId, adminOpenid) {
        const userRes = await db.collection('users').where({ _openid: targetOpenid }).limit(1).get()
        if (!userRes.data || userRes.data.length === 0) return
        const user = userRes.data[0]

        if (type === 'points') {
          // 扣除积分
          const newPoints = Math.max(0, (user.points || 0) - value)
          await db.collection('users').doc(user._id).update({
            data: { points: newPoints, updateTime: db.serverDate() }
          })
        } else if (type === 'credit') {
          // 扣除信用分
          const newCredit = Math.max(0, Math.min(100, (user.creditScore || 100) - value))
          await db.collection('users').doc(user._id).update({
            data: { creditScore: newCredit, updateTime: db.serverDate() }
          })
        } else if (type === 'deposit') {
          // 扣除押金
          const newDeposit = Math.max(0, (user.daigouDeposit || 0) - value)
          await db.collection('users').doc(user._id).update({
            data: { daigouDeposit: newDeposit, updateTime: db.serverDate() }
          })
        }
      }

      // ========== 系统配置管理 ==========
      case 'getSystemConfig': {
        if (!isSuperAdmin) return { success: false, error: '无管理员权限' }
        try {
          const { configKey } = event
          let query = db.collection('system_config')
          if (configKey) {
            query = query.where({ configKey })
          }
          const res = await query.get()
          const configs = {}
          res.data.forEach(item => {
            configs[item.configKey] = item.configValue
          })
          return { success: true, configs }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }

      case 'updateSystemConfig': {
        if (!isSuperAdmin) return { success: false, error: '无管理员权限' }
        try {
          const { configKey, configValue } = event
          if (!configKey || configValue === undefined) {
            return { success: false, error: '参数不完整' }
          }

          // 检查配置是否存在
          const existRes = await db.collection('system_config').where({ configKey }).get()
          
          if (existRes.data && existRes.data.length > 0) {
            // 更新现有配置
            await db.collection('system_config').doc(existRes.data[0]._id).update({
              data: {
                configValue,
                updateTime: db.serverDate()
              }
            })
          } else {
            // 创建新配置
            await db.collection('system_config').add({
              data: {
                configKey,
                configValue,
                createTime: db.serverDate(),
                updateTime: db.serverDate()
              }
            })
          }

          // 清除缓存
          simpleCache.delete('system_config')

          return { success: true, message: '配置已更新' }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }

      // ========== 邀请裂变配置管理 ==========
      case 'getInviteConfig': {
        try {
          // 获取或初始化邀请裂变配置
          const configKeys = [
            'invite_reward_inviter',
            'invite_reward_invitee',
            'withdrawal_threshold'
          ]
          
          const configs = {}
          for (const key of configKeys) {
            const res = await db.collection('system_config').where({ configKey: key }).get()
            if (res.data && res.data.length > 0) {
              configs[key] = res.data[0].configValue
            } else {
              // 设置默认值
              let defaultValue
              switch (key) {
                case 'invite_reward_inviter': defaultValue = 0.3; break
                case 'invite_reward_invitee': defaultValue = 0.1; break
                case 'withdrawal_threshold': defaultValue = 30; break
                default: defaultValue = 0
              }
              configs[key] = defaultValue
              
              // 保存默认值到数据库
              await db.collection('system_config').add({
                data: {
                  configKey: key,
                  configValue: defaultValue,
                  createTime: db.serverDate(),
                  updateTime: db.serverDate()
                }
              })
            }
          }

          return {
            success: true,
            configs,
            message: '获取邀请配置成功'
          }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }

      case 'updateInviteConfig': {
        if (!isSuperAdmin) return { success: false, error: '无管理员权限' }
        try {
          const { inviteRewardInviter, inviteRewardInvitee, withdrawalThreshold } = event
          
          const updates = []
          if (inviteRewardInviter !== undefined) {
            updates.push({
              key: 'invite_reward_inviter',
              value: parseFloat(inviteRewardInviter)
            })
          }
          if (inviteRewardInvitee !== undefined) {
            updates.push({
              key: 'invite_reward_invitee',
              value: parseFloat(inviteRewardInvitee)
            })
          }
          if (withdrawalThreshold !== undefined) {
            updates.push({
              key: 'withdrawal_threshold',
              value: parseFloat(withdrawalThreshold)
            })
          }

          for (const update of updates) {
            const existRes = await db.collection('system_config').where({ configKey: update.key }).get()
            if (existRes.data && existRes.data.length > 0) {
              await db.collection('system_config').doc(existRes.data[0]._id).update({
                data: {
                  configValue: update.value,
                  updateTime: db.serverDate()
                }
              })
            } else {
              await db.collection('system_config').add({
                data: {
                  configKey: update.key,
                  configValue: update.value,
                  createTime: db.serverDate(),
                  updateTime: db.serverDate()
                }
              })
            }
          }

          // 清除缓存
          simpleCache.delete('system_config')

          return {
            success: true,
            message: '邀请配置已更新'
          }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }

      default:
        return { success: false, error: '未知操作' }
    }
  } catch (e) {
    console.error('adminMgr error:', e)
    return { success: false, error: e.message }
  }
}
