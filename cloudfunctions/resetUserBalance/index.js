// cloudfunctions/resetUserBalance/index.js
// 一次性脚本：清空非充值金额，积分初始化为100

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const ADMIN_OPENID = event.adminOpenid || ''

  if (!ADMIN_OPENID) {
    return { success: false, message: '需要提供 adminOpenid' }
  }

  try {
    // 1. 获取所有用户（分批）
    let allUsers = []
    let page = 0
    const BATCH_SIZE = 100
    let hasMore = true

    while (hasMore) {
      const res = await db.collection('users')
        .skip(page * BATCH_SIZE)
        .limit(BATCH_SIZE)
        .get()
      
      if (res.data && res.data.length > 0) {
        allUsers = allUsers.concat(res.data)
        page++
      } else {
        hasMore = false
      }
    }

    console.log(`[重置] 共找到 ${allUsers.length} 个用户`)

    let updatedCount = 0
    let errorCount = 0
    const details = []

    // 2. 逐个用户处理
    for (const user of allUsers) {
      try {
        const openid = user._openid || user.openid

        // 计算微信充值总额
        const rechargeRes = await db.collection('wallet_logs')
          .where({
            _openid: openid,
            type: 'recharge',
            flow: 'income',
            status: 'done'
          })
          .get()

        let rechargeTotal = 0
        if (rechargeRes.data) {
          rechargeRes.data.forEach(log => {
            rechargeTotal += parseFloat(log.amount) || 0
          })
        }

        // 只保留充值金额（微信支付到账的部分），积分设为100
        await db.collection('users').doc(user._id).update({
          data: {
            walletBalance: Math.round(rechargeTotal * 100) / 100, // 保留两位小数
            points: 100
          }
        })

        // 记录详情
        if (rechargeTotal !== (user.walletBalance || 0) || (user.points || 0) !== 100) {
          details.push({
            openid: openid ? openid.slice(-8) : 'unknown',
            oldBalance: user.walletBalance || 0,
            newBalance: rechargeTotal,
            oldPoints: user.points || 0,
            newPoints: 100
          })
        }

        updatedCount++
      } catch (err) {
        errorCount++
        console.error(`[重置] 用户 ${user._id} 处理失败:`, err.message)
      }
    }

    return {
      success: true,
      message: `重置完成：${updatedCount} 个用户已更新，${errorCount} 个失败`,
      totalUsers: allUsers.length,
      updatedCount,
      errorCount,
      changedCount: details.length,
      details: details.slice(0, 50) // 最多返回50条详情
    }
  } catch (error) {
    console.error('[重置] 执行失败:', error)
    return {
      success: false,
      message: error.message
    }
  }
}
