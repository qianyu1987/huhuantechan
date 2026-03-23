// 云函数: adminMgr - 管理员功能
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

// 验证超级管理员权限
async function verifySuperAdmin(wxContext) {
  const admins = await db.collection('system_config').where({
    configKey: 'superAdmins'
  }).get()
  
  if (admins.data.length > 0 && admins.data[0].configValue) {
    const superAdmins = admins.data[0].configValue
    if (superAdmins.includes(wxContext.OPENID)) {
      return true
    }
  }
  return false
}

exports.main = async (event, context) => {
  const { action } = event
  const wxContext = cloud.getWXContext()
  
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

      // 获取用户列表（支持搜索）
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
            points: user.points || 0,
            totalPoints: user.points || 0  // 简化处理，不单独维护累计积分
          }
        })

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

        return { list: res.data, isSuperAdmin }
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
        const [pendingCount, shippingCount, completedCount] = await Promise.all([
          db.collection('orders').where({ status: _.in(['pending', 'confirmed']) }).count(),
          db.collection('orders').where({ status: 'shipped' }).count(),
          db.collection('orders').where({ status: 'completed' }).count()
        ])

        return { 
          list,
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
          const { page = 1, pageSize = 20, filter = 'all' } = event
          
          let query = db.collection('products').where({ status: 'pending_review' })
          
          // 筛选条件
          if (filter === 'auto') {
            query = db.collection('products').where({
              status: 'pending_review',
              auditReason: _.neq('')
            })
          } else if (filter === 'manual') {
            query = db.collection('products').where({
              status: 'pending_review',
              auditReason: ''
            })
          }

          const res = await query
            .orderBy('createTime', 'asc')
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
            publisher: userMap[p.openid] || {}
          }))

          // 统计
          const [autoBlockedCount, manualReviewCount] = await Promise.all([
            db.collection('products').where({
              status: 'pending_review',
              auditReason: _.neq('')
            }).count(),
            db.collection('products').where({
              status: 'pending_review',
              auditReason: ''
            }).count()
          ])

          return { 
            success: true, 
            list,
            stats: {
              autoBlocked: autoBlockedCount.total,
              manualReview: manualReviewCount.total
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

      default:
        return { success: false, error: '未知操作' }
    }
  } catch (e) {
    console.error('adminMgr error:', e)
    return { success: false, error: e.message }
  }
}
