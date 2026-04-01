/**
 * 统一错误处理模块
 */

/**
 * 错误码定义
 */
const ErrorCodes = {
  SUCCESS: { code: 0, message: '成功' },
  PARAM_ERROR: { code: 1001, message: '参数错误' },
  AUTH_ERROR: { code: 1002, message: '未授权' },
  NOT_FOUND: { code: 1003, message: '数据不存在' },
  DB_ERROR: { code: 2001, message: '数据库错误' },
  NETWORK_ERROR: { code: 3001, message: '网络错误' },
  BUSINESS_ERROR: { code: 4001, message: '业务逻辑错误' },
  UNKNOWN_ERROR: { code: 9999, message: '未知错误' }
}

/**
 * 创建成功响应
 * @param {*} data - 响应数据
 * @param {string} message - 成功消息
 * @returns {object}
 */
function success(data = null, message = '成功') {
  return {
    success: true,
    code: ErrorCodes.SUCCESS.code,
    message,
    data
  }
}

/**
 * 创建错误响应
 * @param {string|object} error - 错误信息或错误码对象
 * @param {string} detail - 详细错误信息
 * @returns {object}
 */
function error(error = '未知错误', detail = '') {
  let errorObj = ErrorCodes.UNKNOWN_ERROR
  
  if (typeof error === 'string') {
    // 查找预定义的错误码
    const found = Object.values(ErrorCodes).find(e => e.message === error)
    if (found) {
      errorObj = found
    } else {
      errorObj = { ...ErrorCodes.UNKNOWN_ERROR, message: error }
    }
  } else if (error && error.code) {
    errorObj = error
  }
  
  return {
    success: false,
    code: errorObj.code,
    message: errorObj.message,
    detail: detail || errorObj.message
  }
}

/**
 * 包装云函数主函数，统一错误处理
 * @param {Function} handler - 业务处理函数
 * @returns {Function}
 */
function wrapHandler(handler) {
  return async (event, context) => {
    try {
      console.log(`[CloudFunction] 调用: ${event.action || 'unknown'}`, JSON.stringify(event))
      const result = await handler(event, context)
      console.log(`[CloudFunction] 成功: ${event.action || 'unknown'}`)
      return result
    } catch (e) {
      console.error(`[CloudFunction] 错误: ${event.action || 'unknown'}`, e)
      return error(ErrorCodes.UNKNOWN_ERROR, e.message)
    }
  }
}

/**
 * 参数校验
 * @param {object} params - 参数对象
 * @param {string[]} required - 必填字段列表
 * @returns {object|null} 校验失败返回错误，成功返回null
 */
function validateParams(params, required = []) {
  for (const field of required) {
    if (params[field] === undefined || params[field] === null || params[field] === '') {
      return error(ErrorCodes.PARAM_ERROR, `缺少必填参数: ${field}`)
    }
  }
  return null
}

module.exports = {
  ErrorCodes,
  success,
  error,
  wrapHandler,
  validateParams
}
