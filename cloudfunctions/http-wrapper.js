// cloudfunctions/http-wrapper.js
// HTTP 触发包装函数 - 供所有云函数使用

/**
 * 解析 HTTP 触发事件
 * @param {Object} event - 云函数事件对象
 * @returns {Object} - 解析后的数据对象
 */
function parseHttpEvent(event) {
  // HTTP 触发时，event 包含 httpMethod 和 body
  if (event.httpMethod && event.body) {
    try {
      return typeof event.body === 'string' ? JSON.parse(event.body) : event.body
    } catch (e) {
      console.error('[HTTP触发] 解析 body 失败:', e)
      return null
    }
  }
  // 普通云函数调用
  return event
}

/**
 * 包装云函数入口
 * @param {Function} handler - 云函数处理函数 (actualEvent, context, openid) => result
 * @returns {Function} - 包装后的云函数入口
 */
function wrapCloudFunction(handler) {
  return async (event, context) => {
    const cloud = require('wx-server-sdk')
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
    
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    
    // 解析事件数据
    const actualEvent = parseHttpEvent(event)
    if (!actualEvent) {
      return { success: false, error: '请求格式错误' }
    }
    
    // 调用处理函数
    return handler(actualEvent, context, openid, wxContext)
  }
}

module.exports = { parseHttpEvent, wrapCloudFunction }