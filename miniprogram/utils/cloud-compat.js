/**
 * 云函数兼容性工具
 * 用于支持 WeChat 和 HarmonyOS（鸿蒙）多端开发
 */

/**
 * 以重试机制调用云函数（支持多端）
 * @param {string} funcName - 云函数名称
 * @param {object} data - 传入参数
 * @param {number} maxRetries - 最大重试次数（默认3次）
 * @returns {Promise}
 */
export function callCloudFunctionWithRetry(funcName, data = {}, maxRetries = 3) {
  return new Promise((resolve, reject) => {
    let retryCount = 0
    const delay = (ms) => new Promise(r => setTimeout(r, ms))

    const doCall = async () => {
      if (!wx.cloud) {
        reject(new Error('[Cloud] 云开发尚未初始化'))
        return
      }

      try {
        const res = await wx.cloud.callFunction({
          name: funcName,
          data
        })
        resolve(res)
      } catch (err) {
        retryCount++
        const errMsg = `${err.message || ''} (errCode: ${err.errCode})`
        console.warn(`[Cloud] 调用云函数 "${funcName}" 失败 (${retryCount}/${maxRetries}): ${errMsg}`)

        // HarmonyOS 特定错误码
        // -601002: 云函数环境错误
        // -1: 网络错误或超时
        const isRetryable = (err.errCode === -601002 || err.errCode === -1 || err.errCode === 'INTERNAL_ERROR')
        
        if (retryCount < maxRetries && isRetryable) {
          // 指数退避：第1次延迟500ms，第2次1000ms，第3次1500ms
          const delayMs = 500 * retryCount
          console.log(`[Cloud] 将在 ${delayMs}ms 后进行第${retryCount}次重试...`)
          await delay(delayMs)
          await doCall()
        } else {
          reject(err)
        }
      }
    }

    doCall()
  })
}

/**
 * 获取当前平台
 * @returns {string} 'weixin' 或 'harmony'
 */
export function getCurrentPlatform() {
  try {
    const deviceInfo = wx.getDeviceInfo()
    return deviceInfo.platform === 'harmony' ? 'harmony' : 'weixin'
  } catch (e) {
    console.warn('[Cloud] 获取设备平台失败，默认为 weixin')
    return 'weixin'
  }
}

/**
 * 获取云环境配置建议
 * @returns {object} 云初始化选项
 */
export function getCloudInitOptions(envId) {
  const platform = getCurrentPlatform()
  
  if (platform === 'harmony') {
    // HarmonyOS 平台的特殊配置
    return {
      env: envId,
      traceUser: true,
      // HarmonyOS 可能需要额外的超时配置
      timeout: 30000
    }
  }
  
  // WeChat 平台标准配置
  return {
    env: envId,
    traceUser: true
  }
}

/**
 * 检查云服务连接状态
 * @returns {Promise<boolean>}
 */
export async function checkCloudConnection() {
  try {
    if (!wx.cloud) {
      console.error('[Cloud] wx.cloud 不可用')
      return false
    }

    // 调用一个简单的云函数来测试连接
    const res = await callCloudFunctionWithRetry('testConnect', {}, 2)
    return res && res.result && res.result.success === true
  } catch (e) {
    console.error('[Cloud] 云服务连接测试失败:', e.message)
    return false
  }
}

/**
 * 带降级方案的云函数调用
 * @param {string} funcName - 云函数名称
 * @param {object} data - 传入参数
 * @param {function} fallback - 降级方案回调
 * @returns {Promise}
 */
export async function callCloudFunctionWithFallback(funcName, data = {}, fallback) {
  try {
    return await callCloudFunctionWithRetry(funcName, data, 3)
  } catch (e) {
    console.warn(`[Cloud] 云函数 "${funcName}" 调用最终失败，使用降级方案`)
    if (typeof fallback === 'function') {
      return fallback(e)
    }
    throw e
  }
}

export default {
  callCloudFunctionWithRetry,
  getCurrentPlatform,
  getCloudInitOptions,
  checkCloudConnection,
  callCloudFunctionWithFallback
}
