const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { action, operatorId, page = 1, pageSize = 20 } = event;

  try {
    // 检查操作者权限
    const adminRes = await db.collection('admin').where({ openid: operatorId }).get();
    if (adminRes.data.length === 0) {
      return { success: false, message: '无操作权限' };
    }

    switch (action) {
      case 'getList':
        return await getLogList(page, pageSize);
      case 'getByType':
        return await getLogByType(event.logType, page, pageSize);
      default:
        return { success: false, message: '未知操作' };
    }
  } catch (err) {
    console.error('getAdminLog error:', err);
    return { success: false, message: err.message };
  }
};

// 获取日志列表
async function getLogList(page, pageSize) {
  const skip = (page - 1) * pageSize;
  
  const logs = await db.collection('adminLog')
    .orderBy('createTime', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get();

  const total = await db.collection('adminLog').count();

  return { 
    success: true, 
    data: {
      list: logs.data,
      total: total.total,
      page,
      pageSize
    }
  };
}

// 按类型获取日志
async function getLogByType(logType, page, pageSize) {
  const skip = (page - 1) * pageSize;
  
  const logs = await db.collection('adminLog')
    .where({ type: logType })
    .orderBy('createTime', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get();

  return { success: true, data: logs.data };
}