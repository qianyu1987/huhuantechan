// 云函数: adminMgr - 管理员功能
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

// 验证超级管理员权限
async function verifySuperAdmin(wxContext) {
  const admins = await db.collection('system_config').where({
    configKey: 'superAdmins'
  }).get()
  
  if (admins.data.length > 0 && admins.data[0].configValue) {
    const superAdmins = admins.data[0].configValue
    if (superAdmins.includes(wxContext.OPENID)) {
      return true
    }
  }
  return false
}

exports.main = async (event, context) => {
  const { action } = event
  const wxContext = cloud.getWXContext()
  
  // 检查是否是超级管理员（用于敏感操作）
  const isSuperAdmin = await verifySuperAdmin(wxContext)

  try {
    switch (action) {
      // 获取统计数据
      case 'getStats': {
        const userCount = await db.collection('users').count()
        const productCount = await db.collection('products').count()
        const swapCount = await db.collection('orders').where({
          status: _.in(['pending', 'confirmed', 'shipped'])
        }).count()
        const reviewCount = await db.collection('reviews').where({
          status: 'pending'
        }).count()
        const mysteryCount = await db.collection('products').where({
          isMystery: true
        }).count()

        return {
          totalUsers: userCount.total,
          totalProducts: productCount.total,
          activeSwaps: swapCount.total,
          pendingReviews: reviewCount.total,
          mysteryCount: mysteryCount.total,
          isSuperAdmin
        }
      }

      // 获取用户列表（支持搜索）
      case 'getUsers': {
        const { page = 1, pageSize = 20, keyword = '' } = event
        
        let query = db.collection('users')
        if (keyword) {
          query = query.where({
            nickName: db.RegExp({
              regexp: keyword,
              options: 'i'
            })
          })
        }
        
        const res = await query
          .orderBy('_createTime', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get()

        // 获取积分信息
        const list = await Promise.all(res.data.map(async (user) => {
          let userData = { ...user }
          try {
            const pointsRes = await db.collection('user_points').where({
              _openid: user._openid
            }).get()
            if (pointsRes.data.length > 0) {
              userData.points = pointsRes.data[0].points || 0
              userData.totalPoints = pointsRes.data[0].totalPoints || 0
            } else {
              userData.points = 0
              userData.totalPoints = 0
            }
          } catch (e) {
            userData.points = 0
            userData.totalPoints = 0
          }
          return userData
        }))

        return { list, isSuperAdmin }
      }

      // 获取单个用户详情
      case 'getUserDetail': {
        const { openid } = event
        const userRes = await db.collection('users').where({
          openid: openid
        }).get()
        
        if (userRes.data.length === 0) {
          return { error: '用户不存在' }
        }
        
        const user = userRes.data[0]
        
        // 获取积分记录
        const pointsRes = await db.collection('user_points').where({
          _openid: openid
        }).get()
        
        // 获取积分变动记录
        const pointsLogRes = await db.collection('points_log').where({
          _openid: openid
        }).orderBy('createTime', 'desc').limit(50).get()
        
        return {
          user,
          points: pointsRes.data[0]?.points || 0,
          totalPoints: pointsRes.data[0]?.totalPoints || 0,
          pointsLog: pointsLogRes.data || [],
          isSuperAdmin
        }
      }

      // 增加用户积分（仅超级管理员）
      case 'addPoints': {
        if (!isSuperAdmin) {
          return { error: '权限不足，需要超级管理员权限' }
        }
        
        const { openid, points, reason = '管理员操作' } = event
        if (!openid || !points || points <= 0) {
          return { error: '参数错误' }
        }
        
        // 查询或创建用户积分记录
        let pointsRes = await db.collection('user_points').where({
          _openid: openid
        }).get()
        
        if (pointsRes.data.length === 0) {
          // 创建积分记录
          await db.collection('user_points').add({
            data: {
              _openid: openid,
              points: points,
              totalPoints: points,
              updateTime: db.serverDate()
            }
          })
        } else {
          // 更新积分
          await db.collection('user_points').where({
            _openid: openid
          }).update({
            data: {
              points: _.inc(points),
              totalPoints: _.inc(points),
              updateTime: db.serverDate()
            }
          })
        }
        
        // 记录积分变动日志
        await db.collection('points_log').add({
          data: {
            _openid: openid,
            points: points,
            type: 'admin_add',
            reason: reason,
            createTime: db.serverDate()
          }
        })
        
        return { success: true, message: `成功增加 ${points} 积分` }
      }

      // 扣除用户积分（仅超级管理员）
      case 'deductPoints': {
        if (!isSuperAdmin) {
          return { error: '权限不足，需要超级管理员权限' }
        }
        
        const { openid, points, reason = '管理员操作' } = event
        if (!openid || !points || points <= 0) {
          return { error: '参数错误' }
        }
        
        // 查询当前积分
        let pointsRes = await db.collection('user_points').where({
          _openid: openid
        }).get()
        
        let currentPoints = pointsRes.data.length > 0 ? (pointsRes.data[0].points || 0) : 0
        if (currentPoints < points) {
          return { error: '积分不足，当前积分: ' + currentPoints }
        }
        
        // 扣除积分
        await db.collection('user_points').where({
          _openid: openid
        }).update({
          data: {
            points: _.inc(-points),
            updateTime: db.serverDate()
          }
        })
        
        // 记录积分变动日志
        await db.collection('points_log').add({
          data: {
            _openid: openid,
            points: -points,
            type: 'admin_deduct',
            reason: reason,
            createTime: db.serverDate()
          }
        })
        
        return { success: true, message: `成功扣除 ${points} 积分` }
      }

      // 调整用户信用分（仅超级管理员）
      case 'adjustCredit': {
        if (!isSuperAdmin) {
          return { error: '权限不足，需要超级管理员权限' }
        }
        
        const { openid, creditScore, reason = '管理员操作' } = event
        if (!openid || creditScore === undefined) {
          return { error: '参数错误' }
        }
        
        // 信用分范围 0-100
        const newScore = Math.max(0, Math.min(100, creditScore))
        
        // 更新用户信用分
        await db.collection('users').where({
          openid: openid
        }).update({
          data: {
            creditScore: newScore,
            creditUpdatedAt: db.serverDate()
          }
        })
        
        // 记录信用分变动日志
        await db.collection('credit_log').add({
          data: {
            _openid: openid,
            creditScore: newScore,
            type: 'admin_adjust',
            reason: reason,
            createTime: db.serverDate()
          }
        })
        
        return { success: true, message: `信用分已调整为 ${newScore}` }
      }

      // 编辑用户信息（仅超级管理员）
      case 'editUser': {
        if (!isSuperAdmin) {
          return { error: '权限不足，需要超级管理员权限' }
        }

        const { openid, updates } = event
        if (!openid || !updates) {
          return { error: '参数错误' }
        }

        const allowedFields = ['nickName', 'province']
        const updateData = {}

        for (const key of allowedFields) {
          if (updates[key] !== undefined) {
            updateData[key] = updates[key]
          }
        }

        if (Object.keys(updateData).length === 0) {
          return { error: '没有可更新的字段' }
        }

        updateData.updateTime = db.serverDate()

        await db.collection('users').where({ openid }).update({
          data: updateData
        })

        return { success: true, message: '用户信息已更新' }
      }

      // 编辑特产信息（仅超级管理员）
      case 'editProduct': {
        if (!isSuperAdmin) {
          return { error: '权限不足，需要超级管理员权限' }
        }

        const { productId, updates } = event
        if (!productId || !updates) {
          return { error: '参数错误' }
        }

        const allowedFields = ['name', 'description', 'province', 'city', 'category', 'valueRange', 'status']
        const updateData = {}

        for (const key of allowedFields) {
          if (updates[key] !== undefined) {
            updateData[key] = updates[key]
          }
        }

        if (Object.keys(updateData).length === 0) {
          return { error: '没有可更新的字段' }
        }

        updateData.updatedAt = db.serverDate()

        await db.collection('products').doc(productId).update({
          data: updateData
        })

        return { success: true, message: '特产信息已更新' }
      }

      // 获取特产列表
      case 'getProducts': {
        const { page = 1, pageSize = 20, status = '', isMystery = '' } = event
        let query = db.collection('products')
        
        if (status) {
          query = query.where({ status })
        }
        if (isMystery !== '') {
          query = query.where({ isMystery: isMystery === 'true' })
        }
        
        const res = await query
          .orderBy('_createTime', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get()

        return { list: res.data, isSuperAdmin }
      }

      // 获取神秘特产列表（仅超级管理员）
      case 'getMysteryProducts': {
        if (!isSuperAdmin) {
          return { error: '权限不足，需要超级管理员权限' }
        }
        
        const { page = 1, pageSize = 20 } = event
        const res = await db.collection('products')
          .where({ isMystery: true })
          .orderBy('_createTime', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get()

        return { list: res.data }
      }

      // 编辑神秘特产（仅超级管理员）
      case 'editMysteryProduct': {
        if (!isSuperAdmin) {
          return { error: '权限不足，需要超级管理员权限' }
        }
        
        const { productId, updates } = event
        if (!productId) {
          return { error: '缺少特产ID' }
        }
        
        // 允许更新的字段
        const allowedFields = ['name', 'description', 'province', 'city', 'coverUrl', 'images', 'status', 'tags']
        const updateData = {}
        
        for (const key of allowedFields) {
          if (updates[key] !== undefined) {
            updateData[key] = updates[key]
          }
        }
        
        updateData.updatedAt = db.serverDate()
        
        await db.collection('products').doc(productId).update({
          data: updateData
        })
        
        return { success: true, message: '神秘特产已更新' }
      }

      // 删除神秘特产（仅超级管理员）
      case 'deleteMysteryProduct': {
        if (!isSuperAdmin) {
          return { error: '权限不足，需要超级管理员权限' }
        }
        
        const { productId } = event
        if (!productId) {
          return { error: '缺少特产ID' }
        }
        
        await db.collection('products').doc(productId).remove()
        
        return { success: true, message: '神秘特产已删除' }
      }

      // 下架特产
      case 'banProduct': {
        if (!isSuperAdmin) return { error: '权限不足，需要超级管理员权限' }
        const { productId } = event
        await db.collection('products').doc(productId).update({
          data: {
            status: 'banned',
            bannedAt: db.serverDate()
          }
        })
        return { success: true }
      }

      // 上架特产
      case 'unbanProduct': {
        if (!isSuperAdmin) return { error: '权限不足，需要超级管理员权限' }
        const { productId } = event
        await db.collection('products').doc(productId).update({
          data: {
            status: 'active',
            bannedAt: _.remove()
          }
        })
        return { success: true, message: '已上架' }
      }

      // 获取订单列表
      case 'getOrders': {
        const { page = 1, pageSize = 20 } = event
        const res = await db.collection('orders')
          .orderBy('_createTime', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get()

        // 关联查询用户和特产信息
        const list = await Promise.all(res.data.map(async (order) => {
          let orderData = { ...order }

          // 获取请求者信息
          if (order.requesterId) {
            try {
              const userRes = await db.collection('users').doc(order.requesterId).get()
              orderData.requesterNick = userRes.data.nickName
            } catch (e) {}
          }

          return orderData
        }))

        return { list }
      }

      // 强制完成订单（仅超级管理员）
      case 'forceCompleteOrder': {
        if (!isSuperAdmin) {
          return { error: '权限不足，需要超级管理员权限' }
        }
        
        const { orderId } = event
        await db.collection('orders').doc(orderId).update({
          data: {
            status: 'completed',
            completedAt: db.serverDate()
          }
        })
        return { success: true, message: '订单已强制完成' }
      }

      // 强制取消订单（仅超级管理员）
      case 'forceCancelOrder': {
        if (!isSuperAdmin) {
          return { error: '权限不足，需要超级管理员权限' }
        }
        
        const { orderId } = event
        await db.collection('orders').doc(orderId).update({
          data: {
            status: 'cancelled',
            cancelledAt: db.serverDate()
          }
        })
        return { success: true, message: '订单已强制取消' }
      }

      // 获取待审核评价
      case 'getPendingReviews': {
        const { page = 1, pageSize = 20 } = event
        const res = await db.collection('reviews')
          .where({ status: 'pending' })
          .orderBy('_createTime', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get()

        return { list: res.data }
      }

      // 审核通过
      case 'approveReview': {
        const { reviewId } = event
        await db.collection('reviews').doc(reviewId).update({
          data: {
            status: 'approved',
            approvedAt: db.serverDate()
          }
        })
        return { success: true }
      }

      // 审核拒绝
      case 'rejectReview': {
        const { reviewId } = event
        await db.collection('reviews').doc(reviewId).update({
          data: {
            status: 'rejected',
            rejectedAt: db.serverDate()
          }
        })
        return { success: true }
      }

      // 获取操作日志
      case 'getAdminLogs': {
        if (!isSuperAdmin) {
          return { error: '权限不足，需要超级管理员权限' }
        }
        
        const { page = 1, pageSize = 50, type = '' } = event
        let query = db.collection('admin_logs')
        
        if (type) {
          query = query.where({ type })
        }
        
        const res = await query
          .orderBy('createTime', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get()
        
        return { list: res.data }
      }

      // 记录管理员操作
      case 'logAdminAction': {
        const { type, targetId, action: adminAction, detail = {} } = event
        
        await db.collection('admin_logs').add({
          data: {
            _openid: wxContext.OPENID,
            type,
            targetId,
            action: adminAction,
            detail,
            createTime: db.serverDate()
          }
        })
        
        return { success: true }
      }

      // 获取超级管理员状态
      case 'getAdminStatus': {
        return { isSuperAdmin }
      }

      // 设置当前用户为超级管理员
      case 'initSuperAdmin': {
        try {
          const existing = await db.collection('system_config').where({
            configKey: 'superAdmins'
          }).get()
          
          const openid = wxContext.OPENID
          
          if (existing.data.length > 0) {
            const currentAdmins = existing.data[0].configValue || []
            if (!currentAdmins.includes(openid)) {
              currentAdmins.push(openid)
              await db.collection('system_config').doc(existing.data[0]._id).update({
                data: { 
                  configValue: currentAdmins,
                  updateTime: new Date()
                }
              })
            }
            return { success: true, message: '已设置你为超级管理员', admins: currentAdmins }
          } else {
            await db.collection('system_config').add({
              data: {
                configKey: 'superAdmins',
                configValue: [openid],
                createTime: new Date()
              }
            })
            return { success: true, message: '已设置你为超级管理员', admins: [openid] }
          }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }

      // ========== 获取功能开关配置 ==========
      case 'getFeatureFlags': {
        try {
          const res = await db.collection('system_config').where({
            configKey: 'featureFlags'
          }).get()
          if (res.data.length > 0) {
            return { success: true, flags: res.data[0].configValue }
          }
          return { success: true, flags: null }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }

      // ========== 设置功能开关配置（需超管权限） ==========
      case 'setFeatureFlags': {
        if (!isSuperAdmin) return { success: false, error: '无权限' }
        try {
          const { flags } = event
          const existing = await db.collection('system_config').where({
            configKey: 'featureFlags'
          }).get()
          if (existing.data.length > 0) {
            await db.collection('system_config').doc(existing.data[0]._id).update({
              data: {
                configValue: flags,
                updateTime: new Date(),
                updatedBy: wxContext.OPENID
              }
            })
          } else {
            await db.collection('system_config').add({
              data: {
                configKey: 'featureFlags',
                configValue: flags,
                createTime: new Date(),
                updateTime: new Date(),
                updatedBy: wxContext.OPENID
              }
            })
          }
          return { success: true }
        } catch (e) {
          return { success: false, error: e.message }
        }
      }

      default:
        return { error: '未知操作' }
    }
  } catch (e) {
    console.error('adminMgr error:', e)
    return { error: e.message }
  }
}
