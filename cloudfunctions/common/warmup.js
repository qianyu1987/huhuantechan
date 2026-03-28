/**
 * 云函数预热模块
 * 解决冷启动问题：提前建立数据库连接，缓存高频数据
 * 
 * 使用方式：在每个云函数顶部调用 require('../common/warmup').init(cloud)
 */

let _db = null
let _warmupTime = 0
const WARMUP_TTL = 10 * 60 * 1000 // 连接复用10分钟

/**
 * 初始化预热：复用 DB 连接、缓存基础配置
 */
function init(cloud) {
  const now = Date.now()
  if (_db && (now - _warmupTime) < WARMUP_TTL) {
    return _db // 直接复用已有连接（热启动路径）
  }
  _db = cloud.database()
  _warmupTime = now
  return _db
}

module.exports = { init }
