// cloudfunctions/migratePoints/index.js
// 给老用户补充积分字段
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const DEFAULT_POINTS = 50
  
  try {
    // 分批查询所有没有 points 字段的用户（每次最多100条）
    const MAX_LIMIT = 100
    const countRes = await db.collection('users').where({ points: _.exists(false) }).count()
    const total = countRes.total
    const batchTimes = Math.ceil(total / MAX_LIMIT)
    const tasks = []
    for (let i = 0; i < batchTimes; i++) {
      tasks.push(
        db.collection('users').where({ points: _.exists(false) }).skip(i * MAX_LIMIT).limit(MAX_LIMIT).get()
      )
    }
    const results = await Promise.all(tasks)
    const usersWithoutPoints = results.reduce((acc, cur) => acc.concat(cur.data), [])
    
    if (usersWithoutPoints.length === 0) {
      return { 
        success: true, 
        message: '没有需要迁移的用户',
        migratedCount: 0 
      }
    }
    
    // 批量更新
    let successCount = 0
    let failCount = 0
    
    for (const user of usersWithoutPoints) {
      try {
        await db.collection('users').doc(user._id).update({
          data: {
            points: DEFAULT_POINTS
          }
        })
        
        // 记录积分日志
        await db.collection('points_log').add({
          data: {
            _openid: user._openid || user.openid,
            type: 'migration',
            amount: DEFAULT_POINTS,
            desc: '系统迁移补充积分',
            createTime: db.serverDate()
          }
        })
        
        successCount++
      } catch (e) {
        console.error('更新用户失败:', user._id, e)
        failCount++
      }
    }
    
    return {
      success: true,
      message: `迁移完成，成功 ${successCount} 个，失败 ${failCount} 个`,
      migratedCount: successCount,
      failCount
    }
    
  } catch (e) {
    return { success: false, error: e.message }
  }
}
