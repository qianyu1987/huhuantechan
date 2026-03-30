// cloudfunctions/wallet/index.js
// 钱包云函数
// 功能：获取钱包信息、交易记录等

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// ========== 主函数 ==========
exports.main = async (event, context) => {
  const { action, data } = event
  
  try {
    switch (action) {
      case 'getWalletInfo':
        return await getWalletInfo(data)
      case 'getTransactions':
        return await getTransactions(data)
      default:
        return { success: false, message: '不支持的 action' }
    }
  } catch (e) {
    console.error('[wallet]', e)
    return { success: false, message: e.message || '操作失败' }
  }
}

// ========== 获取钱包信息 ==========
async function getWalletInfo(data) {
  const { openid } = data
  
  if (!openid) {
    return { success: false, message: '缺少openid' }
  }
  
  try {
    // 获取用户信息
    const userRes = await db.collection('users')
      .where({ _openid: openid })
      .limit(1)
      .get()
    
    if (!userRes.data || userRes.data.length === 0) {
      return { success: false, message: '用户不存在' }
    }
    
    const user = userRes.data[0]
    
    // 获取押金信息（如果有）
    let depositInfo = { balance: 0, paid: 0, frozen: 0 }
    if (user.daigouStats && user.daigouStats.deposit) {
      depositInfo = {
        balance: user.daigouStats.deposit.balance || 0,
        paid: user.daigouStats.deposit.paid || 0,
        frozen: user.daigouStats.deposit.frozen || 0
      }
    }
    
    return {
      success: true,
      walletBalance: user.points || 0, // 使用积分作为钱包余额
      depositBalance: depositInfo.balance,
      depositPaid: depositInfo.paid,
      depositFrozen: depositInfo.frozen,
      points: user.points || 0
    }
  } catch (e) {
    console.error('[wallet/getWalletInfo]', e)
    return { success: false, message: '获取钱包信息失败' }
  }
}

// ========== 获取交易记录 ==========
async function getTransactions(data) {
  const { openid, page = 1, pageSize = 5 } = data
  
  if (!openid) {
    return { success: false, message: '缺少openid' }
  }
  
  try {
    // 获取交易记录
    const transactionsRes = await db.collection('points_log')
      .where({ _openid: openid })
      .orderBy('createTime', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()
    
    return {
      success: true,
      list: transactionsRes.data.map(item => ({
        id: item._id,
        title: item.desc || '交易',
        amount: item.amount || 0,
        type: item.type || 'expense',
        time: item.createTime ? item.createTime.toISOString() : '未知时间'
      }))
    }
  } catch (e) {
    console.error('[wallet/getTransactions]', e)
    return { success: false, message: '获取交易记录失败' }
  }
}