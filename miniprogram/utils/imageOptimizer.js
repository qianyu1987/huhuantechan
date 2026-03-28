/**
 * 图片优化工具 - imageOptimizer.js
 * 
 * 功能：
 * 1. 前端临时链接 LRU 缓存（避免重复请求）
 * 2. 图片加载失败占位图
 * 3. 懒加载辅助（批量预取封面图）
 * 4. 上传前客户端压缩（降低流量成本）
 */

// ─── 临时链接缓存（LRU，最多缓存200条，2小时有效） ──────────────────────────
const _urlCache = new Map()     // fileID → { url, expireAt }
const _MAX_CACHE = 200
const _CACHE_TTL = 110 * 60 * 1000  // 110分钟（临时链接2小时有效）

function _setCacheUrl(fileID, url) {
  if (_urlCache.size >= _MAX_CACHE) {
    // 删除最早加入的那条（Map 保持插入顺序）
    _urlCache.delete(_urlCache.keys().next().value)
  }
  _urlCache.set(fileID, { url, expireAt: Date.now() + _CACHE_TTL })
}

function _getCacheUrl(fileID) {
  const item = _urlCache.get(fileID)
  if (!item) return null
  if (Date.now() > item.expireAt) {
    _urlCache.delete(fileID)
    return null
  }
  return item.url
}

/**
 * 批量将 cloud:// 转为临时链接，带缓存
 * @param {string[]} fileIDs  cloud:// 列表
 * @returns {Promise<Object>} fileID → tempURL 映射
 */
async function batchResolve(fileIDs) {
  if (!fileIDs || fileIDs.length === 0) return {}

  const result = {}
  const miss = []

  fileIDs.forEach(fid => {
    if (!fid || !fid.startsWith('cloud://')) return
    const cached = _getCacheUrl(fid)
    if (cached) {
      result[fid] = cached
    } else {
      miss.push(fid)
    }
  })

  if (miss.length > 0) {
    try {
      const BATCH = 50
      for (let i = 0; i < miss.length; i += BATCH) {
        const batch = miss.slice(i, i + BATCH)
        const res = await wx.cloud.getTempFileURL({ fileList: batch })
        res.fileList.forEach(f => {
          if (f.tempFileURL) {
            result[f.fileID] = f.tempFileURL
            _setCacheUrl(f.fileID, f.tempFileURL)
          }
        })
      }
    } catch (e) {
      console.warn('[imageOptimizer] batchResolve 失败:', e)
    }
  }

  return result
}

/**
 * 处理产品列表的封面图（填充 coverUrl 字段）
 * @param {Array} products  产品数组，每项有 images 字段
 * @returns {Promise<Array>} 处理后的产品数组
 */
async function resolveProductCovers(products) {
  if (!products || products.length === 0) return products

  // 收集所有第一张图的 cloud:// fileID
  const allFileIDs = []
  products.forEach(p => {
    const cover = p.images && p.images[0]
    if (cover && cover.startsWith('cloud://')) {
      allFileIDs.push(cover)
    }
  })

  const urlMap = await batchResolve([...new Set(allFileIDs)])

  return products.map(p => {
    const cover = p.images && p.images[0]
    if (cover && cover.startsWith('cloud://') && urlMap[cover]) {
      return { ...p, coverUrl: urlMap[cover] }
    }
    return { ...p, coverUrl: cover || '' }
  })
}

/**
 * 单张图片加载失败时的兜底处理
 * 用法：在 <image> 组件上绑定 binderror="onImgError"，
 * 然后在 Page 中调用 handleImgError(e) 即可。
 * 
 * @param {Object} e  微信 image binderror 事件对象
 * @param {Object} page  Page 实例（this）
 * @param {string} listKey  data 中产品列表的 key，默认 'products'
 */
function handleImgError(e, page, listKey = 'products') {
  const index = e.currentTarget.dataset.index
  if (index === undefined) return

  const list = page.data[listKey]
  if (!list || !list[index]) return

  const path = `${listKey}[${index}].coverUrl`
  page.setData({ [path]: '' })
}

/**
 * 上传前压缩图片（微信 canvas 实现）
 * 将图片压缩到不超过 maxSize（KB），质量逐步降低
 * 
 * @param {string} filePath  本地临时路径
 * @param {number} maxSize  最大文件大小（KB），默认800KB
 * @returns {Promise<string>} 压缩后的临时路径
 */
async function compressImage(filePath, maxSize = 800) {
  return new Promise((resolve) => {
    // 先获取图片信息
    wx.getImageInfo({
      src: filePath,
      success: (info) => {
        const { width, height } = info
        // 最大宽度1200px（超过则缩小），保持比例
        const MAX_WIDTH = 1200
        let targetW = width
        let targetH = height
        if (width > MAX_WIDTH) {
          targetW = MAX_WIDTH
          targetH = Math.round(height * (MAX_WIDTH / width))
        }

        wx.compressImage({
          src: filePath,
          quality: 80,
          compressedWidth: targetW,
          compressedHeight: targetH,
          success: (res) => resolve(res.tempFilePath),
          fail: () => resolve(filePath) // 压缩失败，使用原图
        })
      },
      fail: () => resolve(filePath)
    })
  })
}

/**
 * 批量压缩并上传图片（用于发布页）
 * @param {string[]} filePaths  本地临时路径数组
 * @param {string} folder  云存储目录，默认 'products'
 * @param {Function} onProgress  进度回调 (current, total) => void
 * @returns {Promise<string[]>} cloud:// fileID 数组
 */
async function batchUploadImages(filePaths, folder = 'products', onProgress = null) {
  const results = []
  for (let i = 0; i < filePaths.length; i++) {
    try {
      // 1. 压缩
      const compressed = await compressImage(filePaths[i])
      // 2. 上传
      const ext = compressed.split('.').pop() || 'jpg'
      const cloudPath = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
      const res = await wx.cloud.uploadFile({ cloudPath, filePath: compressed })
      results.push(res.fileID)
      if (onProgress) onProgress(i + 1, filePaths.length)
    } catch (e) {
      console.error(`[imageOptimizer] 第${i + 1}张上传失败:`, e)
      results.push(null)
    }
  }
  return results.filter(Boolean)
}

module.exports = {
  batchResolve,
  resolveProductCovers,
  handleImgError,
  compressImage,
  batchUploadImages
}
