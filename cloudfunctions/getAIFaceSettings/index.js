// cloudfunctions/getAIFaceSettings/index.js
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
  const { OPENID } = cloud.getWXContext()
  
  console.log('获取设置 - OPENID:', OPENID)
  
  if (!OPENID) {
    console.error('未获取到 OPENID')
    return {
      success: false,
      error: '未获取到用户openid'
    }
  }
  
  try {
    // 确保集合存在
    await ensureCollection('ai_face_config')
    
    // 获取或创建设置
    let configRes = await db.collection('ai_face_config').where({ _openid: OPENID }).get()
    console.log('查询结果:', configRes.data)
    
    let config = configRes.data[0]
    
    if (!config) {
      console.log('未找到配置，创建默认配置')
      // 创建默认配置
      const defaultConfig = {
        _openid: OPENID,
        reminderEnabled: false,
        reminderTime: '09:00',
        subscribed: false,
        freeCount: 3,
        pricePerPhoto: 10,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
      
      const addRes = await db.collection('ai_face_config').add({
        data: defaultConfig
      })
      console.log('创建成功:', addRes)
      
      config = defaultConfig
    }
    
    // 确保返回布尔值
    const result = {
      reminderEnabled: config.reminderEnabled === true,
      reminderTime: config.reminderTime || '09:00',
      subscribed: config.subscribed === true
    }
    
    console.log('返回配置:', result)
    
    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('获取设置失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}
