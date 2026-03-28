/**
 * 云函数内存缓存模块
 * 利用云函数实例复用特性，对高频读取数据做内存缓存，减少数据库 IO
 * 
 * 注意：缓存仅在同一实例内有效，实例销毁后清空（冷启动后重建）
 */

const _store = new Map()

/**
 * 获取缓存
 * @param {string} key 
 * @returns {any|null}
 */
function get(key) {
  const item = _store.get(key)
  if (!item) return null
  if (Date.now() > item.expireAt) {
    _store.delete(key)
    return null
  }
  return item.value
}

/**
 * 设置缓存
 * @param {string} key 
 * @param {any} value 
 * @param {number} ttlMs 过期时间（毫秒），默认5分钟
 */
function set(key, value, ttlMs = 5 * 60 * 1000) {
  _store.set(key, {
    value,
    expireAt: Date.now() + ttlMs
  })
}

/**
 * 删除缓存
 * @param {string} key 
 */
function del(key) {
  _store.delete(key)
}

/**
 * 清空所有缓存
 */
function clear() {
  _store.clear()
}

/**
 * 包装异步获取函数，自动缓存结果
 * @param {string} key 
 * @param {Function} fetcher async () => value
 * @param {number} ttlMs 
 */
async function getOrSet(key, fetcher, ttlMs = 5 * 60 * 1000) {
  const cached = get(key)
  if (cached !== null) return cached
  const value = await fetcher()
  set(key, value, ttlMs)
  return value
}

module.exports = { get, set, del, clear, getOrSet }
