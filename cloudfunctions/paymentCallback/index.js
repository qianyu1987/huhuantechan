// cloudfunctions/paymentCallback/index.js
// 微信支付回调云函数 (HTTP 触发)
// 微信支付成功后会发送 XML 格式的回调到此地址

const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const xml2js = require('xml2js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// API 密钥（用于验证回调签名）
const API_KEY = 'abcdefgh1234567890abcdefghhuhuan'

/**
 * 生成微信支付签名（用于验证回调）
 */
function generateSign(params, key) {
  const sortedKeys = Object.keys(params).sort()
  const signStr = sortedKeys
    .filter(k => params[k] !== '' && params[k] !== null && params[k] !== undefined && k !== 'sign')
    .map(k => `${k}=${params[k]}`)
    .join('&')
  const signWithKey = signStr + '&key=' + key
  return crypto.createHash('md5').update(signWithKey, 'utf8').digest('hex').toUpperCase()
}

/**
 * 将 XML 转换为对象
 */
function xmlToObj(xml) {
  return new Promise((resolve, reject) => {
    xml2js.parseString(xml, { explicitArray: false, trim: true }, (err, result) => {
      if (err) reject(err)
      else resolve(result.xml)
    })
  })
}

/**
 * 将对象转换为 XML 格式
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

exports.main = async (event, context) => {
  console.log('[支付回调] 请求头:', {
    'content-type': event.headers && event.headers['content-type']
  })
  console.log('[支付回调] 请求体:', JSON.stringify(event.body || event))
  
  try {
    let callbackData = {}
    
    // 处理不同的请求格式
    if (typeof event === 'string') {
      callbackData = await xmlToObj(event)
    } else if (event.body) {
      if (typeof event.body === 'string') {
        callbackData = await xmlToObj(event.body)
      } else if (event.body.xml) {
        callbackData = event.body.xml
      } else {
        callbackData = event.body
      }
    } else {
      callbackData = event
    }
    
    console.log('[支付回调] 解析后的数据:', JSON.stringify(callbackData))
    
    const {
      return_code,
      return_msg,
      appid,
      mch_id,
      nonce_str,
      sign,
      result_code,
      transaction_id,
      out_trade_no,
      trade_state,
      total_fee,
      cash_fee,
      attach,
      time_end
    } = callbackData
    
    // 验证签名
    if (sign) {
      const calculatedSign = generateSign(callbackData, API_KEY)
      if (calculatedSign !== sign) {
        console.error('[支付回调] 签名验证失败', { expected: calculatedSign, received: sign })
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'text/xml' },
          body: objToXml({ return_code: 'FAIL', return_msg: '签名验证失败' })
        }
      }
      console.log('[支付回调] 签名验证通过')
    }
    
    // 返回成功响应（微信支付需要立即收到 SUCCESS）
    if (return_code !== 'SUCCESS') {
      console.log('[支付回调] 返回码失败:', return_msg)
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/xml' },
        body: objToXml({ return_code: 'SUCCESS', return_msg: 'OK' })
      }
    }
    
    console.log('[支付回调] 收到支付通知，交易状态:', trade_state, '订单号:', out_trade_no)
    
    // 解析附加数据
    let orderData = {}
    if (attach) {
      try {
        orderData = JSON.parse(attach)
      } catch (e) {
        console.error('[解析附加数据失败]', attach)
      }
    }
    
    const orderNo = out_trade_no
    
    if (!orderNo) {
      console.error('[支付回调] 缺少订单号')
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/xml' },
        body: objToXml({ return_code: 'SUCCESS', return_msg: 'OK' })
      }
    }
    
    // 根据订单号查找充值记录
    const rechargeRes = await db.collection('recharge_apply')
      .where({ orderNo: orderNo })
      .limit(1)
      .get()
    
    const recharge = rechargeRes.data && rechargeRes.data[0]
    
    if (!recharge) {
      console.error('[支付回调] 充值记录不存在', orderNo)
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/xml' },
        body: objToXml({ return_code: 'SUCCESS', return_msg: 'OK' })
      }
    }
    
    // 如果已经处理过了，直接返回
    if (recharge.status === 'approved') {
      console.log('[支付回调] 订单已处理，跳过')
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/xml' },
        body: objToXml({ return_code: 'SUCCESS', return_msg: 'OK' })
      }
    }
    
    // 支付成功
    if (trade_state === 'SUCCESS') {
      const amount = recharge.amount
      
      // 获取用户信息
      const userRes = await db.collection('users')
        .where({ _openid: recharge._openid })
        .limit(1)
        .get()
      const user = userRes.data && userRes.data[0]
      
      const oldBalance = user ? (user.walletBalance || 0) : 0
      const newBalance = Math.round((oldBalance + amount) * 100) / 100
      
      // 更新充值记录
      await db.collection('recharge_apply').doc(recharge._id).update({
        data: {
          status: 'approved',
          wechatPayOrderNo: transaction_id || '',
          approvedAt: db.serverDate(),
          updateTime: db.serverDate()
        }
      })
      
      // 更新用户余额
      if (user) {
        await db.collection('users').doc(user._id).update({
          data: {
            walletBalance: newBalance,
            updateTime: db.serverDate()
          }
        })
        
        // 写钱包流水
        await db.collection('wallet_logs').add({
          data: {
            _openid: recharge._openid,
            type: 'recharge',
            flow: 'income',
            title: '微信支付充值',
            amount: amount,
            balanceBefore: oldBalance,
            balanceAfter: newBalance,
            relatedId: recharge._id,
            orderNo: orderNo,
            transactionId: transaction_id,
            remark: '微信支付回调充值',
            status: 'done',
            createTime: db.serverDate()
          }
        })
      }
      
      console.log('[支付回调] 充值成功处理完成', { orderNo, amount, newBalance })
    } else {
      // 支付失败
      await db.collection('recharge_apply').doc(recharge._id).update({
        data: {
          status: 'failed',
          errorMsg: '微信支付失败：' + (trade_state || '未知错误'),
          updateTime: db.serverDate()
        }
      })
      console.log('[支付回调] 支付失败', trade_state)
    }
    
    // 返回成功响应
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/xml' },
      body: objToXml({ return_code: 'SUCCESS', return_msg: 'OK' })
    }
    
  } catch (e) {
    console.error('[支付回调异常]', e)
    // 即使出错也返回 SUCCESS，避免微信支付重复通知
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/xml' },
      body: objToXml({ return_code: 'SUCCESS', return_msg: 'OK' })
    }
  }
}
