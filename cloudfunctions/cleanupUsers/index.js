// cloudfunctions/cleanupUsers/index.js
// 临时清理函数：删除所有非管理员用户（批量版本）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 分页获取所有记录
async function getAllRecords(collection) {
  const MAX_LIMIT = 100
  const result = []
  
  const countRes = await db.collection(collection).count()
  const total = countRes.total
  
  const batchTimes = Math.ceil(total / MAX_LIMIT)
  
  for (let i = 0; i < batchTimes; i++) {
    const res = await db.collection(collection)
      .skip(i * MAX_LIMIT)
      .limit(MAX_LIMIT)
      .get()
    result.push(...res.data)
  }
  
  console.log(`[getAllRecords] ${collection}: ${result.length} 条`)
  return result
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const ADMIN_OPENID = event.adminOpenid || openid

  console.log('[cleanupUsers] 开始清理...')
  console.log('[cleanupUsers] 执行者 openid:', ADMIN_OPENID)

  try {
    // 0. 清理错误的 system_config.superAdmins 数据
    try {
      const adminConfig = await db.collection('system_config').where({
        configKey: 'superAdmins'
      }).get()
      
      if (adminConfig.data.length > 0) {
        const configDoc = adminConfig.data[0]
        const oldAdmins = configDoc.configValue || []
        
        // 如果管理员列表超过 10 个，说明数据有问题，重置为只有当前用户
        if (oldAdmins.length > 10) {
          console.log('[cleanupUsers] 发现错误的管理员配置，共', oldAdmins.length, '个，重置为当前用户')
          await db.collection('system_config').doc(configDoc._id).update({
            data: {
              configValue: [ADMIN_OPENID],
              updateTime: db.serverDate()
            }
          })
          console.log('[cleanupUsers] 管理员配置已重置')
        }
      }
    } catch (e) {
      console.log('[cleanupUsers] 处理管理员配置失败:', e.message)
    }
    
    console.log('[cleanupUsers] 管理员（当前用户）:', ADMIN_OPENID)

    // 2. 获取所有用户，筛选出要删除的用户
    // ⚠️ 只保留当前调用者（管理员本人），忽略 system_config 中可能错误的数据
    const allUsers = await getAllRecords('users')
    console.log('[cleanupUsers] 总用户数:', allUsers.length)
    
    const usersToDelete = allUsers.filter(user => {
      const userOpenid = user._openid
      if (!userOpenid) return false
      // 只保留当前调用者
      return userOpenid !== ADMIN_OPENID
    })
    
    console.log('[cleanupUsers] 需要删除的用户数:', usersToDelete.length)
    console.log('[cleanupUsers] 保留管理员:', ADMIN_OPENID)

    if (usersToDelete.length === 0) {
      return {
        success: true,
        deletedCount: 0,
        keptCount: allUsers.length,
        message: '没有需要删除的用户'
      }
    }

    // 3. 收集要删除的用户的 openid 列表
    const openidsToDelete = usersToDelete
      .map(u => u._openid)
      .filter(o => o)

    console.log('[cleanupUsers] 待删除用户 openid 数量:', openidsToDelete.length)

    // 4. 批量删除特产
    let deletedProducts = 0
    const allProducts = await getAllRecords('products')
    const productsToDelete = allProducts.filter(p => 
      p._openid && openidsToDelete.includes(p._openid)
    )
    console.log('[cleanupUsers] 待删除特产:', productsToDelete.length)
    
    // 分批删除，每批 20 个
    for (let i = 0; i < productsToDelete.length; i += 20) {
      const batch = productsToDelete.slice(i, i + 20)
      await Promise.all(batch.map(p => 
        db.collection('products').doc(p._id).remove()
      ))
      deletedProducts += batch.length
    }

    // 5. 批量删除订单
    let deletedOrders = 0
    const allOrders = await getAllRecords('orders')
    const ordersToDelete = allOrders.filter(o => 
      (o.initiatorOpenid && openidsToDelete.includes(o.initiatorOpenid)) ||
      (o.receiverOpenid && openidsToDelete.includes(o.receiverOpenid))
    )
    console.log('[cleanupUsers] 待删除订单:', ordersToDelete.length)
    
    for (let i = 0; i < ordersToDelete.length; i += 20) {
      const batch = ordersToDelete.slice(i, i + 20)
      await Promise.all(batch.map(o => 
        db.collection('orders').doc(o._id).remove()
      ))
      deletedOrders += batch.length
    }

    // 6. 批量删除收藏
    let deletedFavorites = 0
    const allFavorites = await getAllRecords('favorites')
    const favoritesToDelete = allFavorites.filter(f => 
      f._openid && openidsToDelete.includes(f._openid)
    )
    console.log('[cleanupUsers] 待删除收藏:', favoritesToDelete.length)
    
    for (let i = 0; i < favoritesToDelete.length; i += 20) {
      const batch = favoritesToDelete.slice(i, i + 20)
      await Promise.all(batch.map(f => 
        db.collection('favorites').doc(f._id).remove()
      ))
      deletedFavorites += batch.length
    }

    // 7. 批量删除积分日志
    let deletedPointsLogs = 0
    const allPointsLogs = await getAllRecords('points_log')
    const pointsLogsToDelete = allPointsLogs.filter(l => 
      l._openid && openidsToDelete.includes(l._openid)
    )
    console.log('[cleanupUsers] 待删除积分日志:', pointsLogsToDelete.length)
    
    for (let i = 0; i < pointsLogsToDelete.length; i += 20) {
      const batch = pointsLogsToDelete.slice(i, i + 20)
      await Promise.all(batch.map(log => 
        db.collection('points_log').doc(log._id).remove()
      ))
      deletedPointsLogs += batch.length
    }

    // 8. 批量删除用户记录
    let deletedCount = 0
    for (let i = 0; i < usersToDelete.length; i += 20) {
      const batch = usersToDelete.slice(i, i + 20)
      await Promise.all(batch.map(u => 
        db.collection('users').doc(u._id).remove()
      ))
      deletedCount += batch.length
      console.log('[cleanupUsers] 已删除用户:', deletedCount, '/', usersToDelete.length)
    }

    console.log('[cleanupUsers] ===== 清理完成 =====')
    console.log('[cleanupUsers] 删除用户:', deletedCount)
    console.log('[cleanupUsers] 保留管理员:', allUsers.length - deletedCount)
    console.log('[cleanupUsers] 删除特产:', deletedProducts)
    console.log('[cleanupUsers] 删除订单:', deletedOrders)

    return {
      success: true,
      deletedCount,
      keptCount: allUsers.length - deletedCount,
      deletedProducts,
      deletedOrders,
      deletedFavorites,
      deletedPointsLogs,
      adminOpenid: ADMIN_OPENID
    }
  } catch (e) {
    console.error('[cleanupUsers] 清理失败:', e)
    return { success: false, error: e.message }
  }
}
