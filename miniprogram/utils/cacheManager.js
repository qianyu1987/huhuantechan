// miniprogram/utils/cacheManager.js
// 缓存管理器 - 优化重复请求
// 特性：
//   1. 本地缓存 + 内存缓存双层
//   2. 自动过期控制
//   3. 防击穿（请求中状态）
//   4. 批量预加载

const CACHE_PREFIX = 'cache_'
const DEFAULT_TTL = 5 * 60 * 1000  // 默认5分钟

// 内存缓存（程序级别，重启后失效）
const memoryCache = {}

// ── 工具：生成缓存Key ──
function genKey(key, params) {
  if (!params) return CACHE_PREFIX + key
  const paramStr = JSON.stringify(params)
  return CACHE_PREFIX + key + '_' + hashCode(paramStr)
}

// 简单哈希函数
function hashCode(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

// ── 工具：获取本地存储的缓存 ──
function getStorageCache(key) {
  try {
    const data = wx.getStorageSync(key)
    if (!data) return null

    // 检查过期
    if (data.expire && Date.now() > data.expire) {
      wx.removeStorageSync(key)
      return null
    }

    return data.value
  } catch (e) {
    return null
  }
}

// ── 工具：设置本地存储缓存 ──
function setStorageCache(key, value, ttl = DEFAULT_TTL) {
  try {
    wx.setStorageSync(key, {
      value,
      expire: Date.now() + ttl,
      createTime: Date.now()
    })
  } catch (e) {
    console.warn('[Cache] setStorage failed:', e)
  }
}

// ═══════════════════════════════════════════════════
// 缓存管理器类
// ═══════════════════════════════════════════════════
class CacheManager {
  constructor() {
    this.requestPending = {}  // 记录正在请求的key，防止重复
  }

  // ── 获取缓存 ──
  get(key, params) {
    const cacheKey = genKey(key, params)

    // 1. 先检查内存缓存
    if (memoryCache[cacheKey]) {
      console.log(`[Cache] HIT (memory): ${key}`)
      return Promise.resolve(memoryCache[cacheKey].value)
    }

    // 2. 检查本地存储
    const storageValue = getStorageCache(cacheKey)
    if (storageValue !== null) {
      console.log(`[Cache] HIT (storage): ${key}`)
      // 回填内存缓存
      memoryCache[cacheKey] = { value: storageValue }
      return Promise.resolve(storageValue)
    }

    return Promise.resolve(null)
  }

  // ── 设置缓存 ──
  set(key, params, value, ttl = DEFAULT_TTL) {
    const cacheKey = genKey(key, params)
    const cacheData = { value, expire: Date.now() + ttl }

    // 设置内存缓存
    memoryCache[cacheKey] = cacheData

    // 设置本地存储缓存
    setStorageCache(cacheKey, value, ttl)

    return this
  }

  // ── 清除指定缓存 ──
  remove(key, params) {
    const cacheKey = genKey(key, params)
    delete memoryCache[cacheKey]
    try {
      wx.removeStorageSync(cacheKey)
    } catch (e) {}
    return this
  }

  // ── 清除指定前缀的所有缓存 ──
  clearByPrefix(prefix) {
    const keys = Object.keys(memoryCache).filter(k => k.startsWith(CACHE_PREFIX + prefix))
    keys.forEach(k => delete memoryCache[k])

    // 清除本地存储
    try {
      const info = wx.getStorageInfoSync()
      info.keys.forEach(k => {
        if (k.startsWith(CACHE_PREFIX + prefix)) {
          wx.removeStorageSync(k)
        }
      })
    } catch (e) {}
  }

  // ── 清除所有缓存 ──
  clearAll() {
    Object.keys(memoryCache).forEach(k => delete memoryCache[k])
    try {
      const info = wx.getStorageInfoSync()
      info.keys.forEach(k => {
        if (k.startsWith(CACHE_PREFIX)) {
          wx.removeStorageSync(k)
        }
      })
    } catch (e) {}
    return this
  }

  // ── 带缓存的请求 ──
  async request(key, fetchFn, params, options = {}) {
    const {
      ttl = DEFAULT_TTL,
      forceRefresh = false,
      silent = false
    } = options

    const cacheKey = genKey(key, params)

    // 强制刷新时清除缓存
    if (forceRefresh) {
      this.remove(key, params)
    }

    // 检查是否有缓存
    if (!forceRefresh) {
      const cached = await this.get(key, params)
      if (cached !== null) {
        return cached
      }
    }

    // 检查是否有正在进行的请求
    if (this.requestPending[cacheKey]) {
      if (!silent) {
        console.log(`[Cache] Request pending: ${key}`)
      }
      return this.requestPending[cacheKey]
    }

    // 创建请求
    if (!silent) {
      console.log(`[Cache] Fetching: ${key}`)
    }

    this.requestPending[cacheKey] = fetchFn()
      .then(res => {
        delete this.requestPending[cacheKey]
        if (res) {
          this.set(key, params, res, ttl)
        }
        return res
      })
      .catch(err => {
        delete this.requestPending[cacheKey]
        console.error(`[Cache] Fetch error for ${key}:`, err)
        throw err
      })

    return this.requestPending[cacheKey]
  }

  // ── 批量预加载 ──
  async preload(items) {
    const promises = items.map(item => {
      const { key, fetchFn, params, ttl } = item
      return this.request(key, fetchFn, params, { ttl, silent: true })
    })
    return Promise.all(promises)
  }

  // ── 获取缓存统计 ──
  getStats() {
    const memoryKeys = Object.keys(memoryCache).filter(k => k.startsWith(CACHE_PREFIX))
    let storageCount = 0

    try {
      const info = wx.getStorageInfoSync()
      storageCount = info.keys.filter(k => k.startsWith(CACHE_PREFIX)).length
    } catch (e) {}

    return {
      memoryCount: memoryKeys.length,
      storageCount,
      pendingRequests: Object.keys(this.requestPending).length
    }
  }
}

// ═══════════════════════════════════════════════════
// 预定义缓存策略
// ═══════════════════════════════════════════════════
const cacheStrategies = {
  // 用户数据 - 5分钟
  userInfo: { key: 'userInfo', ttl: 5 * 60 * 1000 },
  userStats: { key: 'userStats', ttl: 5 * 60 * 1000 },

  // 产品列表 - 2分钟
  productList: { key: 'productList', ttl: 2 * 60 * 1000 },
  myProducts: { key: 'myProducts', ttl: 2 * 60 * 1000 },

  // 订单列表 - 1分钟（订单状态经常变化）
  orderList: { key: 'orderList', ttl: 1 * 60 * 1000 },
  swapOrderList: { key: 'swapOrderList', ttl: 1 * 60 * 1000 },
  daigouOrderList: { key: 'daigouOrderList', ttl: 1 * 60 * 1000 },

  // 分类数据 - 10分钟
  categories: { key: 'categories', ttl: 10 * 60 * 1000 },
  provinces: { key: 'provinces', ttl: 10 * 60 * 1000 },

  // 统计数据 - 30秒
  pendingStats: { key: 'pendingStats', ttl: 30 * 1000 },
  myBadges: { key: 'myBadges', ttl: 5 * 60 * 1000 }
}

// ═══════════════════════════════════════════════════
// 导出单例
// ═══════════════════════════════════════════════════
const cacheManager = new CacheManager()

module.exports = {
  cacheManager,
  cacheStrategies,
  CacheManager
}
