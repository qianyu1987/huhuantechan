'use strict';

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

// 获取精确到毫秒的时间戳
function getTimestamp(createTime) {
  if (!createTime) return 0;
  
  if (typeof createTime === 'number') {
    return createTime;
  }
  
  if (typeof createTime === 'object' && createTime.$date) {
    return typeof createTime.$date === 'number' 
      ? createTime.$date 
      : new Date(createTime.$date).getTime();
  }
  
  if (createTime instanceof Date) {
    return createTime.getTime();
  }
  
  return new Date(createTime).getTime();
}

// 清理无效用户和冲突ID，重新排列序号
exports.main = async (event, context) => {
  const { action } = event;
  
  try {
    // 获取所有用户
    const allUsers = await db.collection('users')
      .orderBy('_createTime', 'asc')
      .limit(5000)
      .get();
    
    const users = allUsers.data || [];
    
    if (action === 'check') {
      // 按时间戳排序（包含毫秒）
      const sortedUsers = users.map(u => ({
        ...u,
        _timestamp: getTimestamp(u._createTime)
      })).sort((a, b) => {
        if (a._timestamp !== b._timestamp) {
          return a._timestamp - b._timestamp; // 按时间正序
        }
        return a._id.localeCompare(b._id); // 时间相同按_id排序
      });
      
      // 检查是否有完全相同时间戳的用户
      const duplicates = [];
      for (let i = 1; i < sortedUsers.length; i++) {
        if (sortedUsers[i]._timestamp === sortedUsers[i-1]._timestamp) {
          duplicates.push({
            _id: sortedUsers[i]._id,
            nickName: sortedUsers[i].nickName,
            timestamp: sortedUsers[i]._timestamp,
            previousUserId: sortedUsers[i-1]._id
          });
        }
      }
      
      return {
        success: true,
        total: users.length,
        duplicates,
        duplicateCount: duplicates.length,
        sortedSample: sortedUsers.slice(0, 5).map(u => ({
          _id: u._id,
          nickName: u.nickName,
          timestamp: u._timestamp
        }))
      };
    }
    
    if (action === 'clean') {
      // 按时间戳排序（包含毫秒）
      const sortedUsers = users.map(u => ({
        ...u,
        _timestamp: getTimestamp(u._createTime)
      })).sort((a, b) => {
        if (a._timestamp !== b._timestamp) {
          return a._timestamp - b._timestamp;
        }
        return a._id.localeCompare(b._id);
      });
      
      // 找出需要删除的用户（保留第一个，时间相同保留_id较小的）
      const usersToDelete = [];
      for (let i = 1; i < sortedUsers.length; i++) {
        if (sortedUsers[i]._timestamp === sortedUsers[i-1]._timestamp) {
          usersToDelete.push(sortedUsers[i]._id);
        }
      }
      
      // 删除重复用户
      let deletedCount = 0;
      if (usersToDelete.length > 0) {
        const deleteRes = await db.collection('users')
          .where({
            _id: _.in(usersToDelete)
          })
          .remove();
        deletedCount = deleteRes.deleted || 0;
      }
      
      // 重新获取剩余用户并排序
      const remainingUsers = await db.collection('users')
        .orderBy('_createTime', 'asc')
        .limit(5000)
        .get();
      
      const remainingList = remainingUsers.data || [];
      const totalValid = remainingList.length;
      
      // 更新序号（最老=1，最新=总数）
      const updatePromises = remainingList.map((user, index) => {
        return db.collection('users').doc(user._id).update({
          data: {
            userIndex: index + 1
          }
        });
      });
      
      await Promise.all(updatePromises);
      
      return {
        success: true,
        total: users.length,
        deletedCount,
        deletedIds: usersToDelete,
        remainingCount: totalValid,
        message: `清理完成：删除了 ${deletedCount} 个重复用户，重新排列了 ${totalValid} 个用户的序号`
      };
    }
    
    return { success: false, message: '未知操作' };
    
  } catch (err) {
    console.error('清理用户失败:', err);
    return { success: false, error: err.message };
  }
};
