/**
 * OpenID 字段统一处理工具
 * 规范：数据库统一使用 _openid 字段
 */

/**
 * 构建查询条件 - 兼容 _openid 和 openid（用于查询）
 * @param {string} openid - 用户 openid
 * @returns {object} 查询条件
 */
function buildOpenidQuery(openid) {
  if (!openid) return null
  return {
    _openid: openid
  }
}

/**
 * 构建用户数据 - 统一使用 _openid 字段（用于新增/更新）
 * @param {string} openid - 用户 openid
 * @returns {object} 包含 _openid 的对象
 */
function buildOpenidData(openid) {
  if (!openid) return {}
  return {
    _openid: openid
  }
}

/**
 * 查询用户 - 先查 _openid，兼容旧数据查 openid
 * @param {object} db - 数据库实例
 * @param {string} openid - 用户 openid
 * @returns {Promise<object>} 用户数据或 null
 */
async function findUserByOpenid(db, openid) {
  if (!openid) return null
  
  // 先查 _openid
  let res = await db.collection('users').where({ _openid: openid }).get()
  if (res.data && res.data.length > 0) {
    return res.data[0]
  }
  
  // 兼容旧数据：查 openid
  res = await db.collection('users').where({ openid: openid }).get()
  if (res.data && res.data.length > 0) {
    return res.data[0]
  }
  
  return null
}

/**
 * 获取用户（兼容旧版调用）- 返回 { data, error } 格式
 * @param {object} db - 数据库实例
 * @param {string} openid - 用户 openid
 * @returns {Promise<object>} { data: user, error: null } 或 { data: null, error: error }
 */
async function getUserByOpenid(db, openid) {
  try {
    if (!openid) {
      return { data: null, error: 'openid不能为空' }
    }
    
    // 先查 _openid
    let res = await db.collection('users').where({ _openid: openid }).get()
    if (res.data && res.data.length > 0) {
      return { data: res.data[0], error: null }
    }
    
    // 兼容旧数据：查 openid
    res = await db.collection('users').where({ openid: openid }).get()
    if (res.data && res.data.length > 0) {
      return { data: res.data[0], error: null }
    }
    
    return { data: null, error: '用户不存在' }
  } catch (error) {
    console.error('getUserByOpenid错误:', error)
    return { data: null, error: error.message }
  }
}

/**
 * 查询集合 - 先查 _openid，兼容旧数据查 openid
 * @param {object} db - 数据库实例
 * @param {string} collection - 集合名
 * @param {string} openid - 用户 openid
 * @param {object} extraWhere - 额外查询条件
 * @returns {Promise<object>} 查询结果
 */
async function queryByOpenid(db, collection, openid, extraWhere = {}) {
  if (!openid) return { data: [] }
  
  // 先查 _openid
  let res = await db.collection(collection)
    .where({ _openid: openid, ...extraWhere })
    .get()
  
  if (res.data && res.data.length > 0) {
    return res
  }
  
  // 兼容旧数据：查 openid
  res = await db.collection(collection)
    .where({ openid: openid, ...extraWhere })
    .get()
  
  return res
}

/**
 * 统计数量 - 先查 _openid，兼容旧数据查 openid
 * @param {object} db - 数据库实例
 * @param {string} collection - 集合名
 * @param {string} openid - 用户 openid
 * @param {object} extraWhere - 额外查询条件
 * @returns {Promise<number>} 数量
 */
async function countByOpenid(db, collection, openid, extraWhere = {}) {
  if (!openid) return 0
  
  // 先查 _openid
  let res = await db.collection(collection)
    .where({ _openid: openid, ...extraWhere })
    .count()
  
  if (res.total > 0) {
    return res.total
  }
  
  // 兼容旧数据：查 openid
  res = await db.collection(collection)
    .where({ openid: openid, ...extraWhere })
    .count()
  
  return res.total
}

module.exports = {
  buildOpenidQuery,
  buildOpenidData,
  findUserByOpenid,
  getUserByOpenid,
  queryByOpenid,
  countByOpenid
}
