const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { limit = 10 } = event;

  try {
    // 获取浏览量最高的特产
    const res = await db.collection('specialty')
      .where({
        status: _.in(['unmatched', 'matched', 'sent', 'received', 'completed'])
      })
      .orderBy('viewCount', 'desc')
      .limit(limit)
      .get();

    // 格式化数据
    const specialties = res.data.map(item => ({
      _id: item._id,
      name: item.name,
      origin: item.origin,
      cover: item.cover,
      viewCount: item.viewCount || 0
    }));

    return {
      success: true,
      data: specialties
    };
  } catch (err) {
    console.error('getHotSpecialties error:', err);
    return { success: false, message: err.message };
  }
};
