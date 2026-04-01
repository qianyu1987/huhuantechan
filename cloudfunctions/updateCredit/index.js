const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { action } = event;
  const { OPENID } = cloud.getWXContext();

  if (!OPENID) {
    return { success: false, message: '请先登录' };
  }

  switch (action) {
    case 'transfer':
      return await transferCredit(OPENID, event);
    case 'addRating':
      return await addRating(OPENID, event);
    case 'exchangeComplete':
      return await exchangeComplete(OPENID, event);
    case 'dailyLogin':
      return await dailyLogin(OPENID);
    case 'shareApp':
      return await shareApp(OPENID);
    case 'adminAdjust':
      return await adminAdjust(OPENID, event);
    case 'getCreditLogs':
      return await getCreditLogs(OPENID, event);
    case 'getPointsLogs':
      return await getPointsLogs(OPENID, event);
    default:
      return { success: false, message: '未知操作' };
  }
};

// 积分转账（points）
async function transferCredit(OPENID, { toOpenid, amount }) {
  try {
    if (!toOpenid || !amount) {
      return { success: false, message: '参数不完整' };
    }
    if (amount < 5) {
      return { success: false, message: '最低转账5分' };
    }
    if (toOpenid === OPENID) {
      return { success: false, message: '不能转给自己' };
    }

    const [fromUserRes, toUserRes] = await Promise.all([
      db.collection('users').where({ openid: OPENID }).get(),
      db.collection('users').where({ openid: toOpenid }).get()
    ]);

    if (fromUserRes.data.length === 0 || toUserRes.data.length === 0) {
      return { success: false, message: '用户不存在' };
    }

    const fromUser = fromUserRes.data[0];
    const toUser = toUserRes.data[0];
    const fromPoints = fromUser.points !== undefined ? fromUser.points : 30;
    const toPoints = toUser.points !== undefined ? toUser.points : 30;

    if (fromPoints < amount) {
      return { success: false, message: '积分不足' };
    }

    const today = new Date().toDateString();
    if (fromUser.lastTransferDate === today) {
      const dailyOut = fromUser.dailyTransferOut || 0;
      if (dailyOut + amount > 100) {
        return { success: false, message: '每日转出上限100分' };
      }
    }

    if (toUser.lastTransferDate === today) {
      const dailyIn = toUser.dailyTransferIn || 0;
      if (dailyIn + amount > 50) {
        return { success: false, message: '对方每日接收上限50分' };
      }
    }

    const lastTransfer = await db.collection('pointsLogs')
      .where({ fromOpenid: OPENID, toOpenid: toOpenid, type: 'transfer' })
      .orderBy('createTime', 'desc')
      .limit(1)
      .get();

    if (lastTransfer.data.length > 0) {
      const lastTime = new Date(lastTransfer.data[0].createTime);
      const daysDiff = (Date.now() - lastTime.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff < 7) {
        return { success: false, message: '7天内只能向同一用户转账1次' };
      }
    }

    const fee = Math.ceil(amount * 0.1);
    const actualAmount = amount - fee;

    await db.collection('users').doc(fromUser._id).update({
      data: {
        points: fromPoints - amount,
        dailyTransferOut: _.inc(amount),
        lastTransferDate: today
      }
    });

    await db.collection('users').doc(toUser._id).update({
      data: {
        points: toPoints + actualAmount,
        dailyTransferIn: _.inc(actualAmount),
        lastTransferDate: today
      }
    });

    await db.collection('pointsLogs').add({
      data: {
        fromOpenid: OPENID,
        toOpenid: toOpenid,
        amount: amount,
        fee: fee,
        actualAmount: actualAmount,
        type: 'transfer',
        reason: '积分转账',
        balance: fromPoints - amount,
        createTime: db.serverDate()
      }
    });

    return {
      success: true,
      message: `转账成功，实际到账${actualAmount}分`,
      data: { amount, fee, actualAmount, newBalance: fromPoints - amount }
    };
  } catch (err) {
    console.error('transferCredit error:', err);
    return { success: false, message: '转账失败' };
  }
}

// 添加评价（操作 creditScore 信用分）
async function addRating(OPENID, { specialtyId, rating, toOpenid }) {
  try {
    if (!specialtyId || !rating || !toOpenid) {
      return { success: false, message: '参数不完整' };
    }
    if (rating < 1 || rating > 5) {
      return { success: false, message: '评分必须是1-5分' };
    }

    const specialtyRes = await db.collection('specialty').doc(specialtyId).get();
    if (!specialtyRes.data) {
      return { success: false, message: '特产不存在' };
    }

    const specialty = specialtyRes.data;

    if (specialty.drawerOpenid === OPENID && specialty.senderRating) {
      return { success: false, message: '已经评价过了' };
    }
    if (specialty.senderOpenid === OPENID && specialty.drawerRating) {
      return { success: false, message: '已经评价过了' };
    }

    if (specialty.status !== 'completed') {
      return { success: false, message: '互换未完成，不能评价' };
    }

    // 获取被评价用户信息
    const toUserRes = await db.collection('users').where({ openid: toOpenid }).get();
    if (toUserRes.data.length === 0) {
      return { success: false, message: '用户不存在' };
    }

    const toUser = toUserRes.data[0];
    const negativeCount = toUser.consecutiveNegative || 0;

    // 计算信用分变化（好评影响 creditScore）
    let creditChange = 0;
    let ratingText = '';

    if (rating === 5) {
      creditChange = 12;
      ratingText = '好评';
    } else if (rating === 4) {
      creditChange = 8;
      ratingText = '较好';
    } else if (rating === 3) {
      creditChange = 3;
      ratingText = '中评';
    } else {
      // 差评：首次仅-10（新人保护），之后-15
      creditChange = negativeCount === 0 ? -10 : -15;
      ratingText = '差评';
    }

    const newCredit = Math.max(0, (toUser.creditScore !== undefined ? toUser.creditScore : 100) + creditChange);

    // 更新被评价用户的信用分
    await db.collection('users').doc(toUser._id).update({
      data: {
        creditScore: newCredit,
        consecutiveNegative: creditChange < 0 ? _.inc(1) : 0
      }
    });

    // 更新特产的评价信息
    const updateData = {};
    if (specialty.senderOpenid === OPENID) {
      updateData.senderRating = rating;
      updateData.senderRatingTime = db.serverDate();
    } else {
      updateData.drawerRating = rating;
      updateData.drawerRatingTime = db.serverDate();
    }
    await db.collection('specialty').doc(specialtyId).update({ data: updateData });

    // 记录信用分变动（写 creditLogs）
    await db.collection('creditLogs').add({
      data: {
        openid: toOpenid,
        change: creditChange,
        reason: `收到${ratingText}`,
        balance: newCredit,
        type: 'rating',
        fromOpenid: OPENID,
        createTime: db.serverDate()
      }
    });

    // 荣辱通知
    try {
      if (toUser.hometown && toUser.hometown.code) {
        const isGood = creditChange > 0;
        await db.collection('honorLogs').add({
          data: {
            provinceCode: toUser.hometown.code,
            provinceName: toUser.hometown.name || '',
            openid: toOpenid,
            nickName: toUser.nickName || '同乡',
            type: isGood ? 'honor' : 'shame',
            action: isGood
              ? `获得${ratingText}，为${toUser.hometown.name || '家乡'}争光`
              : `获得${ratingText}，损害${toUser.hometown.name || '家乡'}荣誉`,
            creditChange,
            rating,
            specialtyId,
            createTime: db.serverDate()
          }
        });
      }
    } catch (e) {
      console.warn('荣辱通知写入失败:', e);
    }

    return {
      success: true,
      message: `评价成功，信用分${creditChange > 0 ? '+' : ''}${creditChange}`,
      data: { rating, creditChange, newCredit }
    };
  } catch (err) {
    console.error('addRating error:', err);
    return { success: false, message: '评价失败' };
  }
}

// 互换完成奖励（操作 points 积分）
async function exchangeComplete(OPENID, { specialtyId }) {
  try {
    if (!specialtyId) {
      return { success: false, message: '参数不完整' };
    }

    const specialtyRes = await db.collection('specialty').doc(specialtyId).get();
    if (!specialtyRes.data) {
      return { success: false, message: '特产不存在' };
    }

    const specialty = specialtyRes.data;

    if (specialty.senderOpenid !== OPENID && specialty.drawerOpenid !== OPENID) {
      return { success: false, message: '无权操作' };
    }

    if (specialty.senderCompleted && specialty.senderOpenid === OPENID) {
      return { success: false, message: '已经领取过奖励' };
    }
    if (specialty.drawerCompleted && specialty.drawerOpenid === OPENID) {
      return { success: false, message: '已经领取过奖励' };
    }

    const pointsChange = 5;

    const userRes = await db.collection('users').where({ openid: OPENID }).get();
    const user = userRes.data[0];
    const oldPoints = user.points !== undefined ? user.points : 30;
    const newPoints = oldPoints + pointsChange;

    await db.collection('users').doc(user._id).update({
      data: { points: newPoints }
    });

    const updateData = { completedAt: db.serverDate() };
    if (specialty.senderOpenid === OPENID) updateData.senderCompleted = true;
    if (specialty.drawerOpenid === OPENID) updateData.drawerCompleted = true;
    await db.collection('specialty').doc(specialtyId).update({ data: updateData });

    await db.collection('pointsLogs').add({
      data: {
        openid: OPENID,
        change: pointsChange,
        reason: '互换完成奖励',
        balance: newPoints,
        type: 'exchange_complete',
        specialtyId,
        createTime: db.serverDate()
      }
    });

    return {
      success: true,
      message: '互换完成，积分+5',
      data: { pointsChange, newPoints }
    };
  } catch (err) {
    console.error('exchangeComplete error:', err);
    return { success: false, message: '操作失败' };
  }
}

// 每日登录奖励（操作 points 积分）
async function dailyLogin(OPENID) {
  try {
    const today = new Date().toDateString();

    const userRes = await db.collection('users').where({ openid: OPENID }).get();
    if (userRes.data.length === 0) {
      return { success: false, message: '用户不存在' };
    }

    const user = userRes.data[0];

    if (user.lastLoginDate === today) {
      return { success: false, message: '今天已经领取过了' };
    }

    const pointsChange = 1;
    const oldPoints = user.points !== undefined ? user.points : 30;
    const newPoints = oldPoints + pointsChange;

    await db.collection('users').doc(user._id).update({
      data: {
        points: newPoints,
        lastLoginDate: today,
        dailyStreak: user.lastLoginDate === new Date(Date.now() - 86400000).toDateString()
          ? _.inc(1)
          : 1
      }
    });

    await db.collection('pointsLogs').add({
      data: {
        openid: OPENID,
        change: pointsChange,
        reason: '每日登录',
        balance: newPoints,
        type: 'daily_login',
        createTime: db.serverDate()
      }
    });

    const streak = user.lastLoginDate === new Date(Date.now() - 86400000).toDateString()
      ? (user.dailyStreak || 0) + 1 : 1;

    return {
      success: true,
      message: `每日登录奖励+1积分，连续登录${streak}天`,
      data: { pointsChange, newPoints, streak }
    };
  } catch (err) {
    console.error('dailyLogin error:', err);
    return { success: false, message: '操作失败' };
  }
}

// 分享小程序奖励（操作 points 积分）
async function shareApp(OPENID) {
  try {
    const today = new Date().toDateString();

    const userRes = await db.collection('users').where({ openid: OPENID }).get();
    if (userRes.data.length === 0) {
      return { success: false, message: '用户不存在' };
    }

    const user = userRes.data[0];

    const dailyShareCount = user.dailyShareCount || 0;
    if (dailyShareCount >= 3) {
      return { success: false, message: '今天分享次数已用完' };
    }

    const pointsChange = 2;
    const oldPoints = user.points !== undefined ? user.points : 30;
    const newPoints = oldPoints + pointsChange;

    await db.collection('users').doc(user._id).update({
      data: {
        points: newPoints,
        dailyShareCount: _.inc(1)
      }
    });

    await db.collection('pointsLogs').add({
      data: {
        openid: OPENID,
        change: pointsChange,
        reason: '分享小程序',
        balance: newPoints,
        type: 'share',
        createTime: db.serverDate()
      }
    });

    return {
      success: true,
      message: '分享奖励+2积分',
      data: { pointsChange, newPoints, remainingCount: 3 - (dailyShareCount + 1) }
    };
  } catch (err) {
    console.error('shareApp error:', err);
    return { success: false, message: '操作失败' };
  }
}

// 管理员调整信用分
async function adminAdjust(OPENID, { targetOpenid, change, reason }) {
  try {
    const adminRes = await db.collection('admin').where({ openid: OPENID }).get();
    if (adminRes.data.length === 0) {
      return { success: false, message: '无权操作' };
    }

    if (!targetOpenid || change === undefined || !reason) {
      return { success: false, message: '参数不完整' };
    }

    const userRes = await db.collection('users').where({ openid: targetOpenid }).get();
    if (userRes.data.length === 0) {
      return { success: false, message: '用户不存在' };
    }

    const user = userRes.data[0];
    const newCredit = Math.max(0, (user.creditScore !== undefined ? user.creditScore : 100) + change);

    await db.collection('users').doc(user._id).update({
      data: { creditScore: newCredit }
    });

    await db.collection('creditLogs').add({
      data: {
        openid: targetOpenid,
        change: change,
        reason: reason,
        balance: newCredit,
        type: 'admin_adjust',
        operator: OPENID,
        createTime: db.serverDate()
      }
    });

    await db.collection('adminLog').add({
      data: {
        adminOpenid: OPENID,
        operation: 'adjustCredit',
        content: `调整用户 ${targetOpenid} 信用分: ${change > 0 ? '+' : ''}${change}, 原因: ${reason}`,
        createTime: db.serverDate()
      }
    });

    return {
      success: true,
      message: '调整成功',
      data: { oldCredit: user.creditScore || 100, newCredit, change }
    };
  } catch (err) {
    console.error('adminAdjust error:', err);
    return { success: false, message: '操作失败' };
  }
}

// 获取信用分记录（评价相关）
async function getCreditLogs(OPENID, { page = 1, limit = 20 }) {
  try {
    const skip = (page - 1) * limit;
    const logsRes = await db.collection('creditLogs')
      .where({ openid: OPENID })
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(limit)
      .get();

    return {
      success: true,
      data: logsRes.data,
      page,
      limit,
      hasMore: logsRes.data.length === limit
    };
  } catch (err) {
    console.error('getCreditLogs error:', err);
    return { success: false, message: '获取记录失败' };
  }
}

// 获取积分记录（发布/抽取/签到等）
async function getPointsLogs(OPENID, { page = 1, limit = 20 }) {
  try {
    const skip = (page - 1) * limit;
    const logsRes = await db.collection('pointsLogs')
      .where({ openid: OPENID })
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(limit)
      .get();

    return {
      success: true,
      data: logsRes.data,
      page,
      limit,
      hasMore: logsRes.data.length === limit
    };
  } catch (err) {
    console.error('getPointsLogs error:', err);
    return { success: false, message: '获取记录失败' };
  }
}

