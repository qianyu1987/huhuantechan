// cloudfunctions/reviewMgr/index_fixed.js
// 评价管理云函数（修复版）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 将单个 cloud:// fileID 转为 https 临时链接
async function resolveCloudUrl(url) {
  if (!url || !url.startsWith('cloud://')) return url
  try {
    const res = await cloud.getTempFileURL({ fileList: [url] })
    return res.fileList[0]?.tempFileURL || url
  } catch (e) {
    return url
  }
}

// 获取订单中的产品信息
async function getProductInfo(productId) {
  if (!productId) return null
  try {
    const productRes = await db.collection('products').doc(productId).get()
    const product = productRes.data
    if (product) {
      // 处理图片URL
      if (product.images && product.images.length > 0) {
        product.coverUrl = await resolveCloudUrl(product.images[0])
      }
    }
    return product
  } catch (e) {
    console.error('获取产品信息失败:', e)
    return null
  }
}

// 获取用户信息
async function getUserInfo(openid) {
  if (!openid) return null
  try {
    const userRes = await db.collection('users').where({ _openid: openid }).get()
    const user = userRes.data && userRes.data[0]
    if (user && user.avatarUrl) {
      user.avatarUrl = await resolveCloudUrl(user.avatarUrl)
    }
    return user
  } catch (e) {
    console.error('获取用户信息失败:', e)
    return null
  }
}

// 格式化时间
function formatTime(time) {
  if (!time) return ''
  const date = new Date(time)
  const now = new Date()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return minutes + '分钟前'
  if (hours < 24) return hours + '小时前'
  if (days < 30) return days + '天前'

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 获取评分文本和样式
function getRatingInfo(rating) {
  let ratingText, ratingClass
  
  switch (rating) {
    case 5:
      ratingText = '超级满意'
      ratingClass = 'excellent'
      break
    case 4:
      ratingText = '满意'
      ratingClass = 'good'
      break
    case 3:
      ratingText = '一般'
      ratingClass = 'normal'
      break
    case 2:
      ratingText = '不满意'
      ratingClass = 'bad'
      break
    case 1:
      ratingText = '非常差'
      ratingClass = 'terrible'
      break
    default:
      ratingText = '未评价'
      ratingClass = 'unknown'
  }
  
  return { ratingText, ratingClass }
}

exports.main = async (event, context) => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    const { action } = event

    console.log('reviewMgr调用:', { action, openid: openid?.substring(0, 8) + '...' })

    // ========== 提交评价 ==========
    if (action === 'submit') {
      const { orderId, rating, comment, tags } = event
      
      // 验证参数
      if (!orderId || rating === undefined) {
        return { success: false, message: '参数不完整' }
      }
      
      if (rating < 1 || rating > 5) {
        return { success: false, message: '评分必须在1-5之间' }
      }

      // 获取订单信息
      let order
      try {
        const orderRes = await db.collection('orders').doc(orderId).get()
        order = orderRes.data
      } catch (e) {
        return { success: false, message: '订单不存在' }
      }
      
      if (!order) {
        return { success: false, message: '订单不存在' }
      }
      
      if (order.status !== 'completed') {
        return { success: false, message: '订单未完成' }
      }
      
      if (order.initiatorOpenid !== openid && order.receiverOpenid !== openid) {
        return { success: false, message: '无权操作' }
      }

      // 检查是否已评价
      const existing = await db.collection('reviews')
        .where({ orderId, reviewerOpenid: openid })
        .count()
      
      if (existing.total > 0) {
        return { success: false, message: '已经评价过了' }
      }

      const revieweeOpenid = order.initiatorOpenid === openid ? order.receiverOpenid : order.initiatorOpenid

      // 创建评价
      await db.collection('reviews').add({
        data: {
          orderId,
          reviewerOpenid: openid,
          revieweeOpenid,
          rating,
          comment: comment || '',
          tags: tags || [],
          createTime: db.serverDate()
        }
      })

      return { success: true, message: '评价提交成功' }
    }

    // ========== 获取评价列表（公开） ==========
    if (action === 'list') {
      const { targetOpenid, page = 1, pageSize = 20 } = event
      const target = targetOpenid || openid
      
      console.log('获取评价列表:', { target: target?.substring(0, 8) + '...' })

      // 查询target收到的所有评价
      const reviewsRes = await db.collection('reviews')
        .where({ revieweeOpenid: target })
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()

      // 获取评价者信息
      const reviewerIds = [...new Set(reviewsRes.data.map(r => r.reviewerOpenid).filter(Boolean))]
      let userMap = {}
      
      if (reviewerIds.length > 0) {
        try {
          const usersRes = await db.collection('users')
            .where({ _openid: _.in(reviewerIds) })
            .field({ _openid: true, nickName: true, avatarUrl: true })
            .get()
          
          for (const u of usersRes.data) {
            u.avatarUrl = await resolveCloudUrl(u.avatarUrl)
            userMap[u._openid] = u
          }
        } catch (userError) {
          console.error('获取用户信息失败:', userError)
        }
      }

      const reviews = reviewsRes.data.map(r => {
        const reviewer = userMap[r.reviewerOpenid] || {}
        const { ratingText, ratingClass } = getRatingInfo(r.rating)
        
        return {
          ...r,
          reviewer: {
            nickName: reviewer.nickName || '用户',
            avatarUrl: reviewer.avatarUrl || ''
          },
          ratingText,
          ratingClass,
          createTimeText: formatTime(r.createTime)
        }
      })

      return { 
        success: true, 
        list: reviews, 
        total: reviewsRes.total
      }
    }

    // ========== 获取我发出的评价 ==========
    if (action === 'myReviews') {
      const { page = 1, pageSize = 20 } = event
      
      console.log('获取我发出的评价:', { openid: openid?.substring(0, 8) + '...' })

      // 查询我发出的所有评价
      const reviewsRes = await db.collection('reviews')
        .where({ reviewerOpenid: openid })
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()

      // 获取被评价者信息和订单信息
      const enrichedReviews = []
      
      for (const review of reviewsRes.data) {
        try {
          // 获取被评价者信息
          const reviewee = await getUserInfo(review.revieweeOpenid)
          
          // 获取订单信息
          let order = null
          let productInfo = null
          
          try {
            const orderRes = await db.collection('orders').doc(review.orderId).get()
            order = orderRes.data
            
            // 根据订单角色获取产品信息
            if (order) {
              let productId = null
              if (order.initiatorOpenid === openid) {
                // 我是发起者，查看接收者的产品
                productId = order.receiverProductId
              } else if (order.receiverOpenid === openid) {
                // 我是接收者，查看发起者的产品
                productId = order.initiatorProductId
              }
              
              if (productId) {
                productInfo = await getProductInfo(productId)
              }
            }
          } catch (orderError) {
            console.error('获取订单信息失败:', orderError)
          }
          
          const { ratingText, ratingClass } = getRatingInfo(review.rating)
          
          enrichedReviews.push({
            ...review,
            reviewee: {
              nickName: reviewee?.nickName || '用户',
              avatarUrl: reviewee?.avatarUrl || ''
            },
            productName: productInfo?.name || '特产',
            productCover: productInfo?.coverUrl || '',
            ratingText,
            ratingClass,
            createTimeText: formatTime(review.createTime)
          })
        } catch (e) {
          console.error('处理评价数据失败:', e)
        }
      }

      return { 
        success: true, 
        list: enrichedReviews, 
        total: reviewsRes.total
      }
    }

    // ========== 获取我收到的评价 ==========
    if (action === 'receivedReviews') {
      const { page = 1, pageSize = 20 } = event
      
      console.log('获取我收到的评价:', { openid: openid?.substring(0, 8) + '...' })

      // 查询我收到的所有评价
      const reviewsRes = await db.collection('reviews')
        .where({ revieweeOpenid: openid })
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()

      // 获取评价者信息和订单信息
      const enrichedReviews = []
      
      for (const review of reviewsRes.data) {
        try {
          // 获取评价者信息
          const reviewer = await getUserInfo(review.reviewerOpenid)
          
          // 获取订单信息
          let order = null
          let productInfo = null
          
          try {
            const orderRes = await db.collection('orders').doc(review.orderId).get()
            order = orderRes.data
            
            // 根据订单角色获取产品信息
            if (order) {
              let productId = null
              if (order.initiatorOpenid === review.reviewerOpenid) {
                // 评价者是发起者，查看我的产品（作为接收者）
                productId = order.receiverProductId
              } else if (order.receiverOpenid === review.reviewerOpenid) {
                // 评价者是接收者，查看我的产品（作为发起者）
                productId = order.initiatorProductId
              }
              
              if (productId) {
                productInfo = await getProductInfo(productId)
              }
            }
          } catch (orderError) {
            console.error('获取订单信息失败:', orderError)
          }
          
          const { ratingText, ratingClass } = getRatingInfo(review.rating)
          
          enrichedReviews.push({
            ...review,
            reviewer: {
              nickName: reviewer?.nickName || '用户',
              avatarUrl: reviewer?.avatarUrl || ''
            },
            productName: productInfo?.name || '特产',
            productCover: productInfo?.coverUrl || '',
            ratingText,
            ratingClass,
            createTimeText: formatTime(review.createTime)
          })
        } catch (e) {
          console.error('处理评价数据失败:', e)
        }
      }

      return { 
        success: true, 
        list: enrichedReviews, 
        total: reviewsRes.total
      }
    }

    // ========== 获取信用日志 ==========
    if (action === 'creditLogs') {
      try {
        const res = await db.collection('credit_logs')
          .where(_.or([{ openid }, { _openid: openid }]))
          .orderBy('createTime', 'desc')
          .limit(50)
          .get()
        return { success: true, list: res.data }
      } catch (e) {
        return { success: false, list: [] }
      }
    }

    // 未知的action
    return { 
      success: false, 
      message: '未知的操作类型',
      supportedActions: ['submit', 'list', 'myReviews', 'receivedReviews', 'creditLogs']
    }

  } catch (error) {
    console.error('reviewMgr云函数错误:', error)
    return { 
      success: false, 
      message: '服务器错误',
      error: error.message,
      stack: error.stack
    }
  }
}