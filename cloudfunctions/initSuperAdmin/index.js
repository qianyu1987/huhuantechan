const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 超级管理员 OpenID - 需要替换为实际用户的 OpenID
const SUPER_ADMIN_OPENID = '';

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  
  if (!OPENID) {
    return { success: false, message: '请先登录' };
  }
  
  try {
    // 检查是否已存在超级管理员
    const adminRes = await db.collection('admin')
      .where({ role: 'super' })
      .get();
    
    if (adminRes.data.length > 0) {
      // 已存在超级管理员，检查是否是当前用户
      const existingSuper = adminRes.data[0];
      if (existingSuper.openid === OPENID) {
        return { 
          success: true, 
          message: '您已是超级管理员',
          isSuperAdmin: true
        };
      }
      return { 
        success: false, 
        message: '超级管理员已存在',
        isSuperAdmin: false
      };
    }
    
    // 获取用户信息
    const userRes = await db.collection('users').where({ openid: OPENID }).get();
    if (userRes.data.length === 0) {
      return { success: false, message: '用户不存在' };
    }
    
    const user = userRes.data[0];
    
    // 创建超级管理员记录
    await db.collection('admin').add({
      data: {
        openid: OPENID,
        name: user.nickName || '超级管理员',
        role: 'super',
        permission: ['all'],
        createTime: db.serverDate(),
        lastLoginTime: db.serverDate()
      }
    });
    
    // 记录操作日志
    await db.collection('adminLog').add({
      data: {
        adminOpenid: OPENID,
        adminName: user.nickName || '超级管理员',
        operation: 'initSuperAdmin',
        content: '初始化超级管理员',
        createTime: db.serverDate(),
        ip: ''
      }
    });
    
    return { 
      success: true, 
      message: '超级管理员初始化成功',
      isSuperAdmin: true
    };
    
  } catch (err) {
    console.error('初始化超级管理员失败:', err);
    return { success: false, message: '初始化失败' };
  }
};
