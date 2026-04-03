// cloudfunctions/saveAIFaceRecord/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 确保集合存在
async function ensureCollection(collectionName) {
  try {
    await db.collection(collectionName).limit(1).get()
    return true
  } catch (err) {
    if (err.message && err.message.includes('collection not exists')) {
      try {
        await db.createCollection(collectionName)
        console.log(`集合 ${collectionName} 创建成功`)
        return true
      } catch (createErr) {
        console.error(`创建集合 ${collectionName} 失败:`, createErr)
        return false
      }
    }
    return false
  }
}

exports.main = async (event, context) => {
  const { photoUrl, analysis } = event
  const { OPENID } = cloud.getWXContext()
  
  if (!OPENID) {
    return {
      success: false,
      message: '未获取到用户信息'
    }
  }
  
  try {
    // 确保集合存在
    await ensureCollection('ai_face_records')
    await ensureCollection('ai_face_config')
    
    const now = new Date()
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    
    // 获取用户配置 - 默认每次0.1元 = 10分
    let config = { freeCount: 3, pricePerPhoto: 10 }
    try {
      const configRes = await db.collection('ai_face_config').where({ _openid: OPENID }).get()
      if (configRes.data.length > 0) {
        config = configRes.data[0]
      }
    } catch (e) {
      console.log('获取配置失败:', e)
    }
    
    // 获取今日记录数
    let todayCount = 0
    try {
      const todayCountRes = await db.collection('ai_face_records')
        .where({
          _openid: OPENID,
          date
        })
        .count()
      todayCount = todayCountRes.total
    } catch (e) {
      console.log('获取今日记录数失败:', e)
    }
    
    // 检查是否超过20次上限
    if (todayCount >= 20) {
      return {
        success: false,
        message: '今日已达到记录上限（20次），请明天再来',
        limitReached: true
      }
    }
    
    // 检查是否需要付费（超过免费次数）
    const needPay = todayCount >= (config.freeCount || 3)
    
    if (needPay) {
      // 检查用户钱包余额
      const userRes = await db.collection('users').where({ _openid: OPENID }).get()
      const user = userRes.data[0]
      
      // 钱包余额单位：元
      const walletBalance = user ? (user.walletBalance || 0) : 0
      // 每次拍照费用：0.1元
      const pricePerPhoto = 0.1
      
      if (!user || walletBalance < pricePerPhoto) {
        return {
          success: false,
          message: '余额不足，请先充值',
          needRecharge: true,
          walletBalance: walletBalance,
          pricePerPhoto: pricePerPhoto
        }
      }
      
      // 扣除钱包余额（单位：元）
      await db.collection('users').doc(user._id).update({
        data: {
          walletBalance: db.command.inc(-pricePerPhoto),
          updateTime: db.serverDate()
        }
      })
      
      // 记录消费到 wallet_logs
      try {
        await db.collection('wallet_logs').add({
          data: {
            _openid: OPENID,
            type: 'ai_face',
            flow: 'expense',
            title: 'AI颜值拍照',
            amount: pricePerPhoto, // 存储元
            balanceBefore: walletBalance,
            balanceAfter: walletBalance - pricePerPhoto,
            remark: '超出免费次数，付费拍照',
            status: 'done',
            createTime: db.serverDate()
          }
        })
      } catch (e) {
        console.log('记录消费日志失败:', e)
      }
    }
    
    const record = {
      _openid: OPENID,
      photoUrl,
      date,
      timestamp: now.getTime(),
      isPaid: needPay,
      cost: needPay ? 0.1 : 0, // 存储元
      ...analysis
    }
    
    // 添加新记录
    const addRes = await db.collection('ai_face_records').add({ data: record })
    
    return {
      success: true,
      message: '记录已保存',
      id: addRes._id,
      todayCount: todayCount + 1,
      isPaid: needPay,
      cost: needPay ? 0.1 : 0 // 返回元
    }
  } catch (error) {
    console.error('保存记录失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}
