const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3g4sjhqr5e28e54e' });
const db = cloud.database();

async function checkConfig() {
  try {
    const res = await db.collection('system_config').where({ configKey: 'withdrawal_threshold' }).get();
    console.log('提现门槛配置:', JSON.stringify(res.data, null, 2));
    
    if (!res.data || res.data.length === 0) {
      console.log('未找到提现门槛配置');
    }
  } catch (e) {
    console.error('检查配置失败:', e.message);
  }
}

checkConfig();