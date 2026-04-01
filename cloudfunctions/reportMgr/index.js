// cloudfunctions/reportMgr/index.js - 举报管理云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 处罚规则配置
const PUNISHMENT_RULES = {
  // 商品举报
  product: {
    minor: {
      label: '轻微',
      points: 0,
      credit: 0,
      deposit: 0,
      productAction: 'offline',  // 下架商品
      banDays: 0
    },
    normal: {
      label: '一般',
      points: 10,
      credit: 5,
      deposit: 0,
      productAction: 'offline',
      banDays: 0
    },
    serious: {
      label: '严重',
      points: 50,
      credit: 20,
      deposit: 0.1,  // 扣除10%押金
      productAction: 'offline',
      banDays: 0
    },
    extreme: {
      label: '极其严重',
      points: 0,
      credit: 100,
      deposit: 1,  // 扣除全部押金
      productAction: 'offline',
      banDays: 0,
      accountAction: 'ban'  // 封号
    }
  },
  // 用户举报
  user: {
    minor: {
      label: '轻微',
      points: 0,
      credit: 0,
      deposit: 0,
      banDays: 0
    },
    normal: {
      label: '一般',
      points: 20,
      credit: 10,
      deposit: 0,
      banDays: 0
    },
    serious: {
      label: '严重',
      points: 100,
      credit: 50,
      deposit: 0.3,  // 扣除30%押金
      banDays: 7     // 封号7天
    },
    extreme: {
      label: '极其严重',
      points: 0,
      credit: 100,
      deposit: 1,    // 扣除全部押金
      banDays: 0,
      accountAction: 'ban'  // 永久封号
    }
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action } = event

  if (!openid) {
    return { success: false, error: '未登录' }
  }

  // ========== 提交举报 ==========
  if (action === 'submitReport') {
    try {
      const { type, targetId, targetType, description, images = [], ownerId } = event

      if (!type || !targetId || !targetType || !description) {
        return { success: false, error: '参数不完整' }
      }

      // 检查是否已举报过（24小时内）
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const existingReport = await db.collection('reports')
        .where({
          reporterId: openid,
          targetId,
          createTime: _.gte(oneDayAgo)
        })
        .limit(1)
        .get()

      if (existingReport.data.length > 0) {
        return { success: false, error: '24小时内已举报过该对象' }
      }

      // 检查是否是自己的商品/自己
      if (type === 'product' && ownerId === openid) {
        return { success: false, error: '不能举报自己的商品' }
      }
      if (type === 'user' && targetId === openid) {
        return { success: false, error: '不能举报自己' }
      }

      // 创建举报记录
      const reportData = {
        type,
        targetId,
        targetType,
        reporterId: openid,
        description,
        images,
        status: 'pending',
        result: '',
        punishment: null,
        handlerId: '',
        createTime: db.serverDate(),
        updateTime: db.serverDate(),
        handleTime: null
      }

      const res = await db.collection('reports').add({ data: reportData })

      // 发送通知给被举报方
      try {
        await _sendReportNotification(type, targetId, ownerId || targetId)
      } catch (e) {
        console.error('发送举报通知失败:', e)
      }

      return { success: true, reportId: res._id }
    } catch (e) {
      console.error('[submitReport]', e)
      return { success: false, error: e.message }
    }
  }

  // ========== 获取我的举报记录 ==========
  if (action === 'getMyReports') {
    try {
      const { page = 1, pageSize = 20 } = event
      const skip = (page - 1) * pageSize

      const listRes = await db.collection('reports')
        .where({ reporterId: openid })
        .orderBy('createTime', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get()

      const totalRes = await db.collection('reports')
        .where({ reporterId: openid })
        .count()

      // 格式化数据
      const formatted = listRes.data.map(r => ({
        ...r,
        createTimeText: _formatTime(r.createTime),
        statusText: _getStatusText(r.status)
      }))

      return { success: true, list: formatted, total: totalRes.total }
    } catch (e) {
      console.error('[getMyReports]', e)
      return { success: false, error: e.message }
    }
  }

  // ========== 管理员获取举报列表 ==========
  if (action === 'adminGetReports') {
    try {
      // 检查权限
      const adminRes = await db.collection('admin_users').where({ openid }).limit(1).get()
      if (adminRes.data.length === 0) {
        return { success: false, error: '无权限' }
      }

      const { page = 1, pageSize = 20, status = '' } = event
      const skip = (page - 1) * pageSize

      let query = db.collection('reports')
      if (status) {
        query = query.where({ status })
      }

      const listRes = await query
        .orderBy('createTime', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get()

      // 获取关联的用户信息
      const userIds = [...new Set(listRes.data.map(r => [r.reporterId, r.targetId]).flat())]
      const userMap = await _getUserMap(userIds)

      // 获取商品信息
      const productIds = listRes.data.filter(r => r.type === 'product').map(r => r.targetId)
      const productMap = await _getProductMap(productIds)

      // 统计各状态数量
      const stats = await _getReportStats()

      // 格式化数据
      const formatted = listRes.data.map(r => ({
        ...r,
        createTimeText: _formatTime(r.createTime),
        statusText: _getStatusText(r.status),
        reporterInfo: userMap[r.reporterId] || null,
        targetUserInfo: userMap[r.targetId] || null,
        productInfo: r.type === 'product' ? (productMap[r.targetId] || null) : null
      }))

      return { success: true, list: formatted, stats }
    } catch (e) {
      console.error('[adminGetReports]', e)
      return { success: false, error: e.message }
    }
  }

  // ========== 管理员处理举报 ==========
  if (action === 'adminHandleReport') {
    try {
      // 检查权限
      const adminRes = await db.collection('admin_users').where({ openid }).limit(1).get()
      if (adminRes.data.length === 0) {
        return { success: false, error: '无权限' }
      }

      const { reportId, result, severity = 'normal', note = '' } = event
      if (!reportId || !result) {
        return { success: false, error: '参数不完整' }
      }

      // 获取举报信息
      const reportRes = await db.collection('reports').doc(reportId).get()
      if (!reportRes.data) {
        return { success: false, error: '举报记录不存在' }
      }

      const report = reportRes.data

      // 获取处罚规则
      const rules = PUNISHMENT_RULES[report.type][severity]
      if (!rules) {
        return { success: false, error: '无效的处罚等级' }
      }

      // 执行处罚
      const punishmentResult = await _executePunishment(report, rules, severity)

      // 更新举报记录
      await db.collection('reports').doc(reportId).update({
        data: {
          status: 'resolved',
          result,
          punishment: {
            severity,
            rules,
            executed: punishmentResult
          },
          note,
          handlerId: openid,
          handleTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })

      // 发送处理结果通知
      try {
        await _sendHandleResultNotification(report, result, punishmentResult)
      } catch (e) {
        console.error('发送处理结果通知失败:', e)
      }

      return { success: true, punishment: punishmentResult }
    } catch (e) {
      console.error('[adminHandleReport]', e)
      return { success: false, error: e.message }
    }
  }

  // ========== 驳回举报 ==========
  if (action === 'adminRejectReport') {
    try {
      // 检查权限
      const adminRes = await db.collection('admin_users').where({ openid }).limit(1).get()
      if (adminRes.data.length === 0) {
        return { success: false, error: '无权限' }
      }

      const { reportId, reason } = event
      if (!reportId || !reason) {
        return { success: false, error: '参数不完整' }
      }

      await db.collection('reports').doc(reportId).update({
        data: {
          status: 'rejected',
          result: reason,
          handlerId: openid,
          handleTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })

      return { success: true }
    } catch (e) {
      console.error('[adminRejectReport]', e)
      return { success: false, error: e.message }
    }
  }

  // ========== 获取处罚规则 ==========
  if (action === 'getPunishmentRules') {
    return { success: true, rules: PUNISHMENT_RULES }
  }

  return { success: false, error: '未知操作' }
}

// ========== 辅助函数 ==========

// 执行处罚
async function _executePunishment(report, rules, severity) {
  const result = {
    success: true,
    actions: []
  }

  try {
    // 获取被处罚用户信息
    const targetUserId = report.type === 'product' ? report.ownerId : report.targetId
    if (!targetUserId) {
      return { success: false, error: '无法确定被处罚用户' }
    }

    const userRes = await db.collection('users').where({ _openid: targetUserId }).limit(1).get()
    if (userRes.data.length === 0) {
      return { success: false, error: '用户不存在' }
    }

    const user = userRes.data[0]

    // 1. 扣除积分
    if (rules.points > 0) {
      const newPoints = Math.max(0, (user.points || 0) - rules.points)
      await db.collection('users').doc(user._id).update({
        data: { points: newPoints }
      })
      result.actions.push({ type: 'deduct_points', amount: rules.points, newValue: newPoints })
    }

    // 2. 扣除信用分
    if (rules.credit > 0) {
      const newCredit = Math.max(0, (user.creditScore || 100) - rules.credit)
      await db.collection('users').doc(user._id).update({
        data: { creditScore: newCredit }
      })
      result.actions.push({ type: 'deduct_credit', amount: rules.credit, newValue: newCredit })

      // 如果信用分过低，记录警告
      if (newCredit < 60) {
        result.actions.push({ type: 'warning', message: '信用分过低，限制发布商品' })
      }
    }

    // 3. 扣除押金
    if (rules.deposit > 0 && user.deposit > 0) {
      const depositAmount = Math.floor(user.deposit * rules.deposit)
      if (depositAmount > 0) {
        const newDeposit = user.deposit - depositAmount
        await db.collection('users').doc(user._id).update({
          data: { deposit: newDeposit }
        })
        result.actions.push({ type: 'deduct_deposit', amount: depositAmount, newValue: newDeposit })

        // 记录押金变动
        await db.collection('deposit_records').add({
          data: {
            userId: targetUserId,
            type: 'punishment',
            amount: -depositAmount,
            reason: `举报处罚：${report.targetType}`,
            reportId: report._id,
            createTime: db.serverDate()
          }
        })
      }
    }

    // 4. 下架商品
    if (rules.productAction === 'offline' && report.type === 'product') {
      await db.collection('products').doc(report.targetId).update({
        data: { status: 'offline', updateTime: db.serverDate() }
      })
      result.actions.push({ type: 'offline_product', productId: report.targetId })
    }

    // 5. 封号
    if (rules.accountAction === 'ban' || rules.banDays > 0) {
      const banUntil = rules.banDays > 0
        ? new Date(Date.now() + rules.banDays * 24 * 60 * 60 * 1000)
        : new Date('2099-12-31')

      await db.collection('users').doc(user._id).update({
        data: {
          isBanned: true,
          banUntil,
          banReason: `举报处罚：${report.targetType}`
        }
      })
      result.actions.push({
        type: 'ban_account',
        days: rules.banDays,
        until: banUntil
      })
    }

    // 记录处罚
    await db.collection('punishments').add({
      data: {
        reportId: report._id,
        userId: targetUserId,
        type: report.type,
        severity,
        points: rules.points,
        credit: rules.credit,
        deposit: rules.deposit,
        banDays: rules.banDays,
        createTime: db.serverDate()
      }
    })

    return result
  } catch (e) {
    console.error('执行处罚失败:', e)
    return { success: false, error: e.message }
  }
}

// 发送举报通知
async function _sendReportNotification(type, targetId, userId) {
  // 这里可以实现消息推送或站内信
  console.log(`[通知] 用户 ${userId} 的${type}被举报`)
}

// 发送处理结果通知
async function _sendHandleResultNotification(report, result, punishment) {
  console.log(`[通知] 举报处理结果已通知用户 ${report.reporterId}`)
}

// 获取用户映射
async function _getUserMap(userIds) {
  const userMap = {}
  if (userIds.length === 0) return userMap

  try {
    const userRes = await db.collection('users')
      .where({ _openid: _.in(userIds) })
      .field({ _openid: true, nickName: true, avatarUrl: true })
      .get()

    userRes.data.forEach(u => {
      userMap[u._openid] = u
    })
  } catch (e) {}

  return userMap
}

// 获取商品映射
async function _getProductMap(productIds) {
  const productMap = {}
  if (productIds.length === 0) return productMap

  try {
    const productRes = await db.collection('products')
      .where({ _id: _.in(productIds) })
      .field({ _id: true, name: true, images: true })
      .get()

    productRes.data.forEach(p => {
      productMap[p._id] = p
    })
  } catch (e) {}

  return productMap
}

// 获取举报统计
async function _getReportStats() {
  const stats = { pending: 0, processing: 0, resolved: 0, rejected: 0 }
  try {
    const allRes = await db.collection('reports')
      .field({ status: true })
      .limit(500)
      .get()

    allRes.data.forEach(r => {
      if (stats[r.status] !== undefined) {
        stats[r.status]++
      }
    })
  } catch (e) {}
  return stats
}

// 格式化时间
function _formatTime(t) {
  if (!t) return ''
  try {
    const date = new Date(typeof t === 'object' && t.$date ? t.$date : t)
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (_) {
    return ''
  }
}

// 获取状态文本
function _getStatusText(status) {
  const map = {
    pending: '待处理',
    processing: '处理中',
    resolved: '已处理',
    rejected: '已驳回'
  }
  return map[status] || status
}
