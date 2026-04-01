// miniprogram/utils/errorMonitor.js
// 错误监控与日志上报
// 特性：
//   1. 统一错误处理
//   2. 自动日志上报
//   3. 用户行为追踪
//   4. 性能监控

const REPORT_COLLECTION = 'error_logs'
const ACTION_COLLECTION = 'action_logs'

// 错误级别
const ErrorLevel = {
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  FATAL: 'fatal'
}

// ── 错误监控器类 ──
class ErrorMonitor {
  constructor() {
    this.isEnabled = true
    this.pendingLogs = []
    this.maxPendingLogs = 10
    this.reportInterval = 30000  // 30秒上报一次
    this.userActions = []
  }

  // ── 初始化 ──
  init() {
    // 设置全局错误处理
    wx.onError && wx.onError((err) => {
      this.reportError(err, ErrorLevel.FATAL, { type: 'global' })
    })

    // 定时上报
    this._startReporter()

    console.log('[ErrorMonitor] Initialized')
  }

  // ── 报告错误 ──
  async reportError(error, level = ErrorLevel.ERROR, extra = {}) {
    if (!this.isEnabled) return

    const log = {
      type: 'error',
      level,
      message: typeof error === 'string' ? error : error.message || error.errMsg || String(error),
      stack: error.stack || '',
      timestamp: new Date().toISOString(),
      extra,
      page: this._getCurrentPage(),
      userAgent: wx.getSystemInfoSync ? wx.getSystemInfoSync().platform : 'unknown'
    }

    console.error(`[ErrorMonitor/${level}]`, log.message, extra)

    this.pendingLogs.push(log)

    // 达到阈值立即上报
    if (this.pendingLogs.length >= this.maxPendingLogs) {
      await this.flush()
    }
  }

  // ── 记录用户行为 ──
  async logAction(actionType, params = {}) {
    if (!this.isEnabled) return

    const log = {
      type: 'action',
      actionType,
      params,
      timestamp: new Date().toISOString(),
      page: this._getCurrentPage()
    }

    this.userActions.push(log)

    // 达到阈值批量上报
    if (this.userActions.length >= 20) {
      await this.flush()
    }
  }

  // ── 记录云函数调用 ──
  async logCloudCall(functionName, params, result, costMs) {
    const isError = result && (result.error || result.success === false)

    if (isError) {
      await this.reportError(
        new Error(`Cloud function ${functionName} failed`),
        ErrorLevel.ERROR,
        {
          functionName,
          params,
          result,
          costMs
        }
      )
    }

    await this.logAction('cloud_call', {
      functionName,
      success: !isError,
      costMs,
      paramsSize: JSON.stringify(params).length
    })
  }

  // ── 记录页面访问 ──
  async logPageView(pageName, options = {}) {
    await this.logAction('page_view', {
      page: pageName,
      ...options
    })
  }

  // ── 记录按钮点击 ──
  async logTap(elementId, pageName) {
    await this.logAction('tap', {
      elementId,
      page: pageName || this._getCurrentPage()
    })
  }

  // ── 记录性能数据 ──
  async logPerformance(metrics) {
    await this.logAction('performance', metrics)
  }

  // ── 获取当前页面 ──
  _getCurrentPage() {
    try {
      const pages = getCurrentPages()
      if (pages.length > 0) {
        return pages[pages.length - 1].route || pages[pages.length - 1].__route__ || 'unknown'
      }
    } catch (e) {}
    return 'unknown'
  }

  // ── 启动定时上报 ──
  _startReporter() {
    setInterval(() => {
      if (this.pendingLogs.length > 0 || this.userActions.length > 0) {
        this.flush().catch(console.error)
      }
    }, this.reportInterval)
  }

  // ── 批量上报 ──
  async flush() {
    if (this.pendingLogs.length === 0 && this.userActions.length === 0) {
      return
    }

    const logsToReport = [...this.pendingLogs]
    const actionsToReport = [...this.userActions]

    this.pendingLogs = []
    this.userActions = []

    try {
      const cloud = require('./cloud')
      const db = cloud.database()

      // 批量上报错误日志
      if (logsToReport.length > 0) {
        const errorPromises = logsToReport.map(log =>
          db.collection(REPORT_COLLECTION).add({ data: log }).catch(() => {})
        )
        await Promise.allSettled(errorPromises)
      }

      // 批量上报行为日志
      if (actionsToReport.length > 0) {
        const actionPromises = actionsToReport.map(action =>
          db.collection(ACTION_COLLECTION).add({ data: action }).catch(() => {})
        )
        await Promise.allSettled(actionPromises)
      }

      console.log(`[ErrorMonitor] Flushed: ${logsToReport.length} errors, ${actionsToReport.length} actions`)
    } catch (e) {
      // 上报失败，放回队列
      console.warn('[ErrorMonitor] Flush failed, re-queuing:', e)
      this.pendingLogs.unshift(...logsToReport)
      this.userActions.unshift(...actionsToReport)
    }
  }
}

// ═══════════════════════════════════════════════════
// 便捷函数
// ═══════════════════════════════════════════════════
const errorMonitor = new ErrorMonitor()

// ── 全局错误处理包装器 ──
function withErrorHandler(fn, fnName = 'unknown') {
  return async function(...args) {
    try {
      return await fn.apply(this, args)
    } catch (err) {
      await errorMonitor.reportError(err, ErrorLevel.ERROR, { fnName })
      throw err
    }
  }
}

// ── 云函数调用包装器（自动记录错误） ──
async function callCloudWithMonitor(functionName, params = {}) {
  const startTime = Date.now()

  try {
    const cloud = require('./cloud')
    const result = await cloud.callFunction({
      name: functionName,
      data: params
    })

    const costMs = Date.now() - startTime
    await errorMonitor.logCloudCall(functionName, params, result, costMs)

    return result
  } catch (err) {
    const costMs = Date.now() - startTime
    await errorMonitor.logCloudCall(functionName, params, { error: err.message }, costMs)
    throw err
  }
}

// ── 页面生命周期包装器 ──
function wrapPageLifecycle(page, name) {
  const originalOnLoad = page.onLoad
  const originalOnShow = page.onShow
  const originalOnReady = page.onReady

  page.onLoad = function(options) {
    errorMonitor.logPageView(name, { type: 'load', options })
    originalOnLoad && originalOnLoad.call(this, options)
  }

  page.onShow = function() {
    errorMonitor.logPageView(name, { type: 'show' })
    originalOnShow && originalOnShow.call(this)
  }

  page.onReady = function() {
    errorMonitor.logPageView(name, { type: 'ready' })
    originalOnReady && originalOnReady.call(this)
  }

  return page
}

// ═══════════════════════════════════════════════════
// 导出
// ═══════════════════════════════════════════════════
module.exports = {
  errorMonitor,
  ErrorLevel,
  withErrorHandler,
  callCloudWithMonitor,
  wrapPageLifecycle
}
