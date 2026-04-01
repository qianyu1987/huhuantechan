/**
 * 订阅消息发送云函数
 * 统一封装：调用方只需传入 action / openid / params
 *
 * 模板字段格式规范：
 *   thingN   — 字符串，最多20个字符
 *   numberN  — 数字字符串，如 "100"
 *   dateN    — YYYY-MM-DD 格式
 *   timeN    — YYYY-MM-DD HH:mm 格式
 *   character_stringN — 字符串，最多32字符
 *   phraseN  — 必须是预设关键词（审核中/已通过/已拒绝/未开始/已取消 等）
 */

// ======================
// 工具函数
// ======================

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/** 格式化日期：YYYY-MM-DD */
function fmtDate(d) {
  if (!d) return new Date().toISOString().slice(0, 10);
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** 格式化时间：YYYY-MM-DD HH:mm */
function fmtTime(d) {
  if (!d) {
    const dt = new Date();
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
  }
  if (typeof d === 'string' && d.length >= 16) return d.slice(0, 16);
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

/** 截断字符串并确保不超限 */
function fmtThing(val, maxLen = 20) {
  if (!val) return '通知';
  return String(val).slice(0, maxLen);
}

/** 保证字符串在限长内 */
function fmtChar(val, maxLen = 32) {
  if (!val) return '暂无';
  return String(val).slice(0, maxLen);
}

/** phrase 类型专用：映射到微信允许的关键词 */
function fmtPhrase(val) {
  const PRESET = ['审核中', '已通过', '已拒绝', '未开始', '已取消', '处理中', '已完成'];
  if (!val) return '处理中';
  // 精确匹配或包含匹配
  const lower = String(val);
  const found = PRESET.find(p => p === lower || lower.includes(p));
  return found || '处理中';
}

// ======================
// 模板配置
// ======================

const TEMPLATES = {
  // 发货通知
  SHIPMENT_NOTIFY: 'nxMqu8AQ1vopTH6XpBPOvaaIEmDji-JbqqME7SVc-cU',
  // 积分到账提醒
  POINTS_ARRIVAL: 'FWbxKYQhjUpEYE57OKho-MA5F3WOsbMF9OMkh-1zGqM',
  // 订单取消通知
  ORDER_CANCEL: 'lDm2YCwMBRurC0R5kEMacOAk8nyfQXLI_AXHHBjty7k',
  // 提现结果通知
  WITHDRAWAL_RESULT: 'yotyAzNdqwckEt87CfFq8PoLMtOMMZ-xSZR3MkqlI7k',
  // 新品上架通知
  NEW_PRODUCT: '5JIk57nh6EKodbmkfIlN-5gV4yCVPvL7EVvOJdfcl9I',
  // 活动通知
  ACTIVITY_NOTIFY: 'qkNEkQTj0waYSCgdJC7dSe9L5_gqfAQqme-J0IEFA_c',
};

// ======================
// 底层发送函数
// ======================

/**
 * 实际调用微信订阅消息接口
 * @param {string} touser    - 用户 openid
 * @param {string} templateId - 模板 ID
 * @param {object} data      - 模板数据对象
 * @param {string} page      - 点击跳转页面（可选）
 */
async function doSend(touser, templateId, data, page) {
  try {
    // 严格过滤：去掉所有空值 key，防止微信报 field is empty
    const cleanData = {};
    for (const [k, v] of Object.entries(data)) {
      if (v && v.value !== undefined && v.value !== null && String(v.value).trim() !== '') {
        cleanData[k] = v;
      }
    }

    const res = await cloud.openapi.subscribeMessage.send({
      touser,
      templateId,
      page: page || '',           // 空字符串表示不跳转
      data: cleanData,
      miniprogramState: 'formal',
    });

    console.log('[订阅消息] 发送成功:', JSON.stringify(res));
    return { success: true, errMsg: res.errMsg };
  } catch (err) {
    console.error('[订阅消息] 发送失败:', err.errMsg || err.message, '| errCode:', err.errCode);
    return {
      success: false,
      error: err.errMsg || err.message,
      errCode: err.errCode,
    };
  }
}

// ======================
// 各业务消息发送函数
// ======================

/** 发货通知
 * 字段：发货状态(phrase12)、配送方式(?)、运单号(?)
 * phrase12 已由错误信息确认，其余字段待 getTemplateList 确认
 */
async function sendShipmentNotify(openid, params = {}) {
  const { status, deliveryMethod, trackingNumber, page } = params;
  return doSend(openid, TEMPLATES.SHIPMENT_NOTIFY, {
    phrase12:          { value: fmtPhrase(status) },
    thing13:           { value: fmtThing(deliveryMethod, 20) },
    character_string14:{ value: fmtChar(trackingNumber, 32) },
  }, page);
}

/** 积分到账提醒
 * 字段：获得积分(number5)、积分说明(?)
 * number5 已由错误信息确认
 */
async function sendPointsArrival(openid, params = {}) {
  const { points, reason, page } = params;
  return doSend(openid, TEMPLATES.POINTS_ARRIVAL, {
    number5: { value: String(Number(points) || 0) },
    thing6:  { value: fmtThing(reason, 20) },
  }, page);
}

/** 订单取消通知
 * 字段：取消原因(thing1)、取消时间(date2)、第3字段(thing3)
 * thing3 已由错误信息确认
 */
async function sendOrderCancel(openid, params = {}) {
  const { cancelReason, cancelTime, page } = params;
  return doSend(openid, TEMPLATES.ORDER_CANCEL, {
    thing1: { value: fmtThing(cancelReason, 20) },
    date2:  { value: fmtDate(cancelTime) },
    thing3: { value: '特产互换平台' },
  }, page);
}

/** 提现结果通知
 * 字段：提现状态(thing1)、提现金额(?)、提现账号(?)
 * thing1 已由错误信息确认（不是 phrase1）
 */
async function sendWithdrawalResult(openid, params = {}) {
  const { status, amount, account, page } = params;
  return doSend(openid, TEMPLATES.WITHDRAWAL_RESULT, {
    thing1:  { value: fmtThing(status, 20) },
    amount2: { value: String(Number(amount) || 0) },
    thing3:  { value: fmtThing(account, 20) },
  }, page);
}

/** 新品上架通知 */
async function sendNewProduct(openid, params = {}) {
  const { productName, price, origin, shelfTime, page } = params;
  return doSend(openid, TEMPLATES.NEW_PRODUCT, {
    thing1:   { value: fmtThing(productName, 20) },
    amount2:   { value: String(Number(price) || 0) },
    thing3:    { value: fmtThing(origin, 20) },
    time4:     { value: fmtTime(shelfTime) },
  }, page);
}

/** 活动通知（通用） */
async function sendActivityNotify(openid, params = {}) {
  const { content, startTime, endTime, remark, page } = params;
  return doSend(openid, TEMPLATES.ACTIVITY_NOTIFY, {
    thing1: { value: fmtThing(content, 20) },
    date2:  { value: fmtDate(startTime) },     // 活动开始日期（date2 = 第2字段，日期型）
    date3:  { value: fmtDate(endTime) },      // 活动截止日期（date3 = 第3字段，日期型）
    thing4: { value: fmtThing(remark, 20) },   // 备注
  }, page);
}

/** 互换申请通知 */
async function sendSwapRequest(openid, params = {}) {
  const { requesterName, productName, requestTime, page } = params;
  return doSend(openid, TEMPLATES.ACTIVITY_NOTIFY, {
    thing1: { value: fmtThing(`${fmtThing(requesterName, 10)}想和你互换「${fmtThing(productName, 10)}」`, 20) },
    date2:  { value: fmtDate(requestTime) },
    date3:  { value: fmtDate() },             // 截止日期，用今天占位
    thing4: { value: '点击查看并处理互换请求' },
  }, page);
}

/** 互换接受通知 */
async function sendSwapAccept(openid, params = {}) {
  const { accepterName, productName, acceptTime, page } = params;
  return doSend(openid, TEMPLATES.ACTIVITY_NOTIFY, {
    thing1: { value: fmtThing(`${fmtThing(accepterName, 10)}已同意互换「${fmtThing(productName, 10)}」`, 20) },
    date2:  { value: fmtDate(acceptTime) },
    date3:  { value: fmtDate() },             // 截止日期，用今天占位
    thing4: { value: '互换申请已通过，请填写快递信息' },
  }, page);
}

/** 互换拒绝通知 */
async function sendSwapReject(openid, params = {}) {
  const { rejecterName, productName, rejectTime, page } = params;
  return doSend(openid, TEMPLATES.ACTIVITY_NOTIFY, {
    thing1: { value: fmtThing(`${fmtThing(rejecterName, 10)}拒绝了互换「${fmtThing(productName, 10)}」`, 20) },
    date2:  { value: fmtDate(rejectTime) },
    date3:  { value: fmtDate() },             // 截止日期，用今天占位
    thing4: { value: '您的特产已释放，可重新发起申请' },
  }, page);
}

// ======================
// 云函数入口
// ======================

exports.main = async (event, context) => {
  const { action, openid, params = {} } = event;

  if (!openid) {
    return { success: false, error: '缺少 openid 参数' };
  }

  const ACTION_MAP = {
    shipment:      sendShipmentNotify,
    points:        sendPointsArrival,
    orderCancel:   sendOrderCancel,
    withdrawal:    sendWithdrawalResult,
    newProduct:    sendNewProduct,
    activity:      sendActivityNotify,
    swapRequest:   sendSwapRequest,
    swapAccept:    sendSwapAccept,
    swapReject:    sendSwapReject,
  };

  // 查询模板字段（调试用）
  if (action === 'queryTemplate') {
    try {
      const results = {};
      for (const [name, id] of Object.entries(TEMPLATES)) {
        try {
          const res = await cloud.openapi.subscribeMessage.getTemplateList();
          results[name] = { id, templateList: res.data };
          break; // getTemplateList 一次返回所有，只需调一次
        } catch (e) {
          results[name] = { id, error: e.message };
        }
      }
      return { success: true, results };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  const handler = ACTION_MAP[action];
  if (!handler) {
    return { success: false, error: `未知的 action: ${action}，支持: ${Object.keys(ACTION_MAP).join(', ')}` };
  }

  try {
    return await handler(openid, params);
  } catch (err) {
    console.error('[订阅消息] 未捕获异常:', err);
    return { success: false, error: err.message || String(err) };
  }
};
