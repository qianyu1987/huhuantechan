// cloudfunctions/migrateOpenid/index.js
// 数据迁移：统一使用 _openid 字段
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 分批获取所有用户（每次最多100条，微信云数据库限制）
async function getAllUsers() {
  const MAX_LIMIT = 100
  const countRes = await db.collection('users').count()
  const total = countRes.total
  const batchTimes = Math.ceil(total / MAX_LIMIT)
  const tasks = []
  for (let i = 0; i < batchTimes; i++) {
    tasks.push(
      db.collection('users').skip(i * MAX_LIMIT).limit(MAX_LIMIT).get()
    )
  }
  const results = await Promise.all(tasks)
  return results.reduce((acc, cur) => acc.concat(cur.data), [])
}

exports.main = async (event, context) => {
  // 支持 HTTP 触发
  let actualEvent = event
  if (event.httpMethod && event.body) {
    try {
      actualEvent = typeof event.body === 'string' ? JSON.parse(event.body) : event.body
    } catch (e) {
      return { success: false, error: '请求格式错误' }
    }
  }
  
  const { action } = actualEvent

  // ========== 清理重复用户记录 ==========
  if (action === 'dedupeUsers') {
    try {
      // 分批获取所有用户
      const allUsers = await getAllUsers()
      
      // 按 _openid 分组
      const grouped = {}
      for (const user of allUsers) {
        const key = user._openid
        if (!grouped[key]) {
          grouped[key] = []
        }
        grouped[key].push(user)
      }

      let deleted = 0
      let kept = 0

      // 对每个分组，保留最新的记录，删除旧的
      for (const [openid, users] of Object.entries(grouped)) {
        if (users.length > 1) {
          // 按创建时间排序，保留最新的
          users.sort((a, b) => {
            const timeA = a.createTime ? new Date(a.createTime).getTime() : 0
            const timeB = b.createTime ? new Date(b.createTime).getTime() : 0
            return timeB - timeA
          })

          // 保留第一个，删除其他的
          const toKeep = users[0]
          const toDelete = users.slice(1)

          for (const user of toDelete) {
            await db.collection('users').doc(user._id).remove()
            deleted++
          }
          kept++
          console.log(`_openid: ${openid}, 保留: ${toKeep._id}, 删除: ${toDelete.length} 条`)
        } else {
          kept++
        }
      }

      return {
        success: true,
        message: `清理完成，共 ${allUsers.length} 个用户记录，保留 ${kept} 个，删除 ${deleted} 条重复`,
        total: allUsers.length,
        kept,
        deleted
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // ========== 移除多余的 openid 字段 ==========
  if (action === 'removeOpenidField') {
    try {
      const allUsers = await getAllUsers()
      let updated = 0

      for (const user of allUsers) {
        if (user.openid) {
          // 移除 openid 字段（只保留 _openid）
          await db.collection('users').doc(user._id).update({
            data: {
              openid: _.remove()
            }
          })
          updated++
        }
      }

      return {
        success: true,
        message: `共 ${allUsers.length} 个用户，更新了 ${updated} 条记录`,
        total: allUsers.length,
        updated
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  return { success: false, error: '未知操作' }
}