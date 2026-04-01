const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { boxId, receiverValue, willReturn } = event;
  const { OPENID } = cloud.getWXContext();
  
  if (!OPENID) {
    return { success: false, message: '请先登录' };
  }
  
  if (!boxId || !receiverValue || receiverValue <= 0 || receiverValue > 999) {
    return { success: false, message: '请填写有效的收货价值（0-999）' };
  }
  
  try {
    // 1. 获取盲盒信息
    const boxRes = await db.collection('specialty').doc(boxId).get();
    const box = boxRes.data;
    
    if (!box) {
      return { success: false, message: '盲盒不存在' };
    }
    
    // 2. 检查权限（必须是发布方）
    if (box._openid !== OPENID) {
      return { success: false, message: '无权操作' };
    }
    
    // 3. 检查状态
    if (box.status !== 'sent') {
      return { success: false, message: '当前状态不能确认收货' };
    }
    
    // 4. 更新盲盒状态
    const newStatus = willReturn ? 'received' : 'completed';
    await db.collection('specialty').doc(boxId).update({
      data: {
        status: newStatus,
        receiverValue: parseFloat(receiverValue),
        receiveTime: db.serverDate()
      }
    });
    
    // 5. 更新互换记录
    await db.collection('exchanges').where({ boxId }).update({
      data: {
        status: newStatus,
        receiverValue: parseFloat(receiverValue),
        receiveTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    });
    
    // 6. 更新价值统计
    await db.collection('valueStat').add({
      data: {
        boxId,
        senderOpenid: box._openid,
        receiverOpenid: box.drawerOpenid,
        senderValue: box.senderValue,
        receiverValue: parseFloat(receiverValue),
        completeTime: db.serverDate()
      }
    });
    
    // 7. 如果直接完成（不回寄），双方积分+5
    if (!willReturn) {
      await updatePoints(box._openid, 10, '互换完成奖励');
      await updatePoints(box.drawerOpenid, 10, '互换完成奖励');
    }
    
    return { 
      success: true, 
      message: willReturn ? '确认收货成功，请提醒对方回寄' : '互换完成！',
      data: { 
        boxId, 
        status: newStatus,
        creditChange: willReturn ? 0 : 10
      }
    };
    
  } catch (err) {
    console.error('收货失败:', err);
    return { success: false, message: '收货失败，请重试' };
  }
};

// 更新积分（互换完成奖励）
async function updatePoints(openid, change, reason) {
  try {
    const userRes = await db.collection('users').where({ openid }).get();
    if (userRes.data.length === 0) return;
    
    const user = userRes.data[0];
    const oldPoints = (user.points !== undefined && user.points !== null && user.points > 0) ? user.points : 30;
    const newPoints = Math.max(0, oldPoints + change);
    
    await db.collection('users').doc(user._id).update({
      data: { points: newPoints }
    });
    
    // 记录积分变动日志
    await db.collection('pointsLogs').add({
      data: {
        openid,
        change,
        reason,
        balance: newPoints,
        type: 'exchange_complete',
        createTime: db.serverDate()
      }
    });
  } catch (err) {
    console.error('更新积分失败:', err);
  }
}


