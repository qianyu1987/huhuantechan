const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3g4sjhqr5e28e54e' });
const db = cloud.database();

async function checkCollections() {
  try {
    // 尝试获取集合信息
    const res = await db.collection('invite_rewards').count();
    console.log('invite_rewards 集合已存在，文档数量:', res.total);
  } catch (e) {
    if (e.message && e.message.includes('collection not exist')) {
      console.log('invite_rewards 集合不存在，需要创建');
    } else {
      console.log('检查集合时出错:', e.message);
    }
  }
}

checkCollections();