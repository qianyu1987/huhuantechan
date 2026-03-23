// cloudfunctions/resetData/index.js
// 一次性清空所有业务数据，保留 system_config
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 需要清空的集合列表
const COLLECTIONS = [
  'users',
  'products',
  'orders',
  'reviews',
  'favorites',
  'credit_log',
  'credit_logs',
  'points_log',
  'user_points',
  'addresses',
  'admin_logs'
]

// 云函数单次 remove 最多删 100 条，需要循环删
async function clearCollection(name) {
  let total = 0
  while (true) {
    try {
      const res = await db.collection(name).where({
        _id: _.exists(true)
      }).limit(100).remove()
      const removed = res.stats.removed
      total += removed
      if (removed < 100) break
    } catch (e) {
      // 集合可能不存在，跳过
      break
    }
  }
  return total
}

// 验证超级管理员权限
async function verifySuperAdmin(wxContext) {
  try {
    const admins = await db.collection('system_config').where({
      configKey: 'superAdmins'
    }).get()
    
    if (admins.data.length > 0 && admins.data[0].configValue) {
      const superAdmins = admins.data[0].configValue
      if (superAdmins.includes(wxContext.OPENID)) {
        return true
      }
    }
  } catch (e) {}
  return false
}

// ========== 修复用户发布数 ==========
async function fixPublishCount() {
  const results = { total: 0, fixed: 0, details: [] }
  
  try {
    // 1. 获取所有用户
    const usersRes = await db.collection('users').limit(1000).get()
    const users = usersRes.data || []
    results.total = users.length
    
    for (const user of users) {
      const userOpenid = user._openid || user.openid
      if (!userOpenid) continue
      
      // 2. 统计该用户的特产数量（所有状态，包括待审核）
      const countRes = await db.collection('products')
        .where({ openid: userOpenid })
        .count()
      
      const actualCount = countRes.total
      const storedCount = user.publishCount || 0
      
      // 3. 如果不一致，更新
      if (actualCount !== storedCount) {
        await db.collection('users').doc(user._id).update({
          data: { publishCount: actualCount }
        })
        results.fixed++
        results.details.push({
          nickName: user.nickName || '未知用户',
          openid: userOpenid,
          oldCount: storedCount,
          newCount: actualCount
        })
      }
    }
    
    return { success: true, ...results }
  } catch (e) {
    return { success: false, error: e.message, ...results }
  }
}

// ========== 清理重复用户记录（统一使用 _openid） ==========
async function cleanupDuplicateUsers() {
  const results = {
    totalUsers: 0,
    duplicatesRemoved: 0,
    migratedToOpenid: 0,
    details: []
  }
  
  try {
    // 1. 获取所有用户
    const usersRes = await db.collection('users').limit(1000).get()
    const users = usersRes.data || []
    results.totalUsers = users.length
    
    // 2. 按 openid 分组
    const openidMap = new Map() // key: openid, value: [user1, user2, ...]
    
    for (const user of users) {
      // 优先使用 _openid，如果没有则使用 openid 字段
      const userOpenid = user._openid || user.openid
      
      if (!userOpenid) {
        console.log('用户缺少 openid:', user._id)
        continue
      }
      
      if (!openidMap.has(userOpenid)) {
        openidMap.set(userOpenid, [])
      }
      openidMap.get(userOpenid).push(user)
    }
    
    // 3. 处理每个 openid 分组
    for (const [openid, userList] of openidMap.entries()) {
      if (userList.length === 1) {
        // 只有一个记录，检查是否需要迁移字段
        const user = userList[0]
        
        if (!user._openid && user.openid) {
          // 需要将 openid 字段迁移到 _openid
          await db.collection('users').doc(user._id).update({
            data: {
              _openid: openid
            }
          })
          results.migratedToOpenid++
          results.details.push({
            action: 'migrate',
            openid: openid,
            userId: user._id
          })
        }
      } else {
        // 有重复记录，保留最新的，删除旧的
        // 按更新时间排序（最新的在前）
        userList.sort((a, b) => {
          const timeA = a.updateTime || a.createTime || 0
          const timeB = b.updateTime || b.createTime || 0
          return timeB - timeA
        })
        
        // 保留第一个（最新的）
        const keepUser = userList[0]
        
        // 确保 _openid 字段存在
        if (!keepUser._openid && keepUser.openid) {
          await db.collection('users').doc(keepUser._id).update({
            data: {
              _openid: openid
            }
          })
          results.migratedToOpenid++
        }
        
        // 删除其他重复记录
        for (let i = 1; i < userList.length; i++) {
          const duplicateUser = userList[i]
          await db.collection('users').doc(duplicateUser._id).remove()
          results.duplicatesRemoved++
          results.details.push({
            action: 'remove_duplicate',
            openid: openid,
            userId: duplicateUser._id,
            nickName: duplicateUser.nickName || '未知用户'
          })
        }
      }
    }
    
    return { success: true, ...results }
  } catch (e) {
    return { success: false, error: e.message, ...results }
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  // 验证超级管理员权限
  const isSuperAdmin = await verifySuperAdmin(wxContext)
  if (!isSuperAdmin) {
    return { success: false, error: '需要超级管理员权限' }
  }
  
  const action = event.action || 'clearAll'
  
  // ========== 清理重复用户记录 ==========
  if (action === 'cleanupDuplicateUsers') {
    return await cleanupDuplicateUsers()
  }
  
  // ========== 修复发布数 ==========
  if (action === 'fixPublishCount') {
    return await fixPublishCount()
  }
  
  // ========== 清空所有数据 ==========
  if (action === 'clearAll') {
    const results = {}
    for (const name of COLLECTIONS) {
      const count = await clearCollection(name)
      results[name] = count
    }

    // 清空云存储（用户上传的图片）
    let filesDeleted = 0
    try {
      // 列出所有文件并删除（每批 50 个）
      // 注意：云存储 API 无法直接列出全部文件，需要从控制台手动清理
      // 这里只清数据库，云存储图片请在控制台「存储」手动删除
    } catch (e) {}

    return {
      success: true,
      message: '数据清空完成！system_config 已保留。云存储图片请在控制台手动删除。',
      results,
      filesNote: '云存储图片需在云开发控制台「存储」中手动全选删除'
    }
  }
  
  return { success: false, error: '未知操作' }
}
