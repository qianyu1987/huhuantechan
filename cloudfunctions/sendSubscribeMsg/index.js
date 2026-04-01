/**
 * 发送订阅消息云函数
 * 服务端调用微信 subscribeMessage.send 接口发送订阅消息
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 订阅消息模板配置（与前端保持一致）
const SUBSCRIBE_TEMPLATES = {
  SHIPMENT_NOTIFY: {
    id: 'nxMqu8AQ1vopTH6XpBPOvaaIEmDji-JbqqME7SVc-cU',
    name: '发货通知'
  },
  POINTS_ARRIVAL: {
    id: 'FWbxKYQhjUpEYE57OKho-MA5F3WOsbMF9OMkh-1zGqM',
    name: '积分到账提醒'
  },
  ORDER_CANCEL: {
    id: 'lDm2YCwMBRurC0R5kEMacOAk8nyfQXLI_AXHHBjty7k',
    name: '订单取消通知'
  },
  WITHDRAWAL_RESULT: {
    id: 'yotyAzNdqwckEt87CfFq8PoLMtOMMZ-xSZR3MkqlI7k',
    name: '提现结果通知'
  },
  NEW_PRODUCT: {
    id: '5JIk57nh6EKodbmkfIlN-5gV4yCVPvL7EVvOJdfcl9I',
    name: '新品上架通知'
  },
  ACTIVITY_NOTIFY: {
    id: 'qkNEkQTj0waYSCgdJC7dSe9L5_gqfAQqme-J0IEFA_c',
    name: '活动通知'
  }
};

/**
 * 发送订阅消息
 * @param {string} touser - 接收者openid
 * @param {string} templateId - 模板ID
 * @param {Object} data - 模板数据
 * @param {string} page - 点击消息后跳转的页面路径（可选）
 * @param {string} miniprogramState - 跳转小程序类型：developer/trial/formal
 */
async function sendSubscribeMessage(touser, templateId, data, page, miniprogramState = 'formal') {
  try {
    const result = await cloud.openapi.subscribeMessage.send({
      touser,
      templateId,
      page,
      data,
      miniprogramState
    });
    
    console.log('[订阅消息] 发送成功:', result);
    return { success: true, result };
  } catch (err) {
    console.error('[订阅消息] 发送失败:', err);
    return { success: false, error: err.message || String(err), errCode: err.errCode, errMsg: err.errMsg };
  }
}

/**
 * 发送发货通知
 * @param {string} openid - 用户openid
 * @param {Object} params - 发货信息
 */
async function sendShipmentNotify(openid, params) {
  const { status, deliveryMethod, trackingNumber, page } = params;
  
  const data = {
    // 发货状态
    thing1: { value: status || '已发货' },
    // 配送方式
    thing2: { value: deliveryMethod || '快递配送' },
    // 运单号
    character_string3: { value: trackingNumber || '暂无' }
  };
  
  return sendSubscribeMessage(
    openid,
    SUBSCRIBE_TEMPLATES.SHIPMENT_NOTIFY.id,
    data,
    page
  );
}

/**
 * 发送积分到账提醒
 * @param {string} openid - 用户openid
 * @param {Object} params - 积分信息
 */
async function sendPointsArrival(openid, params) {
  const { points, reason, page } = params;
  
  const data = {
    // 获得积分
    number1: { value: String(points) },
    // 积分（说明）
    thing2: { value: reason || '积分到账' }
  };
  
  return sendSubscribeMessage(
    openid,
    SUBSCRIBE_TEMPLATES.POINTS_ARRIVAL.id,
    data,
    page
  );
}

/**
 * 发送订单取消通知
 * @param {string} openid - 用户openid
 * @param {Object} params - 取消信息
 */
async function sendOrderCancel(openid, params) {
  const { reason, cancelTime, page } = params;
  
  const data = {
    // 取消原因
    thing1: { value: reason || '用户取消' },
    // 取消时间
    time2: { value: cancelTime || new Date().toLocaleString() }
  };
  
  return sendSubscribeMessage(
    openid,
    SUBSCRIBE_TEMPLATES.ORDER_CANCEL.id,
    data,
    page
  );
}

/**
 * 发送提现结果通知
 * @param {string} openid - 用户openid
 * @param {Object} params - 提现信息
 */
async function sendWithdrawalResult(openid, params) {
  const { status, amount, account, page } = params;
  
  const data = {
    // 提现状态
    phrase1: { value: status || '处理中' },
    // 提现金额
    amount2: { value: String(amount) },
    // 提现账号
    thing3: { value: account || '微信零钱' }
  };
  
  return sendSubscribeMessage(
    openid,
    SUBSCRIBE_TEMPLATES.WITHDRAWAL_RESULT.id,
    data,
    page
  );
}

/**
 * 发送新品上架通知
 * @param {string} openid - 用户openid
 * @param {Object} params - 新品信息
 */
async function sendNewProduct(openid, params) {
  const { productName, price, origin, shelfTime, page } = params;
  
  const data = {
    // 商品名称
    thing1: { value: productName },
    // 售价
    amount2: { value: String(price) },
    // 产地
    thing3: { value: origin },
    // 上架时间
    time4: { value: shelfTime }
  };
  
  return sendSubscribeMessage(
    openid,
    SUBSCRIBE_TEMPLATES.NEW_PRODUCT.id,
    data,
    page
  );
}

/**
 * 发送活动通知
 * @param {string} openid - 用户openid
 * @param {Object} params - 活动信息
 */
async function sendActivityNotify(openid, params) {
  const { content, startTime, endTime, remark, page } = params;

  const data = {
    // 活动内容
    thing1: { value: content || '您有新的通知' },
    // 活动开始（date2 是模板实际字段名）
    date2: { value: startTime || new Date().toLocaleString() },
    // 活动截止
    time3: { value: endTime || '长期有效' },
    // 备注说明
    thing4: { value: remark || '点击查看详情' }
  };

  return sendSubscribeMessage(
    openid,
    SUBSCRIBE_TEMPLATES.ACTIVITY_NOTIFY.id,
    data,
    page
  );
}

/**
 * 发送互换申请通知（使用活动通知模板）
 * @param {string} openid - 用户openid
 * @param {Object} params - 申请信息
 */
async function sendSwapRequest(openid, params) {
  const { requesterName, productName, requestTime, page } = params;

  const data = {
    // 活动内容：有人想和你互换特产
    thing1: { value: `${requesterName}想和你互换「${productName}」` },
    // 活动开始：申请时间（date2 是模板实际字段名）
    date2: { value: requestTime || new Date().toLocaleString() },
    // 活动截止：尽快处理
    time3: { value: '请尽快处理' },
    // 备注说明（thing4 必须有值）
    thing4: { value: '点击查看并处理互换请求' }
  };

  return sendSubscribeMessage(
    openid,
    SUBSCRIBE_TEMPLATES.ACTIVITY_NOTIFY.id,
    data,
    page
  );
}

/**
 * 发送互换接受通知（使用活动通知模板）
 * @param {string} openid - 用户openid
 * @param {Object} params - 接受信息
 */
async function sendSwapAccept(openid, params) {
  const { accepterName, productName, acceptTime, page } = params;

  const data = {
    // 活动内容：对方已同意你的互换申请
    thing1: { value: `${accepterName}已同意互换「${productName}」` },
    // 活动开始：同意时间（date2 是模板实际字段名）
    date2: { value: acceptTime || new Date().toLocaleString() },
    // 活动截止：请尽快发货
    time3: { value: '请尽快发货' },
    // 备注说明
    thing4: { value: '互换申请已通过，请填写快递信息' }
  };

  return sendSubscribeMessage(
    openid,
    SUBSCRIBE_TEMPLATES.ACTIVITY_NOTIFY.id,
    data,
    page
  );
}

/**
 * 发送互换拒绝通知（使用活动通知模板）
 * @param {string} openid - 用户openid
 * @param {Object} params - 拒绝信息
 */
async function sendSwapReject(openid, params) {
  const { rejecterName, productName, rejectTime, page } = params;

  const data = {
    // 活动内容：对方拒绝了你的互换申请
    thing1: { value: `${rejecterName}拒绝了互换「${productName}」` },
    // 活动开始：拒绝时间（date2 是模板实际字段名）
    date2: { value: rejectTime || new Date().toLocaleString() },
    // 活动截止：特产已释放
    time3: { value: '特产已释放，可重新申请' },
    // 备注说明
    thing4: { value: '您的特产已释放，可重新发起申请' }
  };

  return sendSubscribeMessage(
    openid,
    SUBSCRIBE_TEMPLATES.ACTIVITY_NOTIFY.id,
    data,
    page
  );
}

// 云函数入口
exports.main = async (event, context) => {
  const { action, openid, params } = event;
  
  if (!openid) {
    return { success: false, error: '缺少openid参数' };
  }
  
  try {
    switch (action) {
      case 'shipment':
        return await sendShipmentNotify(openid, params);
      
      case 'points':
        return await sendPointsArrival(openid, params);
      
      case 'orderCancel':
        return await sendOrderCancel(openid, params);
      
      case 'withdrawal':
        return await sendWithdrawalResult(openid, params);
      
      case 'newProduct':
        return await sendNewProduct(openid, params);
      
      case 'activity':
        return await sendActivityNotify(openid, params);
      
      case 'swapRequest':
        return await sendSwapRequest(openid, params);
      
      case 'swapAccept':
        return await sendSwapAccept(openid, params);
      
      case 'swapReject':
        return await sendSwapReject(openid, params);
      
      default:
        return { success: false, error: '未知的action类型' };
    }
  } catch (err) {
    console.error('[订阅消息] 处理失败:', err);
    return { success: false, error: err.message };
  }
};
