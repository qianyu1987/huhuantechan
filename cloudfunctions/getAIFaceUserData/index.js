// cloudfunctions/getAIFaceUserData/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 确保集合存在
async function ensureCollection(collectionName) {
  try {
    // 尝试获取集合信息，如果不存在会报错
    await db.collection(collectionName).limit(1).get()
    return true
  } catch (err) {
    if (err.message && err.message.includes('collection not exists')) {
      // 集合不存在，尝试创建
      try {
        await db.createCollection(collectionName)
        console.log(`集合 ${collectionName} 创建成功`)
        return true
      } catch (createErr) {
        console.error(`创建集合 ${collectionName} 失败:`, createErr)
        return false
      }
    }
    console.error(`检查集合 ${collectionName} 失败:`, err)
    return false
  }
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  
  if (!OPENID) {
    return {
      success: false,
      error: '未获取到用户openid'
    }
  }
  
  try {
    // 确保集合存在
    await ensureCollection('ai_face_config')
    await ensureCollection('ai_face_records')
    
    // 获取用户信息（钱包余额）
    const userRes = await db.collection('users').where({ _openid: OPENID }).get()
    const user = userRes.data[0] || {}
    
    // 获取今日拍照次数
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    
    let todayCount = 0
    try {
      const todayCountRes = await db.collection('ai_face_records')
        .where({
          _openid: OPENID,
          date: today
        })
        .count()
      todayCount = todayCountRes.total
    } catch (e) {
      console.log('获取今日记录数失败:', e)
    }
    
    // 获取或创建用户AI颜值配置
    let config = { freeCount: 3, pricePerPhoto: 10, reminderEnabled: false, reminderTime: '09:00', subscribed: false }
    try {
      let configRes = await db.collection('ai_face_config').where({ _openid: OPENID }).get()
      
      if (configRes.data.length > 0) {
        config = configRes.data[0]
      } else {
        // 创建默认配置
        const addRes = await db.collection('ai_face_config').add({
          data: {
            _openid: OPENID,
            freeCount: 3,
            pricePerPhoto: 10, // 0.1元 = 10分
            reminderEnabled: false,
            reminderTime: '09:00',
            subscribed: false,
            createTime: db.serverDate(),
            updateTime: db.serverDate()
          }
        })
        console.log('创建默认配置:', addRes)
      }
    } catch (e) {
      console.log('获取/创建配置失败:', e)
    }
    
    // 使用 walletBalance 作为余额（与钱包页面一致，单位：元）
    const walletBalance = user.walletBalance || 0
    
    return {
      success: true,
      data: {
        balance: walletBalance, // 单位：元
        todayCount: todayCount,
        freeCount: config.freeCount || 3,
        pricePerPhoto: 0.1, // 0.1元
        reminderEnabled: config.reminderEnabled || false,
        reminderTime: config.reminderTime || '09:00',
        subscribed: config.subscribed || false
      }
    }
  } catch (error) {
    console.error('获取用户数据失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}
