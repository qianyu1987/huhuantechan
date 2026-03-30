// cloudfunctions/paymentMgr/index.js
// 支付 & 钱包管理云函数 v2.0
// 功能：钱包余额、充值申请、交易记录

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// ========== 常量配置 ==========
// 充值预设金额选项（元）
const RECHARGE_PRESETS = [50, 100, 200, 500, 1000]
// 充值最小/最大金额
const RECHARGE_MIN = 10
const RECHARGE_MAX = 10000
// 管理员微信号（用于充值联系）
const ADMIN_WECHAT = 'xiaoqiange12315'

// ========== 主函数 ==========
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action } = event

  try {
    switch (action) {
      // ── 钱包信息 ──
      case 'getWalletInfo':
        return await getWalletInfo(openid)
      case 'getTransactions':
        return await getTransactions(openid, event)

      // ── 充值申请 ──
      case 'submitRechargeApply':
        return await submitRechargeApply(openid, event)
      case 'getMyRechargeApplies':
        return await getMyRechargeApplies(openid, event)
      case 'cancelRechargeApply':
        return await cancelRechargeApply(openid, event)

      // ── 管理员操作（需鉴权）──
      case 'adminGetRechargeApplies':
        return await adminGetRechargeApplies(openid, event)
      case 'adminApproveRecharge':
        return await adminApproveRecharge(openid, event)
      case 'adminRejectRecharge':
        return await adminRejectRecharge(openid, event)

      // ── 旧接口兼容 ──
      case 'createOrder':
        return { success: false, message: '支付功能暂未开放' }
      case 'getPaymentStatus':
        return { success: false, message: '暂无支付订单' }

      // ── 提现功能 ──
      case 'submitWithdrawalApply':
        return await submitWithdrawalApply(openid, event)
      case 'getMyWithdrawalApplies':
        return await getMyWithdrawalApplies(openid, event)
      case 'cancelWithdrawalApply':
        return await cancelWithdrawalApply(openid, event)
      case 'getWithdrawalConfig':
        return await getWithdrawalConfig(openid, event)

      // ── 管理员提现操作 ──
      case 'adminGetWithdrawalApplies':
        return await adminGetWithdrawalApplies(openid, event)
      case 'adminApproveWithdrawal':
        return await adminApproveWithdrawal(openid, event)
      case 'adminRejectWithdrawal':
        return await adminRejectWithdrawal(openid, event)

      default:
        return { success: false, message: '不支持的 action: ' + action }
    }
  } catch (e) {
    console.error('[paymentMgr]', action, e)
    return { success: false, message: e.message || '操作失败' }
  }
}

// ========================================================
// 获取钱包信息
// ========================================================
async function getWalletInfo(openid) {
  const userRes = await db.collection('users')
    .where({ _openid: openid })
    .limit(1)
    .get()

  if (!userRes.data || userRes.data.length === 0) {
    return { success: false, message: '用户不存在' }
  }

  const user = userRes.data[0]
  const daigouStats = user.daigouStats || {}

  // 查询待审核充值金额总和
  const pendingRes = await db.collection('recharge_apply')
    .where({ _openid: openid, status: 'pending' })
    .get()
  const pendingAmount = (pendingRes.data || []).reduce((sum, r) => sum + (r.amount || 0), 0)

  return {
    success: true,
    walletBalance: user.walletBalance || 0,
    depositBalance: daigouStats.depositBalance || 0,
    depositPaid: daigouStats.depositPaid || 0,
    depositFrozen: daigouStats.depositFrozen || 0,
    points: user.points || 0,
    pendingRechargeAmount: pendingAmount,
    rechargePresets: RECHARGE_PRESETS,
    adminWechat: ADMIN_WECHAT
  }
}

// ========================================================
// 获取交易记录（wallet_logs 集合）
// ========================================================
async function getTransactions(openid, event) {
  const { page = 1, pageSize = 10, type = '' } = event
  const skip = (page - 1) * pageSize

  let query = db.collection('wallet_logs').where({ _openid: openid })
  if (type) query = query.where({ type })

  const [listRes, countRes] = await Promise.all([
    query.orderBy('createTime', 'desc').skip(skip).limit(pageSize).get(),
    query.count()
  ])

  return {
    success: true,
    list: (listRes.data || []).map(item => ({
      id: item._id,
      title: item.title || item.desc || '交易',
      amount: item.amount || 0,
      type: item.flow || 'expense', // income / expense
      bizType: item.type || '',
      time: formatTime(item.createTime),
      status: item.status || 'done',
      remark: item.remark || ''
    })),
    total: countRes.total || 0,
    page,
    pageSize
  }
}

// ========================================================
// 提交充值申请
// ========================================================
async function submitRechargeApply(openid, event) {
  const { amount, remark = '', transferProof = '' } = event

  // 参数校验
  const amountNum = parseFloat(amount)
  if (isNaN(amountNum) || amountNum < RECHARGE_MIN || amountNum > RECHARGE_MAX) {
    return { success: false, message: `充值金额须在 ¥${RECHARGE_MIN}~¥${RECHARGE_MAX} 之间` }
  }

  // 获取用户信息
  const userRes = await db.collection('users')
    .where({ _openid: openid })
    .limit(1)
    .get()
  if (!userRes.data || userRes.data.length === 0) {
    return { success: false, message: '用户不存在，请重新登录' }
  }
  const user = userRes.data[0]

  // 检查是否有待处理的申请（防刷）
  const pendingRes = await db.collection('recharge_apply')
    .where({ _openid: openid, status: 'pending' })
    .count()
  if (pendingRes.total >= 3) {
    return { success: false, message: '您有多个待审核的充值申请，请等待审核后再提交' }
  }

  // 生成申请单号
  const applyNo = 'RC' + Date.now() + Math.random().toString(36).substr(2, 4).toUpperCase()

  const res = await db.collection('recharge_apply').add({
    data: {
      _openid: openid,
      applyNo,
      amount: amountNum,
      status: 'pending',           // pending / approved / rejected / cancelled
      remark,
      transferProof,               // 转账截图（可选）
      userInfo: {
        nickName: user.nickName || '',
        avatarUrl: user.avatarUrl || ''
      },
      adminNote: '',
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  })

  return {
    success: true,
    applyId: res._id,
    applyNo,
    amount: amountNum,
    adminWechat: ADMIN_WECHAT,
    message: `充值申请已提交，申请单号：${applyNo}。请添加管理员微信 ${ADMIN_WECHAT} 并备注申请单号，完成转账后等待审核到账。`
  }
}

// ========================================================
// 获取我的充值申请列表
// ========================================================
async function getMyRechargeApplies(openid, event) {
  const { page = 1, pageSize = 20 } = event
  const skip = (page - 1) * pageSize

  const [listRes, countRes] = await Promise.all([
    db.collection('recharge_apply')
      .where({ _openid: openid })
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get(),
    db.collection('recharge_apply')
      .where({ _openid: openid })
      .count()
  ])

  return {
    success: true,
    list: (listRes.data || []).map(item => ({
      id: item._id,
      applyNo: item.applyNo,
      amount: item.amount,
      status: item.status,
      statusText: getRechargeStatusText(item.status),
      remark: item.remark || '',
      adminNote: item.adminNote || '',
      createTime: formatTime(item.createTime),
      updateTime: formatTime(item.updateTime)
    })),
    total: countRes.total || 0
  }
}

// ========================================================
// 取消充值申请（仅pending状态可取消）
// ========================================================
async function cancelRechargeApply(openid, event) {
  const { applyId } = event
  if (!applyId) return { success: false, message: '缺少申请ID' }

  const applyRes = await db.collection('recharge_apply').doc(applyId).get()
  const apply = applyRes.data
  if (!apply) return { success: false, message: '申请不存在' }
  if (apply._openid !== openid) return { success: false, message: '无权操作' }
  if (apply.status !== 'pending') return { success: false, message: '该申请已处理，无法取消' }

  await db.collection('recharge_apply').doc(applyId).update({
    data: {
      status: 'cancelled',
      updateTime: db.serverDate()
    }
  })

  return { success: true, message: '充值申请已取消' }
}

// ========================================================
// 管理员：获取充值申请列表
// ========================================================
async function adminGetRechargeApplies(openid, event) {
  // 鉴权
  const isAdmin = await verifyAdmin(openid)
  if (!isAdmin) return { success: false, message: '无管理员权限' }

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

  // 批量获取用户信息
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

  return {
    success: true,
    list: (listRes.data || []).map(item => ({
      id: item._id,
      applyNo: item.applyNo,
      amount: item.amount,
      status: item.status,
      statusText: getRechargeStatusText(item.status),
      remark: item.remark || '',
      adminNote: item.adminNote || '',
      transferProof: item.transferProof || '',
      userInfo: userMap[item._openid] || item.userInfo || {},
      currentBalance: (userMap[item._openid] && userMap[item._openid].walletBalance) || 0,
      createTime: formatTime(item.createTime),
      updateTime: formatTime(item.updateTime)
    })),
    total: countRes.total || 0
  }
}

// ========================================================
// 管理员：审批通过充值申请
// ========================================================
async function adminApproveRecharge(openid, event) {
  const isAdmin = await verifyAdmin(openid)
  if (!isAdmin) return { success: false, message: '无管理员权限' }

  const { applyId, adminNote = '审批通过' } = event
  if (!applyId) return { success: false, message: '缺少申请ID' }

  // 获取申请信息
  const applyRes = await db.collection('recharge_apply').doc(applyId).get()
  const apply = applyRes.data
  if (!apply) return { success: false, message: '申请不存在' }
  if (apply.status !== 'pending') return { success: false, message: `该申请已是${getRechargeStatusText(apply.status)}状态` }

  const amount = apply.amount

  // 获取用户文档
  const userRes = await db.collection('users')
    .where({ _openid: apply._openid })
    .limit(1)
    .get()
  if (!userRes.data || userRes.data.length === 0) {
    return { success: false, message: '申请用户不存在' }
  }
  const user = userRes.data[0]
  const oldBalance = user.walletBalance || 0
  const newBalance = Math.round((oldBalance + amount) * 100) / 100

  // 更新申请状态
  await db.collection('recharge_apply').doc(applyId).update({
    data: {
      status: 'approved',
      adminNote,
      approvedBy: openid,
      approvedAt: db.serverDate(),
      updateTime: db.serverDate()
    }
  })

  // 更新用户钱包余额
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
      applyNo: apply.applyNo,
      remark: adminNote,
      status: 'done',
      createTime: db.serverDate()
    }
  })

  return {
    success: true,
    amount,
    newBalance,
    message: `已通过充值申请，充值 ¥${amount.toFixed(2)}，用户余额更新为 ¥${newBalance.toFixed(2)}`
  }
}

// ========================================================
// 管理员：拒绝充值申请
// ========================================================
async function adminRejectRecharge(openid, event) {
  const isAdmin = await verifyAdmin(openid)
  if (!isAdmin) return { success: false, message: '无管理员权限' }

  const { applyId, adminNote = '申请被拒绝' } = event
  if (!applyId) return { success: false, message: '缺少申请ID' }

  const applyRes = await db.collection('recharge_apply').doc(applyId).get()
  const apply = applyRes.data
  if (!apply) return { success: false, message: '申请不存在' }
  if (apply.status !== 'pending') return { success: false, message: `该申请已是${getRechargeStatusText(apply.status)}状态` }

  await db.collection('recharge_apply').doc(applyId).update({
    data: {
      status: 'rejected',
      adminNote,
      rejectedBy: openid,
      rejectedAt: db.serverDate(),
      updateTime: db.serverDate()
    }
  })

  return { success: true, message: '已拒绝该充值申请' }
}

// ========================================================
// 工具函数
// ========================================================
function getRechargeStatusText(status) {
  const map = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已拒绝',
    cancelled: '已取消'
  }
  return map[status] || status
}

async function verifyAdmin(openid) {
  try {
    const res = await db.collection('system_config')
      .where({ key: 'admin_openids' })
      .limit(1)
      .get()
    if (res.data && res.data[0] && Array.isArray(res.data[0].value)) {
      return res.data[0].value.includes(openid)
    }
    // 备用：检查用户的 isAdmin 字段
    const userRes = await db.collection('users')
      .where({ _openid: openid, isAdmin: true })
      .count()
    return userRes.total > 0
  } catch (e) {
    return false
  }
}

function formatTime(ts) {
  if (!ts) return ''
  try {
    const d = ts instanceof Date ? ts : new Date(ts)
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch (e) {
    return String(ts)
  }
}

// ========================================================
// 提现功能实现
// ========================================================

// 获取提现配置（包含提现门槛）
async function getWithdrawalConfig(openid, event) {
  try {
    // 获取系统配置中的提现门槛
    const configRes = await db.collection('system_config').where({
      configKey: 'withdrawal_threshold'
    }).get()
    
    const withdrawalThreshold = configRes.data && configRes.data.length > 0 
      ? parseFloat(configRes.data[0].configValue) 
      : 30.00

    // 获取用户钱包余额
    const userRes = await db.collection('users')
      .where({ _openid: openid })
      .limit(1)
      .get()
    
    const user = userRes.data && userRes.data[0]
    const walletBalance = user ? (user.walletBalance || 0) : 0

    // 计算可提现金额（最多钱包余额的50%）
    const maxWithdrawalRate = 0.5 // 最多提现50%
    const maxWithdrawalAmount = walletBalance * maxWithdrawalRate
    
    // 提现手续费率
    const withdrawalFeeRate = 0.05 // 5%手续费

    // 计算可提现金额：钱包余额的50%
    const availableAmount = maxWithdrawalAmount
    const canWithdraw = availableAmount >= withdrawalThreshold
    
    return {
      success: true,
      withdrawalThreshold,
      walletBalance,
      maxWithdrawalRate,
      maxWithdrawalAmount,
      withdrawalFeeRate,
      canWithdraw,
      availableAmount: availableAmount // 总是返回可提现金额，即使不能提现也显示
    }
  } catch (e) {
    console.error('[getWithdrawalConfig]', e)
    return { success: false, message: e.message || '获取提现配置失败' }
  }
}

// 提交提现申请
async function submitWithdrawalApply(openid, event) {
  const { amount, remark = '', contactInfo = '' } = event
  
  if (!amount || amount <= 0) {
    return { success: false, message: '提现金额必须大于0' }
  }

  try {
    // 获取用户信息和提现配置
    const userRes = await db.collection('users')
      .where({ _openid: openid })
      .limit(1)
      .get()
    
    const user = userRes.data && userRes.data[0]
    if (!user) {
      return { success: false, message: '用户不存在' }
    }

    const walletBalance = user.walletBalance || 0
    
    // 获取提现门槛
    const configRes = await db.collection('system_config').where({
      configKey: 'withdrawal_threshold'
    }).get()
    
    const withdrawalThreshold = configRes.data && configRes.data.length > 0 
      ? parseFloat(configRes.data[0].configValue) 
      : 30.00

    // 检查余额是否足够
    if (walletBalance < amount) {
      return { success: false, message: '钱包余额不足' }
    }

    // 检查是否达到提现门槛
    if (amount < withdrawalThreshold) {
      return { success: false, message: `提现金额不能低于 ¥${withdrawalThreshold.toFixed(2)}` }
    }

    // 检查单次提现金额是否超过钱包余额的50%
    const maxWithdrawalAmount = walletBalance * 0.5
    if (amount > maxWithdrawalAmount) {
      return { success: false, message: `单次提现金额不能超过钱包余额的50%（最多 ¥${maxWithdrawalAmount.toFixed(2)}）` }
    }

    // 生成申请单号
    const applyNo = 'WD' + Date.now() + Math.floor(Math.random() * 1000).toString().padStart(3, '0')

    // 计算手续费和实际到账金额
    const withdrawalFeeRate = 0.05 // 5%手续费
    const feeAmount = parseFloat((amount * withdrawalFeeRate).toFixed(2))
    const actualAmount = parseFloat((amount - feeAmount).toFixed(2))

    // 创建提现申请记录
    await db.collection('withdrawal_apply').add({
      data: {
        _openid: openid,
        applyNo,
        amount: parseFloat(amount), // 申请提现金额
        feeAmount,                  // 手续费金额
        actualAmount,               // 实际到账金额
        walletBalanceBefore: walletBalance,
        remark,
        contactInfo,
        status: 'pending',
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })

    // 冻结提现金额（从钱包余额中扣除）
    const newBalance = walletBalance - amount
    await db.collection('users').doc(user._id).update({
      data: {
        walletBalance: newBalance,
        updateTime: db.serverDate()
      }
    })

    // 记录钱包流水（冻结）
    await db.collection('wallet_logs').add({
      data: {
        _openid: openid,
        type: 'withdrawal_freeze',
        flow: 'expense',
        title: '提现申请冻结',
        amount: parseFloat(amount),
        balanceBefore: walletBalance,
        balanceAfter: newBalance,
        relatedId: applyNo,
        remark: `提现申请 ${applyNo}`,
        status: 'frozen',
        createTime: db.serverDate()
      }
    })

    return {
      success: true,
      applyNo,
      amount,
      feeAmount,
      actualAmount,
      newBalance,
      message: `提现申请已提交，申请单号：${applyNo}。提现金额：¥${amount.toFixed(2)}，手续费：¥${feeAmount.toFixed(2)}（5%），实际到账：¥${actualAmount.toFixed(2)}。请等待管理员审核，审核通过后资金将转入您提供的收款账户。`
    }
  } catch (e) {
    console.error('[submitWithdrawalApply]', e)
    return { success: false, message: e.message || '提交提现申请失败' }
  }
}

// 获取我的提现申请列表
async function getMyWithdrawalApplies(openid, event) {
  const { page = 1, pageSize = 10, status = '' } = event
  
  try {
    let query = db.collection('withdrawal_apply').where({ _openid: openid })
    
    if (status) {
      query = query.where({ status })
    }
    
    const [listRes, countRes] = await Promise.all([
      query
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get(),
      query.count()
    ])

    return {
      success: true,
      list: (listRes.data || []).map(item => ({
        ...item,
        createTimeText: formatTime(item.createTime),
        updateTimeText: formatTime(item.updateTime),
        statusText: getWithdrawalStatusText(item.status)
      })),
      total: countRes.total || 0,
      page,
      pageSize
    }
  } catch (e) {
    console.error('[getMyWithdrawalApplies]', e)
    return { success: false, message: e.message || '获取提现申请列表失败' }
  }
}

// 取消提现申请（仅pending状态可取消）
async function cancelWithdrawalApply(openid, event) {
  const { applyId } = event
  
  if (!applyId) {
    return { success: false, message: '缺少申请ID' }
  }

  try {
    // 获取申请记录
    const applyRes = await db.collection('withdrawal_apply').doc(applyId).get()
    const apply = applyRes.data
    
    if (!apply) {
      return { success: false, message: '提现申请不存在' }
    }
    
    if (apply._openid !== openid) {
      return { success: false, message: '无权操作此申请' }
    }
    
    if (apply.status !== 'pending') {
      return { success: false, message: '只有待审核状态的申请可以取消' }
    }

    // 获取用户信息
    const userRes = await db.collection('users')
      .where({ _openid: openid })
      .limit(1)
      .get()
    
    const user = userRes.data && userRes.data[0]
    if (!user) {
      return { success: false, message: '用户不存在' }
    }

    // 更新申请状态
    await db.collection('withdrawal_apply').doc(applyId).update({
      data: {
        status: 'cancelled',
        updateTime: db.serverDate()
      }
    })

    // 解冻金额（返还到钱包余额）
    const oldBalance = user.walletBalance || 0
    const newBalance = oldBalance + apply.amount
    
    await db.collection('users').doc(user._id).update({
      data: {
        walletBalance: newBalance,
        updateTime: db.serverDate()
      }
    })

    // 记录钱包流水（解冻）
    await db.collection('wallet_logs').add({
      data: {
        _openid: openid,
        type: 'withdrawal_unfreeze',
        flow: 'income',
        title: '提现取消解冻',
        amount: apply.amount,
        balanceBefore: oldBalance,
        balanceAfter: newBalance,
        relatedId: apply.applyNo,
        remark: `取消提现申请 ${apply.applyNo}`,
        status: 'done',
        createTime: db.serverDate()
      }
    })

    return { success: true, message: '提现申请已取消，金额已返还到钱包' }
  } catch (e) {
    console.error('[cancelWithdrawalApply]', e)
    return { success: false, message: e.message || '取消提现申请失败' }
  }
}

// 管理员：获取提现申请列表
async function adminGetWithdrawalApplies(openid, event) {
  // 验证管理员权限
  const isAdmin = await verifyAdmin(openid)
  if (!isAdmin) {
    return { success: false, message: '无管理员权限' }
  }

  const { page = 1, pageSize = 10, status = '', keyword = '' } = event
  
  try {
    let query = db.collection('withdrawal_apply')
    
    if (status) {
      query = query.where({ status })
    }
    
    if (keyword) {
      // 搜索申请单号或用户信息
      const usersRes = await db.collection('users')
        .where({
          nickName: db.RegExp({
            regexp: keyword,
            options: 'i'
          })
        })
        .limit(20)
        .get()
      
      const userOpenids = usersRes.data.map(u => u._openid)
      
      if (userOpenids.length > 0) {
        query = query.where({
          _openid: _.in(userOpenids)
        })
      } else {
        // 如果没有匹配的用户，尝试搜索申请单号
        query = query.where({
          applyNo: db.RegExp({
            regexp: keyword,
            options: 'i'
          })
        })
      }
    }
    
    const [listRes, countRes] = await Promise.all([
      query
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get(),
      query.count()
    ])

    // 获取用户信息
    const openids = [...new Set(listRes.data.map(item => item._openid))]
    const usersMap = {}
    
    if (openids.length > 0) {
      const usersRes = await db.collection('users')
        .where({ _openid: _.in(openids) })
        .get()
      
      usersRes.data.forEach(user => {
        usersMap[user._openid] = user
      })
    }

    return {
      success: true,
      list: (listRes.data || []).map(item => ({
        ...item,
        createTimeText: formatTime(item.createTime),
        updateTimeText: formatTime(item.updateTime),
        statusText: getWithdrawalStatusText(item.status),
        userInfo: usersMap[item._openid] || {}
      })),
      total: countRes.total || 0,
      page,
      pageSize
    }
  } catch (e) {
    console.error('[adminGetWithdrawalApplies]', e)
    return { success: false, message: e.message || '获取提现申请列表失败' }
  }
}

// 管理员：审批通过提现申请
async function adminApproveWithdrawal(openid, event) {
  // 验证管理员权限
  const isAdmin = await verifyAdmin(openid)
  if (!isAdmin) {
    return { success: false, message: '无管理员权限' }
  }

  const { applyId, adminNote = '审核通过', paymentProof = '' } = event
  
  if (!applyId) {
    return { success: false, message: '缺少申请ID' }
  }

  try {
    // 获取申请记录
    const applyRes = await db.collection('withdrawal_apply').doc(applyId).get()
    const apply = applyRes.data
    
    if (!apply) {
      return { success: false, message: '提现申请不存在' }
    }
    
    if (apply.status !== 'pending') {
      return { success: false, message: '该申请已处理' }
    }

    // 更新申请状态
    await db.collection('withdrawal_apply').doc(applyId).update({
      data: {
        status: 'approved',
        adminNote,
        paymentProof,
        approvedBy: openid,
        approvedAt: db.serverDate(),
        updateTime: db.serverDate()
      }
    })

    // 记录钱包流水（提现完成）
    await db.collection('wallet_logs').add({
      data: {
        _openid: apply._openid,
        type: 'withdrawal_complete',
        flow: 'expense',
        title: '提现完成',
        amount: apply.amount,
        balanceBefore: apply.walletBalanceBefore,
        balanceAfter: apply.walletBalanceBefore - apply.amount,
        relatedId: apply.applyNo,
        remark: `提现审核通过 ${adminNote}`,
        status: 'done',
        createTime: db.serverDate()
      }
    })

    return {
      success: true,
      message: `提现申请 ${apply.applyNo} 已审核通过，金额 ¥${apply.amount.toFixed(2)} 已处理`
    }
  } catch (e) {
    console.error('[adminApproveWithdrawal]', e)
    return { success: false, message: e.message || '审批提现申请失败' }
  }
}

// 管理员：拒绝提现申请
async function adminRejectWithdrawal(openid, event) {
  // 验证管理员权限
  const isAdmin = await verifyAdmin(openid)
  if (!isAdmin) {
    return { success: false, message: '无管理员权限' }
  }

  const { applyId, adminNote = '审核拒绝' } = event
  
  if (!applyId) {
    return { success: false, message: '缺少申请ID' }
  }

  try {
    // 获取申请记录
    const applyRes = await db.collection('withdrawal_apply').doc(applyId).get()
    const apply = applyRes.data
    
    if (!apply) {
      return { success: false, message: '提现申请不存在' }
    }
    
    if (apply.status !== 'pending') {
      return { success: false, message: '该申请已处理' }
    }

    // 获取用户信息
    const userRes = await db.collection('users')
      .where({ _openid: apply._openid })
      .limit(1)
      .get()
    
    const user = userRes.data && userRes.data[0]
    if (!user) {
      return { success: false, message: '用户不存在' }
    }

    // 更新申请状态
    await db.collection('withdrawal_apply').doc(applyId).update({
      data: {
        status: 'rejected',
        adminNote,
        rejectedBy: openid,
        rejectedAt: db.serverDate(),
        updateTime: db.serverDate()
      }
    })

    // 解冻金额（返还到钱包余额）
    const oldBalance = user.walletBalance || 0
    const newBalance = oldBalance + apply.amount
    
    await db.collection('users').doc(user._id).update({
      data: {
        walletBalance: newBalance,
        updateTime: db.serverDate()
      }
    })

    // 记录钱包流水（拒绝解冻）
    await db.collection('wallet_logs').add({
      data: {
        _openid: apply._openid,
        type: 'withdrawal_reject',
        flow: 'income',
        title: '提现拒绝返还',
        amount: apply.amount,
        balanceBefore: oldBalance,
        balanceAfter: newBalance,
        relatedId: apply.applyNo,
        remark: `提现申请被拒绝 ${adminNote}`,
        status: 'done',
        createTime: db.serverDate()
      }
    })

    return {
      success: true,
      message: `提现申请 ${apply.applyNo} 已拒绝，金额 ¥${apply.amount.toFixed(2)} 已返还到用户钱包`
    }
  } catch (e) {
    console.error('[adminRejectWithdrawal]', e)
    return { success: false, message: e.message || '拒绝提现申请失败' }
  }
}

// 提现状态文本转换
function getWithdrawalStatusText(status) {
  const map = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已拒绝',
    cancelled: '已取消'
  }
  return map[status] || status
}
