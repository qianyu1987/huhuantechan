/**
 * 订阅消息管理工具
 * 统一管理特产互换小程序的订阅消息功能
 */

// 订阅消息模板ID配置
const SUBSCRIBE_TEMPLATES = {
  // 1. 发货通知 - 用于订单发货时通知用户
  SHIPMENT_NOTIFY: {
    id: 'nxMqu8AQ1vopTH6XpBPOvaaIEmDji-JbqqME7SVc-cU',
    name: '发货通知',
    description: '订单发货时通知用户',
    keywords: ['发货状态', '配送方式', '运单号']
  },
  
  // 2. 积分到账提醒 - 用户获得积分时通知
  POINTS_ARRIVAL: {
    id: 'FWbxKYQhjUpEYE57OKho-MA5F3WOsbMF9OMkh-1zGqM',
    name: '积分到账提醒',
    description: '用户获得积分时通知',
    keywords: ['获得积分', '积分']
  },
  
  // 3. 订单取消通知 - 订单被取消时通知
  ORDER_CANCEL: {
    id: 'lDm2YCwMBRurC0R5kEMacOAk8nyfQXLI_AXHHBjty7k',
    name: '订单取消通知',
    description: '订单被取消时通知用户',
    keywords: ['取消原因', '取消时间']
  },
  
  // 4. 提现结果通知 - 提现申请处理结果通知
  WITHDRAWAL_RESULT: {
    id: 'yotyAzNdqwckEt87CfFq8PoLMtOMMZ-xSZR3MkqlI7k',
    name: '提现结果通知',
    description: '提现申请处理结果通知',
    keywords: ['提现状态', '提现金额', '提现账号']
  },
  
  // 5. 新品上架通知 - 新特产上架时通知关注用户
  NEW_PRODUCT: {
    id: '5JIk57nh6EKodbmkfIlN-5gV4yCVPvL7EVvOJdfcl9I',
    name: '新品上架通知',
    description: '新特产上架时通知关注用户',
    keywords: ['商品名称', '售价', '产地', '上架时间']
  },
  
  // 6. 活动通知 - 平台活动通知
  ACTIVITY_NOTIFY: {
    id: 'qkNEkQTj0waYSCgdJC7dSe9L5_gqfAQqme-J0IEFA_c',
    name: '活动通知',
    description: '平台活动通知',
    keywords: ['活动内容', '活动开始', '活动截止']
  }
};

/**
 * 请求用户订阅消息授权
 * @param {string|Array} templateIds - 模板ID或模板ID数组
 * @returns {Promise<Object>} 用户授权结果
 */
function requestSubscribe(templateIds) {
  return new Promise((resolve, reject) => {
    // 确保是数组
    const tmplIds = Array.isArray(templateIds) ? templateIds : [templateIds];
    
    wx.requestSubscribeMessage({
      tmplIds: tmplIds,
      success: (res) => {
        console.log('[订阅消息] 授权结果:', res);
        resolve(res);
      },
      fail: (err) => {
        console.error('[订阅消息] 授权失败:', err);
        reject(err);
      }
    });
  });
}

/**
 * 请求多个订阅消息授权（一次性订阅多个）
 * @param {Array} templateKeys - 模板配置键名数组，如 ['SHIPMENT_NOTIFY', 'POINTS_ARRIVAL']
 * @returns {Promise<Object>} 用户授权结果
 */
function requestMultiSubscribe(templateKeys) {
  const tmplIds = templateKeys.map(key => SUBSCRIBE_TEMPLATES[key].id);
  return requestSubscribe(tmplIds);
}

/**
 * 检查用户是否已授权某个订阅消息
 * @param {string} templateKey - 模板配置键名
 * @returns {Promise<boolean>} 是否已授权
 */
async function checkSubscribeStatus(templateKey) {
  try {
    const setting = await wx.getSetting();
    const subscribeSetting = setting.subscriptionsSetting || {};
    const itemSettings = subscribeSetting.itemSettings || {};
    const templateId = SUBSCRIBE_TEMPLATES[templateKey].id;
    
    // 'accept' 表示已授权，'reject' 表示拒绝，'ban' 表示被后台封禁
    return itemSettings[templateId] === 'accept';
  } catch (err) {
    console.error('[订阅消息] 检查授权状态失败:', err);
    return false;
  }
}

/**
 * 获取所有订阅消息的授权状态
 * @returns {Promise<Object>} 各模板的授权状态
 */
async function getAllSubscribeStatus() {
  try {
    const setting = await wx.getSetting();
    const subscribeSetting = setting.subscriptionsSetting || {};
    const itemSettings = subscribeSetting.itemSettings || {};
    
    const status = {};
    for (const key in SUBSCRIBE_TEMPLATES) {
      const templateId = SUBSCRIBE_TEMPLATES[key].id;
      status[key] = itemSettings[templateId] || 'unknown';
    }
    return status;
  } catch (err) {
    console.error('[订阅消息] 获取授权状态失败:', err);
    return {};
  }
}

/**
 * 订阅消息场景封装 - 订单发货
 * @param {Function} onSuccess - 授权成功回调
 * @param {Function} onFail - 授权失败回调
 */
function subscribeForShipment(onSuccess, onFail) {
  requestSubscribe(SUBSCRIBE_TEMPLATES.SHIPMENT_NOTIFY.id)
    .then(res => {
      if (res[SUBSCRIBE_TEMPLATES.SHIPMENT_NOTIFY.id] === 'accept') {
        wx.showToast({ title: '订阅成功', icon: 'success' });
        onSuccess && onSuccess(res);
      } else {
        wx.showToast({ title: '订阅后可接收发货通知', icon: 'none' });
        onFail && onFail(res);
      }
    })
    .catch(err => {
      console.error('[订阅消息] 发货通知订阅失败:', err);
      onFail && onFail(err);
    });
}

/**
 * 订阅消息场景封装 - 积分到账
 * @param {Function} onSuccess - 授权成功回调
 * @param {Function} onFail - 授权失败回调
 */
function subscribeForPoints(onSuccess, onFail) {
  requestSubscribe(SUBSCRIBE_TEMPLATES.POINTS_ARRIVAL.id)
    .then(res => {
      if (res[SUBSCRIBE_TEMPLATES.POINTS_ARRIVAL.id] === 'accept') {
        onSuccess && onSuccess(res);
      } else {
        onFail && onFail(res);
      }
    })
    .catch(err => {
      console.error('[订阅消息] 积分到账订阅失败:', err);
      onFail && onFail(err);
    });
}

/**
 * 订阅消息场景封装 - 订单取消
 * @param {Function} onSuccess - 授权成功回调
 * @param {Function} onFail - 授权失败回调
 */
function subscribeForOrderCancel(onSuccess, onFail) {
  requestSubscribe(SUBSCRIBE_TEMPLATES.ORDER_CANCEL.id)
    .then(res => {
      if (res[SUBSCRIBE_TEMPLATES.ORDER_CANCEL.id] === 'accept') {
        onSuccess && onSuccess(res);
      } else {
        onFail && onFail(res);
      }
    })
    .catch(err => {
      console.error('[订阅消息] 订单取消订阅失败:', err);
      onFail && onFail(err);
    });
}

/**
 * 订阅消息场景封装 - 提现结果
 * @param {Function} onSuccess - 授权成功回调
 * @param {Function} onFail - 授权失败回调
 */
function subscribeForWithdrawal(onSuccess, onFail) {
  requestSubscribe(SUBSCRIBE_TEMPLATES.WITHDRAWAL_RESULT.id)
    .then(res => {
      if (res[SUBSCRIBE_TEMPLATES.WITHDRAWAL_RESULT.id] === 'accept') {
        wx.showToast({ title: '订阅成功', icon: 'success' });
        onSuccess && onSuccess(res);
      } else {
        wx.showToast({ title: '订阅后可接收提现通知', icon: 'none' });
        onFail && onFail(res);
      }
    })
    .catch(err => {
      console.error('[订阅消息] 提现结果订阅失败:', err);
      onFail && onFail(err);
    });
}

/**
 * 订阅消息场景封装 - 新品上架
 * @param {Function} onSuccess - 授权成功回调
 * @param {Function} onFail - 授权失败回调
 */
function subscribeForNewProduct(onSuccess, onFail) {
  requestSubscribe(SUBSCRIBE_TEMPLATES.NEW_PRODUCT.id)
    .then(res => {
      if (res[SUBSCRIBE_TEMPLATES.NEW_PRODUCT.id] === 'accept') {
        wx.showToast({ title: '订阅成功，新品上架将通知您', icon: 'success' });
        onSuccess && onSuccess(res);
      } else {
        wx.showToast({ title: '订阅后可接收新品通知', icon: 'none' });
        onFail && onFail(res);
      }
    })
    .catch(err => {
      console.error('[订阅消息] 新品上架订阅失败:', err);
      onFail && onFail(err);
    });
}

/**
 * 订阅消息场景封装 - 活动通知
 * @param {Function} onSuccess - 授权成功回调
 * @param {Function} onFail - 授权失败回调
 */
function subscribeForActivity(onSuccess, onFail) {
  requestSubscribe(SUBSCRIBE_TEMPLATES.ACTIVITY_NOTIFY.id)
    .then(res => {
      if (res[SUBSCRIBE_TEMPLATES.ACTIVITY_NOTIFY.id] === 'accept') {
        wx.showToast({ title: '订阅成功，活动将通知您', icon: 'success' });
        onSuccess && onSuccess(res);
      } else {
        wx.showToast({ title: '订阅后可接收活动通知', icon: 'none' });
        onFail && onFail(res);
      }
    })
    .catch(err => {
      console.error('[订阅消息] 活动通知订阅失败:', err);
      onFail && onFail(err);
    });
}

/**
 * 批量订阅多个消息（用于关键流程）
 * 例如：下单时同时订阅发货通知和订单取消通知
 * @param {Array} templateKeys - 模板键名数组
 * @param {string} successMsg - 成功提示文字
 * @param {string} failMsg - 失败提示文字
 */
function batchSubscribe(templateKeys, successMsg, failMsg) {
  return new Promise((resolve, reject) => {
    requestMultiSubscribe(templateKeys)
      .then(res => {
        let acceptedCount = 0;
        templateKeys.forEach(key => {
          const templateId = SUBSCRIBE_TEMPLATES[key].id;
          if (res[templateId] === 'accept') {
            acceptedCount++;
          }
        });
        
        if (acceptedCount > 0) {
          wx.showToast({ 
            title: successMsg || `成功订阅${acceptedCount}个通知`, 
            icon: 'success' 
          });
          resolve({ accepted: true, count: acceptedCount, res });
        } else {
          wx.showToast({ 
            title: failMsg || '订阅后可接收重要通知', 
            icon: 'none' 
          });
          resolve({ accepted: false, count: 0, res });
        }
      })
      .catch(err => {
        console.error('[订阅消息] 批量订阅失败:', err);
        reject(err);
      });
  });
}

module.exports = {
  // 模板配置
  TEMPLATES: SUBSCRIBE_TEMPLATES,
  
  // 基础方法
  requestSubscribe,
  requestMultiSubscribe,
  checkSubscribeStatus,
  getAllSubscribeStatus,
  
  // 场景封装
  subscribeForShipment,
  subscribeForPoints,
  subscribeForOrderCancel,
  subscribeForWithdrawal,
  subscribeForNewProduct,
  subscribeForActivity,
  
  // 批量订阅
  batchSubscribe
};
