const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { action } = event;
  
  if (action === 'createCollections') {
    return await createCollections();
  }
  
  return { success: false, message: '未知操作' };
};

// 创建所有缺失的数据库集合
async function createCollections() {
  const collections = [
    'users',
    'specialty',
    'exchanges',
    'creditLogs',
    'pointsLogs',
    'dailyTasks',
    'admin',
    'adminLog',
    'adminLogs',
    'systemConfig',
    'provinceStat',
    'valueStat',
    'reports',
    'blindBoxWants',
    'blindBoxOrders'
  ];
  
  const results = [];
  
  for (const name of collections) {
    try {
      // 尝试获取集合信息，如果不存在会报错
      await db.collection(name).limit(1).get();
      results.push({ name, status: 'exists', message: '集合已存在' });
    } catch (err) {
      if (err.message.includes('Collection not found') || err.message.includes('not exist')) {
        try {
          // 创建集合
          await db.createCollection(name);
          results.push({ name, status: 'created', message: '集合创建成功' });
        } catch (createErr) {
          results.push({ name, status: 'error', message: createErr.message });
        }
      } else {
        results.push({ name, status: 'error', message: err.message });
      }
    }
  }
  
  return {
    success: true,
    message: '集合初始化完成',
    data: results
  };
}
