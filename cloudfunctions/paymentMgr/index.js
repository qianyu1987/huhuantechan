// cloudfunctions/paymentMgr/index.js
// 支付 & 钱包管理云函数 v4.0
// 功能：钱包余额、充值申请、交易记录、微信支付 API

const cloud = require('wx-server-sdk')
const axios = require('axios')
const xml2js = require('xml2js')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// ========== 常量配置 ==========
// 充值预设金额选项（元）
const RECHARGE_PRESETS = [50, 100, 200, 500, 1000]
// 充值最小/最大金额（最低1元起充）
const RECHARGE_MIN = 1
const RECHARGE_MAX = 10000
// 管理员微信号（用于充值联系）
const ADMIN_WECHAT = 'xiaoqiange12315'

// 微信支付 API 配置
const MCH_ID = '1646651415'              // 商户号
const API_KEY = 'abcdefgh1234567890abcdefghhuhuan'  // API密钥
const APPID = 'wx7354d924501a001b'       // 小程序 AppID
// 微信支付 API 地址
const QRCODE_API_URL = 'https://api.qrserver.com/v1/create-qr-code'  // 免费二维码生成 API
const UNIFIED_ORDER_URL = 'https://api.mch.weixin.qq.com/pay/unifiedorder'

// ========== 动态获取环境信息 ==========
// 注意：云环境 ID 格式通常为：环境名称-xxx 或 tcb-xxx
// 完整的 HTTP 访问地址格式：https://<env-id>.service.tcloudbase.com/<function-name>

// 云环境ID（动态获取当前环境）
let ENV_ID = ''

// 初始化环境ID
function getEnvId(wxContext) {
  // 优先使用上下文中获取的环境ID
  if (wxContext && wxContext.ENV) {
    return wxContext.ENV
  }
  // 如果上下文中没有，尝试从 DYNAMIC_CURRENT_ENV 获取
  const env = cloud.DYNAMIC_CURRENT_ENV
  if (env && typeof env === 'object' && env.envId) {
    return env.envId
  }
  // 如果是字符串形式的环境ID
  if (env && typeof env === 'string') {
    return env
  }
  return null
}

// ========================================================
// 微信支付 API V2 辅助函数
// ========================================================

/**
 * 生成微信支付签名
 * @param {Object} params - 参数对象
 * @param {string} key - API密钥
 * @returns {string} 签名字符串
 */
function generateSign(params, key) {
  // 1. 按字典序排序参数
  const sortedKeys = Object.keys(params).sort()
  const signStr = sortedKeys
    .filter(k => params[k] !== '' && params[k] !== null && params[k] !== undefined)
    .map(k => `${k}=${params[k]}`)
    .join('&')
  
  // 2. 拼接 API 密钥
  const signWithKey = signStr + '&key=' + key
  
  // 3. MD5 签名并转大写
  return crypto.createHash('md5').update(signWithKey, 'utf8').digest('hex').toUpperCase()
}

/**
 * 将对象转换为 XML 格式
 * @param {Object} obj - 参数对象
 * @returns {string} XML 字符串
 */
function objToXml(obj) {
  let xml = '<xml>'
  for (const key in obj) {
    const value = obj[key] || ''
    xml += `<${key}><![CDATA[${value}]]></${key}>`
  }
  xml += '</xml>'
  return xml
}

/**
 * 将 XML 转换为对象
 * @param {string} xml - XML 字符串
 * @returns {Object} JS 对象
 */
async function xmlToObj(xml) {
  return new Promise((resolve, reject) => {
    xml2js.parseString(xml, { explicitArray: false, trim: true }, (err, result) => {
      if (err) reject(err)
      else resolve(result.xml)
    })
  })
}

/**
 * 调用微信支付统一下单接口
 * @param {Object} orderParams - 订单参数
 * @param {string} notifyUrl - 支付结果回调地址
 * @returns {Object} 支付结果
 */
async function callUnifiedOrder(orderParams, notifyUrl) {
  // 必需参数
  const params = {
    appid: APPID,
    mch_id: MCH_ID,
    nonce_str: generateNonceStr(),
    body: orderParams.body || '特产互换平台钱包充值',
    out_trade_no: orderParams.outTradeNo,
    total_fee: orderParams.totalFee,
    spbill_create_ip: orderParams.spbillCreateIp || '127.0.0.1',
    // 支付结果回调地址（必填）
    notify_url: notifyUrl || 'https://example.com/pay/callback',
    trade_type: 'JSAPI',
    openid: orderParams.openid
  }
  
  // 生成签名
  params.sign = generateSign(params, API_KEY)
  
  // 转换为 XML
  const xmlData = objToXml(params)
  console.log('[微信支付统一下单请求]', xmlData)
  
  // 发送请求
  try {
    const response = await axios.post(UNIFIED_ORDER_URL, xmlData, {
      headers: { 'Content-Type': 'text/xml' },
      timeout: 30000
    })
    
    console.log('[微信支付原始响应]', response.data)
    
    const result = await xmlToObj(response.data)
    console.log('[微信支付解析后响应]', JSON.stringify(result))
    console.log('[result.xml]', result.xml)
    
    return result.xml || result
  } catch (error) {
    console.error('[微信支付请求失败]', error.message)
    throw error
  }
}

/**
 * 生成随机字符串
 * @returns {string} 32位随机字符串
 */
function generateNonceStr() {
  return crypto.randomBytes(16).toString('hex')
}

/**
 * 生成微信支付二维码图片 URL
 * @param {string} codeUrl - 微信支付二维码链接
 * @param {number} size - 二维码尺寸（默认 300）
 * @returns {string} 二维码图片 URL
 */
function generateQRCodeUrl(codeUrl, size = 300) {
  // 使用 qrserver API 生成二维码
  return `${QRCODE_API_URL}?size=${size}x${size}&data=${encodeURIComponent(codeUrl)}`
}

// ========== 主函数 ==========
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action } = event
  
  // 初始化环境ID
  ENV_ID = getEnvId(wxContext)
  console.log('[paymentMgr] 环境信息:', { 
    envId: ENV_ID, 
    wxContextENV: wxContext.ENV,
    wxContextAppId: wxContext.APPID
  })

  try {
    switch (action) {
      // ── 钱包信息 ──
      case 'getWalletInfo':
        return await getWalletInfo(openid)
      case 'getTransactions':
        return await getTransactions(openid, event)

      // ── 充值相关 ──
      case 'submitRechargeApply':
        return await submitRechargeApply(openid, event)
      case 'getMyRechargeApplies':
        return await getMyRechargeApplies(openid, event)
      case 'cancelRechargeApply':
        return await cancelRechargeApply(openid, event)

      // ── 微信支付充值 ──
      case 'createWechatPayOrder':
        return await createWechatPayOrder(openid, event, wxContext)
      case 'getWechatPayResult':
        return await getWechatPayResult(openid, event)

      // ── 代购微信支付 ──
      case 'createDaigouWxPayOrder':
        return await createDaigouWxPayOrder(openid, event, wxContext)
      case 'queryDaigouPayResult':
        return await queryDaigouPayResult(openid, event)

      // ── 提现功能 ──
      case 'submitWithdrawalApply':
        return await submitWithdrawalApply(openid, event)
      case 'getMyWithdrawalApplies':
        return await getMyWithdrawalApplies(openid, event)
      case 'cancelWithdrawalApply':
        return await cancelWithdrawalApply(openid, event)
      case 'getWithdrawalConfig':
        return await getWithdrawalConfig(openid, event)

      // ── 管理员提现操作 ──
      case 'adminGetWithdrawalApplies':
        return await adminGetWithdrawalApplies(openid, event)
      case 'adminApproveWithdrawal':
        return await adminApproveWithdrawal(openid, event)
      case 'adminRejectWithdrawal':
        return await adminRejectWithdrawal(openid, event)

      // ── 积分兑换 ──
      case 'createPointsExchangeOrder':
        return await createPointsExchangeOrder(openid, event, wxContext)
      case 'getPointsExchangeResult':
        return await getPointsExchangeResult(openid, event)

      default:
        return { success: false, message: '不支持的 action: ' + action }
    }
  } catch (e) {
    console.error('[paymentMgr]', action, e)
    return { success: false, message: e.message || '操作失败' }
  }
}

// ========================================================
// 获取钱包信息
// ========================================================
async function getWalletInfo(openid) {
  const userRes = await db.collection('users')
    .where({ _openid: openid })
    .limit(1)
    .get()

  if (!userRes.data || userRes.data.length === 0) {
    return { success: false, message: '用户不存在' }
  }

  const user = userRes.data[0]
  const daigouStats = user.daigouStats || {}

  return {
    success: true,
    walletBalance: user.walletBalance || 0,
    depositBalance: daigouStats.depositBalance || 0,
    depositPaid: daigouStats.depositPaid || 0,
    depositFrozen: daigouStats.depositFrozen || 0,
    points: user.points || 0,
    rechargePresets: RECHARGE_PRESETS,
    adminWechat: ADMIN_WECHAT
  }
}

// ========================================================
// 获取交易记录（wallet_logs 集合）
// ========================================================
async function getTransactions(openid, event) {
  const { page = 1, pageSize = 10, type = '' } = event
  const skip = (page - 1) * pageSize

  let query = db.collection('wallet_logs').where({ _openid: openid })
  if (type) query = query.where({ type })

  const [listRes, countRes] = await Promise.all([
    query.orderBy('createTime', 'desc').skip(skip).limit(pageSize).get(),
    query.count()
  ])

  return {
    success: true,
    list: (listRes.data || []).map(item => ({
      id: item._id,
      title: item.title || item.desc || '交易',
      amount: item.amount || 0,
      type: item.flow || 'expense', // income / expense
      bizType: item.type || '',
      time: formatTime(item.createTime),
      status: item.status || 'done',
      remark: item.remark || ''
    })),
    total: countRes.total || 0,
    page,
    pageSize
  }
}

// ========================================================
// 提交充值申请
// ========================================================
async function submitRechargeApply(openid, event) {
  const { amount, remark = '', transferProof = '' } = event

  // 参数校验
  const amountNum = parseFloat(amount)
  if (isNaN(amountNum) || amountNum < RECHARGE_MIN || amountNum > RECHARGE_MAX) {
    return { success: false, message: `充值金额须在 ¥${RECHARGE_MIN}~¥${RECHARGE_MAX} 之间` }
  }

  // 获取用户信息
  const userRes = await db.collection('users')
    .where({ _openid: openid })
    .limit(1)
    .get()
  if (!userRes.data || userRes.data.length === 0) {
    return { success: false, message: '用户不存在，请重新登录' }
  }
  const user = userRes.data[0]

  // 检查是否有待处理的申请（防刷）
  const pendingRes = await db.collection('recharge_apply')
    .where({ _openid: openid, status: 'pending' })
    .count()
  if (pendingRes.total >= 3) {
    return { success: false, message: '您有多个待审核的充值申请，请等待审核后再提交' }
  }

  // 生成申请单号
  const applyNo = 'RC' + Date.now() + Math.random().toString(36).substr(2, 4).toUpperCase()

  const res = await db.collection('recharge_apply').add({
    data: {
      _openid: openid,
      applyNo,
      amount: amountNum,
      status: 'pending',           // pending / approved / rejected / cancelled
      remark,
      transferProof,               // 转账截图（可选）
      userInfo: {
        nickName: user.nickName || '',
        avatarUrl: user.avatarUrl || ''
      },
      adminNote: '',
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  })

  return {
    success: true,
    applyId: res._id,
    applyNo,
    amount: amountNum,
    adminWechat: ADMIN_WECHAT,
    message: `充值申请已提交，申请单号：${applyNo}。请添加管理员微信 ${ADMIN_WECHAT} 并备注申请单号，完成转账后等待审核到账。`
  }
}

// ========================================================
// 获取我的充值申请列表
// ========================================================
async function getMyRechargeApplies(openid, event) {
  const { page = 1, pageSize = 20 } = event
  const skip = (page - 1) * pageSize

  const [listRes, countRes] = await Promise.all([
    db.collection('recharge_apply')
      .where({ _openid: openid })
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get(),
    db.collection('recharge_apply')
      .where({ _openid: openid })
      .count()
  ])

  return {
    success: true,
    list: (listRes.data || []).map(item => ({
      id: item._id,
      orderNo: item.orderNo || item.applyNo,
      amount: item.amount,
      status: item.status,
      statusText: getRechargeStatusText(item.status),
      createTime: formatTime(item.createTime),
      updateTime: formatTime(item.updateTime)
    })),
    total: countRes.total || 0
  }
}

// ========================================================
// 取消充值申请（仅pending状态可取消）
// ========================================================
async function cancelRechargeApply(openid, event) {
  const { applyId } = event
  if (!applyId) return { success: false, message: '缺少申请ID' }

  const applyRes = await db.collection('recharge_apply').doc(applyId).get()
  const apply = applyRes.data
  if (!apply) return { success: false, message: '申请不存在' }
  if (apply._openid !== openid) return { success: false, message: '无权操作' }
  if (apply.status !== 'pending') return { success: false, message: '该申请已处理，无法取消' }

  await db.collection('recharge_apply').doc(applyId).update({
    data: {
      status: 'cancelled',
      updateTime: db.serverDate()
    }
  })

  return { success: true, message: '充值申请已取消' }
}

// ========================================================
// 工具函数
// ========================================================
function getRechargeStatusText(status) {
  const map = {
    pending: '处理中',
    approved: '充值成功',
    rejected: '已拒绝',
    cancelled: '已取消',
    failed: '支付失败'
  }
  return map[status] || status
}

function formatTime(ts) {
  if (!ts) return ''
  try {
    const d = ts instanceof Date ? ts : new Date(ts)
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch (e) {
    return String(ts)
  }
}

// ========================================================
// 微信支付：创建充值订单（使用微信支付 API V2）
// ========================================================
async function createWechatPayOrder(openid, event, wxContext) {
  const { amount } = event

  // 参数校验
  const amountNum = parseFloat(amount)
  if (isNaN(amountNum) || amountNum < RECHARGE_MIN || amountNum > RECHARGE_MAX) {
    return { success: false, message: `充值金额须在 ¥${RECHARGE_MIN}~¥${RECHARGE_MAX} 之间` }
  }

  // 获取用户信息
  const userRes = await db.collection('users')
    .where({ _openid: openid })
    .limit(1)
    .get()
  if (!userRes.data || userRes.data.length === 0) {
    return { success: false, message: '用户不存在，请重新登录' }
  }
  const user = userRes.data[0]

  // 生成订单号
  const orderNo = 'WX' + Date.now() + Math.random().toString(36).substr(2, 6).toUpperCase()

  // 在数据库中创建充值记录（状态为 pending）
  const res = await db.collection('recharge_apply').add({
    data: {
      _openid: openid,
      orderNo,
      wechatPayOrderNo: '',
      amount: amountNum,
      paymentMethod: 'wechat_pay_api',
      status: 'pending',
      userInfo: {
        nickName: user.nickName || '',
        avatarUrl: user.avatarUrl || ''
      },
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  })

  // 调用微信支付统一下单接口（API V2）
  try {
    // 获取客户端IP
    const clientIP = wxContext.CLIENTIP || '127.0.0.1'
    
    // 构建支付回调 URL
    // 格式：https://<env-id>.ap-shanghai.app.tcloudbase.com/paymentCallback
    const notifyUrl = 'https://cloud1-3g4sjhqr5e28e54e-1348466332.ap-shanghai.app.tcloudbase.com/paymentCallback'
    console.log('[支付回调地址]', notifyUrl)
    
    // 调用统一下单接口
    const payResult = await callUnifiedOrder({
      body: '特产互换平台钱包充值',
      outTradeNo: orderNo,
      totalFee: Math.round(amountNum * 100), // 金额（分）
      spbillCreateIp: clientIP,
      openid: openid
    }, notifyUrl)

    console.log('[微信支付统一下单完整响应]', JSON.stringify(payResult))

    // 检查返回结果
    if (payResult.return_code === 'SUCCESS' && payResult.result_code === 'SUCCESS') {
      // 检查是否有 prepay_id（JSAPI 支付必需）
      if (!payResult.prepay_id) {
        console.error('[支付错误] return_code=SUCCESS 但缺少 prepay_id:', payResult)
        return { success: false, message: '支付参数获取失败，请重试' }
      }

      // 更新充值记录
      await db.collection('recharge_apply').doc(res._id).update({
        data: {
          wechatPayOrderNo: payResult.prepay_id,
          updateTime: db.serverDate()
        }
      })
      
      // JSAPI 支付：生成调起支付的参数
      const timeStamp = String(Math.floor(Date.now() / 1000))
      const nonceStr = generateNonceStr()
      const packageStr = 'prepay_id=' + payResult.prepay_id
      
      const signParams = {
        appId: APPID,
        timeStamp: timeStamp,
        nonceStr: nonceStr,
        package: packageStr,
        signType: 'MD5'
      }
      const paySign = generateSign(signParams, API_KEY)

      console.log('[JSAPI支付参数]', { timeStamp, nonceStr, package: packageStr, paySign })

      return {
        success: true,
        orderId: res._id,
        orderNo,
        payMode: 'jsapi',  // JSAPI 支付模式
        paymentParams: {
          timeStamp,
          nonceStr,
          package: packageStr,
          signType: 'MD5',
          paySign
        },
        message: '支付订单已创建，请完成支付'
      }
    } else {
      // 统一下单失败 - 返回详细信息用于调试
      console.error('[微信支付统一下单失败]', {
        return_code: payResult.return_code,
        return_msg: payResult.return_msg,
        result_code: payResult.result_code,
        err_code: payResult.err_code,
        err_code_des: payResult.err_code_des
      })
      return { 
        success: false, 
        message: payResult.err_code_des || payResult.err_code || payResult.return_msg || '支付订单创建失败',
        debug: {
          return_code: payResult.return_code,
          return_msg: payResult.return_msg,
          result_code: payResult.result_code,
          err_code: payResult.err_code,
          err_code_des: payResult.err_code_des
        }
      }
    }
  } catch (payErr) {
    console.error('[微信支付统一下单失败]', payErr)

    await db.collection('recharge_apply').doc(res._id).update({
      data: {
        status: 'failed',
        errorMsg: payErr.message || '支付创建失败',
        updateTime: db.serverDate()
      }
    })

    return {
      success: false,
      message: '支付订单创建失败：' + (payErr.message || '请稍后重试')
    }
  }
}

// ========================================================
// 微信支付：查询支付结果
// ========================================================

// 微信支付订单查询 API 地址
const ORDER_QUERY_URL = 'https://api.mch.weixin.qq.com/pay/orderquery'

/**
 * 查询微信支付订单状态（API V2）
 * @param {string} outTradeNo - 商户订单号
 * @returns {Object} 查询结果
 */
async function queryWechatPayOrder(outTradeNo) {
  const params = {
    appid: APPID,
    mch_id: MCH_ID,
    out_trade_no: outTradeNo,
    nonce_str: generateNonceStr()
  }
  
  params.sign = generateSign(params, API_KEY)
  const xmlData = objToXml(params)
  
  try {
    const response = await axios.post(ORDER_QUERY_URL, xmlData, {
      headers: { 'Content-Type': 'text/xml' },
      timeout: 30000
    })
    
    const result = await xmlToObj(response.data)
    console.log('[微信支付订单查询响应]', JSON.stringify(result))
    
    return result
  } catch (error) {
    console.error('[微信支付订单查询失败]', error.message)
    throw error
  }
}

async function getWechatPayResult(openid, event) {
  const { orderId } = event

  if (!orderId) {
    return { success: false, message: '缺少订单ID' }
  }

  try {
    const res = await db.collection('recharge_apply').doc(orderId).get()
    const record = res.data

    if (!record) {
      return { success: false, message: '订单不存在' }
    }

    if (record._openid !== openid) {
      return { success: false, message: '无权查看此订单' }
    }

    // 如果状态已经是 approved，说明已经到账
    if (record.status === 'approved') {
      return {
        success: true,
        status: 'approved',
        message: '充值已到账',
        balance: record.balanceAfter || 0
      }
    }

    // 如果状态是 failed
    if (record.status === 'failed') {
      return {
        success: false,
        status: 'failed',
        message: record.errorMsg || '支付失败'
      }
    }

    // 如果状态是 pending 且有微信支付订单号，查询支付状态
    if (record.status === 'pending' && record.wechatPayOrderNo) {
      try {
        const queryResult = await queryWechatPayOrder(record.orderNo)
        
        const tradeState = queryResult.trade_state

        if (tradeState === 'SUCCESS') {
          return await processRechargeSuccess(openid, orderId, record, queryResult.transaction_id)
        } else if (tradeState === 'CLOSED' || tradeState === 'PAY_ERROR') {
          await db.collection('recharge_apply').doc(orderId).update({
            data: {
              status: 'failed',
              errorMsg: '支付已关闭或失败',
              updateTime: db.serverDate()
            }
          })
          return {
            success: false,
            status: 'failed',
            message: '支付已关闭，请重新发起支付'
          }
        } else {
          return {
            success: true,
            status: 'pending',
            message: '支付处理中，请稍候...'
          }
        }
      } catch (queryErr) {
        console.error('[微信支付查询失败]', queryErr)
        return {
          success: true,
          status: 'pending',
          message: '支付处理中，请稍候...'
        }
      }
    }

    // 首次查询，订单还在 pending（还没有微信支付订单号）
    // 如果前端刚发起支付，可能需要等待几秒
    return {
      success: true,
      status: 'pending',
      message: '等待支付...'
    }
  } catch (e) {
    console.error('[getWechatPayResult]', e)
    return { success: false, message: '查询失败' }
  }
}

// ========================================================
// 处理充值成功（内部方法）
// ========================================================
async function processRechargeSuccess(openid, orderId, record, transactionId) {
  try {
    // 更新充值记录状态
    await db.collection('recharge_apply').doc(orderId).update({
      data: {
        status: 'approved',
        wechatPayOrderNo: transactionId || '',
        approvedAt: db.serverDate(),
        updateTime: db.serverDate()
      }
    })

    // 获取用户当前余额
    const userRes = await db.collection('users').where({ _openid: openid }).limit(1).get()
    const user = userRes.data && userRes.data[0]
    if (!user) {
      return { success: false, message: '用户不存在' }
    }

    const oldBalance = user.walletBalance || 0
    const amount = record.amount
    const newBalance = Math.round((oldBalance + amount) * 100) / 100

    // 更新用户钱包余额
    await db.collection('users').doc(user._id).update({
      data: {
        walletBalance: newBalance,
        updateTime: db.serverDate()
      }
    })

    // 写钱包流水
    await db.collection('wallet_logs').add({
      data: {
        _openid: openid,
        type: 'recharge',
        flow: 'income',
        title: '微信支付充值',
        amount: amount,
        balanceBefore: oldBalance,
        balanceAfter: newBalance,
        relatedId: orderId,
        orderNo: record.orderNo,
        transactionId: transactionId,
        remark: '微信支付充值成功',
        status: 'done',
        createTime: db.serverDate()
      }
    })

    return {
      success: true,
      status: 'approved',
      message: `充值成功！¥${amount.toFixed(2)} 已到账`,
      balance: newBalance
    }
  } catch (e) {
    console.error('[processRechargeSuccess]', e)
    return { success: false, message: '处理充值时出错' }
  }
}

// ========================================================
// 代购订单微信支付：创建支付订单
// ========================================================
async function createDaigouWxPayOrder(openid, event, wxContext) {
  const { orderId, orderNo, amount, productName, buyerOpenid } = event

  if (!orderId || !orderNo || !amount) {
    return { success: false, message: '参数不完整' }
  }

  const amountNum = parseFloat(amount)
  if (isNaN(amountNum) || amountNum <= 0) {
    return { success: false, message: '支付金额无效' }
  }

  const payOpenid = buyerOpenid || openid

  try {
    const clientIP = (wxContext && wxContext.CLIENTIP) || '127.0.0.1'
    const notifyUrl = 'https://cloud1-3g4sjhqr5e28e54e-1348466332.ap-shanghai.app.tcloudbase.com/paymentCallback'

    // 生成支付单号（避免与充值订单号冲突，加 DG 前缀）
    const wxPayOrderNo = 'DGP' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase()

    const payResult = await callUnifiedOrder({
      body: productName ? ('特产代购-' + productName.substring(0, 20)) : '特产代购',
      outTradeNo: wxPayOrderNo,
      totalFee: Math.round(amountNum * 100),  // 分
      spbillCreateIp: clientIP,
      openid: payOpenid
    }, notifyUrl)

    console.log('[代购微信支付统一下单响应]', JSON.stringify(payResult))

    if (payResult.return_code === 'SUCCESS' && payResult.result_code === 'SUCCESS') {
      if (!payResult.prepay_id) {
        return { success: false, message: '支付参数获取失败，请重试' }
      }

      // 记录支付单到 daigou_pay_logs
      let wxPayOrderId = ''
      try {
        const addRes = await db.collection('daigou_pay_logs').add({
          data: {
            _openid: payOpenid,
            daigouOrderId: orderId,
            daigouOrderNo: orderNo,
            wxPayOrderNo,
            prepayId: payResult.prepay_id,
            amount: amountNum,
            status: 'pending',
            createTime: db.serverDate(),
            updateTime: db.serverDate()
          }
        })
        wxPayOrderId = addRes._id
      } catch (logErr) {
        // 集合不存在不阻断支付流程
        console.warn('[createDaigouWxPayOrder] daigou_pay_logs 写入失败:', logErr.message)
      }

      // 生成 JSAPI 调起参数
      const timeStamp = String(Math.floor(Date.now() / 1000))
      const nonceStr = generateNonceStr()
      const packageStr = 'prepay_id=' + payResult.prepay_id
      const signParams = {
        appId: APPID,
        timeStamp,
        nonceStr,
        package: packageStr,
        signType: 'MD5'
      }
      const paySign = generateSign(signParams, API_KEY)

      return {
        success: true,
        wxPayOrderId,
        wxPayOrderNo,
        paymentParams: {
          timeStamp,
          nonceStr,
          package: packageStr,
          signType: 'MD5',
          paySign
        },
        message: '支付参数获取成功'
      }
    } else {
      console.error('[代购微信支付失败]', payResult)
      return {
        success: false,
        message: payResult.err_code_des || payResult.err_code || payResult.return_msg || '支付订单创建失败'
      }
    }
  } catch (e) {
    console.error('[createDaigouWxPayOrder]', e)
    return { success: false, message: '支付创建失败：' + (e.message || '请稍后重试') }
  }
}

// ========================================================
// 代购订单微信支付：查询支付结果
// ========================================================
async function queryDaigouPayResult(openid, event) {
  const { orderId, wxPayOrderId } = event
  if (!orderId) return { success: false, message: '缺少订单ID' }

  try {
    // 先查 daigou_pay_logs 获取微信支付单号
    let wxPayOrderNo = ''
    if (wxPayOrderId) {
      try {
        const logRes = await db.collection('daigou_pay_logs').doc(wxPayOrderId).get()
        if (logRes.data) {
          wxPayOrderNo = logRes.data.wxPayOrderNo || ''
          // 如果已经成功，直接返回
          if (logRes.data.status === 'success') {
            return { success: true, paid: true }
          }
        }
      } catch (e) {
        console.warn('[queryDaigouPayResult] 查日志失败:', e.message)
      }
    }

    if (!wxPayOrderNo) {
      return { success: true, paid: false, message: '支付单号不存在' }
    }

    // 查询微信支付状态
    const queryResult = await queryWechatPayOrder(wxPayOrderNo)
    const tradeState = queryResult.trade_state

    if (tradeState === 'SUCCESS') {
      // 更新日志状态
      if (wxPayOrderId) {
        try {
          await db.collection('daigou_pay_logs').doc(wxPayOrderId).update({
            data: {
              status: 'success',
              transactionId: queryResult.transaction_id || '',
              updateTime: db.serverDate()
            }
          })
        } catch (e) {}
      }
      return { success: true, paid: true, transactionId: queryResult.transaction_id }
    } else if (tradeState === 'CLOSED' || tradeState === 'PAYERROR') {
      return { success: true, paid: false, closed: true, message: '支付已关闭，请重新发起' }
    } else {
      return { success: true, paid: false, tradeState }
    }
  } catch (e) {
    console.error('[queryDaigouPayResult]', e)
    return { success: false, message: '查询失败' }
  }
}

// ========================================================
// 管理员权限验证（paymentMgr 内部使用）
// ========================================================
async function verifyAdmin(openid) {
  if (!openid) return false
  try {
    // 先从 system_config 中查 superAdmins 列表（与 adminMgr 保持一致）
    const cfgRes = await db.collection('system_config')
      .where({ configKey: 'superAdmins' })
      .limit(1)
      .get()
    if (cfgRes.data && cfgRes.data.length > 0) {
      const superAdmins = cfgRes.data[0].configValue || []
      if (Array.isArray(superAdmins) && superAdmins.includes(openid)) return true
    }
  } catch (e) {
    console.warn('[paymentMgr/verifyAdmin] superAdmins 查询失败，回退到 admins 集合', e.message)
  }
  try {
    // 回退：查 admins 集合
    const adminsRes = await db.collection('admins').where({ openid }).limit(1).get()
    if (adminsRes.data && adminsRes.data.length > 0) return true
  } catch (e2) {
    console.warn('[paymentMgr/verifyAdmin] admins 查询失败', e2.message)
  }
  return false
}

// ========================================================
// 提现功能实现
// ========================================================

// 获取提现配置（包含提现门槛）
async function getWithdrawalConfig(openid, event) {
  try {
    const configRes = await db.collection('system_config').where({
      configKey: 'withdrawal_threshold'
    }).get()

    const withdrawalThreshold = configRes.data && configRes.data.length > 0
      ? parseFloat(configRes.data[0].configValue)
      : 30.00

    const userRes = await db.collection('users')
      .where({ _openid: openid })
      .limit(1)
      .get()

    const user = userRes.data && userRes.data[0]
    const walletBalance = user ? (user.walletBalance || 0) : 0

    const maxWithdrawalRate = 0.5
    const maxWithdrawalAmount = walletBalance * maxWithdrawalRate
    const withdrawalFeeRate = 0.05

    const availableAmount = maxWithdrawalAmount
    const canWithdraw = availableAmount >= withdrawalThreshold

    return {
      success: true,
      withdrawalThreshold,
      walletBalance,
      maxWithdrawalRate,
      maxWithdrawalAmount,
      withdrawalFeeRate,
      canWithdraw,
      availableAmount: availableAmount
    }
  } catch (e) {
    console.error('[getWithdrawalConfig]', e)
    return { success: false, message: e.message || '获取提现配置失败' }
  }
}

// 提交提现申请
async function submitWithdrawalApply(openid, event) {
  const { amount, remark = '', paymentQrcode = '' } = event

  if (!amount || amount <= 0) {
    return { success: false, message: '提现金额必须大于0' }
  }

  if (!paymentQrcode) {
    return { success: false, message: '请上传微信收款码' }
  }

  try {
    const userRes = await db.collection('users')
      .where({ _openid: openid })
      .limit(1)
      .get()

    const user = userRes.data && userRes.data[0]
    if (!user) {
      return { success: false, message: '用户不存在' }
    }

    const walletBalance = user.walletBalance || 0

    const configRes = await db.collection('system_config').where({
      configKey: 'withdrawal_threshold'
    }).get()

    const withdrawalThreshold = configRes.data && configRes.data.length > 0
      ? parseFloat(configRes.data[0].configValue)
      : 30.00

    if (walletBalance < amount) {
      return { success: false, message: '钱包余额不足' }
    }

    if (amount < withdrawalThreshold) {
      return { success: false, message: `提现金额不能低于 ¥${withdrawalThreshold.toFixed(2)}` }
    }

    const maxWithdrawalAmount = walletBalance * 0.5
    if (amount > maxWithdrawalAmount) {
      return { success: false, message: `单次提现金额不能超过钱包余额的50%（最多 ¥${maxWithdrawalAmount.toFixed(2)}）` }
    }

    const applyNo = 'WD' + Date.now() + Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    const withdrawalFeeRate = 0.05
    const feeAmount = parseFloat((amount * withdrawalFeeRate).toFixed(2))
    const actualAmount = parseFloat((amount - feeAmount).toFixed(2))

    await db.collection('withdrawal_apply').add({
      data: {
        _openid: openid,
        applyNo,
        amount: parseFloat(amount),
        feeAmount,
        actualAmount,
        walletBalanceBefore: walletBalance,
        remark,
        paymentQrcode,  // 微信收款码云存储ID
        // 用户微信信息（用于微信支付商家转账）
        userInfo: {
          nickName: user.nickName || '微信用户',
          avatarUrl: user.avatarUrl || '',
          // 提现到微信零钱，使用用户的 openid
          openid: openid
        },
        // 提现方式说明
        withdrawalMethod: '微信收款码',
        status: 'pending',
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })

    const newBalance = walletBalance - amount
    await db.collection('users').doc(user._id).update({
      data: {
        walletBalance: newBalance,
        updateTime: db.serverDate()
      }
    })

    await db.collection('wallet_logs').add({
      data: {
        _openid: openid,
        type: 'withdrawal_freeze',
        flow: 'expense',
        title: '提现申请冻结',
        amount: parseFloat(amount),
        balanceBefore: walletBalance,
        balanceAfter: newBalance,
        relatedId: applyNo,
        remark: `提现申请 ${applyNo}`,
        status: 'frozen',
        createTime: db.serverDate()
      }
    })

    return {
      success: true,
      applyNo,
      amount,
      feeAmount,
      actualAmount,
      newBalance,
      message: `提现申请已提交，申请单号：${applyNo}。提现金额：¥${amount.toFixed(2)}，手续费：¥${feeAmount.toFixed(2)}（5%），实际到账：¥${actualAmount.toFixed(2)}。请等待管理员审核，审核通过后资金将转入您的微信收款码账户。`
    }
  } catch (e) {
    console.error('[submitWithdrawalApply]', e)
    return { success: false, message: e.message || '提交提现申请失败' }
  }
}

// 获取我的提现申请列表
async function getMyWithdrawalApplies(openid, event) {
  const { page = 1, pageSize = 10, status = '' } = event

  try {
    let query = db.collection('withdrawal_apply').where({ _openid: openid })

    if (status) {
      query = query.where({ status })
    }

    const [listRes, countRes] = await Promise.all([
      query
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get(),
      query.count()
    ])

    return {
      success: true,
      list: (listRes.data || []).map(item => ({
        ...item,
        createTimeText: formatTime(item.createTime),
        updateTimeText: formatTime(item.updateTime),
        statusText: getWithdrawalStatusText(item.status)
      })),
      total: countRes.total || 0,
      page,
      pageSize
    }
  } catch (e) {
    console.error('[getMyWithdrawalApplies]', e)
    return { success: false, message: e.message || '获取提现申请列表失败' }
  }
}

// 取消提现申请（仅pending状态可取消）
async function cancelWithdrawalApply(openid, event) {
  const { applyId } = event

  if (!applyId) {
    return { success: false, message: '缺少申请ID' }
  }

  try {
    const applyRes = await db.collection('withdrawal_apply').doc(applyId).get()
    const apply = applyRes.data

    if (!apply) {
      return { success: false, message: '提现申请不存在' }
    }

    if (apply._openid !== openid) {
      return { success: false, message: '无权操作此申请' }
    }

    if (apply.status !== 'pending') {
      return { success: false, message: '只有待审核状态的申请可以取消' }
    }

    const userRes = await db.collection('users')
      .where({ _openid: openid })
      .limit(1)
      .get()

    const user = userRes.data && userRes.data[0]
    if (!user) {
      return { success: false, message: '用户不存在' }
    }

    await db.collection('withdrawal_apply').doc(applyId).update({
      data: {
        status: 'cancelled',
        updateTime: db.serverDate()
      }
    })

    const oldBalance = user.walletBalance || 0
    const newBalance = oldBalance + apply.amount

    await db.collection('users').doc(user._id).update({
      data: {
        walletBalance: newBalance,
        updateTime: db.serverDate()
      }
    })

    await db.collection('wallet_logs').add({
      data: {
        _openid: openid,
        type: 'withdrawal_unfreeze',
        flow: 'income',
        title: '提现取消解冻',
        amount: apply.amount,
        balanceBefore: oldBalance,
        balanceAfter: newBalance,
        relatedId: apply.applyNo,
        remark: `取消提现申请 ${apply.applyNo}`,
        status: 'done',
        createTime: db.serverDate()
      }
    })

    return { success: true, message: '提现申请已取消，金额已返还到钱包' }
  } catch (e) {
    console.error('[cancelWithdrawalApply]', e)
    return { success: false, message: e.message || '取消提现申请失败' }
  }
}

// 管理员：获取提现申请列表
async function adminGetWithdrawalApplies(openid, event) {
  const isAdmin = await verifyAdmin(openid)
  if (!isAdmin) {
    return { success: false, message: '无管理员权限' }
  }

  const { page = 1, pageSize = 10, status = '', keyword = '' } = event

  try {
    let query = db.collection('withdrawal_apply')

    if (status) {
      query = query.where({ status })
    }

    if (keyword) {
      const usersRes = await db.collection('users')
        .where({
          nickName: db.RegExp({
            regexp: keyword,
            options: 'i'
          })
        })
        .limit(20)
        .get()

      const userOpenids = usersRes.data.map(u => u._openid)

      if (userOpenids.length > 0) {
        query = query.where({
          _openid: _.in(userOpenids)
        })
      } else {
        query = query.where({
          applyNo: db.RegExp({
            regexp: keyword,
            options: 'i'
          })
        })
      }
    }

    const [listRes, countRes] = await Promise.all([
      query
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get(),
      query.count()
    ])

    const openids = [...new Set(listRes.data.map(item => item._openid))]
    const usersMap = {}

    if (openids.length > 0) {
      const usersRes = await db.collection('users')
        .where({ _openid: _.in(openids) })
        .get()

      usersRes.data.forEach(user => {
        usersMap[user._openid] = user
      })
    }

    return {
      success: true,
      list: (listRes.data || []).map(item => ({
        ...item,
        createTimeText: formatTime(item.createTime),
        updateTimeText: formatTime(item.updateTime),
        statusText: getWithdrawalStatusText(item.status),
        userInfo: usersMap[item._openid] || {},
        // 返回用户 openid 便于管理员操作
        userOpenid: item._openid,
        // 返回提现方式
        withdrawalMethodText: item.withdrawalMethod || '微信零钱'
      })),
      total: countRes.total || 0,
      page,
      pageSize
    }
  } catch (e) {
    console.error('[adminGetWithdrawalApplies]', e)
    return { success: false, message: e.message || '获取提现申请列表失败' }
  }
}

// 管理员：审批通过提现申请
async function adminApproveWithdrawal(openid, event) {
  const isAdmin = await verifyAdmin(openid)
  if (!isAdmin) {
    return { success: false, message: '无管理员权限' }
  }

  const { applyId, adminNote = '审核通过', paymentProof = '' } = event

  if (!applyId) {
    return { success: false, message: '缺少申请ID' }
  }

  try {
    const applyRes = await db.collection('withdrawal_apply').doc(applyId).get()
    const apply = applyRes.data

    if (!apply) {
      return { success: false, message: '提现申请不存在' }
    }

    if (apply.status !== 'pending') {
      return { success: false, message: '该申请已处理' }
    }

    await db.collection('withdrawal_apply').doc(applyId).update({
      data: {
        status: 'approved',
        adminNote,
        paymentProof,
        approvedBy: openid,
        approvedAt: db.serverDate(),
        updateTime: db.serverDate()
      }
    })

    await db.collection('wallet_logs').add({
      data: {
        _openid: apply._openid,
        type: 'withdrawal_complete',
        flow: 'expense',
        title: '提现到微信零钱',
        amount: apply.amount,
        balanceBefore: apply.walletBalanceBefore,
        balanceAfter: apply.walletBalanceBefore - apply.amount,
        relatedId: apply.applyNo,
        remark: `提现到微信零钱 ${adminNote}`,
        status: 'done',
        createTime: db.serverDate()
      }
    })

    return {
      success: true,
      message: `提现申请 ${apply.applyNo} 已审核通过，金额 ¥${apply.amount.toFixed(2)} 已处理。请在微信商户平台完成商家转账到零钱操作，转账至用户 openid: ${apply._openid}`,
      // 返回用户 openid 便于后续操作
      userOpenid: apply._openid,
      actualAmount: apply.actualAmount
    }
  } catch (e) {
    console.error('[adminApproveWithdrawal]', e)
    return { success: false, message: e.message || '审批提现申请失败' }
  }
}

// 管理员：拒绝提现申请
async function adminRejectWithdrawal(openid, event) {
  const isAdmin = await verifyAdmin(openid)
  if (!isAdmin) {
    return { success: false, message: '无管理员权限' }
  }

  const { applyId, adminNote = '审核拒绝' } = event

  if (!applyId) {
    return { success: false, message: '缺少申请ID' }
  }

  try {
    const applyRes = await db.collection('withdrawal_apply').doc(applyId).get()
    const apply = applyRes.data

    if (!apply) {
      return { success: false, message: '提现申请不存在' }
    }

    if (apply.status !== 'pending') {
      return { success: false, message: '该申请已处理' }
    }

    const userRes = await db.collection('users')
      .where({ _openid: apply._openid })
      .limit(1)
      .get()

    const user = userRes.data && userRes.data[0]
    if (!user) {
      return { success: false, message: '用户不存在' }
    }

    await db.collection('withdrawal_apply').doc(applyId).update({
      data: {
        status: 'rejected',
        adminNote,
        rejectedBy: openid,
        rejectedAt: db.serverDate(),
        updateTime: db.serverDate()
      }
    })

    const oldBalance = user.walletBalance || 0
    const newBalance = oldBalance + apply.amount

    await db.collection('users').doc(user._id).update({
      data: {
        walletBalance: newBalance,
        updateTime: db.serverDate()
      }
    })

    await db.collection('wallet_logs').add({
      data: {
        _openid: apply._openid,
        type: 'withdrawal_reject',
        flow: 'income',
        title: '提现拒绝返还',
        amount: apply.amount,
        balanceBefore: oldBalance,
        balanceAfter: newBalance,
        relatedId: apply.applyNo,
        remark: `提现申请被拒绝 ${adminNote}`,
        status: 'done',
        createTime: db.serverDate()
      }
    })

    return {
      success: true,
      message: `提现申请 ${apply.applyNo} 已拒绝，金额 ¥${apply.amount.toFixed(2)} 已返还到用户钱包`
    }
  } catch (e) {
    console.error('[adminRejectWithdrawal]', e)
    return { success: false, message: e.message || '拒绝提现申请失败' }
  }
}

// 提现状态文本转换
function getWithdrawalStatusText(status) {
  const map = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已拒绝',
    cancelled: '已取消'
  }
  return map[status] || status
}

// ========================================================
// 积分兑换：创建微信支付订单
// ========================================================
async function createPointsExchangeOrder(openid, event, wxContext) {
  const { points, amount } = event

  if (!points || points < 100) {
    return { success: false, message: '最少兑换100积分' }
  }
  if (points > 100000) {
    return { success: false, message: '单次兑换不能超过100000积分' }
  }
  if (!amount || amount < 0.01) {
    return { success: false, message: '兑换金额不能低于0.01元' }
  }

  // 生成订单号
  const orderNo = 'PE' + Date.now() + Math.random().toString(36).substr(2, 6).toUpperCase()

  try {
    // 创建积分兑换记录
    const res = await db.collection('points_exchange').add({
      data: {
        _openid: openid,
        orderNo,
        points: parseInt(points),
        amount: parseFloat(amount),
        status: 'pending',
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })

    // 获取客户端IP
    const clientIP = wxContext.CLIENTIP || '127.0.0.1'

    // 支付回调地址
    const notifyUrl = 'https://cloud1-3g4sjhqr5e28e54e-1348466332.ap-shanghai.app.tcloudbase.com/paymentCallback'

    // 调用统一下单接口
    const payResult = await callUnifiedOrder({
      body: '特产互换平台积分兑换',
      outTradeNo: orderNo,
      totalFee: Math.round(amount * 100),
      spbillCreateIp: clientIP,
      openid: openid
    }, notifyUrl)

    if (payResult.return_code === 'SUCCESS' && payResult.result_code === 'SUCCESS') {
      if (!payResult.prepay_id) {
        return { success: false, message: '支付参数获取失败，请重试' }
      }

      // 更新兑换记录
      await db.collection('points_exchange').doc(res._id).update({
        data: {
          wechatPayOrderNo: payResult.prepay_id,
          updateTime: db.serverDate()
        }
      })

      // 生成JSAPI支付参数
      const timeStamp = String(Math.floor(Date.now() / 1000))
      const nonceStr = generateNonceStr()
      const packageStr = 'prepay_id=' + payResult.prepay_id

      const signParams = {
        appId: APPID,
        timeStamp: timeStamp,
        nonceStr: nonceStr,
        package: packageStr,
        signType: 'MD5'
      }
      const paySign = generateSign(signParams, API_KEY)

      return {
        success: true,
        orderId: res._id,
        orderNo,
        paymentParams: {
          timeStamp,
          nonceStr,
          package: packageStr,
          signType: 'MD5',
          paySign
        }
      }
    } else {
      await db.collection('points_exchange').doc(res._id).update({
        data: {
          status: 'failed',
          errorMsg: payResult.err_code_des || '支付创建失败',
          updateTime: db.serverDate()
        }
      })
      return {
        success: false,
        message: payResult.err_code_des || '支付订单创建失败'
      }
    }
  } catch (e) {
    console.error('[createPointsExchangeOrder]', e)
    return { success: false, message: e.message || '创建兑换订单失败' }
  }
}

// ========================================================
// 积分兑换：查询支付结果
// ========================================================
async function getPointsExchangeResult(openid, event) {
  const { orderId } = event

  if (!orderId) {
    return { success: false, message: '缺少订单ID' }
  }

  try {
    const res = await db.collection('points_exchange').doc(orderId).get()
    const record = res.data

    if (!record) {
      return { success: false, message: '订单不存在' }
    }

    if (record._openid !== openid) {
      return { success: false, message: '无权查看此订单' }
    }

    // 如果状态已经是 success，说明已经到账
    if (record.status === 'success') {
      return {
        success: true,
        status: 'success',
        points: record.points,
        message: '积分已到账'
      }
    }

    // 如果状态是 failed
    if (record.status === 'failed') {
      return {
        success: false,
        status: 'failed',
        message: record.errorMsg || '兑换失败'
      }
    }

    // 如果状态是 pending 且有微信支付订单号，查询支付状态
    if (record.status === 'pending' && record.wechatPayOrderNo) {
      try {
        const queryResult = await queryWechatPayOrder(record.orderNo)
        const tradeState = queryResult.trade_state

        if (tradeState === 'SUCCESS') {
          // 支付成功，增加用户积分
          const userRes = await db.collection('users').where({ _openid: openid }).limit(1).get()
          const user = userRes.data && userRes.data[0]

          if (!user) {
            return { success: false, message: '用户不存在' }
          }

          const oldPoints = user.points || 0
          const newPoints = oldPoints + record.points

          // 更新用户积分
          await db.collection('users').doc(user._id).update({
            data: {
              points: newPoints,
              updateTime: db.serverDate()
            }
          })

          // 更新兑换记录
          await db.collection('points_exchange').doc(orderId).update({
            data: {
              status: 'success',
              transactionId: queryResult.transaction_id,
              updateTime: db.serverDate()
            }
          })

          // 记录积分日志
          await db.collection('points_logs').add({
            data: {
              _openid: openid,
              type: 'exchange',
              flow: 'income',
              title: '积分兑换',
              points: record.points,
              balanceBefore: oldPoints,
              balanceAfter: newPoints,
              relatedId: record.orderNo,
              remark: `现金兑换积分 ¥${record.amount}`,
              createTime: db.serverDate()
            }
          })

          return {
            success: true,
            status: 'success',
            points: record.points,
            message: '积分已到账'
          }
        } else if (tradeState === 'CLOSED' || tradeState === 'PAY_ERROR') {
          await db.collection('points_exchange').doc(orderId).update({
            data: {
              status: 'failed',
              errorMsg: '支付已关闭或失败',
              updateTime: db.serverDate()
            }
          })
          return {
            success: false,
            status: 'failed',
            message: '支付已关闭，请重新发起兑换'
          }
        } else {
          return {
            success: true,
            status: 'pending',
            message: '支付处理中'
          }
        }
      } catch (queryErr) {
        console.error('[查询支付状态失败]', queryErr)
        return {
          success: true,
          status: 'pending',
          message: '支付状态查询中'
        }
      }
    }

    return {
      success: true,
      status: record.status,
      message: '处理中'
    }
  } catch (e) {
    console.error('[getPointsExchangeResult]', e)
    return { success: false, message: e.message || '查询失败' }
  }
}
