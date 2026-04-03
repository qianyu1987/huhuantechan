// cloudfunctions/updateAIFaceSettings/index.js
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
  const { reminderEnabled, reminderTime, subscribed } = event
  const { OPENID } = cloud.getWXContext()
  
  console.log('更新设置 - OPENID:', OPENID)
  console.log('更新设置 - 参数:', { reminderEnabled, reminderTime, subscribed })
  
  if (!OPENID) {
    console.error('未获取到 OPENID')
    return { success: false, error: '未获取到用户openid' }
  }
  
  try {
    // 确保集合存在
    await ensureCollection('ai_face_config')
    
    // 查找配置
    let configRes = await db.collection('ai_face_config').where({ _openid: OPENID }).get()
    console.log('查询现有配置:', configRes.data)
    
    const updateData = {
      updateTime: db.serverDate()
    }
    
    // 使用严格相等判断 undefined
    if (reminderEnabled !== undefined) {
      updateData.reminderEnabled = reminderEnabled === true
      console.log('更新 reminderEnabled:', updateData.reminderEnabled)
    }
    if (reminderTime !== undefined && reminderTime !== null) {
      updateData.reminderTime = reminderTime
      console.log('更新 reminderTime:', updateData.reminderTime)
    }
    if (subscribed !== undefined) {
      updateData.subscribed = subscribed === true
      console.log('更新 subscribed:', updateData.subscribed)
    }
    
    console.log('最终更新数据:', updateData)
    
    if (configRes.data.length > 0) {
      // 更新
      const docId = configRes.data[0]._id
      console.log('更新文档 ID:', docId)
      const updateRes = await db.collection('ai_face_config').doc(docId).update({
        data: updateData
      })
      console.log('更新结果:', updateRes)
    } else {
      // 创建
      console.log('创建新配置')
      const addRes = await db.collection('ai_face_config').add({
        data: {
          _openid: OPENID,
          freeCount: 3,
          pricePerPhoto: 10,
          reminderEnabled: reminderEnabled === true,
          reminderTime: reminderTime || '09:00',
          subscribed: subscribed === true,
          ...updateData,
          createTime: db.serverDate()
        }
      })
      console.log('创建结果:', addRes)
    }
    
    return {
      success: true,
      message: '设置已更新'
    }
  } catch (error) {
    console.error('更新设置失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}
