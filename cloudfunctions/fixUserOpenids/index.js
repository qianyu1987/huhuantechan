// cloudfunctions/fixUserOpenids/index.js
// 修复用户表缺少 _openid 字段的问题
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  // 验证管理员权限
  try {
    const admins = await db.collection('system_config').where({
      configKey: 'superAdmins'
    }).get()
    
    const superAdmins = (admins.data[0] && admins.data[0].configValue) || []
    if (!superAdmins.includes(openid)) {
      return { success: false, error: '需要管理员权限' }
    }
  } catch (e) {
    return { success: false, error: '权限验证失败' }
  }

  try {
    console.log('[fixUserOpenids] 开始修复用户 openid 字段...')
    
    // 获取所有用户（分页处理）
    let fixedCount = 0
    let totalCount = 0
    let page = 1
    const pageSize = 100
    
    while (true) {
      const res = await db.collection('users')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()
      
      const users = res.data
      if (users.length === 0) break
      
      for (const user of users) {
        totalCount++
        
        // 检查是否缺少 _openid 字段
        if (!user._openid) {
          // 尝试从 openid 字段获取
          if (user.openid) {
            await db.collection('users').doc(user._id).update({
              data: { _openid: user.openid }
            })
            fixedCount++
            console.log(`[fixUserOpenids] 修复用户 ${user._id}: 添加 _openid = ${user.openid}`)
          } else {
            console.log(`[fixUserOpenids] 用户 ${user._id} 既没有 _openid 也没有 openid 字段，无法修复`)
          }
        }
      }
      
      if (users.length < pageSize) break
      page++
    }
    
    console.log(`[fixUserOpenids] 修复完成: 共检查 ${totalCount} 个用户，修复 ${fixedCount} 个`)
    
    return {
      success: true,
      totalCount,
      fixedCount
    }
  } catch (e) {
    console.error('[fixUserOpenids] 修复失败:', e)
    return {
      success: false,
      error: e.message
    }
  }
}
