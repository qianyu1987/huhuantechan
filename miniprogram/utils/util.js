// utils/util.js - 工具函数

const { PROVINCES, CREDIT_TIERS } = require('./constants')

/**
 * 格式化时间
 */
function formatTime(date) {
  if (!date) return ''
  if (typeof date === 'string') date = new Date(date)
  if (typeof date === 'number') date = new Date(date)
  const now = Date.now()
  const diff = now - date.getTime()
  
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  if (diff < 7 * 86400000) return Math.floor(diff / 86400000) + '天前'
  
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * 格式化完整日期时间
 */
function formatDateTime(date) {
  if (!date) return ''
  if (typeof date === 'string') date = new Date(date)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d} ${h}:${min}`
}

/**
 * 根据省份code获取省份信息
 */
function getProvinceByCode(code) {
  return PROVINCES.find(p => p.code === code) || null
}

/**
 * 根据省份名称获取省份信息
 */
function getProvinceByName(name) {
  return PROVINCES.find(p => p.name === name || p.name.includes(name) || name.includes(p.name)) || null
}

/**
 * 格式化时间（相对时间）
 */
function formatTimeAgo(date) {
  if (!date) return ''
  if (typeof date === 'string') date = new Date(date)
  if (typeof date === 'number') date = new Date(date)
  
  const now = Date.now()
  const diff = now - date.getTime()
  
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  if (diff < 7 * 86400000) return Math.floor(diff / 86400000) + '天前'
  if (diff < 30 * 86400000) return Math.floor(diff / (7 * 86400000)) + '周前'
  
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * 信用分等级 - 返回完整等级信息
 */
function getCreditLevel(score) {
  score = Math.max(0, Math.min(100, score || 0))

  const tier = CREDIT_TIERS.find(t => score >= t.minScore && score <= t.maxScore)
    || CREDIT_TIERS[0]

  const tierIndex = CREDIT_TIERS.indexOf(tier)
  const nextTier = tierIndex < CREDIT_TIERS.length - 1 ? CREDIT_TIERS[tierIndex + 1] : null

  // 当前等级内的进度百分比
  const rangeSize = tier.maxScore - tier.minScore + 1
  const progress = Math.round(((score - tier.minScore) / rangeSize) * 100)

  // 距下一等级需要的分数
  const nextNeed = nextTier ? nextTier.minScore - score : 0

  // 兼容旧接口的 class 映射
  let creditClass = 'credit-mid'
  if (score >= 80) creditClass = 'credit-high'
  else if (score < 60) creditClass = 'credit-low'

  return {
    level: tier.name,
    icon: tier.icon,
    color: tier.color,
    bgColor: tier.bgColor,
    class: creditClass,
    tierId: tier.id,
    benefits: tier.benefits,
    locked: tier.locked,
    desc: tier.desc,
    progress,
    nextTier: nextTier ? {
      name: nextTier.name,
      icon: nextTier.icon,
      minScore: nextTier.minScore,
      need: nextNeed
    } : null
  }
}

/**
 * 估值格式化显示
 */
function formatValue(min, max) {
  if (max >= 9999) return `${min}元+`
  return `${min}~${max}元`
}

/**
 * 上传图片到云存储
 * @param {string} tempFilePath - 本地临时文件路径
 * @param {string} folder - 云存储文件夹
 * @returns {Promise<string>} - 返回 cloud://fileID
 */
async function uploadImage(tempFilePath, folder = 'products') {
  // 如果已经是 cloud:// 链接，直接返回
  if (tempFilePath.startsWith('cloud://')) {
    return tempFilePath
  }
  
  // 如果是 http/https 链接（非临时文件），直接返回
  if (tempFilePath.startsWith('https://') || (tempFilePath.startsWith('http://') && !tempFilePath.includes('tmp'))) {
    return tempFilePath
  }
  
  // 检查是否是有效的本地临时路径（支持多种格式）
  const isValidTempPath = 
    tempFilePath.startsWith('wxfile://') ||
    tempFilePath.startsWith('http://tmp/') ||
    tempFilePath.startsWith('https://tmp/') ||
    tempFilePath.startsWith('file://') ||
    tempFilePath.startsWith('http://127.0.0.1')
  
  if (!isValidTempPath) {
    console.error('无效的图片路径:', tempFilePath)
    throw new Error('无效的图片路径')
  }
  
  const ext = tempFilePath.split('.').pop() || 'jpg'
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  const cloudPath = `${folder}/${ts}_${rand}.${ext}`
  
  try {
    const res = await wx.cloud.uploadFile({
      cloudPath,
      filePath: tempFilePath
    })
    
    if (!res.fileID) {
      throw new Error('上传失败：未返回 fileID')
    }
    
    console.log('图片上传成功:', res.fileID)
    return res.fileID
  } catch (e) {
    console.error('图片上传失败:', tempFilePath, e)
    throw new Error(`图片上传失败: ${e.message}`)
  }
}

/**
 * 批量获取临时链接
 */
async function getTempUrls(fileIDs) {
  if (!fileIDs || fileIDs.length === 0) return []
  const res = await wx.cloud.getTempFileURL({ fileList: fileIDs })
  return res.fileList.map(f => f.tempFileURL)
}

/**
 * 处理图片URL - 支持云存储fileID和http链接
 * 返回可用于image组件的合法URL
 * 注意：cloud:// fileID 可直接用于 <image> 组件，无需手动转换
 */
function processImageUrl(url) {
  if (!url) return ''
  
  // 如果是http/https链接，直接使用
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  
  // 如果是本地临时路径（开发工具），返回空
  if (url.startsWith('http://127.0.0.1') || url.startsWith('wxfile://')) {
    console.warn('本地临时路径已过期:', url)
    return ''
  }
  
  // cloud:// fileID 可直接被 <image> 组件使用，无需转换
  if (url.startsWith('cloud://')) {
    return url
  }
  
  return url
}

/**
 * 批量处理图片URL列表
 */
function processImageUrls(urls) {
  if (!urls || !Array.isArray(urls)) return []
  return urls.map(url => processImageUrl(url)).filter(Boolean)
}

/**
 * 防抖
 */
function debounce(fn, delay = 500) {
  let timer = null
  return function (...args) {
    clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), delay)
  }
}

/**
 * 显示Toast
 */
function toast(title, icon = 'none', duration = 2000) {
  wx.showToast({ title, icon, duration })
}

/**
 * 显示loading
 */
function showLoading(title = '加载中...') {
  wx.showLoading({ title, mask: true })
}

function hideLoading() {
  wx.hideLoading()
}

/**
 * 调用云函数（含错误处理）
 */
async function callCloud(name, data = {}) {
  try {
    const res = await wx.cloud.callFunction({ name, data })
    return res.result
  } catch (e) {
    console.error(`[cloud:${name}]`, e)
    throw e
  }
}

module.exports = {
  formatTime,
  formatDateTime,
  formatTimeAgo,
  getProvinceByCode,
  getProvinceByName,
  getCreditLevel,
  formatValue,
  uploadImage,
  getTempUrls,
  processImageUrl,
  processImageUrls,
  debounce,
  toast,
  showLoading,
  hideLoading,
  callCloud
}
