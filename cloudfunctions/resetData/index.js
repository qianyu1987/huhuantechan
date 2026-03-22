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

exports.main = async (event, context) => {
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
