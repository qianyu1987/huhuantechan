// cloudfunctions/aiFaceReminder/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    // 获取所有开启了提醒的用户
    const usersRes = await db.collection('ai_face_config')
      .where({
        reminderEnabled: true
      })
      .get()
    
    const users = usersRes.data
    console.log(`找到 ${users.length} 个开启提醒的用户`)
    
    const results = []
    
    for (const user of users) {
      try {
        // 检查今天是否已经拍过照
        const now = new Date()
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        
        const todayCount = await db.collection('ai_face_records')
          .where({
            _openid: user._openid,
            date: today
          })
          .count()
        
        // 如果今天还没拍照，发送提醒
        if (todayCount.total === 0) {
          const result = await cloud.openapi.subscribeMessage.send({
            touser: user._openid,
            templateId: '_GXTKy-pEGT4zntoE8b3xYkPaX2ho1sRbCVkPkOM0YE',
            page: 'pages/ai-face/index',
            data: {
              thing1: { value: 'AI颜值打卡' },
              time2: { value: '09:00' },
              time3: { value: new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }
            }
          })
          
          results.push({
            openid: user._openid,
            success: true,
            result
          })
          
          console.log(`提醒发送成功: ${user._openid}`)
        } else {
          results.push({
            openid: user._openid,
            success: false,
            reason: '今日已拍照'
          })
        }
      } catch (err) {
        console.error(`提醒发送失败: ${user._openid}`, err)
        results.push({
          openid: user._openid,
          success: false,
          error: err.message
        })
      }
    }
    
    return {
      success: true,
      total: users.length,
      sent: results.filter(r => r.success).length,
      results
    }
  } catch (error) {
    console.error('定时提醒失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}
